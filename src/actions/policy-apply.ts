"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface ProductWithPolicy {
  id: string;
  name: string;
  mainImageUrl: string | null;
  salePrice: number | null;
  costPrice: number | null;
  policyId: string | null;
  policyName: string | null;
  createdAt: string;
}

export interface PolicyOption {
  id: string;
  name: string;
  isDefault: boolean;
}

/** 상품 목록 + 적용된 정책명 조회 */
export async function fetchProductsWithPolicy(
  search?: string,
  policyFilter?: string // "all" | "none" | policyId
): Promise<{
  success: boolean;
  error?: string;
  products?: ProductWithPolicy[];
  totalCount?: number;
  appliedCount?: number;
}> {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "인증 필요" };

    // products + policy name via left join (using RPC or manual query)
    let query = supabase
      .from("products")
      .select(`
        id,
        name,
        main_image_url,
        sale_price,
        cost_price,
        policy_id,
        created_at,
        product_policies(name)
      `)
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(500);

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    if (policyFilter && policyFilter !== "all") {
      if (policyFilter === "none") {
        query = query.is("policy_id", null);
      } else {
        query = query.eq("policy_id", policyFilter);
      }
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const products: ProductWithPolicy[] = (data ?? []).map((row: Record<string, unknown>) => {
      const policy = row.product_policies as { name: string } | null;
      return {
        id: row.id as string,
        name: row.name as string,
        mainImageUrl: row.main_image_url as string | null,
        salePrice: row.sale_price as number | null,
        costPrice: row.cost_price as number | null,
        policyId: row.policy_id as string | null,
        policyName: policy?.name ?? null,
        createdAt: row.created_at as string,
      };
    });

    const totalCount = products.length;
    const appliedCount = products.filter((p) => p.policyId !== null).length;

    return { success: true, products, totalCount, appliedCount };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** 선택된 상품에 정책 일괄 적용/해제 */
export async function applyPolicyToProducts(
  productIds: string[],
  policyId: string | null
): Promise<{ success: boolean; error?: string; updatedCount?: number }> {
  try {
    if (productIds.length === 0) {
      return { success: false, error: "상품을 선택해주세요." };
    }

    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "인증 필요" };

    if (policyId) {
      const { data: policyRow, error: policyError } = await supabase
        .from("product_policies")
        .select("id")
        .eq("id", policyId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (policyError) {
        return { success: false, error: policyError.message };
      }

      if (!policyRow) {
        return { success: false, error: "적용할 정책이 존재하지 않습니다." };
      }
    }

    const { data, error } = await supabase
      .from("products")
      .update({ policy_id: policyId })
      .eq("user_id", user.id)
      .in("id", productIds)
      .select("id");

    if (error) return { success: false, error: error.message };

    revalidatePath("/policy-apply");
    return { success: true, updatedCount: data?.length ?? 0 };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** 드롭다운용 정책 목록 */
export async function fetchPolicySummaryList(): Promise<{
  success: boolean;
  error?: string;
  policies?: PolicyOption[];
}> {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "인증 필요" };

    const { data, error } = await supabase
      .from("product_policies")
      .select("id, name, is_default")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };

    const policies: PolicyOption[] = (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      isDefault: row.is_default as boolean,
    }));

    return { success: true, policies };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
