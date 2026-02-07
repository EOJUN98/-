import { ProductTable } from "@/components/products/product-table";
import { getProductsForDashboard } from "@/lib/queries/products";

export default async function ProductsPage() {
  const { data, error } = await getProductsForDashboard(100);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">상품 관리</h1>
        <p className="text-muted-foreground">
          원본 상품을 편집하고 판매가를 계산한 뒤 마켓으로 전송합니다.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <ProductTable initialData={data} />
    </section>
  );
}
