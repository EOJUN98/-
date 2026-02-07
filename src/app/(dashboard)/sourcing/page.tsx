"use client";

import { useCollectionProgress } from "@/hooks/use-collection-progress";
import { CollectionJobForm } from "@/components/sourcing/collection-job-form";
import { ProgressCard } from "@/components/sourcing/progress-card";

export default function SourcingPage() {
  const { jobs, loading } = useCollectionProgress();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">수집 관리</h1>
        <p className="text-muted-foreground">
          해외 사이트 상품을 자동 수집합니다. Chrome Extension이 설치되어 있어야 합니다.
        </p>
      </div>

      <CollectionJobForm />
      <ProgressCard jobs={jobs} loading={loading} />
    </section>
  );
}
