"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { encryptSecret } from "@/lib/security/crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MarketConfigSummary } from "@/types/settings";

const saveMarketConfigSchema = z.object({
  marketCode: z.enum(["coupang", "smartstore"]),
  apiKey: z.string().trim().optional(),
  secretKey: z.string().trim().optional(),
  vendorId: z.string().trim().optional(),
  isActive: z.boolean().default(true),
  defaultDeliveryFee: z.number().int().min(0).max(500000).default(0),
  defaultReturnFee: z.number().int().min(0).max(500000).default(3000)
});

interface MarketConfigRow {
  id: string;
  market_code: string;
  vendor_id: string | null;
  api_key: string | null;
  secret_key: string | null;
  is_active: boolean | null;
  default_delivery_fee: number | null;
  default_return_fee: number | null;
  updated_at: string | null;
}

function mapRowToSummary(row: MarketConfigRow): MarketConfigSummary {
  return {
    id: row.id,
    marketCode: row.market_code === "coupang" ? "coupang" : "smartstore",
    isConfigured: Boolean(row.api_key) && Boolean(row.secret_key),
    vendorConfigured: Boolean((row.vendor_id ?? "").trim()),
    isActive: Boolean(row.is_active),
    defaultDeliveryFee: row.default_delivery_fee ?? 0,
    defaultReturnFee: row.default_return_fee ?? 3000,
    updatedAt: row.updated_at
  };
}

export async function saveMarketConfigAction(input: z.infer<typeof saveMarketConfigSchema>) {
  const parsed = saveMarketConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues.map((issue) => issue.message).join(", ")
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

  const { data: existingRow, error: existingError } = await supabase
    .from("user_market_configs")
    .select(
      "id, market_code, vendor_id, api_key, secret_key, is_active, default_delivery_fee, default_return_fee, updated_at"
    )
    .eq("user_id", user.id)
    .eq("market_code", parsed.data.marketCode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return {
      success: false as const,
      error: existingError.message
    };
  }

  const apiKeyProvided = Boolean(parsed.data.apiKey);
  const secretKeyProvided = Boolean(parsed.data.secretKey);

  if (apiKeyProvided !== secretKeyProvided) {
    return {
      success: false as const,
      error: "api_key와 secret_key는 함께 입력해야 합니다"
    };
  }

  let encryptedApiKey: string | null = existingRow?.api_key ?? null;
  let encryptedSecretKey: string | null = existingRow?.secret_key ?? null;

  if (apiKeyProvided && secretKeyProvided) {
    try {
      encryptedApiKey = encryptSecret(parsed.data.apiKey as string);
      encryptedSecretKey = encryptSecret(parsed.data.secretKey as string);
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "키 암호화에 실패했습니다"
      };
    }
  }

  const nextVendorId = parsed.data.marketCode === "coupang"
    ? (parsed.data.vendorId?.trim() || existingRow?.vendor_id || null)
    : null;

  if (parsed.data.isActive) {
    if (!encryptedApiKey || !encryptedSecretKey) {
      return {
        success: false as const,
        error: "활성화된 마켓은 API 키와 시크릿 키가 필요합니다"
      };
    }

    if (parsed.data.marketCode === "coupang" && !nextVendorId) {
      return {
        success: false as const,
        error: "쿠팡 활성화에는 vendor_id가 필요합니다"
      };
    }
  }

  const payload = {
    user_id: user.id,
    market_code: parsed.data.marketCode,
    api_key: encryptedApiKey,
    secret_key: encryptedSecretKey,
    vendor_id: nextVendorId,
    is_active: parsed.data.isActive,
    default_delivery_fee: parsed.data.defaultDeliveryFee,
    default_return_fee: parsed.data.defaultReturnFee,
    updated_at: new Date().toISOString()
  };

  let writeResult:
    | {
        data: MarketConfigRow | null;
        error: { message: string } | null;
      }
    | null = null;

  if (existingRow?.id) {
    const { data, error } = await supabase
      .from("user_market_configs")
      .update(payload)
      .eq("id", existingRow.id)
      .eq("user_id", user.id)
      .select(
        "id, market_code, vendor_id, api_key, secret_key, is_active, default_delivery_fee, default_return_fee, updated_at"
      )
      .single();

    writeResult = {
      data: (data as MarketConfigRow | null) ?? null,
      error: error ? { message: error.message } : null
    };
  } else {
    const { data, error } = await supabase
      .from("user_market_configs")
      .insert(payload)
      .select(
        "id, market_code, vendor_id, api_key, secret_key, is_active, default_delivery_fee, default_return_fee, updated_at"
      )
      .single();

    writeResult = {
      data: (data as MarketConfigRow | null) ?? null,
      error: error ? { message: error.message } : null
    };
  }

  if (writeResult.error || !writeResult.data) {
    return {
      success: false as const,
      error: writeResult.error?.message ?? "마켓 설정 저장에 실패했습니다"
    };
  }

  revalidatePath("/settings");

  return {
    success: true as const,
    config: mapRowToSummary(writeResult.data)
  };
}
