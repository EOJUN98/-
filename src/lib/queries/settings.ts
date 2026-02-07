import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MarketConfigSummary, SupportedMarketCode } from "@/types/settings";

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

const SUPPORTED_MARKETS: SupportedMarketCode[] = ["smartstore", "coupang"];

function createDefaultSummary(marketCode: SupportedMarketCode): MarketConfigSummary {
  return {
    id: null,
    marketCode,
    isConfigured: false,
    vendorConfigured: false,
    isActive: false,
    defaultDeliveryFee: 0,
    defaultReturnFee: 3000,
    updatedAt: null
  };
}

function mapRowToSummary(row: MarketConfigRow): MarketConfigSummary | null {
  if (row.market_code !== "smartstore" && row.market_code !== "coupang") {
    return null;
  }

  return {
    id: row.id,
    marketCode: row.market_code,
    isConfigured: Boolean(row.api_key) && Boolean(row.secret_key),
    vendorConfigured: Boolean((row.vendor_id ?? "").trim()),
    isActive: Boolean(row.is_active),
    defaultDeliveryFee: row.default_delivery_fee ?? 0,
    defaultReturnFee: row.default_return_fee ?? 3000,
    updatedAt: row.updated_at
  };
}

export async function getMarketConfigSummaries() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      data: SUPPORTED_MARKETS.map(createDefaultSummary),
      error: "로그인이 필요합니다"
    };
  }

  const { data, error } = await supabase
    .from("user_market_configs")
    .select(
      "id, market_code, vendor_id, api_key, secret_key, is_active, default_delivery_fee, default_return_fee, updated_at"
    )
    .eq("user_id", user.id)
    .in("market_code", SUPPORTED_MARKETS);

  if (error) {
    return {
      data: SUPPORTED_MARKETS.map(createDefaultSummary),
      error: error.message
    };
  }

  const byMarket = new Map<SupportedMarketCode, MarketConfigSummary>();
  for (const row of (data ?? []) as MarketConfigRow[]) {
    const mapped = mapRowToSummary(row);
    if (mapped) {
      byMarket.set(mapped.marketCode, mapped);
    }
  }

  const summaries = SUPPORTED_MARKETS.map((marketCode) => {
    return byMarket.get(marketCode) ?? createDefaultSummary(marketCode);
  });

  return {
    data: summaries,
    error: null as string | null
  };
}
