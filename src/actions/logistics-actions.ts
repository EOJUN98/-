"use server";

import { randomUUID } from "crypto";

import { revalidatePath } from "next/cache";

import { toMarketCourierCode, toStorageCourierCode } from "@/lib/logistics/courier-code-mapper";
import { pushTrackingToMarket } from "@/lib/logistics/market-tracking-clients";
import { parseTrackingUploadFile } from "@/lib/logistics/tracking-parser";
import { decryptSecretIfNeeded } from "@/lib/security/crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CourierCompany } from "@/types/settings";

interface UpdatedOrderRow {
  id: string;
  order_number: string;
  market_config_id: string | null;
}

interface MarketConfigRow {
  id: string;
  market_code: string;
  vendor_id: string | null;
  api_key: string | null;
  secret_key: string | null;
  is_active: boolean | null;
}

interface CourierCompanyRow {
  id: number;
  code: string;
  name: string;
  coupang_code: string | null;
  smartstore_code: string | null;
  eleventh_code: string | null;
  gmarket_code: string | null;
  is_active: boolean | null;
}

interface TrackingPushLogInput {
  orderNumber: string;
  status: string;
  message: string;
  orderId?: string | null;
  marketConfigId?: string | null;
  marketCode?: string | null;
  failureCategory?: string | null;
  statusCode?: number | null;
  attempts?: number | null;
}

export async function uploadTrackingFileAction(formData: FormData) {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return {
      success: false as const,
      error: "업로드할 파일을 선택해주세요"
    };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false as const,
      error: "로그인이 필요합니다"
    };
  }
  const uploadFile = file;
  const userId = user.id;

  let parsed: Awaited<ReturnType<typeof parseTrackingUploadFile>>;
  try {
    parsed = await parseTrackingUploadFile(file);
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "송장 파일 파싱에 실패했습니다"
    };
  }

  const { data: courierCompanyRows, error: courierCompanyError } = await supabase
    .from("courier_companies")
    .select("id, code, name, coupang_code, smartstore_code, eleventh_code, gmarket_code, is_active")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (courierCompanyError) {
    return {
      success: false as const,
      error: `택배사 설정 조회 실패: ${courierCompanyError.message}`,
    };
  }

  const courierCompanies: CourierCompany[] = (courierCompanyRows ?? []).map((row) => {
    const typed = row as CourierCompanyRow;
    return {
      id: typed.id,
      code: typed.code,
      name: typed.name,
      coupangCode: typed.coupang_code,
      smartstoreCode: typed.smartstore_code,
      eleventhCode: typed.eleventh_code,
      gmarketCode: typed.gmarket_code,
      isActive: Boolean(typed.is_active ?? true),
    };
  });

  const { data: defaultCourierSetting, error: defaultCourierError } = await supabase
    .from("user_courier_settings")
    .select("default_courier_code, created_at")
    .eq("user_id", userId)
    .is("market_config_id", null)
    .is("courier_code", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (defaultCourierError) {
    return {
      success: false as const,
      error: `기본 택배사 조회 실패: ${defaultCourierError.message}`,
    };
  }

  const defaultCourierCode = (defaultCourierSetting?.default_courier_code ?? null) as string | null;

  let updatedCount = 0;
  let marketSyncedCount = 0;
  let marketSyncFailedCount = 0;
  let marketSyncSkippedCount = 0;
  const rowErrors: string[] = [];
  const marketSyncErrors: string[] = [];
  const auditLogErrors: string[] = [];
  const marketConfigCache = new Map<string, MarketConfigRow | null>();
  const batchId = randomUUID();

  async function insertTrackingPushLog(input: TrackingPushLogInput) {
    const { error } = await supabase.from("tracking_push_logs").insert({
      user_id: userId,
      order_id: input.orderId ?? null,
      market_config_id: input.marketConfigId ?? null,
      order_number: input.orderNumber,
      market_code: input.marketCode ?? null,
      status: input.status,
      failure_category: input.failureCategory ?? null,
      status_code: input.statusCode ?? null,
      attempts: input.attempts ?? null,
      message: input.message,
      source: "upload",
      batch_id: batchId,
      file_name: uploadFile.name
    });

    if (error) {
      auditLogErrors.push(`${input.orderNumber}: ${error.message}`);
    }
  }

  async function getMarketConfig(configId: string) {
    if (marketConfigCache.has(configId)) {
      return marketConfigCache.get(configId) ?? null;
    }

    const { data, error } = await supabase
      .from("user_market_configs")
      .select("id, market_code, vendor_id, api_key, secret_key, is_active")
      .eq("id", configId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      marketConfigCache.set(configId, null);
      return null;
    }

    const typed = data as MarketConfigRow;
    marketConfigCache.set(configId, typed);
    return typed;
  }

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index];
    const storageCourierCode = toStorageCourierCode({
      inputCourierCode: row.courierCode,
      companies: courierCompanies,
      defaultCourierCode,
    });

    const payload: {
      tracking_number: string;
      internal_status: string;
      market_status: string;
      updated_at: string;
      courier_code?: string;
    } = {
      tracking_number: row.trackingNumber,
      internal_status: "shipped",
      market_status: "DELIVERING",
      updated_at: new Date().toISOString()
    };

    if (storageCourierCode) {
      payload.courier_code = storageCourierCode;
    }

    // 순차 처리로 DB 부하와 시장 API 연동 확장 시 레이스를 줄인다.
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from("orders")
      .update(payload)
      .eq("user_id", userId)
      .eq("order_number", row.orderNumber)
      .select("id, order_number, market_config_id")
      .limit(1);

    if (error) {
      const message = `${index + 1}행(${row.orderNumber}): ${error.message}`;
      rowErrors.push(message);
      // eslint-disable-next-line no-await-in-loop
      await insertTrackingPushLog({
        orderNumber: row.orderNumber,
        status: "db_failed",
        failureCategory: "DB",
        message
      });
      continue;
    }

    if (!data || data.length === 0) {
      const message = `${index + 1}행(${row.orderNumber}): 일치하는 주문이 없습니다`;
      rowErrors.push(message);
      // eslint-disable-next-line no-await-in-loop
      await insertTrackingPushLog({
        orderNumber: row.orderNumber,
        status: "db_failed",
        failureCategory: "NOT_FOUND",
        message
      });
      continue;
    }

    updatedCount += 1;
    const updatedOrder = data[0] as UpdatedOrderRow;

    if (!updatedOrder.market_config_id) {
      marketSyncSkippedCount += 1;
      const message = `${index + 1}행(${row.orderNumber}): market_config_id가 없어 역전송 생략`;
      marketSyncErrors.push(message);
      // eslint-disable-next-line no-await-in-loop
      await insertTrackingPushLog({
        orderNumber: row.orderNumber,
        orderId: updatedOrder.id,
        status: "skipped",
        failureCategory: "INVALID",
        message
      });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const marketConfig = await getMarketConfig(updatedOrder.market_config_id);
    if (!marketConfig) {
      marketSyncFailedCount += 1;
      const message = `${index + 1}행(${row.orderNumber}): 마켓 설정 조회 실패`;
      marketSyncErrors.push(message);
      // eslint-disable-next-line no-await-in-loop
      await insertTrackingPushLog({
        orderNumber: row.orderNumber,
        orderId: updatedOrder.id,
        marketConfigId: updatedOrder.market_config_id,
        status: "failed",
        failureCategory: "CONFIG",
        message
      });
      continue;
    }

    if (!marketConfig.is_active) {
      marketSyncSkippedCount += 1;
      const message = `${index + 1}행(${row.orderNumber}): 비활성 마켓 설정으로 역전송 생략`;
      marketSyncErrors.push(message);
      // eslint-disable-next-line no-await-in-loop
      await insertTrackingPushLog({
        orderNumber: row.orderNumber,
        orderId: updatedOrder.id,
        marketConfigId: updatedOrder.market_config_id,
        marketCode: marketConfig.market_code,
        status: "skipped",
        failureCategory: "CONFIG",
        message
      });
      continue;
    }

    let apiKey: string | null = null;
    let secretKey: string | null = null;
    try {
      apiKey = decryptSecretIfNeeded(marketConfig.api_key);
      secretKey = decryptSecretIfNeeded(marketConfig.secret_key);
    } catch (error) {
      marketSyncFailedCount += 1;
      const message = `${index + 1}행(${row.orderNumber}): 마켓 키 복호화 실패 - ${error instanceof Error ? error.message : "unknown"}`;
      marketSyncErrors.push(message);
      // eslint-disable-next-line no-await-in-loop
      await insertTrackingPushLog({
        orderNumber: row.orderNumber,
        orderId: updatedOrder.id,
        marketConfigId: updatedOrder.market_config_id,
        marketCode: marketConfig.market_code,
        status: "failed",
        failureCategory: "CONFIG",
        message
      });
      continue;
    }

    if (!apiKey || !secretKey) {
      marketSyncFailedCount += 1;
      const message = `${index + 1}행(${row.orderNumber}): 마켓 API 키가 없어 역전송 실패`;
      marketSyncErrors.push(message);
      // eslint-disable-next-line no-await-in-loop
      await insertTrackingPushLog({
        orderNumber: row.orderNumber,
        orderId: updatedOrder.id,
        marketConfigId: updatedOrder.market_config_id,
        marketCode: marketConfig.market_code,
        status: "failed",
        failureCategory: "CONFIG",
        message
      });
      continue;
    }

    const marketCodeRaw = marketConfig.market_code;
    if (marketCodeRaw !== "coupang" && marketCodeRaw !== "smartstore") {
      marketSyncSkippedCount += 1;
      const message = `${index + 1}행(${row.orderNumber}): 역전송 미지원 마켓(${marketCodeRaw})`;
      marketSyncErrors.push(message);
      // eslint-disable-next-line no-await-in-loop
      await insertTrackingPushLog({
        orderNumber: row.orderNumber,
        orderId: updatedOrder.id,
        marketConfigId: updatedOrder.market_config_id,
        marketCode: marketCodeRaw,
        status: "skipped",
        failureCategory: "UNSUPPORTED",
        message
      });
      continue;
    }

    const marketCourierCode = toMarketCourierCode({
      inputCourierCode: storageCourierCode ?? row.courierCode,
      companies: courierCompanies,
      defaultCourierCode,
      marketCode: marketCodeRaw
    });

    // eslint-disable-next-line no-await-in-loop
    const marketSyncResult = await pushTrackingToMarket({
      marketCode: marketCodeRaw,
      orderNumber: row.orderNumber,
      trackingNumber: row.trackingNumber,
      courierCode: marketCourierCode,
      apiKey,
      secretKey,
      vendorId: marketConfig.vendor_id
    });

    if (marketSyncResult.ok) {
      if (marketSyncResult.skipped) {
        marketSyncSkippedCount += 1;
      } else {
        marketSyncedCount += 1;
      }
      if (marketSyncResult.message) {
        marketSyncErrors.push(`${index + 1}행(${row.orderNumber}): ${marketSyncResult.message}`);
      }
      // eslint-disable-next-line no-await-in-loop
      await insertTrackingPushLog({
        orderNumber: row.orderNumber,
        orderId: updatedOrder.id,
        marketConfigId: updatedOrder.market_config_id,
        marketCode: marketCodeRaw,
        status: marketSyncResult.skipped ? "skipped" : "success",
        failureCategory: marketSyncResult.category ?? null,
        statusCode: marketSyncResult.statusCode ?? null,
        attempts: marketSyncResult.attempts ?? null,
        message: marketSyncResult.message ?? (marketSyncResult.skipped ? "역전송 생략" : "역전송 성공")
      });
      continue;
    }

    marketSyncFailedCount += 1;
    const message = `${index + 1}행(${row.orderNumber}): ${
      marketSyncResult.message ?? "마켓 송장 역전송 실패"
    }${marketSyncResult.statusCode ? ` [HTTP ${marketSyncResult.statusCode}]` : ""}${
      marketSyncResult.category ? ` [${marketSyncResult.category}]` : ""
    }${marketSyncResult.attempts ? ` [attempts=${marketSyncResult.attempts}]` : ""}`;
    marketSyncErrors.push(message);
    // eslint-disable-next-line no-await-in-loop
    await insertTrackingPushLog({
      orderNumber: row.orderNumber,
      orderId: updatedOrder.id,
      marketConfigId: updatedOrder.market_config_id,
      marketCode: marketCodeRaw,
      status: "failed",
      failureCategory: marketSyncResult.category ?? null,
      statusCode: marketSyncResult.statusCode ?? null,
      attempts: marketSyncResult.attempts ?? null,
      message
    });
  }

  revalidatePath("/orders");

  return {
    success: true as const,
    fileName: uploadFile.name,
    totalRows: parsed.rows.length,
    updatedCount,
    failedCount: parsed.rows.length - updatedCount,
    marketSyncedCount,
    marketSyncFailedCount,
    marketSyncSkippedCount,
    warnings: parsed.warnings,
    rowErrors,
    marketSyncErrors,
    trackingPushLogErrors: auditLogErrors,
    batchId
  };
}
