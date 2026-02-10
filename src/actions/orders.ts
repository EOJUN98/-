"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OrderDetail, OrderItemDetail, OrderInternalStatus } from "@/types/order";

const FLOW_STATUSES: OrderInternalStatus[] = [
  "collected",
  "ordered",
  "overseas_shipping",
  "domestic_arrived",
  "shipped",
  "delivered",
  "confirmed",
];

function isFlowStatus(value: string): value is OrderInternalStatus {
  return FLOW_STATUSES.includes(value as OrderInternalStatus);
}

function canTransitionStatus(params: { current: string | null; next: OrderInternalStatus }) {
  const current = (params.current ?? "collected").trim();
  const next = params.next;

  if (current === next) return true;

  // Terminal statuses should not be moved back into the flow.
  if (current === "cancelled" || current === "exchanged") return false;

  // Special rules: cancelled/returned are allowed from anywhere in the flow.
  if (next === "cancelled") return current !== "exchanged";
  if (next === "returned") return current !== "cancelled" && current !== "exchanged";

  // Exchanged typically follows shipped/delivered/confirmed or returned.
  if (next === "exchanged") {
    return current === "returned" || current === "shipped" || current === "delivered" || current === "confirmed";
  }

  // Main flow: forward-only.
  if (!isFlowStatus(current)) return false;
  const fromIndex = FLOW_STATUSES.indexOf(current);
  const toIndex = FLOW_STATUSES.indexOf(next);
  return fromIndex >= 0 && toIndex >= 0 && fromIndex < toIndex;
}

// ── 주문 상태 변경 (단건) ──

const updateStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum([
    "collected",
    "ordered",
    "overseas_shipping",
    "domestic_arrived",
    "shipped",
    "delivered",
    "confirmed",
    "cancelled",
    "returned",
    "exchanged",
  ]),
});

export async function updateOrderStatusAction(input: z.infer<typeof updateStatusSchema>) {
  const parsed = updateStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  const { data: currentRow, error: currentError } = await supabase
    .from("orders")
    .select("internal_status")
    .eq("id", parsed.data.orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (currentError) return { success: false as const, error: currentError.message };
  if (!currentRow) return { success: false as const, error: "주문을 찾지 못했습니다" };

  const currentStatus = (currentRow as { internal_status: string | null }).internal_status;
  if (!canTransitionStatus({ current: currentStatus, next: parsed.data.status as OrderInternalStatus })) {
    return {
      success: false as const,
      error: `상태 전이 규칙 위반: ${(currentStatus ?? "collected")} → ${parsed.data.status}`,
    };
  }

  const { error } = await supabase
    .from("orders")
    .update({ internal_status: parsed.data.status })
    .eq("id", parsed.data.orderId)
    .eq("user_id", user.id);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/orders");
  return { success: true as const, newStatus: parsed.data.status };
}

// ── 주문 상태 일괄 변경 ──

const bulkUpdateStatusSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1),
  status: z.enum([
    "collected",
    "ordered",
    "overseas_shipping",
    "domestic_arrived",
    "shipped",
    "delivered",
    "confirmed",
    "cancelled",
    "returned",
    "exchanged",
  ]),
});

export async function bulkUpdateOrderStatusAction(input: z.infer<typeof bulkUpdateStatusSchema>) {
  const parsed = bulkUpdateStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  const { data: rows, error: fetchError } = await supabase
    .from("orders")
    .select("id, internal_status")
    .eq("user_id", user.id)
    .in("id", parsed.data.orderIds);

  if (fetchError) return { success: false as const, error: fetchError.message };

  const byId = new Map<string, string | null>();
  for (const row of (rows ?? []) as Array<{ id: string; internal_status: string | null }>) {
    byId.set(row.id, row.internal_status);
  }

  const updatedIds: string[] = [];
  const skipped: Array<{ id: string; current: string | null }> = [];

  for (const id of parsed.data.orderIds) {
    const current = byId.get(id) ?? null;
    if (canTransitionStatus({ current, next: parsed.data.status as OrderInternalStatus })) {
      updatedIds.push(id);
    } else {
      skipped.push({ id, current });
    }
  }

  if (updatedIds.length === 0) {
    const sample = skipped[0] ? `${skipped[0].id.slice(0, 8)}: ${(skipped[0].current ?? "collected")}→${parsed.data.status}` : null;
    return { success: false as const, error: sample ? `변경 가능한 주문이 없습니다. 예: ${sample}` : "변경 가능한 주문이 없습니다" };
  }

  const { error } = await supabase
    .from("orders")
    .update({ internal_status: parsed.data.status })
    .eq("user_id", user.id)
    .in("id", updatedIds);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/orders");
  const skippedSample = skipped[0]
    ? `${skipped[0].id.slice(0, 8)}: ${(skipped[0].current ?? "collected")}→${parsed.data.status}`
    : null;
  return {
    success: true as const,
    updatedCount: updatedIds.length,
    updatedIds,
    skippedCount: skipped.length,
    skippedSample,
  };
}

// ── 주문 상세 조회 (아이템 포함) ──

export async function getOrderDetailAction(orderId: string): Promise<{
  success: boolean;
  order?: OrderDetail;
  error?: string;
}> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "로그인이 필요합니다" };

  const { data: row, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, market_config_id, market_status, internal_status, overseas_order_number, overseas_tracking_number, forwarder_id, internal_memo, memo_updated_at, buyer_name, buyer_phone, shipping_address, personal_customs_code, total_price, order_date, tracking_number, courier_code, created_at"
    )
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (error || !row) {
    return { success: false, error: error?.message ?? "주문을 찾지 못했습니다" };
  }

  // market code 조회
  let marketCode: string | null = null;
  if (row.market_config_id) {
    const { data: configRow } = await supabase
      .from("user_market_configs")
      .select("market_code")
      .eq("id", row.market_config_id as string)
      .single();
    marketCode = (configRow as { market_code: string } | null)?.market_code ?? null;
  }

  // 주문 아이템 조회
  const { data: itemRows } = await supabase
    .from("order_items")
    .select("id, market_product_name, market_option_name, quantity, unit_price")
    .eq("order_id", orderId);

  const items: OrderItemDetail[] = ((itemRows ?? []) as Array<{
    id: string;
    market_product_name: string | null;
    market_option_name: string | null;
    quantity: number;
    unit_price: number | string | null;
  }>).map((item) => ({
    id: item.id,
    marketProductName: item.market_product_name,
    marketOptionName: item.market_option_name,
    quantity: item.quantity ?? 1,
    unitPrice: Number(item.unit_price ?? 0),
  }));

  const orderDetail: OrderDetail = {
    id: row.id as string,
    orderNumber: row.order_number as string,
    marketCode,
    marketStatus: row.market_status as string | null,
    internalStatus: (row.internal_status as OrderInternalStatus) ?? "collected",
    overseasOrderNumber: (row.overseas_order_number as string | null) ?? null,
    overseasTrackingNumber: (row.overseas_tracking_number as string | null) ?? null,
    forwarderId: (row.forwarder_id as string | null) ?? null,
    internalMemo: (row.internal_memo as string | null) ?? null,
    memoUpdatedAt: (row.memo_updated_at as string | null) ?? null,
    buyerName: row.buyer_name as string | null,
    buyerPhone: row.buyer_phone as string | null,
    shippingAddress: row.shipping_address as string | null,
    personalCustomsCode: row.personal_customs_code as string | null,
    totalPrice: Number(row.total_price ?? 0),
    orderDate: row.order_date as string | null,
    trackingNumber: row.tracking_number as string | null,
    courierCode: row.courier_code as string | null,
    createdAt: row.created_at as string,
    items,
  };

  return { success: true, order: orderDetail };
}

// ── Overseas tracking + internal memo update ──

const updateOverseasSchema = z.object({
  orderId: z.string().uuid(),
  overseasOrderNumber: z.string().trim().max(120).nullable().optional(),
  overseasTrackingNumber: z.string().trim().max(120).nullable().optional(),
  forwarderId: z.string().trim().max(120).nullable().optional(),
  internalMemo: z.string().trim().max(5000).nullable().optional(),
});

function normalizeNullableText(value: string | null | undefined) {
  if (typeof value === "undefined") return undefined;
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

export async function updateOrderOverseasAndMemoAction(input: z.infer<typeof updateOverseasSchema>) {
  const parsed = updateOverseasSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  const payload: Record<string, unknown> = {};
  const overseasOrderNumber = normalizeNullableText(parsed.data.overseasOrderNumber);
  const overseasTrackingNumber = normalizeNullableText(parsed.data.overseasTrackingNumber);
  const forwarderId = normalizeNullableText(parsed.data.forwarderId);
  const internalMemo = normalizeNullableText(parsed.data.internalMemo);

  if (typeof overseasOrderNumber !== "undefined") payload.overseas_order_number = overseasOrderNumber;
  if (typeof overseasTrackingNumber !== "undefined") payload.overseas_tracking_number = overseasTrackingNumber;
  if (typeof forwarderId !== "undefined") payload.forwarder_id = forwarderId;
  if (typeof internalMemo !== "undefined") {
    payload.internal_memo = internalMemo;
    payload.memo_updated_at = new Date().toISOString();
  }

  if (Object.keys(payload).length === 0) {
    return { success: true as const };
  }

  const { error } = await supabase
    .from("orders")
    .update(payload)
    .eq("id", parsed.data.orderId)
    .eq("user_id", user.id);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/orders");
  return { success: true as const };
}

// ── Internal memo auto-save ──

const updateOrderMemoSchema = z.object({
  orderId: z.string().uuid(),
  memo: z.string().trim().max(5000).nullable(),
});

export async function updateOrderMemoAction(input: z.infer<typeof updateOrderMemoSchema>) {
  const parsed = updateOrderMemoSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  const nextMemo = parsed.data.memo ? parsed.data.memo.trim() : null;

  const { error } = await supabase
    .from("orders")
    .update({
      internal_memo: nextMemo,
      memo_updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.orderId)
    .eq("user_id", user.id);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/orders");
  return { success: true as const, memoUpdatedAt: new Date().toISOString() };
}

// ── Bulk status step (UP/DOWN) ──

const bulkStepStatusSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1),
  direction: z.enum(["up", "down"]),
});

export async function bulkStepOrderStatusAction(input: z.infer<typeof bulkStepStatusSchema>) {
  const parsed = bulkStepStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  const { data: rows, error: fetchError } = await supabase
    .from("orders")
    .select("id, internal_status")
    .eq("user_id", user.id)
    .in("id", parsed.data.orderIds);

  if (fetchError) return { success: false as const, error: fetchError.message };

  const byId = new Map<string, string | null>();
  for (const row of (rows ?? []) as Array<{ id: string; internal_status: string | null }>) {
    byId.set(row.id, row.internal_status);
  }

  const updates: Array<{ id: string; newStatus: OrderInternalStatus }> = [];
  const skipped: Array<{ id: string; current: string | null }> = [];

  for (const orderId of parsed.data.orderIds) {
    const current = (byId.get(orderId) ?? "collected")?.trim() ?? "collected";

    // Do not step terminal/exception statuses here.
    if (current === "cancelled" || current === "returned" || current === "exchanged") {
      skipped.push({ id: orderId, current });
      continue;
    }

    const idx = FLOW_STATUSES.indexOf(current as OrderInternalStatus);
    if (idx < 0) {
      skipped.push({ id: orderId, current });
      continue;
    }

    const nextIdx = parsed.data.direction === "up" ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= FLOW_STATUSES.length) {
      skipped.push({ id: orderId, current });
      continue;
    }

    updates.push({ id: orderId, newStatus: FLOW_STATUSES[nextIdx] });
  }

  if (updates.length === 0) {
    const sample = skipped[0] ? `${skipped[0].id.slice(0, 8)}: ${(skipped[0].current ?? "collected")}` : null;
    return {
      success: false as const,
      error: sample ? `이동 가능한 주문이 없습니다. 예: ${sample}` : "이동 가능한 주문이 없습니다",
    };
  }

  // Group updates by target status to reduce DB round-trips.
  const idsByStatus = new Map<OrderInternalStatus, string[]>();
  for (const u of updates) {
    const list = idsByStatus.get(u.newStatus) ?? [];
    list.push(u.id);
    idsByStatus.set(u.newStatus, list);
  }

  for (const [status, ids] of idsByStatus.entries()) {
    const { error: updateError } = await supabase
      .from("orders")
      .update({ internal_status: status })
      .eq("user_id", user.id)
      .in("id", ids);

    if (updateError) return { success: false as const, error: updateError.message };
  }

  revalidatePath("/orders");
  const skippedSample = skipped[0]
    ? `${skipped[0].id.slice(0, 8)}: ${(skipped[0].current ?? "collected")}`
    : null;

  return {
    success: true as const,
    updatedCount: updates.length,
    updates,
    skippedCount: skipped.length,
    skippedSample,
  };
}

// ── 수동 주문 동기화 트리거 ──

export async function triggerOrderSyncAction() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  // 활성 마켓 설정 확인
  const { data: configs } = await supabase
    .from("user_market_configs")
    .select("id, market_code, vendor_id, api_key, secret_key, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .in("market_code", ["coupang", "smartstore"]);

  if (!configs || configs.length === 0) {
    return { success: false as const, error: "활성화된 마켓 설정이 없습니다. 환경설정에서 마켓을 연동해주세요." };
  }

  const { syncOrdersForMarketConfig } = await import("@/lib/logistics/order-syncer");
  let supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabaseAdmin = createSupabaseAdminClient();
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "서버 환경변수 설정이 필요합니다"
    };
  }

  let totalFetched = 0;
  let totalUpserted = 0;
  const errors: string[] = [];

  for (const config of configs as Array<{
    id: string;
    market_code: string;
    vendor_id: string | null;
    api_key: string | null;
    secret_key: string | null;
    is_active: boolean;
  }>) {
    try {
      const result = await syncOrdersForMarketConfig({
        supabaseAdmin,
        config: {
          id: config.id,
          user_id: user.id,
          market_code: config.market_code,
          vendor_id: config.vendor_id,
          api_key: config.api_key,
          secret_key: config.secret_key,
          is_active: config.is_active,
        },
      });
      totalFetched += result.fetchedCount;
      totalUpserted += result.upsertedCount;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${config.market_code}: ${message.slice(0, 200)}`);
    }
  }

  revalidatePath("/orders");

  if (errors.length > 0) {
    return {
      success: true as const,
      totalFetched,
      totalUpserted,
      warning: errors.join("; "),
    };
  }

  return { success: true as const, totalFetched, totalUpserted };
}
