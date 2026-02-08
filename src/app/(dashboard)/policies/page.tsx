import { fetchPolicies } from "@/actions/policies";
import { PolicyList } from "@/components/policies/policy-list";

export default async function PoliciesPage() {
  const result = await fetchPolicies();

  return (
    <section className="space-y-6">
      <PolicyList initialPolicies={result.policies ?? []} />
    </section>
  );
}
