import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CsInquiryListItem, CsTemplateItem } from "@/types/cs";

interface CsInquiryRow {
  id: string;
  inquiry_id: string | null;
  market_config_id: string | null;
  writer_id: string | null;
  title: string | null;
  content: string | null;
  reply_content: string | null;
  is_answered: boolean | null;
  inquiry_date: string | null;
  created_at: string;
}

interface CsTemplateRow {
  id: string;
  title: string;
  content: string;
  shortcut_key: string | null;
  created_at: string;
  updated_at: string | null;
}

export async function getCsInquiriesForDashboard(limit = 300) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      data: [] as CsInquiryListItem[],
      error: "로그인이 필요합니다"
    };
  }

  const { data: rows, error } = await supabase
    .from("cs_inquiries")
    .select(
      "id, inquiry_id, market_config_id, writer_id, title, content, reply_content, is_answered, inquiry_date, created_at"
    )
    .eq("user_id", user.id)
    .order("is_answered", { ascending: true })
    .order("inquiry_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      data: [] as CsInquiryListItem[],
      error: error.message
    };
  }

  const inquiryRows = (rows ?? []) as CsInquiryRow[];
  const configIds = Array.from(
    new Set(
      inquiryRows
        .map((row) => row.market_config_id)
        .filter((id): id is string => Boolean(id))
    )
  );

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

  const data: CsInquiryListItem[] = inquiryRows.map((row) => ({
    id: row.id,
    inquiryId: row.inquiry_id,
    marketCode: row.market_config_id ? marketCodeByConfigId.get(row.market_config_id) ?? null : null,
    writerId: row.writer_id,
    title: row.title,
    content: row.content,
    replyContent: row.reply_content,
    isAnswered: Boolean(row.is_answered),
    inquiryDate: row.inquiry_date,
    createdAt: row.created_at
  }));

  return {
    data,
    error: null as string | null
  };
}

export async function getCsTemplatesForDashboard(limit = 100) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      data: [] as CsTemplateItem[],
      error: "로그인이 필요합니다"
    };
  }

  const { data: rows, error } = await supabase
    .from("cs_templates")
    .select("id, title, content, shortcut_key, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      data: [] as CsTemplateItem[],
      error: error.message
    };
  }

  const data: CsTemplateItem[] = ((rows ?? []) as CsTemplateRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    shortcutKey: row.shortcut_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  return {
    data,
    error: null as string | null
  };
}
