"use server";

import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const devEnsureUserSchema = z.object({
  email: z.string().trim().email("이메일 형식이 올바르지 않습니다"),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다")
});

function isDevAuthBypassEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";
}

export async function devEnsureConfirmedUserAction(input: z.infer<typeof devEnsureUserSchema>) {
  const parsed = devEnsureUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues.map((issue) => issue.message).join(", ")
    };
  }

  if (!isDevAuthBypassEnabled()) {
    return {
      success: false as const,
      error: "DEV_AUTH_BYPASS가 비활성화되어 있습니다"
    };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const email = parsed.data.email;
  const password = parsed.data.password;

  // Try to find existing user by email (dev environments are expected to be small).
  let matchedUserId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200
    });
    if (error) {
      return {
        success: false as const,
        error: error.message
      };
    }

    const users = data?.users ?? [];
    const found = users.find((user) => (user.email ?? "").toLowerCase() === email.toLowerCase());
    matchedUserId = found?.id ?? null;
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "사용자 조회에 실패했습니다"
    };
  }

  if (matchedUserId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(matchedUserId, {
      email_confirm: true,
      password
    });

    if (error) {
      return {
        success: false as const,
        error: error.message
      };
    }

    return {
      success: true as const,
      created: false as const,
      userId: matchedUserId
    };
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error || !data?.user) {
    return {
      success: false as const,
      error: error?.message ?? "사용자 생성에 실패했습니다"
    };
  }

  return {
    success: true as const,
    created: true as const,
    userId: data.user.id
  };
}

