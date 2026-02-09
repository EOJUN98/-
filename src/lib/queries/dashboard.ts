import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface DashboardStats {
  // 상품 현황
  totalProducts: number;
  translatedProducts: number;
  policyAppliedProducts: number;
  // 수집 현황
  totalRawProducts: number;
  rawBySite: Record<string, number>;
  // 전송 현황
  publishSuccess: number;
  publishFailed: number;
  publishPending: number;
  // 최근 수집 상품 (5건)
  recentProducts: Array<{
    id: string;
    name: string;
    salePrice: number;
    mainImageUrl: string | null;
    createdAt: string;
  }>;
  // 최근 전송 로그 (5건)
  recentPublishLogs: Array<{
    id: string;
    productName: string;
    marketCode: string | null;
    status: string | null;
    syncedAt: string | null;
  }>;
}

export async function getDashboardStats(): Promise<{
  data: DashboardStats | null;
  error: string | null;
}> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "로그인이 필요합니다" };
  }

  try {
    // 1. 상품 수 통계
    const { count: totalProducts } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_deleted", false);

    const { count: translatedProducts } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .eq("is_translated", true);

    const { count: policyAppliedProducts } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .not("policy_id", "is", null);

    // 2. 수집 원본 통계
    const { count: totalRawProducts } = await supabase
      .from("raw_products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const { data: rawSiteData } = await supabase
      .from("raw_products")
      .select("site_id")
      .eq("user_id", user.id);

    const rawBySite: Record<string, number> = {};
    for (const row of (rawSiteData ?? []) as Array<{ site_id: string }>) {
      rawBySite[row.site_id] = (rawBySite[row.site_id] ?? 0) + 1;
    }

    // 3. 전송 통계
    const { data: productIds } = await supabase
      .from("products")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_deleted", false);

    const ids = (productIds ?? []).map((r: { id: string }) => r.id);

    let publishSuccess = 0;
    let publishFailed = 0;
    let publishPending = 0;

    if (ids.length > 0) {
      const { count: sc } = await supabase
        .from("market_publish_logs")
        .select("id", { count: "exact", head: true })
        .in("product_id", ids)
        .eq("status", "success");
      publishSuccess = sc ?? 0;

      const { count: fc } = await supabase
        .from("market_publish_logs")
        .select("id", { count: "exact", head: true })
        .in("product_id", ids)
        .eq("status", "failed");
      publishFailed = fc ?? 0;

      const { count: pc } = await supabase
        .from("market_publish_logs")
        .select("id", { count: "exact", head: true })
        .in("product_id", ids)
        .eq("status", "pending");
      publishPending = pc ?? 0;
    }

    // 4. 최근 상품 5건
    const { data: recentRows } = await supabase
      .from("products")
      .select("id, name, sale_price, main_image_url, created_at")
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(5);

    const recentProducts = (recentRows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      salePrice: Number(r.sale_price ?? 0),
      mainImageUrl: r.main_image_url as string | null,
      createdAt: r.created_at as string,
    }));

    // 5. 최근 전송 로그 5건
    let recentPublishLogs: DashboardStats["recentPublishLogs"] = [];
    if (ids.length > 0) {
      const { data: logRows } = await supabase
        .from("market_publish_logs")
        .select("id, product_id, market_config_id, status, synced_at")
        .in("product_id", ids)
        .order("synced_at", { ascending: false })
        .limit(5);

      // Get product names and market codes
      const logProductIds = [...new Set((logRows ?? []).map((r: Record<string, unknown>) => r.product_id as string))];
      const logConfigIds = (logRows ?? [])
        .map((r: Record<string, unknown>) => r.market_config_id as string | null)
        .filter((id): id is string => Boolean(id));

      const productNameMap = new Map<string, string>();
      if (logProductIds.length > 0) {
        const { data: pRows } = await supabase
          .from("products")
          .select("id, name")
          .in("id", logProductIds);
        for (const p of (pRows ?? []) as Array<{ id: string; name: string }>) {
          productNameMap.set(p.id, p.name);
        }
      }

      const marketCodeMap = new Map<string, string>();
      if (logConfigIds.length > 0) {
        const { data: mcRows } = await supabase
          .from("user_market_configs")
          .select("id, market_code")
          .in("id", [...new Set(logConfigIds)]);
        for (const mc of (mcRows ?? []) as Array<{ id: string; market_code: string }>) {
          marketCodeMap.set(mc.id, mc.market_code);
        }
      }

      recentPublishLogs = (logRows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        productName: productNameMap.get(r.product_id as string) ?? "알 수 없음",
        marketCode: r.market_config_id ? (marketCodeMap.get(r.market_config_id as string) ?? null) : null,
        status: r.status as string | null,
        syncedAt: r.synced_at as string | null,
      }));
    }

    return {
      data: {
        totalProducts: totalProducts ?? 0,
        translatedProducts: translatedProducts ?? 0,
        policyAppliedProducts: policyAppliedProducts ?? 0,
        totalRawProducts: totalRawProducts ?? 0,
        rawBySite,
        publishSuccess,
        publishFailed,
        publishPending,
        recentProducts,
        recentPublishLogs,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}
