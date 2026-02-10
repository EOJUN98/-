"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  searchProducts,
  type GmarketProduct,
} from "@/lib/api/gmarket";
import {
  crawlProductDetail,
  type GmarketProductDetail,
} from "@/lib/api/gmarket-crawler";

// ── Internal: Load user sourcing config ──

type SupabaseClient = ReturnType<typeof createSupabaseServerClient>;

interface SourcingSettings {
  pageDelayMs: number;
  crawlDelayMs: number;
  bulkMaxTarget: number;
  pageSize: number;
  autoConvert: boolean;
  defaultMarginRate: number;
}

const SOURCING_DEFAULTS: SourcingSettings = {
  pageDelayMs: 300,
  crawlDelayMs: 500,
  bulkMaxTarget: 3000,
  pageSize: 50,
  autoConvert: true,
  defaultMarginRate: 30,
};

async function loadSourcingSettings(supabase: SupabaseClient, userId: string): Promise<SourcingSettings> {
  const { data } = await supabase
    .from("user_sourcing_configs")
    .select("page_delay_ms, crawl_delay_ms, bulk_max_target, page_size, auto_convert, default_margin_rate")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return SOURCING_DEFAULTS;

  return {
    pageDelayMs: data.page_delay_ms ?? 300,
    crawlDelayMs: data.crawl_delay_ms ?? 500,
    bulkMaxTarget: data.bulk_max_target ?? 3000,
    pageSize: data.page_size ?? 50,
    autoConvert: data.auto_convert ?? true,
    defaultMarginRate: Number(data.default_margin_rate ?? 30),
  };
}

// ── Search ──

const searchSchema = z.object({
  keyword: z
    .string()
    .min(1, "검색어를 입력해주세요")
    .max(100, "검색어는 100자 이내로 입력해주세요"),
  pageNum: z.number().int().min(1).default(1),
  sortType: z.enum(["recm", "date", "lowp", "highp", "popr"]).default("recm"),
});

export type GmarketSearchInput = z.infer<typeof searchSchema>;

interface SearchResult {
  success: boolean;
  error?: string;
  totalCount?: number;
  products?: GmarketProduct[];
}

export async function searchGmarketProducts(
  input: GmarketSearchInput
): Promise<SearchResult> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(", "),
    };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  try {
    const result = await searchProducts(parsed.data.keyword, {
      pageNum: parsed.data.pageNum,
      sortType: parsed.data.sortType,
    });

    return {
      success: true,
      totalCount: result.totalCount,
      products: result.products,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "검색 실패",
    };
  }
}

// ── Collect ──

const collectSchema = z.object({
  products: z.array(
    z.object({
      productCode: z.string(),
      productName: z.string(),
      productPrice: z.number(),
      salePrice: z.number(),
      productImage: z.string(),
      productImage300: z.string(),
      detailPageUrl: z.string(),
      sellerName: z.string(),
      delivery: z.string(),
      reviewCount: z.number(),
      rating: z.string(),
    })
  ).min(1, "최소 1개 상품을 선택해주세요"),
  groupName: z.string().trim().max(80).optional(),
});

interface CollectResult {
  success: boolean;
  error?: string;
  insertedCount?: number;
}

export async function collectGmarketProducts(
  input: z.infer<typeof collectSchema>
): Promise<CollectResult> {
  const parsed = collectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(", "),
    };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const inputData = parsed.data;
  const userId = user.id;

  const settings = await loadSourcingSettings(supabase, userId);

  async function createJob() {
    const displayName = inputData.groupName?.trim()
      || `GMARKET 수집 · ${new Date().toLocaleString("ko-KR")}`.slice(0, 80);
    const searchUrl = "keyword:manual_select";
    const options = { displayName, source: "manual_select" };

    const { data: jobRow, error } = await supabase
      .from("collection_jobs")
      .insert({
        user_id: userId,
        site_id: "gmarket",
        search_url: searchUrl,
        display_name: displayName,
        status: "completed",
        total_target: inputData.products.length,
        total_collected: inputData.products.length,
        options,
      })
      .select("id")
      .single();

    if (!error && jobRow?.id) return jobRow.id as string;

    const msg = (error?.message ?? "").toLowerCase();
    const isMissingDisplayName = msg.includes("display_name") && msg.includes("does not exist");
    if (!isMissingDisplayName) return null;

    const { data: jobRow2, error: error2 } = await supabase
      .from("collection_jobs")
      .insert({
        user_id: userId,
        site_id: "gmarket",
        search_url: searchUrl,
        status: "completed",
        total_target: inputData.products.length,
        total_collected: inputData.products.length,
        options,
      })
      .select("id")
      .single();

    if (error2 || !jobRow2?.id) return null;
    return jobRow2.id as string;
  }

  const jobId = await createJob();
  if (!jobId) {
    return { success: false, error: "수집 그룹 생성에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }

  const rows = inputData.products.map((p) => ({
    user_id: userId,
    job_id: jobId,
    site_id: "gmarket",
    external_id: p.productCode,
    title_origin: p.productName,
    price_origin: p.salePrice > 0 ? p.salePrice : p.productPrice,
    currency: "KRW",
    images_json: [p.productImage300 || p.productImage],
    url: p.detailPageUrl,
    raw_data: {
      sellerName: p.sellerName,
      delivery: p.delivery,
      reviewCount: p.reviewCount,
      rating: p.rating,
      productPrice: p.productPrice,
      salePrice: p.salePrice,
    },
    status: "collected",
  }));

  const { data: rawRows, error } = await supabase
    .from("raw_products")
    .upsert(rows, { onConflict: "user_id,site_id,external_id" })
    .select("id");

  if (error) {
    return { success: false, error: `저장 실패: ${error.message}` };
  }

  if (settings.autoConvert) {
    const rawIds = (rawRows ?? []).map((r) => r.id);
    await autoConvertRawToProducts(supabase, userId, rawIds, settings.defaultMarginRate);
  }

  return { success: true, insertedCount: rawRows?.length ?? 0 };
}

// ── Bulk Collect (Auto-Pagination) ──

const bulkCollectSchema = z.object({
  keyword: z.string().min(1),
  totalTarget: z.number().int().min(1).max(10000).default(100),
  sortType: z.enum(["recm", "date", "lowp", "highp", "popr"]).default("recm"),
  groupName: z.string().trim().max(80).optional(),
});

interface BulkCollectResult {
  success: boolean;
  error?: string;
  totalCollected?: number;
  pagesProcessed?: number;
}

export async function bulkCollectGmarketProducts(
  input: z.infer<typeof bulkCollectSchema>
): Promise<BulkCollectResult> {
  const parsed = bulkCollectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(", "),
    };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const inputData = parsed.data;
  const userId = user.id;

  const settings = await loadSourcingSettings(supabase, userId);
  const effectiveTarget = Math.min(inputData.totalTarget, settings.bulkMaxTarget);
  let totalCollected = 0;
  let currentPage = 1;
  // Gmarket typically shows ~40 items per page
  const estimatedPageSize = 40;
  const maxPages = Math.ceil(effectiveTarget / estimatedPageSize) + 5;

  async function createBulkJob() {
    const displayName = inputData.groupName?.trim()
      || `GMARKET 키워드: ${inputData.keyword}`.slice(0, 80);
    const searchUrl = `keyword:${inputData.keyword}`;
    const options = { displayName, keyword: inputData.keyword, sortType: inputData.sortType, source: "bulk_collect" };

    const { data: jobRow, error } = await supabase
      .from("collection_jobs")
      .insert({
        user_id: userId,
        site_id: "gmarket",
        search_url: searchUrl,
        display_name: displayName,
        status: "processing",
        total_target: effectiveTarget,
        total_collected: 0,
        options,
      })
      .select("id")
      .single();

    if (!error && jobRow?.id) return jobRow.id as string;

    const msg = (error?.message ?? "").toLowerCase();
    const isMissingDisplayName = msg.includes("display_name") && msg.includes("does not exist");
    if (!isMissingDisplayName) return null;

    const { data: jobRow2, error: error2 } = await supabase
      .from("collection_jobs")
      .insert({
        user_id: userId,
        site_id: "gmarket",
        search_url: searchUrl,
        status: "processing",
        total_target: effectiveTarget,
        total_collected: 0,
        options,
      })
      .select("id")
      .single();

    if (error2 || !jobRow2?.id) return null;
    return jobRow2.id as string;
  }

  const jobId = await createBulkJob();
  if (!jobId) {
    return { success: false, error: "대량 수집 그룹 생성에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }

  while (totalCollected < effectiveTarget && currentPage <= maxPages) {
    try {
      const result = await searchProducts(inputData.keyword, {
        pageNum: currentPage,
        sortType: inputData.sortType,
      });

      if (!result.products || result.products.length === 0) break;

      const remaining = effectiveTarget - totalCollected;
      const productsToCollect = result.products.slice(0, remaining);

      const rows = productsToCollect.map((p) => ({
        user_id: userId,
        job_id: jobId,
        site_id: "gmarket",
        external_id: p.productCode,
        title_origin: p.productName,
        price_origin: p.salePrice > 0 ? p.salePrice : p.productPrice,
        currency: "KRW",
        images_json: [p.productImage300 || p.productImage],
        url: p.detailPageUrl,
        raw_data: {
          sellerName: p.sellerName,
          delivery: p.delivery,
          reviewCount: p.reviewCount,
          rating: p.rating,
          productPrice: p.productPrice,
          salePrice: p.salePrice,
        },
        status: "collected",
      }));

      const { data: rawRows, error } = await supabase
        .from("raw_products")
        .upsert(rows, { onConflict: "user_id,site_id,external_id" })
        .select("id");

      if (error) {
        return {
          success: false,
          error: `페이지 ${currentPage} 저장 실패: ${error.message}`,
          totalCollected,
          pagesProcessed: currentPage - 1,
        };
      }

      if (settings.autoConvert) {
        const rawIds = (rawRows ?? []).map((r) => r.id);
        await autoConvertRawToProducts(supabase, userId, rawIds, settings.defaultMarginRate);
      }

      totalCollected += rawRows?.length ?? 0;
      await supabase
        .from("collection_jobs")
        .update({
          total_collected: totalCollected,
          status: totalCollected >= effectiveTarget ? "completed" : "processing",
        })
        .eq("id", jobId)
        .eq("user_id", userId);
      currentPage++;

      if (currentPage <= maxPages && totalCollected < effectiveTarget) {
        await new Promise((resolve) => setTimeout(resolve, settings.pageDelayMs));
      }
    } catch (err) {
      return {
        success: false,
        error: `페이지 ${currentPage} 수집 중 오류: ${err instanceof Error ? err.message : String(err)}`,
        totalCollected,
        pagesProcessed: currentPage - 1,
      };
    }
  }

  // Ensure the job is marked completed even when the site returns fewer results than requested.
  await supabase
    .from("collection_jobs")
    .update({ total_collected: totalCollected, status: "completed" })
    .eq("id", jobId)
    .eq("user_id", userId);

  return {
    success: true,
    totalCollected,
    pagesProcessed: currentPage - 1,
  };
}

// ── Internal: Convert raw_products → products ──

async function autoConvertRawToProducts(
  supabase: SupabaseClient,
  userId: string,
  rawIds: string[],
  marginRate = 30
): Promise<number> {
  if (rawIds.length === 0) return 0;

  interface RawProductDbRow {
    id: string;
    external_id: string | null;
    job_id: string | null;
    title_origin: string | null;
    price_origin: number | string | null;
    currency: string | null;
    images_json: unknown;
    raw_data: unknown;
  }

  const { data: rawProductsData } = await supabase
    .from("raw_products")
    .select("*")
    .eq("user_id", userId)
    .in("id", rawIds);

  const rawProducts = ((rawProductsData ?? []) as RawProductDbRow[]).filter(Boolean);
  if (rawProducts.length === 0) return 0;

  const rawIdList = rawProducts.map((rp) => rp.id);
  const { data: existingProductsData } = await supabase
    .from("products")
    .select("raw_id")
    .eq("user_id", userId)
    .in("raw_id", rawIdList);

  const alreadyConverted = new Set(
    ((existingProductsData ?? []) as Array<{ raw_id: string | null }>)
      .map((p) => p.raw_id)
      .filter((value): value is string => Boolean(value))
  );
  const newRawProducts = rawProducts.filter((rp) => !alreadyConverted.has(rp.id));

  if (newRawProducts.length === 0) return 0;

  const jobIds = Array.from(new Set(newRawProducts.map((rp) => rp.job_id).filter((v): v is string => Boolean(v))));
  const jobPolicyById = new Map<string, string | null>();
  const jobCategoryById = new Map<string, number | null>();
  if (jobIds.length > 0) {
    const { data: jobRows } = await supabase
      .from("collection_jobs")
      .select("id, options")
      .eq("user_id", userId)
      .in("id", jobIds);

    for (const row of (jobRows ?? []) as Array<{ id: string; options: unknown }>) {
      const options = (row.options ?? {}) as Record<string, unknown>;
      const policyId = typeof options.policyId === "string" ? options.policyId : null;
      jobPolicyById.set(row.id, policyId);
      const categoryIdRaw = options.categoryId;
      const categoryId = typeof categoryIdRaw === "number" && Number.isFinite(categoryIdRaw)
        ? Math.trunc(categoryIdRaw)
        : null;
      jobCategoryById.set(row.id, categoryId);
    }
  }

  const productRows = newRawProducts.map((rp) => {
    const images = Array.isArray(rp.images_json) ? rp.images_json : [];
    const rawData = (rp.raw_data ?? {}) as Record<string, unknown>;
    const mainImages = Array.isArray(rawData.mainImages) ? rawData.mainImages as string[] : [];
    const detailImages = Array.isArray(rawData.detailImages) ? rawData.detailImages as string[] : [];

    const allImages = mainImages.length > 0
      ? [...mainImages, ...detailImages]
      : images;

    const priceOrigin = Number(rp.price_origin ?? 0);
    const baseName = rp.title_origin?.trim() || rp.external_id?.trim() || "수집 상품";

    return {
      user_id: userId,
      raw_id: rp.id,
      product_code: rp.external_id,
      name: baseName,
      cost_price: priceOrigin,
      exchange_rate: 1,
      margin_rate: marginRate,
      shipping_fee: 0,
      sale_price: Math.ceil(priceOrigin * (1 + marginRate / 100) / 100) * 100,
      main_image_url: allImages[0] ?? null,
      sub_images_url: allImages.slice(1),
      stock_quantity: 999,
      is_translated: false,
      is_deleted: false,
      policy_id: rp.job_id ? (jobPolicyById.get(rp.job_id) ?? null) : null,
      category_id: rp.job_id ? (jobCategoryById.get(rp.job_id) ?? null) : null,
    };
  });

  const { data, error: insertError } = await supabase
    .from("products")
    .insert(productRows)
    .select("id");

  if (insertError) return 0;

  await supabase
    .from("raw_products")
    .update({ status: "converted" })
    .eq("user_id", userId)
    .in("id", rawIds);

  return data?.length ?? 0;
}

// ── Batch Crawl Product Details ──

const batchCrawlSchema = z.object({
  productCodes: z
    .array(z.string())
    .min(1, "최소 1개 상품을 선택해주세요"),
});

interface BatchCrawlResult {
  success: boolean;
  error?: string;
  results?: Array<{
    productCode: string;
    success: boolean;
    error?: string;
    detailImageCount?: number;
    mainImageCount?: number;
  }>;
}

export async function batchCrawlGmarketDetails(
  input: z.infer<typeof batchCrawlSchema>
): Promise<BatchCrawlResult> {
  const parsed = batchCrawlSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(", "),
    };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const settings = await loadSourcingSettings(supabase, user.id);
  const results: NonNullable<BatchCrawlResult["results"]> = [];

  for (const productCode of parsed.data.productCodes) {
    try {
      const detail = await crawlProductDetail(productCode);

      const { error: updateError } = await supabase
        .from("raw_products")
        .update({
          images_json: [...detail.mainImages, ...detail.detailImages],
          raw_data: {
            categoryPath: detail.categoryPath,
            sellerId: detail.sellerId,
            sellerName: detail.sellerName,
            mainImages: detail.mainImages,
            detailImages: detail.detailImages,
            optionCount: detail.optionCount,
            deliveryType: detail.deliveryType,
            price: detail.price,
            finalPrice: detail.finalPrice,
            ogDescription: detail.ogDescription,
          },
          status: "detail_crawled",
        })
        .eq("user_id", user.id)
        .eq("site_id", "gmarket")
        .eq("external_id", productCode);

      if (updateError) {
        results.push({
          productCode,
          success: false,
          error: updateError.message,
        });
      } else {
        results.push({
          productCode,
          success: true,
          mainImageCount: detail.mainImages.length,
          detailImageCount: detail.detailImages.length,
        });
      }
    } catch (err) {
      results.push({
        productCode,
        success: false,
        error: err instanceof Error ? err.message : "크롤링 실패",
      });
    }

    await new Promise((resolve) => setTimeout(resolve, settings.crawlDelayMs));
  }

  return { success: true, results };
}

// ── Export types for UI ──
export type { GmarketProduct, GmarketProductDetail };
