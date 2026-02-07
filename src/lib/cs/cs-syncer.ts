import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchLiveCsInquiries, type NormalizedCsInquiry } from "@/lib/cs/market-inquiry-clients";
import { decryptSecretIfNeeded } from "@/lib/security/crypto";

export interface CsSyncMarketConfig {
  id: string;
  user_id: string;
  market_code: string;
  vendor_id: string | null;
  api_key: string | null;
  secret_key: string | null;
  is_active: boolean | null;
}

interface FetchMarketInquiriesResult {
  inquiries: NormalizedCsInquiry[];
  warnings: string[];
}

export interface SyncCsResult {
  marketConfigId: string;
  userId: string;
  marketCode: string;
  fetchedCount: number;
  upsertedCount: number;
  warningMessages: string[];
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

function buildMockInquiries(config: CsSyncMarketConfig, nowIso: string): NormalizedCsInquiry[] {
  const token = nowIso.slice(0, 10).replace(/-/g, "");

  return [
    {
      inquiryId: `MOCK-CS-${config.market_code.toUpperCase()}-${token}-${config.id.slice(0, 6).toUpperCase()}`,
      writerId: "mock-user",
      title: "배송일 문의",
      content: "언제 출고되는지 확인 부탁드립니다.",
      inquiryDate: nowIso,
      isAnswered: false
    }
  ];
}

async function fetchMarketInquiries(config: CsSyncMarketConfig): Promise<FetchMarketInquiriesResult> {
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
    return { inquiries: [], warnings };
  }

  if (!apiKey || !secretKey) {
    warnings.push(`${config.market_code}: API 키가 없어 문의 수집을 건너뜁니다.`);
    return { inquiries: [], warnings };
  }

  if (process.env.CS_SYNC_MOCK_ENABLED === "true") {
    return {
      inquiries: buildMockInquiries(config, new Date().toISOString()),
      warnings
    };
  }

  if (config.market_code !== "coupang" && config.market_code !== "smartstore") {
    warnings.push(`${config.market_code}: 문의 수집 미지원 마켓입니다.`);
    return { inquiries: [], warnings };
  }

  const liveResult = await fetchLiveCsInquiries({
    marketCode: config.market_code,
    apiKey,
    secretKey,
    vendorId: config.vendor_id
  });

  warnings.push(...liveResult.warnings);
  return {
    inquiries: liveResult.inquiries,
    warnings
  };
}

export async function syncCsForMarketConfig(params: {
  supabaseAdmin: SupabaseClient;
  config: CsSyncMarketConfig;
}) {
  const { supabaseAdmin, config } = params;

  const warningMessages: string[] = [];
  const fetched = await fetchMarketInquiries(config);
  warningMessages.push(...fetched.warnings);

  let upsertedCount = 0;

  for (const inquiry of fetched.inquiries) {
    const inquiryId = cleanNullableText(inquiry.inquiryId);
    if (!inquiryId) {
      warningMessages.push(`${config.market_code}: inquiry_id가 비어 있는 문의를 건너뜁니다.`);
      continue;
    }

    const nowIso = new Date().toISOString();
    const { error } = await supabaseAdmin.from("cs_inquiries").upsert(
      {
        user_id: config.user_id,
        market_config_id: config.id,
        inquiry_id: inquiryId,
        writer_id: cleanNullableText(inquiry.writerId),
        title: cleanNullableText(inquiry.title),
        content: cleanNullableText(inquiry.content),
        reply_content: cleanNullableText(inquiry.replyContent),
        is_answered: Boolean(inquiry.isAnswered),
        inquiry_date: toIsoTimestamp(inquiry.inquiryDate ?? null, nowIso)
      },
      {
        onConflict: "user_id,market_config_id,inquiry_id"
      }
    );

    if (error) {
      warningMessages.push(
        `${config.market_code}: 문의(${inquiryId}) upsert 실패 - ${error.message}`
      );
      continue;
    }

    upsertedCount += 1;
  }

  const result: SyncCsResult = {
    marketConfigId: config.id,
    userId: config.user_id,
    marketCode: config.market_code,
    fetchedCount: fetched.inquiries.length,
    upsertedCount,
    warningMessages
  };

  return result;
}
