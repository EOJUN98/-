"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { devEnsureConfirmedUserAction } from "@/actions/auth-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();

    if (mode === "signup") {
      // Dev-fast path: create/confirm user via service role so local development is unblocked.
      // In production this action is disabled by default.
      const devResult = await devEnsureConfirmedUserAction({ email, password });
      if (devResult.success) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);
        if (signInError) {
          setError(signInError.message);
          return;
        }
        router.replace("/");
        router.refresh();
        return;
      }

      // Fallback to normal signup (may require email confirmation).
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      setLoading(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (!data.session) {
        setError("회원가입은 완료되었습니다. 이메일 인증 후 로그인해주세요.");
        setMode("login");
        return;
      }

      router.replace("/");
      router.refresh();
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-2xl">
            {mode === "login" ? "로그인" : "회원가입"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "처리 중..."
                : mode === "login"
                  ? "로그인"
                  : "회원가입"}
            </Button>
          </form>
          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:underline"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login"
              ? "계정이 없으신가요? 회원가입"
              : "이미 계정이 있으신가요? 로그인"}
          </button>
        </CardContent>
      </Card>
    </main>
  );
}
