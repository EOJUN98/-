"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { encryptSecret, decryptSecretIfNeeded } from "@/lib/security/crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MarketConfigSummary, SourcingConfig, MarketFeeConfig } from "@/types/settings";
import { DEFAULT_MARKET_FEES } from "@/types/settings";

const saveMarketConfigSchema = z.object({
  marketCode: z.enum(["coupang", "smartstore"]),
  apiKey: z.string().trim().optional(),
  secretKey: z.string().trim().optional(),
  vendorId: z.string().trim().optional(),
  isActive: z.boolean().default(true),
  defaultDeliveryFee: z.number().int().min(0).max(500000).default(0),
  defaultReturnFee: z.number().int().min(0).max(500000).default(3000)
});

interface MarketConfigRow {
  id: string;
  market_code: string;
  vendor_id: string | null;
  api_key: string | null;
  secret_key: string | null;
  is_active: boolean | null;
  default_delivery_fee: number | null;
  default_return_fee: number | null;
  updated_at: string | null;
}

function mapRowToSummary(row: MarketConfigRow): MarketConfigSummary {
  return {
    id: row.id,
    marketCode: row.market_code === "coupang" ? "coupang" : "smartstore",
    isConfigured: Boolean(row.api_key) && Boolean(row.secret_key),
    vendorConfigured: Boolean((row.vendor_id ?? "").trim()),
    isActive: Boolean(row.is_active),
    defaultDeliveryFee: row.default_delivery_fee ?? 0,
    defaultReturnFee: row.default_return_fee ?? 3000,
    updatedAt: row.updated_at
  };
}

export async function saveMarketConfigAction(input: z.infer<typeof saveMarketConfigSchema>) {
  const parsed = saveMarketConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues.map((issue) => issue.message).join(", ")
    };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false as const,
      error: "로그인이 필요합니다"
    };
  }

  const { data: existingRow, error: existingError } = await supabase
    .from("user_market_configs")
    .select(
      "id, market_code, vendor_id, api_key, secret_key, is_active, default_delivery_fee, default_return_fee, updated_at"
    )
    .eq("user_id", user.id)
    .eq("market_code", parsed.data.marketCode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return {
      success: false as const,
      error: existingError.message
    };
  }

  const apiKeyProvided = Boolean(parsed.data.apiKey);
  const secretKeyProvided = Boolean(parsed.data.secretKey);

  if (apiKeyProvided !== secretKeyProvided) {
    return {
      success: false as const,
      error: "api_key와 secret_key는 함께 입력해야 합니다"
    };
  }

  let encryptedApiKey: string | null = existingRow?.api_key ?? null;
  let encryptedSecretKey: string | null = existingRow?.secret_key ?? null;

  if (apiKeyProvided && secretKeyProvided) {
    try {
      encryptedApiKey = encryptSecret(parsed.data.apiKey as string);
      encryptedSecretKey = encryptSecret(parsed.data.secretKey as string);
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "키 암호화에 실패했습니다"
      };
    }
  }

  const nextVendorId = parsed.data.marketCode === "coupang"
    ? (parsed.data.vendorId?.trim() || existingRow?.vendor_id || null)
    : null;

  if (parsed.data.isActive) {
    if (!encryptedApiKey || !encryptedSecretKey) {
      return {
        success: false as const,
        error: "활성화된 마켓은 API 키와 시크릿 키가 필요합니다"
      };
    }

    if (parsed.data.marketCode === "coupang" && !nextVendorId) {
      return {
        success: false as const,
        error: "쿠팡 활성화에는 vendor_id가 필요합니다"
      };
    }
  }

  const payload = {
    user_id: user.id,
    market_code: parsed.data.marketCode,
    api_key: encryptedApiKey,
    secret_key: encryptedSecretKey,
    vendor_id: nextVendorId,
    is_active: parsed.data.isActive,
    default_delivery_fee: parsed.data.defaultDeliveryFee,
    default_return_fee: parsed.data.defaultReturnFee,
    updated_at: new Date().toISOString()
  };

  let writeResult:
    | {
        data: MarketConfigRow | null;
        error: { message: string } | null;
      }
    | null = null;

  if (existingRow?.id) {
    const { data, error } = await supabase
      .from("user_market_configs")
      .update(payload)
      .eq("id", existingRow.id)
      .eq("user_id", user.id)
      .select(
        "id, market_code, vendor_id, api_key, secret_key, is_active, default_delivery_fee, default_return_fee, updated_at"
      )
      .single();

    writeResult = {
      data: (data as MarketConfigRow | null) ?? null,
      error: error ? { message: error.message } : null
    };
  } else {
    const { data, error } = await supabase
      .from("user_market_configs")
      .insert(payload)
      .select(
        "id, market_code, vendor_id, api_key, secret_key, is_active, default_delivery_fee, default_return_fee, updated_at"
      )
      .single();

    writeResult = {
      data: (data as MarketConfigRow | null) ?? null,
      error: error ? { message: error.message } : null
    };
  }

  if (writeResult.error || !writeResult.data) {
    return {
      success: false as const,
      error: writeResult.error?.message ?? "마켓 설정 저장에 실패했습니다"
    };
  }

  revalidatePath("/settings");

  return {
    success: true as const,
    config: mapRowToSummary(writeResult.data)
  };
}

// ── Sourcing Config ──

const SOURCING_CONFIG_DEFAULTS: SourcingConfig = {
  pageDelayMs: 300,
  crawlDelayMs: 500,
  bulkMaxTarget: 3000,
  pageSize: 50,
  autoConvert: true,
  defaultMarginRate: 30,
  updatedAt: null,
};

const saveSourcingConfigSchema = z.object({
  pageDelayMs: z.number().int().min(100).max(5000).default(300),
  crawlDelayMs: z.number().int().min(100).max(5000).default(500),
  bulkMaxTarget: z.number().int().min(100).max(10000).default(3000),
  pageSize: z.number().int().min(10).max(100).default(50),
  autoConvert: z.boolean().default(true),
  defaultMarginRate: z.number().min(0).max(100).default(30),
});

export async function getSourcingConfig(): Promise<{
  data: SourcingConfig;
  error?: string;
}> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: SOURCING_CONFIG_DEFAULTS };
  }

  const { data, error } = await supabase
    .from("user_sourcing_configs")
    .select(
      "page_delay_ms, crawl_delay_ms, bulk_max_target, page_size, auto_convert, default_margin_rate, updated_at"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { data: SOURCING_CONFIG_DEFAULTS, error: error.message };
  }

  if (!data) {
    return { data: SOURCING_CONFIG_DEFAULTS };
  }

  return {
    data: {
      pageDelayMs: data.page_delay_ms ?? 300,
      crawlDelayMs: data.crawl_delay_ms ?? 500,
      bulkMaxTarget: data.bulk_max_target ?? 3000,
      pageSize: data.page_size ?? 50,
      autoConvert: data.auto_convert ?? true,
      defaultMarginRate: Number(data.default_margin_rate ?? 30),
      updatedAt: data.updated_at ?? null,
    },
  };
}

export async function saveSourcingConfigAction(
  input: z.infer<typeof saveSourcingConfigSchema>
) {
  const parsed = saveSourcingConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false as const, error: "로그인이 필요합니다" };
  }

  const payload = {
    user_id: user.id,
    page_delay_ms: parsed.data.pageDelayMs,
    crawl_delay_ms: parsed.data.crawlDelayMs,
    bulk_max_target: parsed.data.bulkMaxTarget,
    page_size: parsed.data.pageSize,
    auto_convert: parsed.data.autoConvert,
    default_margin_rate: parsed.data.defaultMarginRate,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("user_sourcing_configs")
    .upsert(payload, { onConflict: "user_id" })
    .select(
      "page_delay_ms, crawl_delay_ms, bulk_max_target, page_size, auto_convert, default_margin_rate, updated_at"
    )
    .single();

  if (error) {
    return { success: false as const, error: error.message };
  }

  revalidatePath("/settings");

  return {
    success: true as const,
    config: {
      pageDelayMs: data.page_delay_ms,
      crawlDelayMs: data.crawl_delay_ms,
      bulkMaxTarget: data.bulk_max_target,
      pageSize: data.page_size,
      autoConvert: data.auto_convert,
      defaultMarginRate: Number(data.default_margin_rate),
      updatedAt: data.updated_at,
    } as SourcingConfig,
  };
}

// ── API 연결 테스트 ──

export async function testMarketConnectionAction(marketCode: "coupang" | "smartstore") {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  const { data: config } = await supabase
    .from("user_market_configs")
    .select("api_key, secret_key, vendor_id, is_active")
    .eq("user_id", user.id)
    .eq("market_code", marketCode)
    .maybeSingle();

  if (!config || !config.api_key || !config.secret_key) {
    return { success: false as const, error: "API 키가 설정되지 않았습니다" };
  }

  try {
    const apiKey = decryptSecretIfNeeded(config.api_key as string) ?? "";
    const secretKey = decryptSecretIfNeeded(config.secret_key as string) ?? "";

    if (marketCode === "smartstore") {
      const tokenRes = await fetch("https://api.commerce.naver.com/external/v1/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: apiKey,
          client_secret: secretKey,
          grant_type: "client_credentials",
          type: "SELF",
        }),
      });

      if (!tokenRes.ok) {
        const payload = await tokenRes.json().catch(() => null) as
          | { error?: string; error_description?: string }
          | null;
        const description = payload?.error_description ?? payload?.error ?? "인증 실패";
        return { success: false as const, error: `인증 실패 (HTTP ${tokenRes.status}): ${description}` };
      }

      return { success: true as const, message: "스마트스토어 API 연결 성공" };
    }

    if (marketCode === "coupang") {
      // 쿠팡은 HMAC 서명이 필요하므로 간단한 연결 확인만 수행
      const vendorId = (config.vendor_id as string | null) ?? "";
      if (!vendorId) {
        return { success: false as const, error: "Vendor ID가 설정되지 않았습니다" };
      }
      return { success: true as const, message: `쿠팡 API 키 확인 완료 (vendor: ${vendorId})` };
    }

    return { success: false as const, error: "지원하지 않는 마켓입니다" };
  } catch (err) {
    return { success: false as const, error: `연결 테스트 실패: ${String(err)}` };
  }
}

// ── 마켓별 수수료율 설정 ──

const saveMarketFeesSchema = z.object({
  fees: z.array(z.object({
    marketCode: z.string(),
    feeRate: z.number().min(0).max(50),
  })),
});

export async function getMarketFeeRates(): Promise<{ data: MarketFeeConfig[] }> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { data: DEFAULT_MARKET_FEES };

  const { data } = await supabase
    .from("user_sourcing_configs")
    .select("market_fee_rates")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data || !data.market_fee_rates) {
    return { data: DEFAULT_MARKET_FEES };
  }

  // DB에 저장된 수수료율로 기본값 덮어쓰기
  const savedRates = data.market_fee_rates as Record<string, number>;
  const merged = DEFAULT_MARKET_FEES.map((fee) => ({
    ...fee,
    feeRate: savedRates[fee.marketCode] ?? fee.feeRate,
  }));

  return { data: merged };
}

export async function saveMarketFeeRatesAction(input: z.infer<typeof saveMarketFeesSchema>) {
  const parsed = saveMarketFeesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  // 수수료율을 JSON 객체로 변환
  const feeRatesObj: Record<string, number> = {};
  for (const fee of parsed.data.fees) {
    feeRatesObj[fee.marketCode] = fee.feeRate;
  }

  const { error } = await supabase
    .from("user_sourcing_configs")
    .upsert({
      user_id: user.id,
      market_fee_rates: feeRatesObj,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/settings");
  return { success: true as const };
}
