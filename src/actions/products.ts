"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { optimizeProductInfo } from "@/lib/ai/google-studio";
import { calculateSalePrice } from "@/lib/logic/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductListItem } from "@/types/product";

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

const updateProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2, "상품명은 2자 이상이어야 합니다").max(200),
  costPrice: z.number().min(0),
  exchangeRate: z.number().min(0),
  marginRate: z.number().min(0).max(90),
  shippingFee: z.number().min(0),
  marketFeeRate: z.number().min(0).max(40).default(11)
});

const updateProductImageSchema = z.object({
  id: z.string().uuid(),
  mainImageUrl: z
    .string()
    .min(1)
    .refine(
      (value) =>
        value.startsWith("https://") ||
        value.startsWith("http://") ||
        value.startsWith("data:image/"),
      "이미지 URL은 http(s) 또는 data:image 형식이어야 합니다"
    )
});

const generateOptimizationSchema = z.object({
  productId: z.string().uuid(),
  target: z.enum(["name", "description"]),
  task: z.enum(["rewrite", "translate"])
});

const applyOptimizationSchema = z.object({
  productId: z.string().uuid(),
  target: z.enum(["name", "description"]),
  content: z.string().min(2).max(12000),
  markTranslated: z.boolean().default(false)
});

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

function mapProductRow(row: ProductRow): ProductListItem {
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
    lastPublishStatus: null,
    lastPublishError: null,
    lastPublishedAt: null,
    createdAt: row.created_at
  };
}

export async function updateProductAction(input: z.infer<typeof updateProductSchema>) {
  const parsed = updateProductSchema.safeParse(input);
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
    return { success: false as const, error: "로그인이 필요합니다" };
  }

  const pricing = calculateSalePrice({
    costPrice: parsed.data.costPrice,
    exchangeRate: parsed.data.exchangeRate,
    shippingFee: parsed.data.shippingFee,
    marginRate: parsed.data.marginRate,
    marketFeeRate: parsed.data.marketFeeRate
  });

  const { data, error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      cost_price: parsed.data.costPrice,
      exchange_rate: parsed.data.exchangeRate,
      margin_rate: parsed.data.marginRate,
      shipping_fee: parsed.data.shippingFee,
      sale_price: pricing.salePrice
    })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .select(
      "id, product_code, name, sale_price, cost_price, exchange_rate, margin_rate, shipping_fee, main_image_url, category_id, stock_quantity, is_translated, created_at"
    )
    .single();

  if (error || !data) {
    return {
      success: false as const,
      error: error?.message ?? "상품을 찾지 못했습니다"
    };
  }

  revalidatePath("/products");

  return {
    success: true as const,
    product: mapProductRow(data as ProductRow),
    pricing
  };
}

export async function updateProductMainImageAction(input: z.infer<typeof updateProductImageSchema>) {
  const parsed = updateProductImageSchema.safeParse(input);
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
    return { success: false as const, error: "로그인이 필요합니다" };
  }

  const { data, error } = await supabase
    .from("products")
    .update({
      main_image_url: parsed.data.mainImageUrl
    })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .select(
      "id, product_code, name, sale_price, cost_price, exchange_rate, margin_rate, shipping_fee, main_image_url, category_id, stock_quantity, is_translated, created_at"
    )
    .single();

  if (error || !data) {
    return {
      success: false as const,
      error: error?.message ?? "상품을 찾지 못했습니다"
    };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${parsed.data.id}`);

  return {
    success: true as const,
    product: mapProductRow(data as ProductRow)
  };
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function generateProductOptimizationAction(
  input: z.infer<typeof generateOptimizationSchema>
) {
  const parsed = generateOptimizationSchema.safeParse(input);
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
    return { success: false as const, error: "로그인이 필요합니다" };
  }

  const { data: productRow, error: productError } = await supabase
    .from("products")
    .select("id, user_id, name, description_html")
    .eq("id", parsed.data.productId)
    .eq("user_id", user.id)
    .single();

  if (productError || !productRow) {
    return { success: false as const, error: productError?.message ?? "상품을 찾지 못했습니다" };
  }

  const sourceText =
    parsed.data.target === "name"
      ? productRow.name
      : stripHtml(productRow.description_html ?? productRow.name);
  const normalizedSourceText = sourceText.trim() ? sourceText : productRow.name;
  const suggestion = await optimizeProductInfo(normalizedSourceText, parsed.data.task);

  return {
    success: true as const,
    sourceText: normalizedSourceText,
    suggestion
  };
}

// ── Quick inline update (name or sale_price only) ──

const quickUpdateSchema = z.object({
  id: z.string().uuid(),
  field: z.enum(["name", "salePrice"]),
  value: z.union([z.string(), z.number()]),
});

export async function quickUpdateProductAction(input: z.infer<typeof quickUpdateSchema>) {
  const parsed = quickUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  const updatePayload: Record<string, unknown> = {};
  if (parsed.data.field === "name") {
    const name = String(parsed.data.value).trim();
    if (name.length < 2) return { success: false as const, error: "상품명은 2자 이상이어야 합니다" };
    updatePayload.name = name;
  } else {
    const price = Number(parsed.data.value);
    if (!Number.isFinite(price) || price < 0) return { success: false as const, error: "유효한 가격을 입력해주세요" };
    updatePayload.sale_price = Math.round(price);
  }

  const { data, error } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .select("id, name, sale_price")
    .single();

  if (error || !data) {
    return { success: false as const, error: error?.message ?? "상품을 찾지 못했습니다" };
  }

  revalidatePath("/products");
  return {
    success: true as const,
    updatedName: data.name as string,
    updatedSalePrice: Number(data.sale_price ?? 0),
  };
}

// ── Soft delete ──

export async function deleteProductAction(productId: string) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  const { error } = await supabase
    .from("products")
    .update({ is_deleted: true })
    .eq("id", productId)
    .eq("user_id", user.id);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/products");
  return { success: true as const };
}

export async function applyProductOptimizationAction(input: z.infer<typeof applyOptimizationSchema>) {
  const parsed = applyOptimizationSchema.safeParse(input);
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
    return { success: false as const, error: "로그인이 필요합니다" };
  }

  const updatePayload: {
    name?: string;
    description_html?: string;
    is_translated?: boolean;
  } = {};

  if (parsed.data.target === "name") {
    updatePayload.name = parsed.data.content;
  } else {
    updatePayload.description_html = parsed.data.content;
  }

  if (parsed.data.markTranslated) {
    updatePayload.is_translated = true;
  }

  const { error } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", parsed.data.productId)
    .eq("user_id", user.id);

  if (error) {
    return {
      success: false as const,
      error: error.message
    };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${parsed.data.productId}`);

  return {
    success: true as const
  };
}
