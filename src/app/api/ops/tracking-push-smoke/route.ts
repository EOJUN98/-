import { NextResponse } from "next/server";

import { pushTrackingToMarket } from "@/lib/logistics/market-tracking-clients";
import { decryptSecretIfNeeded } from "@/lib/security/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SmokeOrderRow {
  id: string;
  user_id: string;
  order_number: string;
  tracking_number: string | null;
  courier_code: string | null;
  market_config_id: string | null;
  updated_at: string | null;
}

interface SmokeMarketConfigRow {
  id: string;
  user_id: string;
  market_code: string;
  vendor_id: string | null;
  api_key: string | null;
  secret_key: string | null;
  is_active: boolean | null;
}

function readBearerToken(value: string | null) {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}

function isAuthorized(request: Request) {
  const secret = process.env.OPS_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false as const,
      status: 500,
      error: "OPS_SECRET or CRON_SECRET is not configured"
    };
  }

  const token = readBearerToken(request.headers.get("authorization"));
  if (!token || token !== secret) {
    return {
      ok: false as const,
      status: 401,
      error: "Unauthorized"
    };
  }

  return {
    ok: true as const
  };
}

function toLimit(raw: string | null) {
  const parsed = raw ? Number(raw) : 5;
  if (!Number.isFinite(parsed)) {
    return 5;
  }
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function toDryRun(raw: string | null) {
  return raw === "1" || raw === "true";
}

export async function GET(request: Request) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json(
      {
        success: false,
        error: auth.error
      },
      { status: auth.status }
    );
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "failed to create admin client"
      },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const limit = toLimit(url.searchParams.get("limit"));
  const dryRun = toDryRun(url.searchParams.get("dryRun"));

  const { data: orderRows, error: orderError } = await supabase
    .from("orders")
    .select("id, user_id, order_number, tracking_number, courier_code, market_config_id, updated_at")
    .not("tracking_number", "is", null)
    .not("market_config_id", "is", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit * 5);

  if (orderError) {
    return NextResponse.json(
      {
        success: false,
        error: orderError.message
      },
      { status: 500 }
    );
  }

  const orders = (orderRows ?? []) as SmokeOrderRow[];
  if (orders.length === 0) {
    return NextResponse.json({
      success: true,
      dryRun,
      sampled: 0,
      message: "tracking_number가 있는 주문이 없습니다"
    });
  }

  const configIds = Array.from(
    new Set(
      orders
        .map((order) => order.market_config_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: configRows, error: configError } = await supabase
    .from("user_market_configs")
    .select("id, user_id, market_code, vendor_id, api_key, secret_key, is_active")
    .in("id", configIds);

  if (configError) {
    return NextResponse.json(
      {
        success: false,
        error: configError.message
      },
      { status: 500 }
    );
  }

  const configMap = new Map<string, SmokeMarketConfigRow>();
  for (const row of (configRows ?? []) as SmokeMarketConfigRow[]) {
    configMap.set(row.id, row);
  }

  const results: Array<{
    orderNumber: string;
    marketCode: string | null;
    dryRun: boolean;
    ok: boolean;
    skipped: boolean;
    statusCode: number | null;
    category: string | null;
    attempts: number | null;
    message: string;
  }> = [];

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const order of orders) {
    if (results.length >= limit) {
      break;
    }

    const orderNumber = order.order_number;
    const trackingNumber = (order.tracking_number ?? "").trim();
    const courierCode = (order.courier_code ?? "CJGLS").trim() || "CJGLS";

    const configId = order.market_config_id;
    if (!configId) {
      skippedCount += 1;
      results.push({
        orderNumber,
        marketCode: null,
        dryRun,
        ok: false,
        skipped: true,
        statusCode: null,
        category: "INVALID",
        attempts: null,
        message: "market_config_id가 없어 스모크 테스트에서 제외됨"
      });
      continue;
    }

    const config = configMap.get(configId);
    if (!config) {
      failedCount += 1;
      results.push({
        orderNumber,
        marketCode: null,
        dryRun,
        ok: false,
        skipped: false,
        statusCode: null,
        category: "INVALID",
        attempts: null,
        message: "마켓 설정을 찾을 수 없음"
      });
      continue;
    }

    if (!config.is_active) {
      skippedCount += 1;
      results.push({
        orderNumber,
        marketCode: config.market_code,
        dryRun,
        ok: false,
        skipped: true,
        statusCode: null,
        category: "INVALID",
        attempts: null,
        message: "비활성 마켓 설정"
      });
      continue;
    }

    if (config.market_code !== "coupang" && config.market_code !== "smartstore") {
      skippedCount += 1;
      results.push({
        orderNumber,
        marketCode: config.market_code,
        dryRun,
        ok: false,
        skipped: true,
        statusCode: null,
        category: "INVALID",
        attempts: null,
        message: "미지원 마켓 코드"
      });
      continue;
    }

    let apiKey: string | null = null;
    let secretKey: string | null = null;

    try {
      apiKey = decryptSecretIfNeeded(config.api_key);
      secretKey = decryptSecretIfNeeded(config.secret_key);
    } catch (error) {
      failedCount += 1;
      results.push({
        orderNumber,
        marketCode: config.market_code,
        dryRun,
        ok: false,
        skipped: false,
        statusCode: null,
        category: "INVALID",
        attempts: null,
        message: `키 복호화 실패: ${error instanceof Error ? error.message : "unknown"}`
      });
      continue;
    }

    if (!apiKey || !secretKey) {
      failedCount += 1;
      results.push({
        orderNumber,
        marketCode: config.market_code,
        dryRun,
        ok: false,
        skipped: false,
        statusCode: null,
        category: "INVALID",
        attempts: null,
        message: "API 키/시크릿 키 누락"
      });
      continue;
    }

    if (!trackingNumber) {
      skippedCount += 1;
      results.push({
        orderNumber,
        marketCode: config.market_code,
        dryRun,
        ok: false,
        skipped: true,
        statusCode: null,
        category: "INVALID",
        attempts: null,
        message: "송장번호 누락"
      });
      continue;
    }

    if (dryRun) {
      skippedCount += 1;
      results.push({
        orderNumber,
        marketCode: config.market_code,
        dryRun,
        ok: true,
        skipped: true,
        statusCode: null,
        category: null,
        attempts: 0,
        message: "dryRun=true, 실제 호출 생략"
      });
      continue;
    }

    // Keep sequential execution to avoid sudden burst against marketplace APIs.
    // eslint-disable-next-line no-await-in-loop
    const push = await pushTrackingToMarket({
      marketCode: config.market_code,
      orderNumber,
      trackingNumber,
      courierCode,
      apiKey,
      secretKey,
      vendorId: config.vendor_id
    });

    if (push.ok) {
      if (push.skipped) {
        skippedCount += 1;
      } else {
        successCount += 1;
      }
    } else {
      failedCount += 1;
    }

    results.push({
      orderNumber,
      marketCode: config.market_code,
      dryRun,
      ok: push.ok,
      skipped: Boolean(push.skipped),
      statusCode: push.statusCode ?? null,
      category: push.category ?? null,
      attempts: push.attempts ?? null,
      message: push.message ?? (push.ok ? "성공" : "실패")
    });
  }

  return NextResponse.json({
    success: true,
    ranAt: new Date().toISOString(),
    dryRun,
    sampled: results.length,
    summary: {
      successCount,
      failedCount,
      skippedCount
    },
    results
  });
}
