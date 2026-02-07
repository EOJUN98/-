import Link from "next/link";

import { CsTable } from "@/components/cs/cs-table";
import { Button } from "@/components/ui/button";
import { getCsInquiriesForDashboard, getCsTemplatesForDashboard } from "@/lib/queries/cs";

export default async function CsPage() {
  const [{ data, error }, { data: templates }] = await Promise.all([
    getCsInquiriesForDashboard(),
    getCsTemplatesForDashboard()
  ]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">CS 관리</h1>
          <p className="text-muted-foreground">미답변 문의를 우선 확인하고 답변을 저장합니다.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/cs/templates">답변 템플릿 관리</Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          CS 문의 조회 중 오류가 발생했습니다: {error}
        </div>
      ) : (
        <CsTable initialData={data} templates={templates} />
      )}
    </section>
  );
}
