import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { ProductUpdateTable } from "@/components/product-update/product-update-table";

export default function ProductUpdatePage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">상품 업데이트 & 마켓 전송</h1>
        <p className="text-muted-foreground">
          수집된 상품을 일괄 업데이트하고 마켓에 전송합니다
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>상품 목록</CardTitle>
          <CardDescription>
            상품을 선택하고 업데이트 항목 또는 전송할 마켓을 지정하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductUpdateTable />
        </CardContent>
      </Card>
    </section>
  );
}
