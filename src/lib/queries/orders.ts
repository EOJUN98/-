import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrderListItem } from "@/types/order";

type NumericValue = number | string | null;

interface OrderRow {
  id: string;
  order_number: string;
  market_config_id: string | null;
  market_status: string | null;
  internal_status: string | null;
  overseas_order_number: string | null;
  overseas_tracking_number: string | null;
  forwarder_id: string | null;
  internal_memo: string | null;
  memo_updated_at: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  shipping_address: string | null;
  total_price: NumericValue;
  order_date: string | null;
  tracking_number: string | null;
  courier_code: string | null;
  created_at: string;
}

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

export async function getOrdersForDashboard(limit = 300) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: [] as OrderListItem[], error: "로그인이 필요합니다" };
  }

  const { data: rows, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, market_config_id, market_status, internal_status, overseas_order_number, overseas_tracking_number, forwarder_id, internal_memo, memo_updated_at, buyer_name, buyer_phone, shipping_address, total_price, order_date, tracking_number, courier_code, created_at"
    )
    .eq("user_id", user.id)
    .order("order_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [] as OrderListItem[], error: error.message };
  }

  const orderRows = (rows ?? []) as OrderRow[];
  const configIds = orderRows
    .map((row) => row.market_config_id)
    .filter((id): id is string => Boolean(id));

  const marketCodeByConfigId = new Map<string, string>();
  if (configIds.length > 0) {
    const { data: configRows } = await supabase
      .from("user_market_configs")
      .select("id, market_code")
      .eq("user_id", user.id)
      .in("id", configIds);

    for (const row of (configRows ?? []) as Array<{ id: string; market_code: string }>) {
      marketCodeByConfigId.set(row.id, row.market_code);
    }
  }

  const data: OrderListItem[] = orderRows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    marketCode: row.market_config_id ? marketCodeByConfigId.get(row.market_config_id) ?? null : null,
    marketStatus: row.market_status,
    internalStatus: row.internal_status ?? "collected",
    overseasOrderNumber: row.overseas_order_number ?? null,
    overseasTrackingNumber: row.overseas_tracking_number ?? null,
    forwarderId: row.forwarder_id ?? null,
    internalMemo: row.internal_memo ?? null,
    memoUpdatedAt: row.memo_updated_at ?? null,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    shippingAddress: row.shipping_address,
    totalPrice: toNumber(row.total_price, 0),
    orderDate: row.order_date,
    trackingNumber: row.tracking_number,
    courierCode: row.courier_code,
    createdAt: row.created_at
  }));

  return {
    data,
    error: null as string | null
  };
}

interface CourierCompanyRow {
  code: string;
  name: string;
  coupang_code: string | null;
  smartstore_code: string | null;
  eleventh_code: string | null;
  gmarket_code: string | null;
}

function normalizeCourierKey(value: string) {
  return value.trim().toLowerCase();
}

export async function getCourierNameMapForDashboard() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: {} as Record<string, string>, error: "로그인이 필요합니다" };
  }

  const { data: rows, error } = await supabase
    .from("courier_companies")
    .select("code, name, coupang_code, smartstore_code, eleventh_code, gmarket_code")
    .eq("is_active", true);

  if (error) {
    return { data: {} as Record<string, string>, error: error.message };
  }

  const map: Record<string, string> = {};
  for (const row of (rows ?? []) as CourierCompanyRow[]) {
    const add = (value: string | null | undefined) => {
      const key = (value ?? "").trim();
      if (!key) return;
      map[normalizeCourierKey(key)] = row.name;
    };

    add(row.code);
    add(row.coupang_code);
    add(row.smartstore_code);
    add(row.eleventh_code);
    add(row.gmarket_code);
  }

  return {
    data: map,
    error: null as string | null
  };
}

interface ForwarderCompanyRow {
  code: string;
  name: string;
}

function normalizeForwarderKey(value: string) {
  return value.trim().toLowerCase();
}

export async function getForwarderMetaForDashboard() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      data: {
        options: [] as Array<{ code: string; name: string }>,
        nameMap: {} as Record<string, string>
      },
      error: "로그인이 필요합니다"
    };
  }

  const { data: rows, error } = await supabase
    .from("forwarder_companies")
    .select("code, name")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (error) {
    return {
      data: {
        options: [] as Array<{ code: string; name: string }>,
        nameMap: {} as Record<string, string>
      },
      error: error.message
    };
  }

  const options: Array<{ code: string; name: string }> = [];
  const nameMap: Record<string, string> = {};
  for (const row of (rows ?? []) as ForwarderCompanyRow[]) {
    options.push({ code: row.code, name: row.name });
    nameMap[normalizeForwarderKey(row.code)] = row.name;
  }

  return {
    data: {
      options,
      nameMap
    },
    error: null as string | null
  };
}
