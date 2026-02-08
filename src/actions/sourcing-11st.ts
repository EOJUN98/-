"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  searchProducts,
  type EleventhStreetProduct,
} from "@/lib/api/eleventh-street";
import {
  crawlProductDetail,
  type EleventhStreetProductDetail,
} from "@/lib/api/eleventh-street-crawler";

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

const searchSchema = z.object({
  keyword: z
    .string()
    .min(1, "검색어를 입력해주세요")
    .max(100, "검색어는 100자 이내로 입력해주세요"),
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(30),
  sortCd: z
    .enum(["CP", "A", "G", "I", "L", "R"])
    .default("CP"),
});

export type SearchInput = z.infer<typeof searchSchema>;

interface SearchResult {
  success: boolean;
  error?: string;
  totalCount?: number;
  products?: EleventhStreetProduct[];
}

export async function search11stProducts(
  input: SearchInput
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

  const result = await searchProducts(parsed.data.keyword, {
    pageNum: parsed.data.pageNum,
    pageSize: parsed.data.pageSize,
    sortCd: parsed.data.sortCd,
  });

  return {
    success: true,
    totalCount: result.totalCount,
    products: result.products,
  };
}

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
      sellerNick: z.string(),
      seller: z.string(),
      delivery: z.string(),
      reviewCount: z.number(),
      buySatisfy: z.number(),
      rating: z.string(),
    })
  ).min(1, "최소 1개 상품을 선택해주세요"),
});

interface CollectResult {
  success: boolean;
  error?: string;
  insertedCount?: number;
}

export async function collect11stProducts(
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

  // Load user sourcing settings
  const settings = await loadSourcingSettings(supabase, user.id);

  const rows = parsed.data.products.map((p) => ({
    user_id: user.id,
    site_id: "11st",
    external_id: p.productCode,
    title_origin: p.productName,
    price_origin: p.salePrice > 0 ? p.salePrice : p.productPrice,
    currency: "KRW",
    images_json: [p.productImage300 || p.productImage],
    url: p.detailPageUrl,
    raw_data: {
      sellerNick: p.sellerNick,
      seller: p.seller,
      delivery: p.delivery,
      reviewCount: p.reviewCount,
      buySatisfy: p.buySatisfy,
      rating: p.rating,
      productPrice: p.productPrice,
      salePrice: p.salePrice,
    },
    status: "collected",
  }));

  const { data, error } = await supabase
    .from("raw_products")
    .upsert(rows, { onConflict: "user_id,site_id,external_id" })
    .select("id");

  if (error) {
    return { success: false, error: `저장 실패: ${error.message}` };
  }

  // Auto-convert to products table (if enabled)
  if (settings.autoConvert) {
    const rawIds = (data ?? []).map((r) => r.id);
    await autoConvertRawToProducts(supabase, user.id, rawIds, settings.defaultMarginRate);
  }

  return { success: true, insertedCount: data?.length ?? 0 };
}

// ── Bulk Collect (Auto-Pagination) ──

const bulkCollectSchema = z.object({
  keyword: z.string().min(1),
  totalTarget: z.number().int().min(1).max(10000).default(100),
  sortCd: z.enum(["CP", "A", "G", "I", "L", "R"]).default("CP"),
});

interface BulkCollectResult {
  success: boolean;
  error?: string;
  totalCollected?: number;
  pagesProcessed?: number;
}

export async function bulkCollect11stProducts(
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

  // Load user sourcing settings
  const settings = await loadSourcingSettings(supabase, user.id);
  // 11st Open API pageSize is practically capped; clamp to avoid bad requests.
  const pageSize = Math.min(settings.pageSize, 50);
  const effectiveTarget = Math.min(parsed.data.totalTarget, settings.bulkMaxTarget);
  let totalCollected = 0;
  let currentPage = 1;
  const maxPages = Math.ceil(effectiveTarget / pageSize);

  while (totalCollected < effectiveTarget && currentPage <= maxPages) {
    const result = await searchProducts(parsed.data.keyword, {
      pageNum: currentPage,
      pageSize,
      sortCd: parsed.data.sortCd,
    });

    if (!result.products || result.products.length === 0) break;

    const remaining = effectiveTarget - totalCollected;
    const productsToCollect = result.products.slice(0, remaining);

    const rows = productsToCollect.map((p) => ({
      user_id: user.id,
      site_id: "11st",
      external_id: p.productCode,
      title_origin: p.productName,
      price_origin: p.salePrice > 0 ? p.salePrice : p.productPrice,
      currency: "KRW",
      images_json: [p.productImage300 || p.productImage],
      url: p.detailPageUrl,
      raw_data: {
        sellerNick: p.sellerNick,
        seller: p.seller,
        delivery: p.delivery,
        reviewCount: p.reviewCount,
        buySatisfy: p.buySatisfy,
        rating: p.rating,
        productPrice: p.productPrice,
        salePrice: p.salePrice,
      },
      status: "collected",
    }));

    const { data, error } = await supabase
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

    // Auto-convert to products table (if enabled)
    if (settings.autoConvert) {
      const rawIds = (data ?? []).map((r) => r.id);
      await autoConvertRawToProducts(supabase, user.id, rawIds, settings.defaultMarginRate);
    }

    totalCollected += data?.length ?? 0;
    currentPage++;

    // Rate limit between pages (user-configured delay)
    if (currentPage <= maxPages && totalCollected < effectiveTarget) {
      await new Promise((resolve) => setTimeout(resolve, settings.pageDelayMs));
    }
  }

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

  // Filter out already-converted
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

  const productRows = newRawProducts.map((rp) => {
    const images = Array.isArray(rp.images_json) ? rp.images_json : [];
    const rawData = (rp.raw_data ?? {}) as Record<string, unknown>;
    const mainImages = Array.isArray(rawData.mainImages) ? rawData.mainImages as string[] : [];
    const detailImages = Array.isArray(rawData.detailImages) ? rawData.detailImages as string[] : [];

    const allImages = mainImages.length > 0
      ? [...mainImages, ...detailImages]
      : images;

    const priceOrigin = Number(rp.price_origin ?? 0);
    const currency = (rp.currency ?? "USD").toUpperCase();
    const baseName = rp.title_origin?.trim() || rp.external_id?.trim() || "수집 상품";

    return {
      user_id: userId,
      raw_id: rp.id,
      product_code: rp.external_id,
      name: baseName,
      cost_price: priceOrigin,
      exchange_rate: currency == "KRW" ? 1 : 1400,
      margin_rate: marginRate,
      shipping_fee: 0,
      sale_price: currency === "KRW"
        ? Math.ceil(priceOrigin * (1 + marginRate / 100) / 100) * 100
        : Math.ceil(priceOrigin * 1400 * (1 + marginRate / 100) / 100) * 100,
      main_image_url: allImages[0] ?? null,
      sub_images_url: allImages.slice(1),
      stock_quantity: 999,
      is_translated: false,
      is_deleted: false,
    };
  });

  const { data, error: insertError } = await supabase
    .from("products")
    .insert(productRows)
    .select("id");

  if (insertError) return 0;

  // Update raw_products status
  await supabase
    .from("raw_products")
    .update({ status: "converted" })
    .eq("user_id", userId)
    .in("id", rawIds);

  return data?.length ?? 0;
}

// ── Public: Convert Raw Products to Products ──

export async function convertRawToProducts(
  rawIds: string[]
): Promise<{ success: boolean; error?: string; convertedCount?: number }> {
  if (rawIds.length === 0) {
    return { success: false, error: "변환할 상품을 선택해주세요" };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const count = await autoConvertRawToProducts(supabase, user.id, rawIds);
  return { success: true, convertedCount: count };
}

// ── Crawl Product Detail ──

const crawlDetailSchema = z.object({
  productCode: z.string().min(1, "상품 코드가 필요합니다"),
});

interface CrawlDetailResult {
  success: boolean;
  error?: string;
  detail?: EleventhStreetProductDetail;
}

export async function crawl11stProductDetail(
  input: z.infer<typeof crawlDetailSchema>
): Promise<CrawlDetailResult> {
  const parsed = crawlDetailSchema.safeParse(input);
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

  const detail = await crawlProductDetail(parsed.data.productCode);

  // Update raw_products with crawled detail data
  const { error: updateError } = await supabase
    .from("raw_products")
    .update({
      images_json: [...detail.mainImages, ...detail.detailImages],
      raw_data: {
        categoryPath: detail.categoryPath,
        categoryIds: detail.categoryIds,
        sellerId: detail.sellerId,
        sellerName: detail.sellerName,
        mainImages: detail.mainImages,
        detailImages: detail.detailImages,
        optionCount: detail.optionCount,
        optionNames: detail.optionNames,
        deliveryType: detail.deliveryType,
        isAdult: detail.isAdult,
        price: detail.price,
        finalPrice: detail.finalPrice,
        ogDescription: detail.ogDescription,
      },
      status: "detail_crawled",
    })
    .eq("user_id", user.id)
    .eq("site_id", "11st")
    .eq("external_id", parsed.data.productCode);

  if (updateError) {
    return {
      success: false,
      error: `상세정보 저장 실패: ${updateError.message}`,
    };
  }

  return { success: true, detail };
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

export async function batchCrawl11stDetails(
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

  // Load user sourcing settings for crawl delay
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
            categoryIds: detail.categoryIds,
            sellerId: detail.sellerId,
            sellerName: detail.sellerName,
            mainImages: detail.mainImages,
            detailImages: detail.detailImages,
            optionCount: detail.optionCount,
            optionNames: detail.optionNames,
            deliveryType: detail.deliveryType,
            isAdult: detail.isAdult,
            price: detail.price,
            finalPrice: detail.finalPrice,
            ogDescription: detail.ogDescription,
          },
          status: "detail_crawled",
        })
        .eq("user_id", user.id)
        .eq("site_id", "11st")
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

    // Rate limit: user-configured crawl delay
    await new Promise((resolve) => setTimeout(resolve, settings.crawlDelayMs));
  }

  return { success: true, results };
}

// ── Fetch Collected Raw Products ──

export interface RawProductRow {
  id: string;
  external_id: string;
  title_origin: string;
  price_origin: number;
  currency: string;
  images_json: string[];
  url: string;
  site_id: string;
  status: string;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

interface FetchRawProductsResult {
  success: boolean;
  error?: string;
  products?: RawProductRow[];
  totalCount?: number;
}

export async function fetchCollectedProducts(
  page = 1,
  pageSize = 30
): Promise<FetchRawProductsResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { count } = await supabase
    .from("raw_products")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data, error } = await supabase
    .from("raw_products")
    .select(
      "id, external_id, title_origin, price_origin, currency, images_json, url, site_id, status, raw_data, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    products: (data as RawProductRow[]) ?? [],
    totalCount: count ?? 0,
  };
}

// ── Delete Raw Products ──

export async function deleteRawProducts(ids: string[]): Promise<{ success: boolean; error?: string }> {
  if (ids.length === 0) {
    return { success: false, error: "삭제할 상품을 선택해주세요" };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const { error } = await supabase
    .from("raw_products")
    .delete()
    .eq("user_id", user.id)
    .in("id", ids);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
