import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { syncCsForMarketConfig, type CsSyncMarketConfig } from "@/lib/cs/cs-syncer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function ensureCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false as const,
      status: 500,
      error: "CRON_SECRET is not configured"
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

export async function GET(request: Request) {
  const authResult = ensureCronAuthorized(request);
  if (!authResult.ok) {
    return NextResponse.json(
      {
        success: false,
        error: authResult.error
      },
      { status: authResult.status }
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: marketConfigRows, error: configError } = await supabaseAdmin
    .from("user_market_configs")
    .select("id, user_id, market_code, vendor_id, api_key, secret_key, is_active")
    .eq("is_active", true)
    .in("market_code", ["smartstore", "coupang"])
    .order("updated_at", { ascending: false })
    .limit(300);

  if (configError) {
    return NextResponse.json(
      {
        success: false,
        error: configError.message
      },
      { status: 500 }
    );
  }

  const configs = (marketConfigRows ?? []) as CsSyncMarketConfig[];
  const results = [] as Awaited<ReturnType<typeof syncCsForMarketConfig>>[];
  const runId = randomUUID();

  for (const config of configs) {
    // Keep this sequential to avoid sudden API burst against marketplace endpoints.
    // eslint-disable-next-line no-await-in-loop
    try {
      const result = await syncCsForMarketConfig({
        supabaseAdmin,
        config
      });
      results.push(result);
    } catch (error) {
      results.push({
        marketConfigId: config.id,
        userId: config.user_id,
        marketCode: config.market_code,
        fetchedCount: 0,
        upsertedCount: 0,
        warningMessages: [
          `${config.market_code}: CS 수집 중 예외 발생 - ${error instanceof Error ? error.message : "unknown"}`
        ]
      });
    }
  }

  const summary = {
    totalConfigs: configs.length,
    totalFetched: results.reduce((acc, item) => acc + item.fetchedCount, 0),
    totalUpserted: results.reduce((acc, item) => acc + item.upsertedCount, 0),
    warningCount: results.reduce((acc, item) => acc + item.warningMessages.length, 0)
  };

  const csSyncLogRows = results.map((result) => ({
    user_id: result.userId,
    market_config_id: result.marketConfigId,
    market_code: result.marketCode,
    fetched_count: result.fetchedCount,
    upserted_count: result.upsertedCount,
    warning_count: result.warningMessages.length,
    warning_messages: result.warningMessages,
    triggered_by: "cron",
    run_id: runId
  }));

  let csSyncLogError: string | null = null;
  if (csSyncLogRows.length > 0) {
    const { error } = await supabaseAdmin.from("cs_sync_logs").insert(csSyncLogRows);
    if (error) {
      csSyncLogError = error.message;
    }
  }

  return NextResponse.json({
    success: true,
    ranAt: new Date().toISOString(),
    runId,
    summary,
    csSyncLogError,
    results
  });
}
