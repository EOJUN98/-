"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ── Zod Schemas ──
const createJobSchema = z.object({
  siteId: z.enum(["aliexpress", "taobao"], {
    required_error: "수집 사이트를 선택해주세요",
  }),
  searchUrl: z
    .string()
    .url("올바른 URL 형식이 아닙니다"),
  totalTarget: z
    .number()
    .int()
    .min(1, "최소 1개 이상이어야 합니다")
    .max(500, "최대 500개까지 수집 가능합니다")
    .default(100),
  options: z.record(z.unknown()).optional(),
}).superRefine((value, ctx) => {
  const hostname = new URL(value.searchUrl).hostname.toLowerCase();
  const isAliExpressHost =
    hostname === "aliexpress.com" || hostname.endsWith(".aliexpress.com");
  const isTaobaoHost =
    hostname === "taobao.com" || hostname.endsWith(".taobao.com");

  if (value.siteId === "aliexpress" && !isAliExpressHost) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["searchUrl"],
      message: "선택한 사이트가 AliExpress이면 aliexpress.com URL만 입력 가능합니다",
    });
  }

  if (value.siteId === "taobao" && !isTaobaoHost) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["searchUrl"],
      message: "선택한 사이트가 Taobao이면 taobao.com URL만 입력 가능합니다",
    });
  }
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

interface ActionResult {
  success: boolean;
  error?: string;
  jobId?: string;
}

// ── Create Collection Job ──
export async function createCollectionJob(
  input: CreateJobInput
): Promise<ActionResult> {
  const parsed = createJobSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(", "),
    };
  }

  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const { data, error } = await supabase
    .from("collection_jobs")
    .insert({
      user_id: user.id,
      site_id: parsed.data.siteId,
      search_url: parsed.data.searchUrl,
      status: "pending",
      total_target: parsed.data.totalTarget,
      options: parsed.data.options ?? {},
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: `작업 생성 실패: ${error.message}` };
  }

  return { success: true, jobId: data.id };
}

// ── Fetch Collection Jobs ──
export async function fetchCollectionJobs() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false as const, error: "로그인이 필요합니다", data: [] };
  }

  const { data, error } = await supabase
    .from("collection_jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return { success: false as const, error: error.message, data: [] };
  }

  return { success: true as const, data: data ?? [] };
}
