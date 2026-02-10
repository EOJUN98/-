"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { optimizeProductInfo } from "@/lib/ai/google-studio";
import { uploadToCoupang } from "@/lib/markets/coupang";
import { uploadToSmartStore } from "@/lib/markets/smartstore";
import type { PublishableProduct } from "@/lib/markets/types";
import { decryptSecretIfNeeded } from "@/lib/security/crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PublishMarketCode } from "@/types/product";

const publishInputSchema = z.object({
  productId: z.string().uuid(),
  marketCode: z.enum(["coupang", "smartstore", "11st", "gmarket", "auction"]),
  optimizeTitle: z.boolean().default(true)
});

const retryFailedQueueSchema = z.object({
  productId: z.string().uuid(),
  strategy: z.enum(["latest_per_market", "all"]).default("latest_per_market"),
  limit: z.number().int().min(1).max(50).default(20),
  optimizeTitle: z.boolean().default(false)
});

interface ProductPublishRow {
  id: string;
  user_id: string;
  raw_id: string | null;
  name: string;
  description_html: string | null;
  category_id: number | null;
  sale_price: number | string | null;
  main_image_url: string | null;
  stock_quantity: number | null;
}

interface MarketConfigRow {
  id: string;
  market_code: string;
  vendor_id: string | null;
  api_key: string | null;
  secret_key: string | null;
  is_active: boolean | null;
}

interface PublishHistoryRow {
  id: string;
  market_config_id: string | null;
  status: string | null;
  error_message: string | null;
  synced_at: string | null;
}

type FailureCategoryCode =
  | "AUTH"
  | "CONFIG"
  | "CATEGORY"
  | "IMAGE"
  | "PRICE"
  | "NETWORK"
  | "UNKNOWN";

const CATEGORY_BACKOFF_BASE_SECONDS: Record<FailureCategoryCode, number> = {
  AUTH: 60 * 30,
  CONFIG: 60 * 45,
  CATEGORY: 60 * 30,
  IMAGE: 60 * 10,
  PRICE: 60 * 10,
  NETWORK: 60 * 2,
  UNKNOWN: 60 * 5
};

const FAILURE_TAG_PATTERN = /^\[([A-Z_]+)\]\s*/;

function toNumber(value: number | string | null, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function parseFailureCategoryFromMessage(message?: string | null): FailureCategoryCode | null {
  if (!message) {
    return null;
  }

  const matched = message.match(FAILURE_TAG_PATTERN);
  if (!matched) {
    return null;
  }

  const category = matched[1] as FailureCategoryCode;
  if (category in CATEGORY_BACKOFF_BASE_SECONDS) {
    return category;
  }

  return null;
}

function classifyPublishFailure(message?: string | null): FailureCategoryCode {
  const text = (message ?? "").toLowerCase();

  if (!text.trim()) {
    return "UNKNOWN";
  }

  if (
    text.includes("token") ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("signature") ||
    text.includes("인증") ||
    text.includes("권한")
  ) {
    return "AUTH";
  }

  if (
    text.includes("설정") ||
    text.includes("config") ||
    text.includes("client_id") ||
    text.includes("secret") ||
    text.includes("vendor_id") ||
    text.includes("encryption_key") ||
    text.includes("암호화")
  ) {
    return "CONFIG";
  }

  if (text.includes("category") || text.includes("카테고리")) {
    return "CATEGORY";
  }

  if (text.includes("image") || text.includes("이미지")) {
    return "IMAGE";
  }

  if (text.includes("price") || text.includes("판매가") || text.includes("원가")) {
    return "PRICE";
  }

  if (
    text.includes("timeout") ||
    text.includes("network") ||
    text.includes("fetch") ||
    text.includes("gateway") ||
    text.includes("연결") ||
    text.includes("econn")
  ) {
    return "NETWORK";
  }

  return "UNKNOWN";
}

function stripFailureTag(message: string) {
  return message.replace(FAILURE_TAG_PATTERN, "").trim();
}

function ensureTaggedFailureMessage(message?: string | null) {
  const normalized = (message ?? "알 수 없는 전송 오류").trim();
  const existing = parseFailureCategoryFromMessage(normalized);
  if (existing) {
    return normalized;
  }

  const category = classifyPublishFailure(normalized);
  return `[${category}] ${normalized}`;
}

function getNextRetryAt(params: {
  lastFailureAt: string | null;
  category: FailureCategoryCode;
  consecutiveFailureCount: number;
}) {
  if (!params.lastFailureAt) {
    return null;
  }

  const lastFailureTime = new Date(params.lastFailureAt).getTime();
  if (Number.isNaN(lastFailureTime)) {
    return null;
  }

  const baseDelay = CATEGORY_BACKOFF_BASE_SECONDS[params.category] ?? CATEGORY_BACKOFF_BASE_SECONDS.UNKNOWN;
  const exponent = Math.max(0, params.consecutiveFailureCount - 1);
  const delaySeconds = Math.min(60 * 60 * 24, baseDelay * 2 ** exponent);

  return new Date(lastFailureTime + delaySeconds * 1000);
}

async function insertPublishLog(params: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  productId: string;
  marketConfigId: string | null;
  marketProductId?: string;
  status: "success" | "failed";
  errorMessage?: string;
}) {
  const taggedErrorMessage =
    params.status === "failed"
      ? ensureTaggedFailureMessage(params.errorMessage)
      : params.errorMessage ?? null;

  await params.supabase.from("market_publish_logs").insert({
    product_id: params.productId,
    market_config_id: params.marketConfigId,
    market_product_id: params.marketProductId ?? null,
    status: params.status,
    error_message: taggedErrorMessage,
    synced_at: new Date().toISOString()
  });
}

function marketLabel(marketCode: PublishMarketCode) {
  if (marketCode === "coupang") return "쿠팡";
  if (marketCode === "smartstore") return "스마트스토어";
  if (marketCode === "11st") return "11번가";
  if (marketCode === "gmarket") return "G마켓";
  return "옥션";
}

function buildPublishableProduct(params: {
  product: ProductPublishRow;
  optimizedName: string;
  marketCode: PublishMarketCode;
  categoryId: number | null;
}): PublishableProduct {
  if (!params.categoryId) {
    throw new Error(`${marketLabel(params.marketCode)} 카테고리 ID가 없어 마켓 전송을 진행할 수 없습니다`);
  }

  if (!params.product.main_image_url) {
    throw new Error("대표 이미지가 없어 마켓 전송을 진행할 수 없습니다");
  }

  const salePrice = toNumber(params.product.sale_price, 0);
  if (salePrice <= 0) {
    throw new Error("판매가가 0 이하라 마켓 전송을 진행할 수 없습니다");
  }

  return {
    id: params.product.id,
    name: params.optimizedName,
    descriptionHtml: params.product.description_html ?? `<p>${params.optimizedName}</p>`,
    categoryId: params.categoryId,
    salePrice,
    mainImageUrl: params.product.main_image_url,
    stockQuantity: params.product.stock_quantity ?? 999
  };
}

async function resolveMarketCategoryId(params: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  product: ProductPublishRow;
  marketCode: PublishMarketCode;
}): Promise<number | null> {
  const fallback = params.product.category_id ?? null;
  if (!params.product.raw_id) return fallback;

  const { data: rawRow, error: rawError } = await params.supabase
    .from("raw_products")
    .select("job_id")
    .eq("user_id", params.userId)
    .eq("id", params.product.raw_id)
    .maybeSingle();

  if (rawError || !rawRow?.job_id) return fallback;

  const { data: jobRow, error: jobError } = await params.supabase
    .from("collection_jobs")
    .select("options")
    .eq("user_id", params.userId)
    .eq("id", rawRow.job_id)
    .maybeSingle();

  if (jobError || !jobRow) return fallback;

  const options = (jobRow.options ?? {}) as Record<string, unknown>;
  const marketMap = (options.marketCategoryIds ?? {}) as Record<string, unknown>;

  const key = params.marketCode === "coupang" ? "coupang" : "smartstore";
  const fromMap = marketMap[key];
  if (typeof fromMap === "number" && Number.isFinite(fromMap)) return Math.trunc(fromMap);

  // Backward compatibility (older UI stored only categoryId).
  const legacy = options.categoryId;
  if (params.marketCode === "smartstore" && typeof legacy === "number" && Number.isFinite(legacy)) {
    return Math.trunc(legacy);
  }

  return fallback;
}

async function publishByMarket(params: {
  marketCode: PublishMarketCode;
  product: PublishableProduct;
  marketConfig: MarketConfigRow;
}) {
  const apiKey = decryptSecretIfNeeded(params.marketConfig.api_key);
  const secretKey = decryptSecretIfNeeded(params.marketConfig.secret_key);
  const vendorId = params.marketConfig.vendor_id?.trim() ?? null;

  if (params.marketCode === "coupang") {
    if (!apiKey || !secretKey || !vendorId) {
      throw new Error("쿠팡 API 설정(api_key, secret_key, vendor_id)이 필요합니다");
    }

    return uploadToCoupang(params.product, {
      accessKey: apiKey,
      secretKey,
      vendorId
    });
  }

  if (params.marketCode === "11st" || params.marketCode === "gmarket" || params.marketCode === "auction") {
    throw new Error(`${marketLabel(params.marketCode)} 전송은 아직 준비중입니다`);
  }

  if (!apiKey || !secretKey) {
    throw new Error("스마트스토어 API 설정(client_id, client_secret)이 필요합니다");
  }

  return uploadToSmartStore(params.product, {
    clientId: apiKey,
    clientSecret: secretKey
  });
}

async function getAuthenticatedUserAndProduct(params: {
  productId: string;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      product: null,
      error: "로그인이 필요합니다"
    };
  }

  const { data: productRow, error: productError } = await supabase
    .from("products")
    .select("id, user_id, raw_id, name, description_html, category_id, sale_price, main_image_url, stock_quantity")
    .eq("id", params.productId)
    .eq("user_id", user.id)
    .single();

  if (productError || !productRow) {
    return {
      supabase,
      user,
      product: null,
      error: productError?.message ?? "상품이 존재하지 않습니다"
    };
  }

  return {
    supabase,
    user,
    product: productRow as ProductPublishRow,
    error: null
  };
}

async function executePublish(params: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  product: ProductPublishRow;
  marketCode: PublishMarketCode;
  optimizeTitle: boolean;
}) {
  const { data: marketConfigRow, error: marketConfigError } = await params.supabase
    .from("user_market_configs")
    .select("id, market_code, vendor_id, api_key, secret_key, is_active")
    .eq("user_id", params.userId)
    .eq("market_code", params.marketCode)
    .eq("is_active", true)
    .maybeSingle();

  if (marketConfigError || !marketConfigRow) {
    const errorMessage =
      marketConfigError?.message ?? `마켓 설정 없음: ${params.marketCode}`;

    await insertPublishLog({
      supabase: params.supabase,
      productId: params.product.id,
      marketConfigId: null,
      status: "failed",
      errorMessage
    });

    return {
      success: false as const,
      marketCode: params.marketCode,
      error: errorMessage
    };
  }

  const optimizedName = params.optimizeTitle
    ? await optimizeProductInfo(params.product.name, "rewrite")
    : params.product.name;

  try {
    const categoryId = await resolveMarketCategoryId({
      supabase: params.supabase,
      userId: params.userId,
      product: params.product,
      marketCode: params.marketCode,
    });

    const publishProduct = buildPublishableProduct({
      product: params.product,
      optimizedName,
      marketCode: params.marketCode,
      categoryId,
    });
    const publishResult = await publishByMarket({
      marketCode: params.marketCode,
      product: publishProduct,
      marketConfig: marketConfigRow as MarketConfigRow
    });

    await insertPublishLog({
      supabase: params.supabase,
      productId: params.product.id,
      marketConfigId: marketConfigRow.id,
      marketProductId: publishResult.marketProductId,
      status: "success"
    });

    return {
      success: true as const,
      marketCode: params.marketCode,
      marketProductId: publishResult.marketProductId
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 전송 오류";

    await insertPublishLog({
      supabase: params.supabase,
      productId: params.product.id,
      marketConfigId: marketConfigRow.id,
      status: "failed",
      errorMessage: message
    });

    return {
      success: false as const,
      marketCode: params.marketCode,
      error: message
    };
  }
}

export async function publishProductAction(input: z.infer<typeof publishInputSchema>) {
  const parsed = publishInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues.map((issue) => issue.message).join(", ")
    };
  }

  const authResult = await getAuthenticatedUserAndProduct({
    productId: parsed.data.productId
  });

  if (authResult.error || !authResult.user || !authResult.product) {
    return {
      success: false as const,
      error: authResult.error ?? "인증 오류"
    };
  }

  const result = await executePublish({
    supabase: authResult.supabase,
    userId: authResult.user.id,
    product: authResult.product,
    marketCode: parsed.data.marketCode,
    optimizeTitle: parsed.data.optimizeTitle
  });

  revalidatePath("/products");
  revalidatePath(`/products/${parsed.data.productId}`);

  if (!result.success) {
    return {
      success: false as const,
      error: result.error,
      marketCode: result.marketCode
    };
  }

  return {
    success: true as const,
    marketProductId: result.marketProductId,
    marketCode: result.marketCode
  };
}

export async function retryFailedPublishQueueAction(
  input: z.infer<typeof retryFailedQueueSchema>
) {
  const parsed = retryFailedQueueSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues.map((issue) => issue.message).join(", ")
    };
  }

  const authResult = await getAuthenticatedUserAndProduct({
    productId: parsed.data.productId
  });

  if (authResult.error || !authResult.user || !authResult.product) {
    return {
      success: false as const,
      error: authResult.error ?? "인증 오류"
    };
  }

  const { data: historyRows, error: historyError } = await authResult.supabase
    .from("market_publish_logs")
    .select("id, market_config_id, status, error_message, synced_at")
    .eq("product_id", parsed.data.productId)
    .order("synced_at", { ascending: false })
    .limit(200);

  if (historyError) {
    return {
      success: false as const,
      error: historyError.message
    };
  }

  const logs = (historyRows ?? []) as PublishHistoryRow[];
  const failedLogs = logs.filter((row) => row.status === "failed");

  if (failedLogs.length === 0) {
    return {
      success: true as const,
      totalQueued: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      cooldownSkippedCount: 0,
      results: [] as Array<{
        marketCode: string;
        status: "success" | "failed" | "cooldown_skipped" | "skipped";
        message: string;
        nextRetryAt?: string | null;
      }>
    };
  }

  const marketConfigIds = failedLogs
    .map((row) => row.market_config_id)
    .filter((id): id is string => Boolean(id));

  const marketCodeByConfigId = new Map<string, PublishMarketCode>();
  if (marketConfigIds.length > 0) {
    const { data: marketRows } = await authResult.supabase
      .from("user_market_configs")
      .select("id, market_code")
      .eq("user_id", authResult.user.id)
      .in("id", marketConfigIds);

    for (const row of (marketRows ?? []) as Array<{ id: string; market_code: string }>) {
      if (row.market_code === "coupang" || row.market_code === "smartstore") {
        marketCodeByConfigId.set(row.id, row.market_code);
      }
    }
  }

  const queue: PublishMarketCode[] = [];
  const seenMarket = new Set<PublishMarketCode>();
  const results: Array<{
    marketCode: string;
    status: "success" | "failed" | "cooldown_skipped" | "skipped";
    message: string;
    nextRetryAt?: string | null;
  }> = [];

  const now = Date.now();

  for (const failedLog of failedLogs) {
    const marketCode = failedLog.market_config_id
      ? marketCodeByConfigId.get(failedLog.market_config_id)
      : undefined;

    if (!marketCode) {
      results.push({
        marketCode: "unknown",
        status: "skipped",
        message: "market_config_id에 매핑되는 활성 마켓이 없습니다"
      });
      continue;
    }

    if (parsed.data.strategy === "latest_per_market") {
      if (seenMarket.has(marketCode)) {
        continue;
      }
      seenMarket.add(marketCode);
    }

    const marketHistory = logs.filter((row) => {
      const code = row.market_config_id
        ? marketCodeByConfigId.get(row.market_config_id)
        : undefined;
      return code === marketCode;
    });

    let consecutiveFailureCount = 0;
    for (const row of marketHistory) {
      if (row.status === "failed") {
        consecutiveFailureCount += 1;
      } else {
        break;
      }
    }

    const category =
      parseFailureCategoryFromMessage(failedLog.error_message) ??
      classifyPublishFailure(failedLog.error_message);

    const nextRetryAt = getNextRetryAt({
      lastFailureAt: failedLog.synced_at,
      category,
      consecutiveFailureCount
    });

    if (nextRetryAt && now < nextRetryAt.getTime()) {
      results.push({
        marketCode,
        status: "cooldown_skipped",
        message: `${category} 오류 백오프 적용 중`,
        nextRetryAt: nextRetryAt.toISOString()
      });
      continue;
    }

    queue.push(marketCode);
    if (queue.length >= parsed.data.limit) {
      break;
    }
  }

  let successCount = 0;
  let failedCount = 0;

  for (const marketCode of queue) {
    // Retry sequentially to avoid burst traffic to external market APIs.
    // eslint-disable-next-line no-await-in-loop
    const retryResult = await executePublish({
      supabase: authResult.supabase,
      userId: authResult.user.id,
      product: authResult.product,
      marketCode,
      optimizeTitle: parsed.data.optimizeTitle
    });

    if (retryResult.success) {
      successCount += 1;
      results.push({
        marketCode,
        status: "success",
        message: retryResult.marketProductId
      });
    } else {
      failedCount += 1;
      const category = classifyPublishFailure(retryResult.error);
      results.push({
        marketCode,
        status: "failed",
        message: `[${category}] ${stripFailureTag(retryResult.error)}`
      });
    }
  }

  const cooldownSkippedCount = results.filter((item) => item.status === "cooldown_skipped").length;
  const skippedCount = results.filter((item) => item.status === "skipped").length;

  revalidatePath("/products");
  revalidatePath(`/products/${parsed.data.productId}`);

  return {
    success: true as const,
    totalQueued: queue.length,
    successCount,
    failedCount,
    skippedCount,
    cooldownSkippedCount,
    results
  };
}
