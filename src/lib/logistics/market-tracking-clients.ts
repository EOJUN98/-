import "server-only";

import { createCoupangAuthHeader } from "@/lib/markets/coupang";
import { getSmartStoreAccessToken } from "@/lib/markets/smartstore";

export interface TrackingPushInput {
  marketCode: "coupang" | "smartstore";
  orderNumber: string;
  trackingNumber: string;
  courierCode: string;
  apiKey: string;
  secretKey: string;
  vendorId?: string | null;
}

export type TrackingFailureCategory = "AUTH" | "RATE_LIMIT" | "INVALID" | "SERVER" | "NETWORK" | "UNKNOWN";

export interface TrackingPushResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  statusCode?: number;
  category?: TrackingFailureCategory;
  attempts?: number;
}

interface RequestAttemptResult {
  ok: boolean;
  statusCode?: number;
  message?: string;
  category?: TrackingFailureCategory;
  retryable: boolean;
  attempts: number;
}

function readString(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function withTemplate(template: string, params: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    return encodeURIComponent(params[key] ?? "");
  });
}

function readMaxRetries() {
  const raw = process.env.MARKET_TRACKING_MAX_RETRIES;
  const parsed = raw ? Number(raw) : 1;
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(5, Math.max(0, Math.floor(parsed)));
}

function readRetryBaseMs() {
  const raw = process.env.MARKET_TRACKING_RETRY_BASE_MS;
  const parsed = raw ? Number(raw) : 400;
  if (!Number.isFinite(parsed)) {
    return 400;
  }
  return Math.min(10_000, Math.max(100, Math.floor(parsed)));
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function classifyFailure(statusCode?: number, message?: string): TrackingFailureCategory {
  const text = (message ?? "").toLowerCase();

  if (statusCode === 401 || statusCode === 403 || text.includes("unauthorized") || text.includes("forbidden")) {
    return "AUTH";
  }

  if (statusCode === 429 || text.includes("rate") || text.includes("too many")) {
    return "RATE_LIMIT";
  }

  if (statusCode && statusCode >= 500) {
    return "SERVER";
  }

  if (statusCode && statusCode >= 400) {
    return "INVALID";
  }

  if (text.includes("network") || text.includes("fetch") || text.includes("timeout") || text.includes("econn")) {
    return "NETWORK";
  }

  return "UNKNOWN";
}

function shouldRetry(statusCode?: number, category?: TrackingFailureCategory) {
  if (statusCode === 429) {
    return true;
  }

  if (statusCode && statusCode >= 500) {
    return true;
  }

  return category === "NETWORK";
}

function extractMessageFromPayload(payload: unknown): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    return payload.trim() || null;
  }

  if (typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.message,
    record.error,
    record.errorMessage,
    record.error_description,
    record.detail,
    record.code
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (record.data && typeof record.data === "object") {
    return extractMessageFromPayload(record.data);
  }

  return null;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isMockTrackingEnabled() {
  return process.env.MARKET_TRACKING_MOCK_ENABLED === "true";
}

function isTrackingPushDisabled() {
  return process.env.MARKET_TRACKING_PUSH_ENABLED === "false";
}

async function runWithRetry(request: () => Promise<Response>): Promise<RequestAttemptResult> {
  const maxRetries = readMaxRetries();
  const baseDelay = readRetryBaseMs();

  let attempts = 0;
  let lastStatusCode: number | undefined;
  let lastCategory: TrackingFailureCategory = "UNKNOWN";
  let lastMessage = "응답을 받지 못했습니다";

  while (attempts <= maxRetries) {
    attempts += 1;

    try {
      const response = await request();
      const payload = await readJsonResponse(response);
      const payloadMessage = extractMessageFromPayload(payload) ?? undefined;

      if (response.ok) {
        return {
          ok: true,
          statusCode: response.status,
          message: payloadMessage,
          retryable: false,
          attempts
        };
      }

      lastStatusCode = response.status;
      lastMessage = payloadMessage ?? `HTTP ${response.status}`;
      lastCategory = classifyFailure(response.status, payloadMessage);

      if (!shouldRetry(response.status, lastCategory) || attempts > maxRetries) {
        return {
          ok: false,
          statusCode: response.status,
          message: lastMessage,
          category: lastCategory,
          retryable: shouldRetry(response.status, lastCategory),
          attempts
        };
      }

      // Exponential backoff for temporary failures.
      // eslint-disable-next-line no-await-in-loop
      await sleep(baseDelay * 2 ** (attempts - 1));
      continue;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      lastMessage = message;
      lastCategory = classifyFailure(undefined, message);

      if (!shouldRetry(undefined, lastCategory) || attempts > maxRetries) {
        return {
          ok: false,
          statusCode: lastStatusCode,
          message,
          category: lastCategory,
          retryable: shouldRetry(undefined, lastCategory),
          attempts
        };
      }

      // eslint-disable-next-line no-await-in-loop
      await sleep(baseDelay * 2 ** (attempts - 1));
    }
  }

  return {
    ok: false,
    statusCode: lastStatusCode,
    message: lastMessage,
    category: lastCategory,
    retryable: false,
    attempts
  };
}

async function pushTrackingToCoupang(input: TrackingPushInput): Promise<TrackingPushResult> {
  const vendorId = readString(input.vendorId);
  if (!vendorId) {
    return {
      ok: false,
      message: "쿠팡 송장 전송에 vendor_id가 필요합니다",
      category: "INVALID"
    };
  }

  const endpointTemplate =
    process.env.COUPANG_TRACKING_API_URL_TEMPLATE ??
    "https://api-gateway.coupang.com/v2/providers/openapi/apis/api/v4/vendors/{vendorId}/orders/invoices";
  const endpoint = withTemplate(endpointTemplate, { vendorId });
  const url = new URL(endpoint);

  const authHeader = createCoupangAuthHeader("POST", `${url.pathname}${url.search}`, {
    accessKey: input.apiKey,
    secretKey: input.secretKey,
    vendorId
  });

  const baseItem = {
    vendorId,
    orderId: input.orderNumber,
    shipmentBoxId: input.orderNumber,
    invoiceNumber: input.trackingNumber,
    deliveryCompanyCode: input.courierCode
  };

  const payloadCandidates: unknown[] = [
    [baseItem],
    { invoiceUploads: [baseItem] },
    { invoices: [baseItem] }
  ];

  let bestFailure: RequestAttemptResult | null = null;

  for (const payload of payloadCandidates) {
    const attempt = await runWithRetry(() => {
      return fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        cache: "no-store"
      });
    });

    if (attempt.ok) {
      return {
        ok: true,
        statusCode: attempt.statusCode,
        message: attempt.message ?? "쿠팡 송장 전송 성공",
        attempts: attempt.attempts
      };
    }

    bestFailure = attempt;

    if (attempt.statusCode && attempt.statusCode < 500 && attempt.statusCode !== 429) {
      // Try next payload shape for 4xx schema mismatch cases.
      continue;
    }
  }

  return {
    ok: false,
    statusCode: bestFailure?.statusCode,
    category: bestFailure?.category,
    attempts: bestFailure?.attempts,
    message: bestFailure?.message ?? "쿠팡 송장 전송 API 호출이 모두 실패했습니다"
  };
}

async function pushTrackingToSmartstore(input: TrackingPushInput): Promise<TrackingPushResult> {
  const accessToken = await getSmartStoreAccessToken({
    clientId: input.apiKey,
    clientSecret: input.secretKey
  });

  const endpointCandidates = [
    process.env.SMARTSTORE_TRACKING_API_URL_TEMPLATE
      ? withTemplate(process.env.SMARTSTORE_TRACKING_API_URL_TEMPLATE, {
          productOrderId: input.orderNumber
        })
      : null,
    `https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/${encodeURIComponent(input.orderNumber)}/dispatch`,
    "https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/dispatch"
  ].filter((item): item is string => Boolean(item));

  const payloadCandidates = [
    {
      productOrderId: input.orderNumber,
      deliveryMethodCode: "DELIVERY",
      deliveryCompanyCode: input.courierCode,
      trackingNumber: input.trackingNumber
    },
    {
      dispatchProductOrders: [
        {
          productOrderId: input.orderNumber,
          deliveryMethodCode: "DELIVERY",
          deliveryCompanyCode: input.courierCode,
          trackingNumber: input.trackingNumber
        }
      ]
    }
  ];

  let bestFailure: RequestAttemptResult | null = null;

  for (const endpoint of endpointCandidates) {
    for (const payload of payloadCandidates) {
      const attempt = await runWithRetry(() => {
        return fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          cache: "no-store"
        });
      });

      if (attempt.ok) {
        return {
          ok: true,
          statusCode: attempt.statusCode,
          message: attempt.message ?? "스마트스토어 송장 전송 성공",
          attempts: attempt.attempts
        };
      }

      bestFailure = attempt;

      if (attempt.statusCode && attempt.statusCode < 500 && attempt.statusCode !== 429) {
        continue;
      }
    }
  }

  return {
    ok: false,
    statusCode: bestFailure?.statusCode,
    category: bestFailure?.category,
    attempts: bestFailure?.attempts,
    message: bestFailure?.message ?? "스마트스토어 송장 전송 API 호출이 모두 실패했습니다"
  };
}

export async function pushTrackingToMarket(input: TrackingPushInput): Promise<TrackingPushResult> {
  if (isTrackingPushDisabled()) {
    return {
      ok: true,
      skipped: true,
      message: "MARKET_TRACKING_PUSH_ENABLED=false 설정으로 송장 역전송을 건너뜁니다"
    };
  }

  if (isMockTrackingEnabled()) {
    return {
      ok: true,
      skipped: true,
      message: "MARKET_TRACKING_MOCK_ENABLED=true 설정으로 모의 성공 처리했습니다"
    };
  }

  if (input.marketCode === "coupang") {
    return pushTrackingToCoupang(input);
  }

  return pushTrackingToSmartstore(input);
}
