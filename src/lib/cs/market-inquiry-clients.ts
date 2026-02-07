import "server-only";

import { createCoupangAuthHeader } from "@/lib/markets/coupang";
import { getSmartStoreAccessToken } from "@/lib/markets/smartstore";

export interface NormalizedCsInquiry {
  inquiryId: string;
  writerId?: string | null;
  title?: string | null;
  content?: string | null;
  replyContent?: string | null;
  inquiryDate?: string | null;
  isAnswered?: boolean | null;
}

interface FetchLiveCsInquiriesInput {
  marketCode: "coupang" | "smartstore";
  apiKey: string;
  secretKey: string;
  vendorId?: string | null;
}

interface FetchLiveCsInquiriesResult {
  inquiries: NormalizedCsInquiry[];
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

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (["true", "yes", "y", "answered", "complete", "completed", "done"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "n", "pending", "unanswered", "waiting"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function parseDateToIso(value: unknown): string | null {
  const text = readString(value);
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function collectObjectsByKeys(root: unknown, keys: string[], acc: LooseRecord[] = []) {
  if (Array.isArray(root)) {
    for (const item of root) {
      collectObjectsByKeys(item, keys, acc);
    }
    return acc;
  }

  if (!isRecord(root)) {
    return acc;
  }

  for (const key of keys) {
    if (key in root) {
      acc.push(root);
      break;
    }
  }

  for (const value of Object.values(root)) {
    collectObjectsByKeys(value, keys, acc);
  }

  return acc;
}

function dedupeByInquiryId(rows: NormalizedCsInquiry[]) {
  const seen = new Set<string>();
  const result: NormalizedCsInquiry[] = [];

  for (const row of rows) {
    if (!row.inquiryId || seen.has(row.inquiryId)) {
      continue;
    }
    seen.add(row.inquiryId);
    result.push(row);
  }

  return result;
}

function mergeQuery(baseSearch: string, extra: URLSearchParams | null) {
  const merged = new URLSearchParams(baseSearch);
  if (extra) {
    for (const [key, value] of extra.entries()) {
      merged.set(key, value);
    }
  }
  const query = merged.toString();
  return query.length > 0 ? `?${query}` : "";
}

function parseGenericInquiry(row: LooseRecord): NormalizedCsInquiry | null {
  const inquiryId =
    readString(row.inquiryId) ??
    readString(row.customerInquiryId) ??
    readString(row.vendorInquiryId) ??
    readString(row.questionId) ??
    readString(row.id);
  if (!inquiryId) {
    return null;
  }

  const title =
    readString(row.title) ??
    readString(row.inquiryTitle) ??
    readString(row.questionTitle) ??
    readString(row.subject);
  const content =
    readString(row.content) ??
    readString(row.inquiryContent) ??
    readString(row.questionContent) ??
    readString(row.question);

  const replyContent =
    readString(row.replyContent) ??
    readString(row.answerContent) ??
    readString(row.answer) ??
    readString(row.reply);

  const statusText =
    readString(row.status) ??
    readString(row.answerStatus) ??
    readString(row.inquiryStatus) ??
    readString(row.processStatus);

  const answeredFlag =
    readBoolean(row.isAnswered) ??
    readBoolean(row.answered) ??
    readBoolean(row.hasAnswer) ??
    (statusText ? !["waiting", "unanswered", "pending"].includes(statusText.toLowerCase()) : null);

  return {
    inquiryId,
    writerId:
      readString(row.writerId) ?? readString(row.customerId) ?? readString(row.buyerId) ?? readString(row.userId),
    title,
    content,
    replyContent,
    inquiryDate:
      parseDateToIso(row.inquiryDate) ??
      parseDateToIso(row.createdAt) ??
      parseDateToIso(row.created_at) ??
      parseDateToIso(row.questionCreatedAt),
    isAnswered: answeredFlag
  };
}

function readLookbackDays(defaultValue = 14) {
  const parsed = Number(process.env.CS_SYNC_LOOKBACK_DAYS ?? defaultValue);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return Math.min(90, Math.max(1, Math.floor(parsed)));
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

function extractMessageFromPayload(payload: unknown): string | null {
  if (!payload) {
    return null;
  }
  if (typeof payload === "string") {
    return payload.trim() || null;
  }
  if (!isRecord(payload)) {
    return null;
  }

  const candidates = [
    payload.message,
    payload.error,
    payload.errorMessage,
    payload.error_description,
    payload.detail,
    payload.code
  ];

  for (const candidate of candidates) {
    const text = readString(candidate);
    if (text) {
      return text;
    }
  }

  if (isRecord(payload.data)) {
    return extractMessageFromPayload(payload.data);
  }

  return null;
}

async function fetchCoupangInquiries(input: FetchLiveCsInquiriesInput): Promise<FetchLiveCsInquiriesResult> {
  const warnings: string[] = [];
  const vendorId = readString(input.vendorId);
  if (!vendorId) {
    return {
      inquiries: [],
      warnings: ["coupang: vendor_id가 없어 문의 수집을 건너뜁니다."]
    };
  }

  const endpointTemplate =
    process.env.COUPANG_CS_INQUIRIES_API_URL_TEMPLATE ??
    "https://api-gateway.coupang.com/v2/providers/openapi/apis/api/v1/vendors/{vendorId}/inquiries";
  const endpoint = endpointTemplate.replace("{vendorId}", encodeURIComponent(vendorId));
  const url = new URL(endpoint);
  const pathWithoutQuery = `${url.pathname}`;
  const baseSearch = url.search.replace(/^\?/, "");

  const lookbackDays = readLookbackDays(14);
  const now = new Date();
  const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const queryCandidates = [
    new URLSearchParams({
      fromDate: from.toISOString(),
      toDate: now.toISOString(),
      status: "UNANSWERED",
      page: "1",
      size: "100"
    }),
    new URLSearchParams({
      page: "1",
      size: "100"
    }),
    null
  ];

  let payload: unknown = null;
  let success = false;
  let lastError: string | null = null;

  for (const query of queryCandidates) {
    const mergedSearch = mergeQuery(baseSearch, query);
    const requestUrl = `${url.origin}${pathWithoutQuery}${mergedSearch}`;
    const pathWithQuery = `${pathWithoutQuery}${mergedSearch}`;
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Authorization: createCoupangAuthHeader("GET", pathWithQuery, {
          accessKey: input.apiKey,
          secretKey: input.secretKey,
          vendorId
        })
      },
      cache: "no-store"
    });

    payload = await readJsonResponse(response);
    if (response.ok) {
      success = true;
      break;
    }

    lastError = extractMessageFromPayload(payload) ?? `HTTP ${response.status}`;
  }

  if (!success) {
    warnings.push(`coupang: 문의 조회 실패 - ${lastError ?? "unknown"}`);
    return { inquiries: [], warnings };
  }

  const rows = collectObjectsByKeys(payload, ["inquiryId", "vendorInquiryId", "customerInquiryId", "questionId"]);
  const mapped = dedupeByInquiryId(
    rows
      .map((row) => parseGenericInquiry(row))
      .filter((row): row is NormalizedCsInquiry => row !== null)
  );

  return {
    inquiries: mapped,
    warnings
  };
}

async function fetchSmartstoreInquiries(input: FetchLiveCsInquiriesInput): Promise<FetchLiveCsInquiriesResult> {
  const warnings: string[] = [];

  const accessToken = await getSmartStoreAccessToken({
    clientId: input.apiKey,
    clientSecret: input.secretKey
  });

  const endpoint = process.env.SMARTSTORE_CS_INQUIRIES_API_URL_TEMPLATE
    ? process.env.SMARTSTORE_CS_INQUIRIES_API_URL_TEMPLATE
    : "https://api.commerce.naver.com/external/v1/customer-inquiries";
  const endpointUrl = new URL(endpoint);
  const baseSearch = endpointUrl.search.replace(/^\?/, "");

  const lookbackDays = readLookbackDays(14);
  const now = new Date();
  const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const queryCandidates = [
    new URLSearchParams({
      fromDate: from.toISOString().slice(0, 10),
      toDate: now.toISOString().slice(0, 10),
      answered: "false",
      size: "100"
    }),
    new URLSearchParams({
      size: "100"
    }),
    null
  ];

  let payload: unknown = null;
  let success = false;
  let lastError: string | null = null;

  for (const query of queryCandidates) {
    const mergedSearch = mergeQuery(baseSearch, query);
    const requestUrl = `${endpointUrl.origin}${endpointUrl.pathname}${mergedSearch}`;
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });

    payload = await readJsonResponse(response);
    if (response.ok) {
      success = true;
      break;
    }

    lastError = extractMessageFromPayload(payload) ?? `HTTP ${response.status}`;
  }

  if (!success) {
    warnings.push(`smartstore: 문의 조회 실패 - ${lastError ?? "unknown"}`);
    return { inquiries: [], warnings };
  }

  const rows = collectObjectsByKeys(payload, ["customerInquiryId", "inquiryId", "questionId", "id"]);
  const mapped = dedupeByInquiryId(
    rows
      .map((row) => parseGenericInquiry(row))
      .filter((row): row is NormalizedCsInquiry => row !== null)
  );

  return {
    inquiries: mapped,
    warnings
  };
}

export async function fetchLiveCsInquiries(input: FetchLiveCsInquiriesInput): Promise<FetchLiveCsInquiriesResult> {
  if (input.marketCode === "coupang") {
    return fetchCoupangInquiries(input);
  }

  return fetchSmartstoreInquiries(input);
}
