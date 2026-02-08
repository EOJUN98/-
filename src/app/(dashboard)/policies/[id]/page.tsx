import { notFound } from "next/navigation";
import { fetchPolicy, fetchDetailTemplates } from "@/actions/policies";
import { PolicyEditor } from "@/components/policies/policy-editor";

interface PolicyDetailPageProps {
  params: { id: string };
}

export default async function PolicyDetailPage({ params }: PolicyDetailPageProps) {
  const [policyResult, templatesResult] = await Promise.all([
    fetchPolicy(params.id),
    fetchDetailTemplates(),
  ]);

  if (!policyResult.success || !policyResult.policy) {
    notFound();
  }

  return (
    <section>
      <PolicyEditor
        policy={policyResult.policy}
        templates={templatesResult.templates ?? []}
      />
    </section>
  );
}
