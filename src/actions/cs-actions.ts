"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sendReplyToMarket } from "@/lib/cs/reply-sender";
import { decryptSecretIfNeeded } from "@/lib/security/crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const replyInputSchema = z.object({
  inquiryRecordId: z.string().uuid(),
  replyContent: z.string().trim().min(1, "답변 내용을 입력해주세요").max(5000, "답변이 너무 깁니다")
});

interface UpdatedCsInquiryRow {
  id: string;
  reply_content: string | null;
  is_answered: boolean | null;
}

interface CsInquiryRow {
  id: string;
  market_config_id: string | null;
  inquiry_id: string | null;
}

interface MarketConfigRow {
  id: string;
  market_code: string;
  vendor_id: string | null;
  api_key: string | null;
  secret_key: string | null;
  is_active: boolean | null;
}

interface CsTemplateRow {
  id: string;
  title: string;
  content: string;
  shortcut_key: string | null;
  created_at: string;
  updated_at: string | null;
}

const saveTemplateInputSchema = z.object({
  templateId: z.string().uuid().optional(),
  title: z.string().trim().min(1, "템플릿 제목을 입력해주세요").max(120, "템플릿 제목이 너무 깁니다"),
  content: z.string().trim().min(1, "템플릿 내용을 입력해주세요").max(5000, "템플릿 내용이 너무 깁니다"),
  shortcutKey: z
    .string()
    .trim()
    .max(10, "단축키는 10자 이하여야 합니다")
    .optional()
});

const deleteTemplateInputSchema = z.object({
  templateId: z.string().uuid()
});

export async function replyCsInquiryAction(input: z.infer<typeof replyInputSchema>) {
  const parsed = replyInputSchema.safeParse(input);
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

  const { data: inquiryRow, error: inquiryError } = await supabase
    .from("cs_inquiries")
    .select("id, market_config_id, inquiry_id")
    .eq("id", parsed.data.inquiryRecordId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (inquiryError) {
    return {
      success: false as const,
      error: inquiryError.message
    };
  }

  if (!inquiryRow) {
    return {
      success: false as const,
      error: "CS 문의를 찾을 수 없습니다"
    };
  }

  const inquiry = inquiryRow as CsInquiryRow;
  if (!inquiry.market_config_id) {
    return {
      success: false as const,
      error: "마켓 설정 정보가 없는 문의입니다"
    };
  }

  if (!inquiry.inquiry_id) {
    return {
      success: false as const,
      error: "마켓 문의 번호가 없어 답변 전송을 진행할 수 없습니다"
    };
  }

  const { data: marketConfigRow, error: marketConfigError } = await supabase
    .from("user_market_configs")
    .select("id, market_code, vendor_id, api_key, secret_key, is_active")
    .eq("id", inquiry.market_config_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (marketConfigError) {
    return {
      success: false as const,
      error: marketConfigError.message
    };
  }

  if (!marketConfigRow) {
    return {
      success: false as const,
      error: "마켓 설정을 찾을 수 없습니다"
    };
  }

  const marketConfig = marketConfigRow as MarketConfigRow;
  if (!marketConfig.is_active) {
    return {
      success: false as const,
      error: "비활성 마켓 설정입니다"
    };
  }

  if (marketConfig.market_code !== "coupang" && marketConfig.market_code !== "smartstore") {
    return {
      success: false as const,
      error: `답변 전송 미지원 마켓입니다: ${marketConfig.market_code}`
    };
  }

  let apiKey: string | null = null;
  let secretKey: string | null = null;
  try {
    apiKey = decryptSecretIfNeeded(marketConfig.api_key);
    secretKey = decryptSecretIfNeeded(marketConfig.secret_key);
  } catch (error) {
    return {
      success: false as const,
      error: `마켓 API 키 복호화 실패: ${error instanceof Error ? error.message : "unknown"}`
    };
  }

  if (!apiKey || !secretKey) {
    return {
      success: false as const,
      error: "마켓 API 키가 없어 답변 전송을 진행할 수 없습니다"
    };
  }

  const marketReplyResult = await sendReplyToMarket({
    marketCode: marketConfig.market_code,
    inquiryId: inquiry.inquiry_id,
    replyContent: parsed.data.replyContent,
    apiKey,
    secretKey,
    vendorId: marketConfig.vendor_id
  });

  if (!marketReplyResult.ok) {
    return {
      success: false as const,
      error: [
        marketReplyResult.message ?? "마켓 답변 전송 실패",
        marketReplyResult.statusCode ? `(HTTP ${marketReplyResult.statusCode})` : "",
        marketReplyResult.category ? `[${marketReplyResult.category}]` : "",
        marketReplyResult.attempts ? `(attempts=${marketReplyResult.attempts})` : ""
      ]
        .filter(Boolean)
        .join(" ")
    };
  }

  const { data, error } = await supabase
    .from("cs_inquiries")
    .update({
      reply_content: parsed.data.replyContent,
      is_answered: true
    })
    .eq("id", parsed.data.inquiryRecordId)
    .eq("user_id", user.id)
    .select("id, reply_content, is_answered")
    .maybeSingle();

  if (error) {
    return {
      success: false as const,
      error: error.message
    };
  }

  if (!data) {
    return {
      success: false as const,
      error: "CS 문의를 찾을 수 없습니다"
    };
  }

  revalidatePath("/cs");

  return {
    success: true as const,
    inquiry: {
      id: (data as UpdatedCsInquiryRow).id,
      replyContent: (data as UpdatedCsInquiryRow).reply_content,
      isAnswered: Boolean((data as UpdatedCsInquiryRow).is_answered)
    },
    marketReply: {
      skipped: Boolean(marketReplyResult.skipped),
      message: marketReplyResult.message ?? null,
      statusCode: marketReplyResult.statusCode ?? null,
      attempts: marketReplyResult.attempts ?? null
    }
  };
}

export async function saveCsTemplateAction(input: z.infer<typeof saveTemplateInputSchema>) {
  const parsed = saveTemplateInputSchema.safeParse(input);
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

  const shortcutKey = parsed.data.shortcutKey?.trim() || null;
  const payload = {
    user_id: user.id,
    title: parsed.data.title,
    content: parsed.data.content,
    shortcut_key: shortcutKey
  };

  let row: CsTemplateRow | null = null;
  let writeError: string | null = null;

  if (parsed.data.templateId) {
    const { data, error } = await supabase
      .from("cs_templates")
      .update(payload)
      .eq("id", parsed.data.templateId)
      .eq("user_id", user.id)
      .select("id, title, content, shortcut_key, created_at, updated_at")
      .maybeSingle();

    if (error) {
      writeError = error.message;
    } else if (!data) {
      writeError = "수정할 템플릿을 찾을 수 없습니다";
    } else {
      row = data as CsTemplateRow;
    }
  } else {
    const { data, error } = await supabase
      .from("cs_templates")
      .insert(payload)
      .select("id, title, content, shortcut_key, created_at, updated_at")
      .single();

    if (error) {
      writeError = error.message;
    } else {
      row = data as CsTemplateRow;
    }
  }

  if (writeError || !row) {
    return {
      success: false as const,
      error: writeError ?? "템플릿 저장에 실패했습니다"
    };
  }

  revalidatePath("/cs");
  revalidatePath("/cs/templates");

  return {
    success: true as const,
    template: {
      id: row.id,
      title: row.title,
      content: row.content,
      shortcutKey: row.shortcut_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  };
}

export async function deleteCsTemplateAction(input: z.infer<typeof deleteTemplateInputSchema>) {
  const parsed = deleteTemplateInputSchema.safeParse(input);
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

  const { error } = await supabase
    .from("cs_templates")
    .delete()
    .eq("id", parsed.data.templateId)
    .eq("user_id", user.id);

  if (error) {
    return {
      success: false as const,
      error: error.message
    };
  }

  revalidatePath("/cs");
  revalidatePath("/cs/templates");

  return {
    success: true as const
  };
}
