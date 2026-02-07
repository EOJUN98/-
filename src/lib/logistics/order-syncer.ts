import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchLiveMarketOrders, type NormalizedMarketOrder } from "@/lib/logistics/market-order-clients";
import { decryptSecretIfNeeded } from "@/lib/security/crypto";

export interface OrderSyncMarketConfig {
  id: string;
  user_id: string;
  market_code: string;
  vendor_id: string | null;
  api_key: string | null;
  secret_key: string | null;
  is_active: boolean | null;
}

interface MarketOrderItemInput {
  marketProductName: string;
  marketOptionName?: string | null;
  quantity: number;
  unitPrice: number;
}

interface MarketOrderInput {
  orderNumber: string;
  marketStatus?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  personalCustomsCode?: string | null;
  shippingAddress?: string | null;
  totalPrice?: number;
  orderDate?: string | null;
  trackingNumber?: string | null;
  courierCode?: string | null;
  items?: MarketOrderItemInput[];
}

interface FetchMarketOrdersResult {
  orders: MarketOrderInput[];
  warnings: string[];
}

export interface SyncOrdersResult {
  marketConfigId: string;
  userId: string;
  marketCode: string;
  fetchedCount: number;
  upsertedCount: number;
  upsertedItemCount: number;
  warningMessages: string[];
}

interface UpsertedOrderRow {
  id: string;
}

function toInteger(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
  }
  return fallback;
}

function cleanNullableText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoTimestamp(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toISOString();
}

function summarizeItemsTotal(items: MarketOrderItemInput[]) {
  return items.reduce((acc, item) => {
    const unitPrice = toInteger(item.unitPrice, 0);
    const quantity = Math.max(1, toInteger(item.quantity, 1));
    return acc + unitPrice * quantity;
  }, 0);
}

function buildMockOrders(config: OrderSyncMarketConfig, nowIso: string): MarketOrderInput[] {
  const dateToken = nowIso.slice(0, 10).replace(/-/g, "");
  const marketToken = config.market_code.toUpperCase();
  const suffix = config.id.slice(0, 6).toUpperCase();
  const orderNumber = `MOCK-${marketToken}-${dateToken}-${suffix}`;

  return [
    {
      orderNumber,
      marketStatus: "NEW",
      buyerName: "홍길동",
      buyerPhone: "010-0000-0000",
      personalCustomsCode: "P000000000000",
      shippingAddress: "서울특별시 중구 세종대로 110",
      totalPrice: 12900,
      orderDate: nowIso,
      items: [
        {
          marketProductName: `${config.market_code} 샘플 상품`,
          marketOptionName: "기본 옵션",
          quantity: 1,
          unitPrice: 12900
        }
      ]
    }
  ];
}

async function fetchMarketOrders(config: OrderSyncMarketConfig): Promise<FetchMarketOrdersResult> {
  const warnings: string[] = [];

  let apiKey: string | null = null;
  let secretKey: string | null = null;
  try {
    apiKey = decryptSecretIfNeeded(config.api_key);
    secretKey = decryptSecretIfNeeded(config.secret_key);
  } catch (error) {
    warnings.push(
      `${config.market_code}: API 키 복호화 실패 - ${error instanceof Error ? error.message : "unknown"}`
    );
    return { orders: [], warnings };
  }

  const vendorId = cleanNullableText(config.vendor_id);

  if (!apiKey || !secretKey) {
    warnings.push(`${config.market_code}: API 키가 없어 주문 수집을 건너뜁니다.`);
    return { orders: [], warnings };
  }

  const useMockOrders = process.env.ORDER_SYNC_MOCK_ENABLED === "true";
  if (useMockOrders) {
    return {
      orders: buildMockOrders(config, new Date().toISOString()),
      warnings
    };
  }

  if (config.market_code !== "coupang" && config.market_code !== "smartstore") {
    warnings.push(`${config.market_code}: 주문 수집 미지원 마켓입니다.`);
    return { orders: [], warnings };
  }

  const liveResult = await fetchLiveMarketOrders({
    marketCode: config.market_code,
    apiKey,
    secretKey,
    vendorId
  });

  warnings.push(...liveResult.warnings);

  const orders: MarketOrderInput[] = liveResult.orders.map((order: NormalizedMarketOrder) => ({
    orderNumber: order.orderNumber,
    marketStatus: order.marketStatus ?? null,
    buyerName: order.buyerName ?? null,
    buyerPhone: order.buyerPhone ?? null,
    personalCustomsCode: order.personalCustomsCode ?? null,
    shippingAddress: order.shippingAddress ?? null,
    totalPrice: order.totalPrice,
    orderDate: order.orderDate ?? null,
    trackingNumber: order.trackingNumber ?? null,
    courierCode: order.courierCode ?? null,
    items: order.items?.map((item) => ({
      marketProductName: item.marketProductName,
      marketOptionName: item.marketOptionName ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice
    }))
  }));

  return { orders, warnings };
}

export async function syncOrdersForMarketConfig(params: {
  supabaseAdmin: SupabaseClient;
  config: OrderSyncMarketConfig;
}) {
  const { supabaseAdmin, config } = params;

  const warningMessages: string[] = [];
  const fetched = await fetchMarketOrders(config);
  warningMessages.push(...fetched.warnings);

  let upsertedCount = 0;
  let upsertedItemCount = 0;

  for (const order of fetched.orders) {
    const orderNumber = cleanNullableText(order.orderNumber);
    if (!orderNumber) {
      warningMessages.push(`${config.market_code}: order_number가 비어 있는 주문을 건너뜁니다.`);
      continue;
    }

    const items = (order.items ?? []).filter((item) => {
      return cleanNullableText(item.marketProductName) !== null;
    });

    const nowIso = new Date().toISOString();
    const totalPrice = toInteger(
      order.totalPrice,
      items.length > 0 ? summarizeItemsTotal(items) : 0
    );
    const trackingNumber = cleanNullableText(order.trackingNumber);
    const courierCode = cleanNullableText(order.courierCode);
    const upsertPayload: Record<string, string | number | null> = {
      user_id: config.user_id,
      market_config_id: config.id,
      order_number: orderNumber,
      market_status: cleanNullableText(order.marketStatus),
      buyer_name: cleanNullableText(order.buyerName),
      buyer_phone: cleanNullableText(order.buyerPhone),
      personal_customs_code: cleanNullableText(order.personalCustomsCode),
      shipping_address: cleanNullableText(order.shippingAddress),
      total_price: totalPrice,
      order_date: toIsoTimestamp(order.orderDate, nowIso),
      updated_at: nowIso
    };
    if (trackingNumber) {
      upsertPayload.tracking_number = trackingNumber;
    }
    if (courierCode) {
      upsertPayload.courier_code = courierCode;
    }

    const { data: upsertedOrder, error: upsertError } = await supabaseAdmin
      .from("orders")
      .upsert(
        upsertPayload,
        { onConflict: "user_id,order_number" }
      )
      .select("id")
      .single();

    if (upsertError || !upsertedOrder) {
      warningMessages.push(
        `${config.market_code}: 주문(${orderNumber}) upsert 실패 - ${upsertError?.message ?? "unknown"}`
      );
      continue;
    }

    upsertedCount += 1;

    if (items.length === 0) {
      continue;
    }

    const orderId = (upsertedOrder as UpsertedOrderRow).id;

    const { error: deleteItemsError } = await supabaseAdmin
      .from("order_items")
      .delete()
      .eq("order_id", orderId);

    if (deleteItemsError) {
      warningMessages.push(
        `${config.market_code}: 주문(${orderNumber}) 기존 아이템 삭제 실패 - ${deleteItemsError.message}`
      );
      continue;
    }

    const rows = items.map((item) => ({
      order_id: orderId,
      product_id: null,
      market_product_name: cleanNullableText(item.marketProductName),
      market_option_name: cleanNullableText(item.marketOptionName),
      quantity: Math.max(1, toInteger(item.quantity, 1)),
      unit_price: Math.max(0, toInteger(item.unitPrice, 0))
    }));

    const { error: insertItemError } = await supabaseAdmin
      .from("order_items")
      .insert(rows);

    if (insertItemError) {
      warningMessages.push(
        `${config.market_code}: 주문(${orderNumber}) 아이템 저장 실패 - ${insertItemError.message}`
      );
      continue;
    }

    upsertedItemCount += rows.length;
  }

  const result: SyncOrdersResult = {
    marketConfigId: config.id,
    userId: config.user_id,
    marketCode: config.market_code,
    fetchedCount: fetched.orders.length,
    upsertedCount,
    upsertedItemCount,
    warningMessages
  };

  return result;
}
