"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ── Types ──

export interface ProductForUpdate {
  id: string;
  name: string;
  productCode: string | null;
  mainImageUrl: string | null;
  salePrice: number;
  costPrice: number;
  stockQuantity: number;
  policyId: string | null;
  policyName: string | null;
  siteId: string | null;
  isTranslated: boolean;
  createdAt: string;
  updatedAt: string | null;
  lastPublishStatus: string | null;
  lastPublishedAt: string | null;
}

export type UpdateField = "price" | "stock" | "image" | "description";

// ── Fetch Products for Update Page ──

export async function fetchProductsForUpdate(filters?: {
  search?: string;
  siteId?: string;
  publishStatus?: string; // "all" | "published" | "unpublished" | "failed"
}): Promise<{
  success: boolean;
  error?: string;
  products?: ProductForUpdate[];
}> {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "인증 필요" };

    // Fetch products with policy name
    const { data: productRows, error: productError } = await supabase
      .from("products")
      .select(`
        id, name, product_code, main_image_url, sale_price, cost_price,
        stock_quantity, policy_id, is_translated, created_at, updated_at,
        product_policies(name),
        raw_products(site_id)
      `)
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(500);

    if (productError) return { success: false, error: productError.message };

    // Fetch latest publish log per product
    const productIds = (productRows ?? []).map((r: Record<string, unknown>) => r.id as string);
    const publishMap = new Map<string, { status: string; syncedAt: string }>();

    if (productIds.length > 0) {
      const { data: logRows } = await supabase
        .from("market_publish_logs")
        .select("product_id, status, synced_at")
        .in("product_id", productIds)
        .order("synced_at", { ascending: false });

      for (const log of (logRows ?? []) as Array<{ product_id: string; status: string; synced_at: string }>) {
        if (!publishMap.has(log.product_id)) {
          publishMap.set(log.product_id, { status: log.status, syncedAt: log.synced_at });
        }
      }
    }

    let products: ProductForUpdate[] = (productRows ?? []).map((row: Record<string, unknown>) => {
      const policy = row.product_policies as { name: string } | null;
      const rawProduct = row.raw_products as { site_id: string } | null;
      const publishInfo = publishMap.get(row.id as string);

      return {
        id: row.id as string,
        name: row.name as string,
        productCode: row.product_code as string | null,
        mainImageUrl: row.main_image_url as string | null,
        salePrice: Number(row.sale_price ?? 0),
        costPrice: Number(row.cost_price ?? 0),
        stockQuantity: Number(row.stock_quantity ?? 999),
        policyId: row.policy_id as string | null,
        policyName: policy?.name ?? null,
        siteId: rawProduct?.site_id ?? null,
        isTranslated: Boolean(row.is_translated),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string | null,
        lastPublishStatus: publishInfo?.status ?? null,
        lastPublishedAt: publishInfo?.syncedAt ?? null,
      };
    });

    // Apply client-side filters
    if (filters?.search) {
      const term = filters.search.toLowerCase();
      products = products.filter((p) => p.name.toLowerCase().includes(term));
    }
    if (filters?.siteId && filters.siteId !== "all") {
      products = products.filter((p) => p.siteId === filters.siteId);
    }
    if (filters?.publishStatus && filters.publishStatus !== "all") {
      if (filters.publishStatus === "published") {
        products = products.filter((p) => p.lastPublishStatus === "success");
      } else if (filters.publishStatus === "unpublished") {
        products = products.filter((p) => !p.lastPublishStatus);
      } else if (filters.publishStatus === "failed") {
        products = products.filter((p) => p.lastPublishStatus === "failed");
      }
    }

    return { success: true, products };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Bulk Update Products ──

export async function bulkUpdateProducts(
  productIds: string[],
  updateFields: UpdateField[],
  policyId?: string | null
): Promise<{
  success: boolean;
  error?: string;
  updatedCount?: number;
}> {
  try {
    if (productIds.length === 0) return { success: false, error: "상품을 선택해주세요" };
    if (updateFields.length === 0) return { success: false, error: "업데이트 항목을 선택해주세요" };

    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "인증 필요" };

    // If price update is requested and a policy is specified, recalculate prices
    if (updateFields.includes("price") && policyId) {
      const { data: policy } = await supabase
        .from("product_policies")
        .select("base_margin_rate, base_margin_amount, international_shipping_fee, domestic_shipping_fee, exchange_rate, platform_fee_rate")
        .eq("id", policyId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (policy) {
        const pr = policy as Record<string, unknown>;
        const marginRate = Number(pr.base_margin_rate ?? 0);
        const marginAmount = Number(pr.base_margin_amount ?? 0);
        const exRate = Number(pr.exchange_rate ?? 1);
        const shippingFee = Number(pr.international_shipping_fee ?? 0) + Number(pr.domestic_shipping_fee ?? 0);
        const feeRate = Number(pr.platform_fee_rate ?? 0);

        // Fetch products to recalculate
        const { data: productsData } = await supabase
          .from("products")
          .select("id, cost_price")
          .eq("user_id", user.id)
          .in("id", productIds);

        for (const prod of (productsData ?? []) as Array<{ id: string; cost_price: number | string | null }>) {
          const cost = Number(prod.cost_price ?? 0);
          const purchaseCost = cost * exRate;
          const margin = marginAmount > 0 ? marginAmount : Math.round(purchaseCost * (marginRate / 100));
          const baseCost = purchaseCost + margin + shippingFee;
          const denominator = Math.max(0.01, 1 - feeRate / 100);
          const salePrice = Math.ceil(baseCost / denominator / 100) * 100;

          await supabase
            .from("products")
            .update({
              sale_price: salePrice,
              exchange_rate: exRate,
              margin_rate: marginRate,
              shipping_fee: shippingFee,
              updated_at: new Date().toISOString(),
            })
            .eq("id", prod.id)
            .eq("user_id", user.id);
        }
      }
    }

    // Mark updated_at for all selected products
    const { data, error } = await supabase
      .from("products")
      .update({ updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .in("id", productIds)
      .select("id");

    if (error) return { success: false, error: error.message };

    revalidatePath("/product-update");
    revalidatePath("/products");

    return { success: true, updatedCount: data?.length ?? 0 };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Bulk Publish to Markets ──

export async function bulkPublishToMarkets(
  productIds: string[],
  marketCodes: string[]
): Promise<{
  success: boolean;
  error?: string;
  totalAttempted?: number;
  successCount?: number;
  failedCount?: number;
  results?: Array<{
    productId: string;
    productName: string;
    marketCode: string;
    status: "success" | "failed" | "skipped";
    message?: string;
  }>;
}> {
  try {
    if (productIds.length === 0) return { success: false, error: "상품을 선택해주세요" };
    if (marketCodes.length === 0) return { success: false, error: "전송할 마켓을 선택해주세요" };

    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "인증 필요" };

    // Fetch market configs
    const { data: marketConfigs } = await supabase
      .from("user_market_configs")
      .select("id, market_code, is_active")
      .eq("user_id", user.id)
      .in("market_code", marketCodes)
      .eq("is_active", true);

    const activeMarkets = new Map<string, string>();
    for (const mc of (marketConfigs ?? []) as Array<{ id: string; market_code: string }>) {
      activeMarkets.set(mc.market_code, mc.id);
    }

    // Fetch products
    const { data: productsData } = await supabase
      .from("products")
      .select("id, name, sale_price, main_image_url, category_id")
      .eq("user_id", user.id)
      .in("id", productIds);

    const results: NonNullable<Awaited<ReturnType<typeof bulkPublishToMarkets>>["results"]> = [];
    let successCount = 0;
    let failedCount = 0;

    for (const product of (productsData ?? []) as Array<{
      id: string;
      name: string;
      sale_price: number | null;
      main_image_url: string | null;
      category_id: number | null;
    }>) {
      for (const marketCode of marketCodes) {
        const configId = activeMarkets.get(marketCode);

        if (!configId) {
          results.push({
            productId: product.id,
            productName: product.name,
            marketCode,
            status: "skipped",
            message: `${marketCode} 마켓 설정이 없거나 비활성 상태`,
          });
          continue;
        }

        // Validate product
        if (!product.sale_price || Number(product.sale_price) <= 0) {
          failedCount++;
          results.push({
            productId: product.id,
            productName: product.name,
            marketCode,
            status: "failed",
            message: "판매가 미설정",
          });
          continue;
        }

        if (!product.main_image_url) {
          failedCount++;
          results.push({
            productId: product.id,
            productName: product.name,
            marketCode,
            status: "failed",
            message: "대표 이미지 없음",
          });
          continue;
        }

        // Insert publish log as pending
        await supabase.from("market_publish_logs").insert({
          product_id: product.id,
          market_config_id: configId,
          status: "pending",
          synced_at: new Date().toISOString(),
        });

        successCount++;
        results.push({
          productId: product.id,
          productName: product.name,
          marketCode,
          status: "success",
          message: "전송 대기열에 추가됨",
        });
      }
    }

    revalidatePath("/product-update");
    revalidatePath("/products");

    return {
      success: true,
      totalAttempted: results.length,
      successCount,
      failedCount,
      results,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
