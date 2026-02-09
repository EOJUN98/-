import { OrderTable } from "@/components/orders/order-table";
import { TrackingUpload } from "@/components/orders/tracking-upload";
import { getOrdersForDashboard } from "@/lib/queries/orders";

export default async function OrdersPage() {
  const { data: orders, error } = await getOrdersForDashboard();

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">주문 관리</h1>
        <p className="text-muted-foreground">
          주문 수집 결과를 확인하고 배송 상태를 관리합니다.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          주문 조회 중 오류가 발생했습니다: {error}
        </div>
      ) : (
        <div className="space-y-4">
          <TrackingUpload />
          <OrderTable initialData={orders} />
        </div>
      )}
    </section>
  );
}
