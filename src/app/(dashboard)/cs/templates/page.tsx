import Link from "next/link";

import { TemplateManager } from "@/components/cs/template-manager";
import { Button } from "@/components/ui/button";
import { getCsTemplatesForDashboard } from "@/lib/queries/cs";

export default async function CsTemplatesPage() {
  const { data, error } = await getCsTemplatesForDashboard();

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">CS 템플릿 관리</h1>
          <p className="text-muted-foreground">자주 사용하는 답변 문구를 저장하고 수정합니다.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/cs">CS 목록으로 이동</Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          템플릿 조회 중 오류가 발생했습니다: {error}
        </div>
      ) : (
        <TemplateManager initialData={data} />
      )}
    </section>
  );
}
