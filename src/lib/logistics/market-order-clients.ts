import "server-only";

import { createCoupangAuthHeader } from "@/lib/markets/coupang";
import { getSmartStoreAccessToken } from "@/lib/markets/smartstore";

export interface NormalizedMarketOrderItem {
  marketProductName: string;
  marketOptionName?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface NormalizedMarketOrder {
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
  items?: NormalizedMarketOrderItem[];
}

interface FetchLiveOrdersInput {
  marketCode: "coupang" | "smartstore";
  apiKey: string;
  secretKey: string;
  vendorId?: string | null;
}

interface FetchLiveOrdersResult {
  orders: NormalizedMarketOrder[];
  warnings: string[];
}

interface LooseRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readInteger(value: unknown, fallback = 0): number {
  const parsed = readNumber(value);
  if (parsed === null) {
    return fallback;
  }
  return Math.max(0, Math.round(parsed));
}

function readMoneyUnits(value: unknown): number | null {
  if (!isRecord(value)) {
    return readNumber(value);
  }

  const units = readNumber(value.units);
  const nanos = readNumber(value.nanos);

  if (units === null && nanos === null) {
    return null;
  }

  const unitValue = units ?? 0;
  const nanoValue = nanos ?? 0;
  return unitValue + nanoValue / 1_000_000_000;
}

function joinAddress(parts: Array<string | null | undefined>) {
  const filtered = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);

  return filtered.length > 0 ? filtered.join(" ") : null;
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function formatKstDateTime(date: Date) {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const iso = shifted.toISOString();
  return `${iso.slice(0, 16)}+09:00`;
}

function readLookbackMinutes(defaultValue: number) {
  const parsed = readInteger(process.env.ORDER_SYNC_LOOKBACK_MINUTES, defaultValue);
  if (parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, 60 * 24);
}

function collectObjectsByKey(root: unknown, key: string, acc: LooseRecord[] = []) {
  if (Array.isArray(root)) {
    for (const item of root) {
      collectObjectsByKey(item, key, acc);
    }
    return acc;
  }

  if (!isRecord(root)) {
    return acc;
  }

  if (key in root) {
    acc.push(root);
  }

  for (const value of Object.values(root)) {
    collectObjectsByKey(value, key, acc);
  }

  return acc;
}

function extractRowsFromPayload(payload: unknown, keyHint: string) {
  const rows = collectObjectsByKey(payload, keyHint);
  const unique = new Set<LooseRecord>();

  const result: LooseRecord[] = [];
  for (const row of rows) {
    if (unique.has(row)) {
      continue;
    }
    unique.add(row);
    result.push(row);
  }

  return result;
}

function parseCoupangItem(item: unknown): NormalizedMarketOrderItem | null {
  if (!isRecord(item)) {
    return null;
  }

  const productName = readString(item.vendorItemName) ?? readString(item.vendorItemPackageName);
  if (!productName) {
    return null;
  }

  const quantity = Math.max(1, readInteger(item.shippingCount, 1));
  const unitPriceCandidate = readMoneyUnits(item.salesPrice) ?? readMoneyUnits(item.orderPrice);
  const unitPrice = Math.max(0, readInteger(unitPriceCandidate, 0));

  return {
    marketProductName: productName,
    marketOptionName: null,
    quantity,
    unitPrice
  };
}

function parseCoupangOrder(row: unknown): NormalizedMarketOrder | null {
  if (!isRecord(row)) {
    return null;
  }

  const orderNumber = readString(row.orderId) ?? readString(row.shipmentBoxId);
  if (!orderNumber) {
    return null;
  }

  const receiver = isRecord(row.receiver) ? row.receiver : null;
  const orderer = isRecord(row.orderer) ? row.orderer : null;
  const overseas = isRecord(row.overseasShippingInfo) ? row.overseasShippingInfo : null;

  const address = joinAddress([
    receiver ? readString(receiver.addr1) : null,
    receiver ? readString(receiver.addr2) : null,
    receiver ? readString(receiver.postCode) : null
  ]);

  const rawItems = Array.isArray(row.orderItems) ? row.orderItems : [];
  const items = rawItems
    .map((item) => parseCoupangItem(item))
    .filter((item): item is NormalizedMarketOrderItem => item !== null);

  const summedTotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const totalPrice = readMoneyUnits(row.orderPrice) ?? readMoneyUnits(row.finalPaidAmount) ?? summedTotal;

  return {
    orderNumber,
    marketStatus: readString(row.status),
    buyerName: (receiver ? readString(receiver.name) : null) ?? (orderer ? readString(orderer.name) : null),
    buyerPhone:
      (receiver ? readString(receiver.safeNumber) : null) ??
      (receiver ? readString(receiver.receiverNumber) : null) ??
      (orderer ? readString(orderer.safeNumber) : null),
    personalCustomsCode:
      (overseas ? readString(overseas.personalCustomsClearanceCode) : null) ??
      (overseas ? readString(overseas.personalCustomClearanceCode) : null),
    shippingAddress: address,
    totalPrice: Math.max(0, readInteger(totalPrice, 0)),
    orderDate: readString(row.orderedAt) ?? readString(row.paidAt),
    trackingNumber: readString(row.invoiceNumber),
    courierCode: readString(row.deliveryCompanyName),
    items
  };
}

async function fetchCoupangOrders(input: FetchLiveOrdersInput): Promise<FetchLiveOrdersResult> {
  const warnings: string[] = [];
  const vendorId = readString(input.vendorId);
  if (!vendorId) {
    return {
      orders: [],
      warnings: ["coupang: vendor_id가 없어 live 주문 수집을 건너뜁니다."]
    };
  }

  const now = new Date();
  const lookbackMinutes = readLookbackMinutes(180);
  const from = new Date(now.getTime() - lookbackMinutes * 60 * 1000);

  const createdAtFrom = formatKstDateTime(from);
  const createdAtTo = formatKstDateTime(now);

  const path = `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(vendorId)}/ordersheets`;
  const statuses = ["ACCEPT", "INSTRUCT"];

  const orderMap = new Map<string, NormalizedMarketOrder>();

  for (const status of statuses) {
    let nextToken: string | null = null;

    for (let page = 0; page < 20; page += 1) {
      const query = new URLSearchParams({
        createdAtFrom,
        createdAtTo,
        status,
        searchType: "timeFrame",
        maxPerPage: "50"
      });

      if (nextToken) {
        query.set("nextToken", nextToken);
      }

      const response = await fetch(`https://api-gateway.coupang.com${path}?${query.toString()}`, {
        method: "GET",
        headers: {
          Authorization: createCoupangAuthHeader("GET", path, {
            accessKey: input.apiKey,
            secretKey: input.secretKey,
            vendorId
          })
        },
        cache: "no-store"
      });

      const result = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        warnings.push(`coupang: 주문 조회 실패(${response.status}) - status=${status}`);
        break;
      }

      const rows = extractRowsFromPayload(result, "orderId");
      for (const row of rows) {
        const parsed = parseCoupangOrder(row);
        if (parsed) {
          orderMap.set(parsed.orderNumber, parsed);
        }
      }

      const parsedNextToken =
        (isRecord(result) ? readString(result.nextToken) : null) ??
        (isRecord(result) && isRecord(result.data) ? readString(result.data.nextToken) : null);

      if (!parsedNextToken) {
        break;
      }

      nextToken = parsedNextToken;
    }
  }

  return {
    orders: Array.from(orderMap.values()),
    warnings
  };
}

function parseSmartstoreItems(entry: LooseRecord): NormalizedMarketOrderItem[] {
  const products = Array.isArray(entry.products)
    ? entry.products
    : Array.isArray(entry.productItems)
      ? entry.productItems
      : null;

  if (products) {
    const mapped = products
      .map((item) => {
        if (!isRecord(item)) {
          return null;
        }

        const name = readString(item.productName) ?? readString(item.goodsName);
        if (!name) {
          return null;
        }

        const option = readString(item.optionValue) ?? readString(item.productOption);
        const quantity = Math.max(1, readInteger(item.quantity ?? item.productCount, 1));
        const unitPrice = Math.max(0, readInteger(item.unitPrice ?? item.salePrice ?? item.productPrice, 0));

        return {
          marketProductName: name,
          marketOptionName: option,
          quantity,
          unitPrice
        } as NormalizedMarketOrderItem;
      })
      .filter((item): item is NormalizedMarketOrderItem => item !== null);

    if (mapped.length > 0) {
      return mapped;
    }
  }

  const name = readString(entry.productName) ?? readString(entry.goodsName);
  if (!name) {
    return [];
  }

  return [
    {
      marketProductName: name,
      marketOptionName: readString(entry.productOption) ?? readString(entry.optionValue),
      quantity: Math.max(1, readInteger(entry.quantity ?? entry.productCount, 1)),
      unitPrice: Math.max(0, readInteger(entry.unitPrice ?? entry.salePrice ?? entry.productPrice, 0))
    }
  ];
}

function parseSmartstoreOrder(entry: LooseRecord): NormalizedMarketOrder | null {
  const orderNumber = readString(entry.productOrderId) ?? readString(entry.orderId);
  if (!orderNumber) {
    return null;
  }

  const shippingAddress = isRecord(entry.shippingAddress) ? entry.shippingAddress : null;

  const items = parseSmartstoreItems(entry);
  const totalFromItems = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

  const totalPrice =
    readNumber(entry.totalPaymentAmount) ??
    readNumber(entry.paymentAmount) ??
    readNumber(entry.orderPrice) ??
    totalFromItems;

  return {
    orderNumber,
    marketStatus: readString(entry.productOrderStatus) ?? readString(entry.lastChangedType),
    buyerName: readString(entry.ordererName) ?? readString(entry.receiverName),
    buyerPhone:
      readString(entry.receiverTel1) ??
      readString(entry.receiverTel2) ??
      readString(entry.ordererTel1) ??
      readString(entry.ordererTel2),
    personalCustomsCode: readString(entry.customsClearanceCode),
    shippingAddress:
      joinAddress([
        shippingAddress ? readString(shippingAddress.baseAddress) : null,
        shippingAddress ? readString(shippingAddress.detailAddress) : null,
        shippingAddress ? readString(shippingAddress.zipCode) : null
      ]) ??
      joinAddress([
        readString(entry.baseAddress),
        readString(entry.detailAddress),
        readString(entry.zipCode)
      ]),
    totalPrice: Math.max(0, readInteger(totalPrice, 0)),
    orderDate:
      readString(entry.paymentDate) ??
      readString(entry.orderDate) ??
      readString(entry.lastChangedDate),
    trackingNumber: readString(entry.trackingNumber),
    courierCode: readString(entry.deliveryCompany),
    items
  };
}

async function fetchSmartstoreOrders(input: FetchLiveOrdersInput): Promise<FetchLiveOrdersResult> {
  const warnings: string[] = [];

  const accessToken = await getSmartStoreAccessToken({
    clientId: input.apiKey,
    clientSecret: input.secretKey
  });

  const now = new Date();
  const lookbackMinutes = readLookbackMinutes(180);
  const from = new Date(now.getTime() - lookbackMinutes * 60 * 1000);

  const changedQuery = new URLSearchParams({
    lastChangedFrom: from.toISOString(),
    lastChangedTo: now.toISOString(),
    limitCount: "300"
  });

  const changedResponse = await fetch(
    `https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/last-changed-statuses?${changedQuery.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    }
  );

  const changedResult = (await changedResponse.json().catch(() => null)) as unknown;

  if (!changedResponse.ok) {
    return {
      orders: [],
      warnings: [`smartstore: 변경 주문 조회 실패(${changedResponse.status})`]
    };
  }

  const changedRows = extractRowsFromPayload(changedResult, "productOrderId");
  const productOrderIds = Array.from(
    new Set(
      changedRows
        .map((row) => readString(row.productOrderId))
        .filter((id): id is string => Boolean(id))
    )
  );

  if (productOrderIds.length === 0) {
    return {
      orders: [],
      warnings
    };
  }

  const orderMap = new Map<string, NormalizedMarketOrder>();
  const chunks = chunkArray(productOrderIds, 300);

  for (const ids of chunks) {
    const detailResponse = await fetch("https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/query", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ productOrderIds: ids }),
      cache: "no-store"
    });

    const detailResult = (await detailResponse.json().catch(() => null)) as unknown;

    if (!detailResponse.ok) {
      warnings.push(`smartstore: 주문 상세 조회 실패(${detailResponse.status})`);
      continue;
    }

    const detailRows = extractRowsFromPayload(detailResult, "productOrderId");
    for (const row of detailRows) {
      const parsed = parseSmartstoreOrder(row);
      if (parsed) {
        orderMap.set(parsed.orderNumber, parsed);
      }
    }
  }

  return {
    orders: Array.from(orderMap.values()),
    warnings
  };
}

export async function fetchLiveMarketOrders(input: FetchLiveOrdersInput): Promise<FetchLiveOrdersResult> {
  try {
    if (input.marketCode === "coupang") {
      return await fetchCoupangOrders(input);
    }

    return await fetchSmartstoreOrders(input);
  } catch (error) {
    return {
      orders: [],
      warnings: [
        `${input.marketCode}: live 주문 조회 중 오류 - ${error instanceof Error ? error.message : "unknown"}`
      ]
    };
  }
}
