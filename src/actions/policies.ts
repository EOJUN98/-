"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ProductPolicy,
  PolicySummary,
  MarginTier,
  DetailTemplate,
} from "@/types/policy";

// ── Helpers ──

function getAuthenticatedClient() {
  return createSupabaseServerClient();
}

async function getUser(supabase: ReturnType<typeof createSupabaseServerClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── Fetch Policies List ──

export async function fetchPolicies(): Promise<{
  success: boolean;
  error?: string;
  policies?: PolicySummary[];
}> {
  const supabase = getAuthenticatedClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  const { data, error } = await supabase
    .from("product_policies")
    .select("id, name, is_default, base_margin_rate, target_markets, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return { success: false, error: error.message };

  const policies: PolicySummary[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    isDefault: r.is_default ?? false,
    baseMarginRate: Number(r.base_margin_rate ?? 30),
    targetMarkets: Array.isArray(r.target_markets) ? r.target_markets : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return { success: true, policies };
}

// ── Fetch Single Policy ──

export async function fetchPolicy(
  policyId: string
): Promise<{ success: boolean; error?: string; policy?: ProductPolicy }> {
  const supabase = getAuthenticatedClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  const { data: row, error } = await supabase
    .from("product_policies")
    .select("*")
    .eq("id", policyId)
    .eq("user_id", user.id)
    .single();

  if (error || !row) return { success: false, error: error?.message ?? "정책을 찾을 수 없습니다" };

  const { data: tiers } = await supabase
    .from("policy_margin_tiers")
    .select("*")
    .eq("policy_id", policyId)
    .order("sort_order", { ascending: true });

  const marginTiers: MarginTier[] = (tiers ?? []).map((t) => ({
    id: t.id,
    minPrice: t.min_price,
    maxPrice: t.max_price,
    marginRate: Number(t.margin_rate),
    marginAmount: t.margin_amount ?? 0,
    sortOrder: t.sort_order ?? 0,
  }));

  const policy: ProductPolicy = {
    id: row.id,
    name: row.name,
    isDefault: row.is_default ?? false,
    baseMarginRate: Number(row.base_margin_rate ?? 30),
    baseMarginAmount: row.base_margin_amount ?? 0,
    useTieredMargin: row.use_tiered_margin ?? false,
    marginTiers,
    internationalShippingFee: row.international_shipping_fee ?? 2500,
    shippingWeightUnit: row.shipping_weight_unit ?? "KG",
    shippingWeight: row.shipping_weight ? Number(row.shipping_weight) : null,
    domesticShippingFee: row.domestic_shipping_fee ?? 0,
    freeShippingThreshold: row.free_shipping_threshold ?? 0,
    freeShippingAmount: row.free_shipping_amount ?? 0,
    baseCurrency: row.base_currency ?? "KRW",
    exchangeRate: Number(row.exchange_rate ?? 1),
    targetMarkets: Array.isArray(row.target_markets) ? row.target_markets : [],
    detailTemplateId: row.detail_template_id ?? null,
    translationEnabled: row.translation_enabled ?? false,
    translationSourceLang: row.translation_source_lang ?? "ko",
    translationTargetLang: row.translation_target_lang ?? "ko",
    watermarkEnabled: row.watermark_enabled ?? false,
    watermarkImageUrl: row.watermark_image_url ?? null,
    watermarkPosition: row.watermark_position ?? "bottom-right",
    watermarkOpacity: Number(row.watermark_opacity ?? 0.5),
    platformFeeRate: Number(row.platform_fee_rate ?? 0),
    productNamePrefix: row.product_name_prefix ?? "",
    productNameSuffix: row.product_name_suffix ?? "",
    optionNamePrefix: row.option_name_prefix ?? "",
    optionNameSuffix: row.option_name_suffix ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return { success: true, policy };
}

// ── Create Policy ──

export async function createPolicy(
  name?: string
): Promise<{ success: boolean; error?: string; policyId?: string }> {
  const supabase = getAuthenticatedClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  const { data, error } = await supabase
    .from("product_policies")
    .insert({
      user_id: user.id,
      name: name || "새 정책",
      is_default: false,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/policies");
  return { success: true, policyId: data.id };
}

// ── Update Policy ──

const marginTierSchema = z.object({
  id: z.string().optional(),
  minPrice: z.number().int().min(0),
  maxPrice: z.number().int().min(1),
  marginRate: z.number().min(0).max(100),
  marginAmount: z.number().int().min(0).default(0),
  sortOrder: z.number().int().min(0).default(0),
});

const updatePolicySchema = z.object({
  name: z.string().min(1).max(100),
  baseMarginRate: z.number().min(0).max(100).default(30),
  baseMarginAmount: z.number().int().min(0).default(0),
  useTieredMargin: z.boolean().default(false),
  marginTiers: z.array(marginTierSchema).default([]),
  internationalShippingFee: z.number().int().min(0).default(2500),
  shippingWeightUnit: z.string().default("KG"),
  shippingWeight: z.number().nullable().default(null),
  domesticShippingFee: z.number().int().min(0).default(0),
  freeShippingThreshold: z.number().int().min(0).default(0),
  freeShippingAmount: z.number().int().min(0).default(0),
  baseCurrency: z.string().default("KRW"),
  exchangeRate: z.number().min(0).default(1),
  targetMarkets: z.array(z.string()).default([]),
  detailTemplateId: z.string().nullable().default(null),
  translationEnabled: z.boolean().default(false),
  translationSourceLang: z.string().default("ko"),
  translationTargetLang: z.string().default("ko"),
  watermarkEnabled: z.boolean().default(false),
  watermarkImageUrl: z.string().nullable().default(null),
  watermarkPosition: z.string().default("bottom-right"),
  watermarkOpacity: z.number().min(0).max(1).default(0.5),
  platformFeeRate: z.number().min(0).max(100).default(0),
  productNamePrefix: z.string().default(""),
  productNameSuffix: z.string().default(""),
  optionNamePrefix: z.string().default(""),
  optionNameSuffix: z.string().default(""),
});

export async function updatePolicy(
  policyId: string,
  input: z.infer<typeof updatePolicySchema>
): Promise<{ success: boolean; error?: string }> {
  const parsed = updatePolicySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const supabase = getAuthenticatedClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  const d = parsed.data;

  const { error: updateError } = await supabase
    .from("product_policies")
    .update({
      name: d.name,
      base_margin_rate: d.baseMarginRate,
      base_margin_amount: d.baseMarginAmount,
      use_tiered_margin: d.useTieredMargin,
      international_shipping_fee: d.internationalShippingFee,
      shipping_weight_unit: d.shippingWeightUnit,
      shipping_weight: d.shippingWeight,
      domestic_shipping_fee: d.domesticShippingFee,
      free_shipping_threshold: d.freeShippingThreshold,
      free_shipping_amount: d.freeShippingAmount,
      base_currency: d.baseCurrency,
      exchange_rate: d.exchangeRate,
      target_markets: d.targetMarkets,
      detail_template_id: d.detailTemplateId,
      translation_enabled: d.translationEnabled,
      translation_source_lang: d.translationSourceLang,
      translation_target_lang: d.translationTargetLang,
      watermark_enabled: d.watermarkEnabled,
      watermark_image_url: d.watermarkImageUrl,
      watermark_position: d.watermarkPosition,
      watermark_opacity: d.watermarkOpacity,
      platform_fee_rate: d.platformFeeRate,
      product_name_prefix: d.productNamePrefix,
      product_name_suffix: d.productNameSuffix,
      option_name_prefix: d.optionNamePrefix,
      option_name_suffix: d.optionNameSuffix,
    })
    .eq("id", policyId)
    .eq("user_id", user.id);

  if (updateError) return { success: false, error: updateError.message };

  // Sync margin tiers: delete all then re-insert
  const { error: deleteTierError } = await supabase
    .from("policy_margin_tiers")
    .delete()
    .eq("policy_id", policyId);

  if (deleteTierError) {
    return { success: false, error: `기존 마진 구간 삭제 실패: ${deleteTierError.message}` };
  }

  if (d.marginTiers.length > 0) {
    const tierRows = d.marginTiers.map((t, i) => ({
      policy_id: policyId,
      min_price: t.minPrice,
      max_price: t.maxPrice,
      margin_rate: t.marginRate,
      margin_amount: t.marginAmount,
      sort_order: i,
    }));

    const { error: tierError } = await supabase
      .from("policy_margin_tiers")
      .insert(tierRows);

    if (tierError) return { success: false, error: `마진 구간 저장 실패: ${tierError.message}` };
  }

  revalidatePath("/policies");
  revalidatePath(`/policies/${policyId}`);
  return { success: true };
}

// ── Delete Policy ──

export async function deletePolicy(
  policyId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAuthenticatedClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  const { error } = await supabase
    .from("product_policies")
    .delete()
    .eq("id", policyId)
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/policies");
  return { success: true };
}

// ── Copy Policy ──

export async function copyPolicy(
  policyId: string
): Promise<{ success: boolean; error?: string; newPolicyId?: string }> {
  const supabase = getAuthenticatedClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  // Fetch source
  const result = await fetchPolicy(policyId);
  if (!result.success || !result.policy) {
    return { success: false, error: result.error ?? "원본 정책을 찾을 수 없습니다" };
  }

  const src = result.policy;

  // Insert copy
  const { data: newRow, error: insertError } = await supabase
    .from("product_policies")
    .insert({
      user_id: user.id,
      name: `${src.name} (복사)`,
      is_default: false,
      base_margin_rate: src.baseMarginRate,
      base_margin_amount: src.baseMarginAmount,
      use_tiered_margin: src.useTieredMargin,
      international_shipping_fee: src.internationalShippingFee,
      shipping_weight_unit: src.shippingWeightUnit,
      shipping_weight: src.shippingWeight,
      domestic_shipping_fee: src.domesticShippingFee,
      free_shipping_threshold: src.freeShippingThreshold,
      free_shipping_amount: src.freeShippingAmount,
      base_currency: src.baseCurrency,
      exchange_rate: src.exchangeRate,
      target_markets: src.targetMarkets,
      detail_template_id: src.detailTemplateId,
      translation_enabled: src.translationEnabled,
      translation_source_lang: src.translationSourceLang,
      translation_target_lang: src.translationTargetLang,
      watermark_enabled: src.watermarkEnabled,
      watermark_image_url: src.watermarkImageUrl,
      watermark_position: src.watermarkPosition,
      watermark_opacity: src.watermarkOpacity,
      platform_fee_rate: src.platformFeeRate,
      product_name_prefix: src.productNamePrefix,
      product_name_suffix: src.productNameSuffix,
      option_name_prefix: src.optionNamePrefix,
      option_name_suffix: src.optionNameSuffix,
    })
    .select("id")
    .single();

  if (insertError || !newRow) return { success: false, error: insertError?.message ?? "복사 실패" };

  // Copy margin tiers
  if (src.marginTiers.length > 0) {
    const tierRows = src.marginTiers.map((t, i) => ({
      policy_id: newRow.id,
      min_price: t.minPrice,
      max_price: t.maxPrice,
      margin_rate: t.marginRate,
      margin_amount: t.marginAmount,
      sort_order: i,
    }));
    const { error: copyTierError } = await supabase
      .from("policy_margin_tiers")
      .insert(tierRows);

    if (copyTierError) {
      return { success: false, error: `마진 구간 복사 실패: ${copyTierError.message}` };
    }
  }

  revalidatePath("/policies");
  return { success: true, newPolicyId: newRow.id };
}

// ── Set Default Policy ──

export async function setDefaultPolicy(
  policyId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAuthenticatedClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  // One statement in DB to avoid a "no default" gap under concurrent requests.
  const { data, error } = await supabase.rpc("set_default_product_policy", {
    p_policy_id: policyId,
  });

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "정책을 찾을 수 없습니다" };

  revalidatePath("/policies");
  return { success: true };
}

// ── Detail Templates ──

export async function fetchDetailTemplates(): Promise<{
  success: boolean;
  error?: string;
  templates?: DetailTemplate[];
}> {
  const supabase = getAuthenticatedClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  const { data, error } = await supabase
    .from("detail_templates")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return { success: false, error: error.message };

  const templates: DetailTemplate[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    headerHtml: r.header_html ?? "",
    footerHtml: r.footer_html ?? "",
    cssStyle: r.css_style ?? "",
    isDefault: r.is_default ?? false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return { success: true, templates };
}

const saveTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  headerHtml: z.string().default(""),
  footerHtml: z.string().default(""),
  cssStyle: z.string().default(""),
  isDefault: z.boolean().default(false),
});

export async function saveDetailTemplate(
  input: z.infer<typeof saveTemplateSchema>
): Promise<{ success: boolean; error?: string; templateId?: string }> {
  const parsed = saveTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const supabase = getAuthenticatedClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  const payload = {
    user_id: user.id,
    name: parsed.data.name,
    header_html: parsed.data.headerHtml,
    footer_html: parsed.data.footerHtml,
    css_style: parsed.data.cssStyle,
    is_default: parsed.data.isDefault,
  };

  if (parsed.data.id) {
    const { error } = await supabase
      .from("detail_templates")
      .update(payload)
      .eq("id", parsed.data.id)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/policies");
    return { success: true, templateId: parsed.data.id };
  }

  const { data, error } = await supabase
    .from("detail_templates")
    .insert(payload)
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/policies");
  return { success: true, templateId: data.id };
}

export async function deleteDetailTemplate(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAuthenticatedClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  const { error } = await supabase
    .from("detail_templates")
    .delete()
    .eq("id", templateId)
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/policies");
  return { success: true };
}
