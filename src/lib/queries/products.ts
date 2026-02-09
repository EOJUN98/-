import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ProductDetailItem,
  ProductListItem,
  ProductPolicyDetail,
  ProductPublishLogItem,
  PublishStatus
} from "@/types/product";

type NumericValue = number | string | null;

function toNumber(value: NumericValue, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === "string");
}

interface ProductRow {
  id: string;
  product_code: string | null;
  name: string;
  sale_price: NumericValue;
  cost_price: NumericValue;
  exchange_rate: NumericValue;
  margin_rate: NumericValue;
  shipping_fee: NumericValue;
  main_image_url: string | null;
  category_id: number | null;
  stock_quantity: number | null;
  is_translated: boolean | null;
  created_at: string;
}

interface ProductDetailRow extends ProductRow {
  description_html: string | null;
  sub_images_url: unknown;
  raw_id: string | null;
  updated_at: string | null;
  policy_id: string | null;
}

interface PublishLogRow {
  id: string;
  product_id: string;
  market_config_id: string | null;
  market_product_id: string | null;
  status: string | null;
  error_message: string | null;
  synced_at: string | null;
}

function mapPublishLogRow(log: PublishLogRow, marketCodeByConfigId?: Map<string, string>): ProductPublishLogItem {
  return {
    id: log.id,
    marketConfigId: log.market_config_id,
    marketCode: log.market_config_id ? marketCodeByConfigId?.get(log.market_config_id) ?? null : null,
    marketProductId: log.market_product_id,
    status: (log.status as PublishStatus | undefined) ?? null,
    errorMessage: log.error_message,
    syncedAt: log.synced_at
  };
}

function mapProductRowToListItem(row: ProductRow, latestLog?: PublishLogRow): ProductListItem {
  return {
    id: row.id,
    productCode: row.product_code,
    name: row.name,
    salePrice: toNumber(row.sale_price, 0),
    costPrice: toNumber(row.cost_price, 0),
    exchangeRate: toNumber(row.exchange_rate, 1),
    marginRate: toNumber(row.margin_rate, 30),
    shippingFee: toNumber(row.shipping_fee, 0),
    mainImageUrl: row.main_image_url,
    categoryId: row.category_id,
    stockQuantity: row.stock_quantity ?? 999,
    isTranslated: Boolean(row.is_translated),
    lastPublishStatus: (latestLog?.status as PublishStatus | undefined) ?? null,
    lastPublishError: latestLog?.error_message ?? null,
    lastPublishedAt: latestLog?.synced_at ?? null,
    createdAt: row.created_at
  };
}

export async function getProductsForDashboard(limit = 100) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: [] as ProductListItem[], error: "로그인이 필요합니다" };
  }

  const { data: productRows, error: productError } = await supabase
    .from("products")
    .select(
      "id, product_code, name, sale_price, cost_price, exchange_rate, margin_rate, shipping_fee, main_image_url, category_id, stock_quantity, is_translated, created_at"
    )
    .eq("user_id", user.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (productError) {
    return { data: [] as ProductListItem[], error: productError.message };
  }

  const rows = (productRows ?? []) as ProductRow[];
  const productIds = rows.map((row) => row.id);

  const latestLogByProduct = new Map<string, PublishLogRow>();
  if (productIds.length > 0) {
    const { data: logRows } = await supabase
      .from("market_publish_logs")
      .select("id, product_id, market_config_id, market_product_id, status, error_message, synced_at")
      .in("product_id", productIds)
      .order("synced_at", { ascending: false });

    for (const log of (logRows ?? []) as PublishLogRow[]) {
      if (!latestLogByProduct.has(log.product_id)) {
        latestLogByProduct.set(log.product_id, log);
      }
    }
  }

  const data: ProductListItem[] = rows.map((row) => {
    const latestLog = latestLogByProduct.get(row.id);
    return mapProductRowToListItem(row, latestLog);
  });

  return { data, error: null as string | null };
}

export async function getProductDetailForDashboard(productId: string) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      data: null as ProductDetailItem | null,
      policyDetail: null as ProductPolicyDetail | null,
      marketFeeRates: null as Record<string, number> | null,
      error: "로그인이 필요합니다"
    };
  }

  const { data: productRow, error: productError } = await supabase
    .from("products")
    .select(
      "id, product_code, name, sale_price, cost_price, exchange_rate, margin_rate, shipping_fee, main_image_url, category_id, stock_quantity, is_translated, created_at, description_html, sub_images_url, raw_id, updated_at, policy_id"
    )
    .eq("id", productId)
    .eq("user_id", user.id)
    .eq("is_deleted", false)
    .maybeSingle();

  if (productError) {
    return {
      data: null as ProductDetailItem | null,
      policyDetail: null as ProductPolicyDetail | null,
      marketFeeRates: null as Record<string, number> | null,
      error: productError.message
    };
  }

  if (!productRow) {
    return {
      data: null as ProductDetailItem | null,
      policyDetail: null as ProductPolicyDetail | null,
      marketFeeRates: null as Record<string, number> | null,
      error: "상품을 찾을 수 없습니다"
    };
  }

  const { data: logRows, error: logError } = await supabase
    .from("market_publish_logs")
    .select("id, product_id, market_config_id, market_product_id, status, error_message, synced_at")
    .eq("product_id", productId)
    .order("synced_at", { ascending: false })
    .limit(100);

  if (logError) {
    return {
      data: null as ProductDetailItem | null,
      policyDetail: null as ProductPolicyDetail | null,
      marketFeeRates: null as Record<string, number> | null,
      error: logError.message
    };
  }

  const rawLogRows = (logRows ?? []) as PublishLogRow[];
  const marketConfigIds = rawLogRows
    .map((row) => row.market_config_id)
    .filter((id): id is string => Boolean(id));

  const marketCodeByConfigId = new Map<string, string>();
  if (marketConfigIds.length > 0) {
    const { data: marketConfigRows } = await supabase
      .from("user_market_configs")
      .select("id, market_code")
      .eq("user_id", user.id)
      .in("id", marketConfigIds);

    for (const row of (marketConfigRows ?? []) as Array<{ id: string; market_code: string }>) {
      marketCodeByConfigId.set(row.id, row.market_code);
    }
  }

  const publishLogs = rawLogRows.map((row) => mapPublishLogRow(row, marketCodeByConfigId));
  const latestLog = rawLogRows[0];

  const mapped = mapProductRowToListItem(productRow as ProductRow, latestLog);

  // Fetch policy detail if product has a policy assigned
  let policyDetail: ProductPolicyDetail | null = null;
  const policyId = (productRow as ProductDetailRow).policy_id;

  if (policyId) {
    const { data: policyRow } = await supabase
      .from("product_policies")
      .select(
        "id, name, base_margin_rate, base_margin_amount, use_tiered_margin, international_shipping_fee, domestic_shipping_fee, exchange_rate, platform_fee_rate, target_markets"
      )
      .eq("id", policyId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (policyRow) {
      const { data: tierRows } = await supabase
        .from("policy_margin_tiers")
        .select("min_price, max_price, margin_rate, margin_amount")
        .eq("policy_id", policyId)
        .order("sort_order", { ascending: true });

      const pr = policyRow as Record<string, unknown>;
      policyDetail = {
        id: pr.id as string,
        name: pr.name as string,
        baseMarginRate: Number(pr.base_margin_rate ?? 0),
        baseMarginAmount: Number(pr.base_margin_amount ?? 0),
        useTieredMargin: Boolean(pr.use_tiered_margin),
        internationalShippingFee: Number(pr.international_shipping_fee ?? 0),
        domesticShippingFee: Number(pr.domestic_shipping_fee ?? 0),
        exchangeRate: Number(pr.exchange_rate ?? 1),
        platformFeeRate: Number(pr.platform_fee_rate ?? 0),
        targetMarkets: Array.isArray(pr.target_markets) ? (pr.target_markets as string[]) : [],
        marginTiers: (tierRows ?? []).map((t: Record<string, unknown>) => ({
          minPrice: Number(t.min_price ?? 0),
          maxPrice: Number(t.max_price ?? 0),
          marginRate: Number(t.margin_rate ?? 0),
          marginAmount: Number(t.margin_amount ?? 0),
        })),
      };
    }
  }

  // Fetch user-level market fee overrides (optional)
  const { data: feeRow } = await supabase
    .from("user_sourcing_configs")
    .select("market_fee_rates")
    .eq("user_id", user.id)
    .maybeSingle();

  const marketFeeRates =
    feeRow && (feeRow as Record<string, unknown>).market_fee_rates
      ? (((feeRow as Record<string, unknown>).market_fee_rates ?? null) as Record<string, number> | null)
      : null;

  const data: ProductDetailItem = {
    ...mapped,
    descriptionHtml: (productRow as ProductDetailRow).description_html,
    subImagesUrl: parseStringArray((productRow as ProductDetailRow).sub_images_url),
    rawId: (productRow as ProductDetailRow).raw_id,
    updatedAt: (productRow as ProductDetailRow).updated_at,
    policyId: policyId ?? null,
    publishLogs
  };

  return { data, policyDetail, marketFeeRates, error: null as string | null };
}
