"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ── Zod Schemas ──
const createJobSchema = z.object({
  siteId: z.enum(["aliexpress", "taobao"], {
    required_error: "수집 사이트를 선택해주세요",
  }),
  displayName: z
    .string()
    .trim()
    .max(80, "필터명은 80자 이내로 입력해주세요")
    .optional(),
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

// ── Update Collection Job Display Name ──

const updateJobDisplayNameSchema = z.object({
  jobId: z.string().uuid("올바른 작업 ID가 아닙니다"),
  displayName: z.string().trim().min(1, "필터명을 입력해주세요").max(80, "필터명은 80자 이내로 입력해주세요"),
});

export async function updateCollectionJobDisplayNameAction(input: z.infer<typeof updateJobDisplayNameSchema>) {
  const parsed = updateJobDisplayNameSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  const { data: row, error: fetchError } = await supabase
    .from("collection_jobs")
    .select("options")
    .eq("id", parsed.data.jobId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) return { success: false as const, error: fetchError.message };
  if (!row) return { success: false as const, error: "작업을 찾을 수 없습니다" };

  const prevOptions = (row.options ?? {}) as Record<string, unknown>;
  const nextOptions = { ...prevOptions, displayName: parsed.data.displayName };

  // Prefer updating display_name (newer schema). If the column isn't migrated yet,
  // retry by updating options only.
  const { error: updateError } = await supabase
    .from("collection_jobs")
    .update({ display_name: parsed.data.displayName, options: nextOptions })
    .eq("id", parsed.data.jobId)
    .eq("user_id", user.id);

  if (!updateError) return { success: true as const };

  const msg = updateError.message.toLowerCase();
  const isMissingColumn = msg.includes("display_name") && msg.includes("does not exist");
  if (!isMissingColumn) return { success: false as const, error: updateError.message };

  const { error: fallbackError } = await supabase
    .from("collection_jobs")
    .update({ options: nextOptions })
    .eq("id", parsed.data.jobId)
    .eq("user_id", user.id);

  if (fallbackError) return { success: false as const, error: fallbackError.message };
  return { success: true as const };
}

// ── Update Collection Job Policy (stored in options) ──

const updateJobPolicySchema = z.object({
  jobId: z.string().uuid("올바른 작업 ID가 아닙니다"),
  policyId: z.string().uuid("올바른 정책 ID가 아닙니다").nullable(),
});

export async function updateCollectionJobPolicyAction(input: z.infer<typeof updateJobPolicySchema>) {
  const parsed = updateJobPolicySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  if (parsed.data.policyId) {
    const { data: policyRow, error: policyError } = await supabase
      .from("product_policies")
      .select("id")
      .eq("id", parsed.data.policyId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (policyError) return { success: false as const, error: policyError.message };
    if (!policyRow) return { success: false as const, error: "정책을 찾을 수 없습니다" };
  }

  const { data: jobRow, error: jobError } = await supabase
    .from("collection_jobs")
    .select("options")
    .eq("id", parsed.data.jobId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (jobError) return { success: false as const, error: jobError.message };
  if (!jobRow) return { success: false as const, error: "작업을 찾을 수 없습니다" };

  const prevOptions = (jobRow.options ?? {}) as Record<string, unknown>;
  const nextOptions = { ...prevOptions, policyId: parsed.data.policyId };

  const { error: updateError } = await supabase
    .from("collection_jobs")
    .update({ options: nextOptions })
    .eq("id", parsed.data.jobId)
    .eq("user_id", user.id);

  if (updateError) return { success: false as const, error: updateError.message };
  return { success: true as const };
}

// ── Update Collection Job Category (stored in options) ──

const updateJobCategorySchema = z.object({
  jobId: z.string().uuid("올바른 작업 ID가 아닙니다"),
  categoryId: z.number().int().positive("카테고리 ID는 양의 정수여야 합니다").nullable(),
  categoryLabel: z.string().trim().max(120).nullable().optional(),
});

export async function updateCollectionJobCategoryAction(input: z.infer<typeof updateJobCategorySchema>) {
  const parsed = updateJobCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false as const, error: "로그인이 필요합니다" };

  const { data: jobRow, error: jobError } = await supabase
    .from("collection_jobs")
    .select("options")
    .eq("id", parsed.data.jobId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (jobError) return { success: false as const, error: jobError.message };
  if (!jobRow) return { success: false as const, error: "작업을 찾을 수 없습니다" };

  const prevOptions = (jobRow.options ?? {}) as Record<string, unknown>;
  const nextOptions: Record<string, unknown> = {
    ...prevOptions,
    categoryId: parsed.data.categoryId,
  };
  if (typeof parsed.data.categoryLabel === "string") {
    nextOptions.categoryLabel = parsed.data.categoryLabel;
  }

  const { error: updateError } = await supabase
    .from("collection_jobs")
    .update({ options: nextOptions })
    .eq("id", parsed.data.jobId)
    .eq("user_id", user.id);

  if (updateError) return { success: false as const, error: updateError.message };
  return { success: true as const };
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

  const fallbackDisplayName = `${parsed.data.siteId.toUpperCase()} · ${parsed.data.searchUrl}`.slice(0, 80);
  const displayName = parsed.data.displayName?.trim() || (parsed.data.options?.displayName as string | undefined)?.trim() || fallbackDisplayName;

  let insertError: { message: string } | null = null;
  let jobId: string | null = null;

  // Prefer inserting with display_name (newer schema). If the column isn't migrated yet,
  // retry without it to avoid breaking the workflow.
  {
    const { data, error } = await supabase
      .from("collection_jobs")
      .insert({
        user_id: user.id,
        site_id: parsed.data.siteId,
        search_url: parsed.data.searchUrl,
        display_name: displayName,
        status: "pending",
        total_target: parsed.data.totalTarget,
        options: { ...(parsed.data.options ?? {}), displayName },
      })
      .select("id")
      .single();

    if (!error && data?.id) {
      jobId = data.id as string;
    } else if (error?.message?.toLowerCase().includes("display_name") && error.message.toLowerCase().includes("does not exist")) {
      const { data: data2, error: error2 } = await supabase
        .from("collection_jobs")
        .insert({
          user_id: user.id,
          site_id: parsed.data.siteId,
          search_url: parsed.data.searchUrl,
          status: "pending",
          total_target: parsed.data.totalTarget,
          options: { ...(parsed.data.options ?? {}), displayName },
        })
        .select("id")
        .single();

      if (!error2 && data2?.id) jobId = data2.id as string;
      else insertError = error2 ?? error;
    } else {
      insertError = error ?? { message: "작업 생성 실패" };
    }
  }

  if (!jobId) {
    return { success: false, error: `작업 생성 실패: ${insertError?.message ?? "알 수 없는 오류"}` };
  }

  return { success: true, jobId };
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
