import { fetchProductsWithPolicy, fetchPolicySummaryList } from "@/actions/policy-apply";
import { PolicyApplyTable } from "@/components/policy-apply/policy-apply-table";

export default async function PolicyApplyPage() {
  const [productsResult, policiesResult] = await Promise.all([
    fetchProductsWithPolicy(),
    fetchPolicySummaryList(),
  ]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">정책 적용</h1>
        <p className="text-sm text-muted-foreground">
          수집된 상품에 정책을 적용하거나 해제합니다.
        </p>
      </div>
      <PolicyApplyTable
        initialProducts={productsResult.products ?? []}
        policies={policiesResult.policies ?? []}
        totalCount={productsResult.totalCount ?? 0}
        appliedCount={productsResult.appliedCount ?? 0}
      />
    </section>
  );
}
