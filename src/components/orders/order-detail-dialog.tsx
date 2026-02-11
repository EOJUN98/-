"use client";

import { useEffect, useState } from "react";

import { getOrderDetailAction, updateOrderMemoAction, updateOrderOverseasAndMemoAction } from "@/actions/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import type { OrderDetail } from "@/types/order";

interface OrderDetailDialogProps {
  orderId: string | null;
  courierNamesByCode: Record<string, string>;
  forwarderNamesByCode: Record<string, string>;
  forwarderOptions: Array<{ code: string; name: string }>;
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

function formatCourierLabel(code: string | null, courierNamesByCode: Record<string, string>) {
  if (!code) return null;
  const normalized = code.trim().toLowerCase();
  const mapped = courierNamesByCode[normalized];
  if (!mapped) return code;
  if (mapped.toLowerCase() === normalized) return mapped;
  return `${mapped} (${code})`;
}

function formatForwarderLabel(code: string | null, forwarderNamesByCode: Record<string, string>) {
  if (!code) return null;
  const normalized = code.trim().toLowerCase();
  const mapped = forwarderNamesByCode[normalized];
  if (!mapped) return code;
  if (mapped.toLowerCase() === normalized) return mapped;
  return `${mapped} (${code})`;
}

export function OrderDetailDialog({
  orderId,
  courierNamesByCode,
  forwarderNamesByCode,
  forwarderOptions,
  onClose
}: OrderDetailDialogProps) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoStatus, setMemoStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [memoDraft, setMemoDraft] = useState("");
  const [memoServerValue, setMemoServerValue] = useState("");
  const [draft, setDraft] = useState({
    overseasOrderNumber: "",
    overseasTrackingNumber: "",
    forwarderId: "",
  });
  const { toast } = useToast();

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

  useEffect(() => {
    if (!order) return;
    setDraft({
      overseasOrderNumber: order.overseasOrderNumber ?? "",
      overseasTrackingNumber: order.overseasTrackingNumber ?? "",
      forwarderId: order.forwarderId ?? "",
    });

    const memo = order.internalMemo ?? "";
    setMemoDraft(memo);
    setMemoServerValue(memo);
    setMemoStatus("idle");
  }, [order]);

  async function handleSaveOverseasAndMemo() {
    if (!order) return;
    setSaving(true);
    const result = await updateOrderOverseasAndMemoAction({
      orderId: order.id,
      overseasOrderNumber: draft.overseasOrderNumber,
      overseasTrackingNumber: draft.overseasTrackingNumber,
      forwarderId: draft.forwarderId,
    });
    setSaving(false);

    if (!result.success) {
      toast({ title: "저장 실패", description: result.error, variant: "destructive" });
      return;
    }

    setOrder((prev) => prev ? ({
      ...prev,
      overseasOrderNumber: draft.overseasOrderNumber.trim() || null,
      overseasTrackingNumber: draft.overseasTrackingNumber.trim() || null,
      forwarderId: draft.forwarderId.trim() || null,
    }) : prev);

    toast({ title: "저장 완료" });
  }

  useEffect(() => {
    if (!order) return;

    const nextTrimmed = memoDraft.trim();
    const serverTrimmed = memoServerValue.trim();
    if (nextTrimmed === serverTrimmed) {
      if (memoStatus === "saving") setMemoStatus("idle");
      return;
    }

    setMemoStatus("saving");
    const timeout = window.setTimeout(async () => {
      setMemoSaving(true);
      const res = await updateOrderMemoAction({
        orderId: order.id,
        memo: nextTrimmed ? nextTrimmed : null,
      });
      setMemoSaving(false);

      if (!res.success) {
        setMemoStatus("error");
        return;
      }

      setMemoServerValue(nextTrimmed);
      setMemoStatus("saved");
      setOrder((prev) => prev ? ({
        ...prev,
        internalMemo: nextTrimmed ? nextTrimmed : null,
        memoUpdatedAt: res.memoUpdatedAt ?? new Date().toISOString(),
      }) : prev);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [memoDraft, memoServerValue, memoStatus, order]);

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
                  <p>{formatCourierLabel(order.courierCode, courierNamesByCode) ?? "미등록"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">송장번호</p>
                  <p className="font-medium">{order.trackingNumber ?? "미등록"}</p>
                </div>
              </div>
            </div>

            {/* 해외주문/트래킹 */}
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-sm">해외주문/해외트래킹</p>
                <Button size="sm" onClick={handleSaveOverseasAndMemo} disabled={saving}>
                  {saving ? "저장 중..." : "저장"}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="overseas-order-number">해외주문번호</Label>
                  <Input
                    id="overseas-order-number"
                    value={draft.overseasOrderNumber}
                    onChange={(e) => setDraft((p) => ({ ...p, overseasOrderNumber: e.target.value }))}
                    placeholder="예: 20260210-12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overseas-tracking-number">해외트래킹번호</Label>
                  <Input
                    id="overseas-tracking-number"
                    value={draft.overseasTrackingNumber}
                    onChange={(e) => setDraft((p) => ({ ...p, overseasTrackingNumber: e.target.value }))}
                    placeholder="예: LP123456789CN"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>배대지/포워더 (선택)</Label>
                  <Select
                    value={draft.forwarderId || "none"}
                    onValueChange={(value) => setDraft((p) => ({ ...p, forwarderId: value === "none" ? "" : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="포워더 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">미지정</SelectItem>
                      {forwarderOptions.map((f) => (
                        <SelectItem key={f.code} value={f.code}>
                          {f.name} ({f.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    현재값: {formatForwarderLabel(order.forwarderId, forwarderNamesByCode) ?? "미지정"}
                  </p>
                </div>
              </div>
            </div>

            {/* 내부 메모 (자동저장) */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-sm">내부 메모 (자동저장)</p>
                <div className="text-xs text-muted-foreground">
                  {memoSaving || memoStatus === "saving"
                    ? "저장 중..."
                    : memoStatus === "saved"
                      ? "저장됨"
                      : memoStatus === "error"
                        ? "저장 실패"
                        : "대기"}
                </div>
              </div>
              <Label htmlFor="internal-memo">메모</Label>
              <textarea
                id="internal-memo"
                value={memoDraft}
                onChange={(e) => setMemoDraft(e.target.value)}
                className="min-h-[96px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="운영 메모(예: 품절/옵션변경/추가 안내 등)"
              />
              <p className="text-xs text-muted-foreground">
                마지막 저장: {order.memoUpdatedAt ? formatDate(order.memoUpdatedAt) : "-"} · 500ms 디바운스
              </p>
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
