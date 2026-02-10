"use client";

import { useState, useEffect } from "react";

import { getOrderDetailAction } from "@/actions/orders";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OrderDetail } from "@/types/order";

interface OrderDetailDialogProps {
  orderId: string | null;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  collected: "수집됨",
  ordered: "발주완료",
  overseas_shipping: "해외배송중",
  domestic_arrived: "국내입고",
  shipped: "국내배송중",
  delivered: "배송완료",
  confirmed: "구매확정",
  cancelled: "취소",
  returned: "반품",
  exchanged: "교환",
};

function formatPrice(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderDetailDialog({ orderId, onClose }: OrderDetailDialogProps) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      return;
    }

    setLoading(true);
    getOrderDetailAction(orderId).then((result) => {
      setLoading(false);
      if (result.success && result.order) {
        setOrder(result.order);
      }
    });
  }, [orderId]);

  return (
    <Dialog open={Boolean(orderId)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>주문 상세</DialogTitle>
          <DialogDescription>
            {order ? `주문번호: ${order.orderNumber}` : "주문 정보를 불러오는 중..."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-8">불러오는 중...</p>
        ) : order ? (
          <div className="space-y-4">
            {/* 주문 기본 정보 */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">주문일시</p>
                <p className="font-medium">{formatDate(order.orderDate)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">마켓</p>
                <p className="font-medium">{order.marketCode ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">내부상태</p>
                <Badge variant="outline">
                  {STATUS_LABELS[order.internalStatus] ?? order.internalStatus}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">마켓상태</p>
                <p className="font-medium">{order.marketStatus ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">결제금액</p>
                <p className="font-semibold text-base">{formatPrice(order.totalPrice)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">등록일</p>
                <p className="font-medium">{formatDate(order.createdAt)}</p>
              </div>
            </div>

            {/* 수취인 정보 */}
            <div className="rounded-lg border p-3 space-y-2">
              <p className="font-medium text-sm">수취인 정보</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">수취인</p>
                  <p>{order.buyerName ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">전화번호</p>
                  <p>{order.buyerPhone ?? "-"}</p>
                </div>
                {order.personalCustomsCode ? (
                  <div>
                    <p className="text-muted-foreground">개인통관부호</p>
                    <p>{order.personalCustomsCode}</p>
                  </div>
                ) : null}
              </div>
              <div className="text-sm">
                <p className="text-muted-foreground">배송지</p>
                <p>{order.shippingAddress ?? "-"}</p>
              </div>
            </div>

            {/* 배송 정보 */}
            <div className="rounded-lg border p-3 space-y-2">
              <p className="font-medium text-sm">배송 정보</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">택배사</p>
                  <p>{order.courierCode ?? "미등록"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">송장번호</p>
                  <p className="font-medium">{order.trackingNumber ?? "미등록"}</p>
                </div>
              </div>
            </div>

            {/* 주문 아이템 */}
            {order.items.length > 0 ? (
              <div className="space-y-2">
                <p className="font-medium text-sm">주문 상품 ({order.items.length}건)</p>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>상품명</TableHead>
                        <TableHead className="w-[120px]">옵션</TableHead>
                        <TableHead className="w-[60px] text-center">수량</TableHead>
                        <TableHead className="w-[100px] text-right">단가</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm">
                            {item.marketProductName ?? "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.marketOptionName ?? "-"}
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatPrice(item.unitPrice)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">주문 상품 정보가 없습니다.</p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
