"use client";

import { useCollectionProgress } from "@/hooks/use-collection-progress";
import { ProgressCard } from "@/components/sourcing/progress-card";
import { EleventhStreetSearch } from "@/components/sourcing/eleventh-street-search";
import { CollectedProductsCard } from "@/components/sourcing/collected-products-card";

export default function SourcingPage() {
  const { jobs, loading } = useCollectionProgress();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">수집 관리</h1>
        <p className="text-muted-foreground">
          상품 검색 및 수집을 지원합니다.
        </p>
      </div>

      <EleventhStreetSearch />
      <CollectedProductsCard />
      <ProgressCard jobs={jobs} loading={loading} />
    </section>
  );
}
