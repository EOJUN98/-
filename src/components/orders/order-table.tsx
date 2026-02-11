"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { bulkStepOrderStatusAction, triggerOrderSyncAction, updateOrderStatusAction } from "@/actions/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  TableRow
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import type { OrderInternalStatus, OrderListItem } from "@/types/order";

import { OrderDetailDialog } from "./order-detail-dialog";

interface OrderTableProps {
  initialData: OrderListItem[];
  courierNamesByCode: Record<string, string>;
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
  exchanged: "교환"
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  collected: "outline",
  ordered: "default",
  overseas_shipping: "secondary",
  domestic_arrived: "secondary",
  shipped: "secondary",
  delivered: "secondary",
  confirmed: "default",
  cancelled: "destructive",
  returned: "destructive",
  exchanged: "destructive",
};

const ALL_STATUSES: OrderInternalStatus[] = [
  "collected",
  "ordered",
  "overseas_shipping",
  "domestic_arrived",
  "shipped",
  "delivered",
  "confirmed",
  "cancelled",
  "returned",
  "exchanged",
];

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatPrice(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatCourierLabel(code: string | null, courierNamesByCode: Record<string, string>) {
  if (!code) return null;
  const normalized = code.trim().toLowerCase();
  const mapped = courierNamesByCode[normalized];
  if (!mapped) return code;
  if (mapped.toLowerCase() === normalized) return mapped;
  return `${mapped} (${code})`;
}

export function OrderTable({ initialData, courierNamesByCode }: OrderTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialKeyword = searchParams.get("q") ?? "";
  const initialMarket = searchParams.get("market") ?? "all";
  const initialStatus = searchParams.get("status") ?? "all";
  const initialCourier = searchParams.get("courier") ?? "all";
  const initialFromDate = searchParams.get("from") ?? "";
  const initialToDate = searchParams.get("to") ?? "";

  const [orders, setOrders] = useState(initialData);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [marketFilter, setMarketFilter] = useState(initialMarket);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [courierFilter, setCourierFilter] = useState(initialCourier);
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [exportSelectKey, setExportSelectKey] = useState(0);
  const { toast } = useToast();

  const marketOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        orders
          .map((order) => order.marketCode)
          .filter((value): value is string => Boolean(value))
      )
    );
    return values.sort();
  }, [orders]);

  const courierOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        orders
          .map((order) => formatCourierLabel(order.courierCode, courierNamesByCode))
          .filter((value): value is string => Boolean(value))
      )
    );
    return values.sort((a, b) => a.localeCompare(b, "ko-KR"));
  }, [orders, courierNamesByCode]);

  const filteredOrders = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const fromTs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;

    return orders.filter((order) => {
      if (marketFilter !== "all" && order.marketCode !== marketFilter) return false;
      if (statusFilter !== "all" && order.internalStatus !== statusFilter) return false;
      if (courierFilter !== "all") {
        const courierLabel = formatCourierLabel(order.courierCode, courierNamesByCode);
        if ((courierLabel ?? "none") !== courierFilter) return false;
      }

      if (fromTs || toTs) {
        const sourceDate = order.orderDate ?? order.createdAt;
        const orderTs = sourceDate ? new Date(sourceDate).getTime() : NaN;
        if (!Number.isFinite(orderTs)) return false;
        if (fromTs && orderTs < fromTs) return false;
        if (toTs && orderTs > toTs) return false;
      }

      if (!normalizedKeyword) return true;
      return (
        order.orderNumber.toLowerCase().includes(normalizedKeyword) ||
        (order.buyerName ?? "").toLowerCase().includes(normalizedKeyword) ||
        (order.buyerPhone ?? "").toLowerCase().includes(normalizedKeyword) ||
        (order.trackingNumber ?? "").toLowerCase().includes(normalizedKeyword) ||
        (order.overseasTrackingNumber ?? "").toLowerCase().includes(normalizedKeyword) ||
        (order.overseasOrderNumber ?? "").toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [orders, keyword, marketFilter, statusFilter, courierFilter, fromDate, toDate, courierNamesByCode]);

  // 상태별 카운트
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of ALL_STATUSES) counts[s] = 0;
    for (const o of orders) {
      counts[o.internalStatus] = (counts[o.internalStatus] ?? 0) + 1;
    }
    return counts;
  }, [orders]);

  const allVisibleSelected = filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id));

  useEffect(() => {
    const nextKeyword = searchParams.get("q") ?? "";
    const nextMarket = searchParams.get("market") ?? "all";
    const nextStatus = searchParams.get("status") ?? "all";
    const nextCourier = searchParams.get("courier") ?? "all";
    const nextFrom = searchParams.get("from") ?? "";
    const nextTo = searchParams.get("to") ?? "";

    setKeyword((prev) => (prev === nextKeyword ? prev : nextKeyword));
    setMarketFilter((prev) => (prev === nextMarket ? prev : nextMarket));
    setStatusFilter((prev) => (prev === nextStatus ? prev : nextStatus));
    setCourierFilter((prev) => (prev === nextCourier ? prev : nextCourier));
    setFromDate((prev) => (prev === nextFrom ? prev : nextFrom));
    setToDate((prev) => (prev === nextTo ? prev : nextTo));
  }, [searchParams]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    const setOrDelete = (key: string, value: string, emptyValue: string) => {
      const nextValue = value.trim();
      if (!nextValue || nextValue === emptyValue) {
        next.delete(key);
        return;
      }
      next.set(key, nextValue);
    };

    setOrDelete("q", keyword, "");
    setOrDelete("market", marketFilter, "all");
    setOrDelete("status", statusFilter, "all");
    setOrDelete("courier", courierFilter, "all");
    setOrDelete("from", fromDate, "");
    setOrDelete("to", toDate, "");

    const currentQuery = searchParams.toString();
    const nextQuery = next.toString();
    if (currentQuery === nextQuery) return;

    const href = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(href, { scroll: false });
  }, [keyword, marketFilter, statusFilter, courierFilter, fromDate, toDate, pathname, router, searchParams]);

  function toggleSelectAll(checked: boolean) {
    if (!checked) { setSelectedIds(new Set()); return; }
    setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleStatusChange(orderId: string, newStatus: OrderInternalStatus) {
    const result = await updateOrderStatusAction({ orderId, status: newStatus });
    if (!result.success) {
      toast({ title: "상태 변경 실패", description: result.error, variant: "destructive" });
      return;
    }
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, internalStatus: newStatus } : o));
    toast({ title: "상태 변경 완료" });
  }

  async function handleBulkStep(direction: "up" | "down") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const result = await bulkStepOrderStatusAction({ orderIds: ids, direction });
    if (!result.success) {
      toast({ title: "일괄 이동 실패", description: result.error, variant: "destructive" });
      return;
    }

    const updates = result.updates ?? [];
    const updateMap = new Map<string, OrderInternalStatus>(updates.map((u) => [u.id, u.newStatus]));
    setOrders((prev) =>
      prev.map((o) => updateMap.has(o.id) ? { ...o, internalStatus: updateMap.get(o.id) as OrderInternalStatus } : o)
    );

    const skippedCount = result.skippedCount ?? 0;
    const skippedSample = result.skippedSample ?? null;
    toast({
      title: "일괄 이동 완료",
      description: skippedCount > 0
        ? `이동 ${result.updatedCount}건 / 스킵 ${skippedCount}건${skippedSample ? ` (예: ${skippedSample})` : ""}`
        : `${result.updatedCount}건 상태 이동됨`,
    });
  }

  async function downloadExcel(mode: "search" | "all" | "shipping") {
    const now = new Date();
    const ts = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
    ].join("");

    const XLSX = await import("xlsx");

    function statusLabel(status: string) {
      return STATUS_LABELS[status] ?? status;
    }

    function toRow(order: OrderListItem) {
      return {
        주문일시: order.orderDate ?? order.createdAt,
        주문번호: order.orderNumber,
        마켓: order.marketCode ?? "",
        내부상태: statusLabel(order.internalStatus),
        마켓상태: order.marketStatus ?? "",
        수취인: order.buyerName ?? "",
        전화번호: order.buyerPhone ?? "",
        배송지: order.shippingAddress ?? "",
        결제금액: order.totalPrice,
        해외주문번호: order.overseasOrderNumber ?? "",
        해외트래킹: order.overseasTrackingNumber ?? "",
        포워더: order.forwarderId ?? "",
        국내송장: order.trackingNumber ?? "",
        택배사: formatCourierLabel(order.courierCode, courierNamesByCode) ?? "",
      };
    }

    const wb = XLSX.utils.book_new();

    if (mode === "search") {
      const sheet = XLSX.utils.json_to_sheet(filteredOrders.map(toRow));
      XLSX.utils.book_append_sheet(wb, sheet, "검색결과");
      XLSX.writeFile(wb, `orders_search_${ts}.xlsx`);
      return;
    }

    if (mode === "all") {
      const sheet = XLSX.utils.json_to_sheet(orders.map(toRow));
      XLSX.utils.book_append_sheet(wb, sheet, "전체주문");
      XLSX.writeFile(wb, `orders_all_${ts}.xlsx`);
      return;
    }

    const target = selectedIds.size > 0
      ? orders.filter((o) => selectedIds.has(o.id))
      : filteredOrders;

    const slipRows = target.map((o) => ({
      주문번호: o.orderNumber,
      수취인: o.buyerName ?? "",
      전화번호: o.buyerPhone ?? "",
      배송지: o.shippingAddress ?? "",
      국내송장: o.trackingNumber ?? "",
      택배사: formatCourierLabel(o.courierCode, courierNamesByCode) ?? "",
      해외트래킹: o.overseasTrackingNumber ?? "",
      포워더: o.forwarderId ?? "",
      내부상태: statusLabel(o.internalStatus),
    }));

    const sheet = XLSX.utils.json_to_sheet(slipRows);
    XLSX.utils.book_append_sheet(wb, sheet, "배송전표");
    XLSX.writeFile(wb, `orders_shipping_${ts}.xlsx`);
  }

  async function handleSync() {
    setSyncing(true);
    const result = await triggerOrderSyncAction();
    setSyncing(false);

    if (!result.success) {
      toast({ title: "동기화 실패", description: result.error, variant: "destructive" });
      return;
    }

    toast({
      title: "주문 동기화 완료",
      description: `수집 ${result.totalFetched}건 / 반영 ${result.totalUpserted}건${result.warning ? ` (경고: ${result.warning})` : ""}`,
    });

    // 페이지 새로고침으로 데이터 갱신
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      {/* 상태별 카운트 요약 */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span>전체 <strong>{orders.length}</strong>건</span>
        <span className="text-muted-foreground">수집 <strong>{statusCounts.collected}</strong></span>
        <span className="text-blue-600">발주 <strong>{statusCounts.ordered}</strong></span>
        <span className="text-slate-600">해외배송 <strong>{statusCounts.overseas_shipping}</strong></span>
        <span className="text-amber-700">국내입고 <strong>{statusCounts.domestic_arrived}</strong></span>
        <span className="text-orange-600">국내배송 <strong>{statusCounts.shipped}</strong></span>
        <span className="text-green-600">배송완료 <strong>{statusCounts.delivered}</strong></span>
        <span className="text-emerald-700">구매확정 <strong>{statusCounts.confirmed}</strong></span>
        <span className="text-red-600">취소 <strong>{statusCounts.cancelled}</strong></span>
        <span className="text-red-600">반품 <strong>{statusCounts.returned}</strong></span>
        <span className="text-red-600">교환 <strong>{statusCounts.exchanged}</strong></span>
      </div>

      {/* 필터 + 동기화 + 엑셀 */}
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2 xl:grid-cols-[1fr_130px_130px_180px_140px_140px_auto_auto_auto] xl:items-center">
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="주문번호/수취인/전화번호/송장번호/해외트래킹 검색"
        />

        <Select value={marketFilter} onValueChange={setMarketFilter}>
          <SelectTrigger>
            <SelectValue placeholder="마켓" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 마켓</SelectItem>
            {marketOptions.map((market) => (
              <SelectItem key={market} value={market}>{market}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={courierFilter} onValueChange={setCourierFilter}>
          <SelectTrigger>
            <SelectValue placeholder="택배사" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 택배사</SelectItem>
            <SelectItem value="none">택배사 미입력</SelectItem>
            {courierOptions.map((courier) => (
              <SelectItem key={courier} value={courier}>{courier}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          aria-label="시작일"
        />

        <Input
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          aria-label="종료일"
        />

        <p className="text-sm text-muted-foreground whitespace-nowrap">총 {filteredOrders.length}건</p>

        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? "동기화 중..." : "주문 동기화"}
        </Button>

        <Select
          key={exportSelectKey}
          onValueChange={(value) => {
            const v = value as "search" | "all" | "shipping";
            setExportSelectKey((prev) => prev + 1);
            downloadExcel(v).catch((err) => {
              toast({ title: "엑셀 다운로드 실패", description: String(err), variant: "destructive" });
            });
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="엑셀 다운로드" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="search">검색결과 내보내기</SelectItem>
            <SelectItem value="all">전체 주문 내보내기</SelectItem>
            <SelectItem value="shipping">배송전표 내보내기</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 일괄 상태 변경 바 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <span className="text-sm font-medium">{selectedIds.size}건 선택됨</span>
          <Button size="sm" onClick={() => handleBulkStep("down")}>
            한단계 DOWN
          </Button>
          <Button size="sm" onClick={() => handleBulkStep("up")}>
            한단계 UP
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            선택 해제
          </Button>
        </div>
      )}

      {/* 주문 테이블 */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                  aria-label="전체 선택"
                />
              </TableHead>
              <TableHead className="w-[140px]">주문일시</TableHead>
              <TableHead className="w-[160px]">주문번호</TableHead>
              <TableHead className="w-[100px]">마켓</TableHead>
              <TableHead className="w-[130px]">내부상태</TableHead>
              <TableHead className="w-[100px]">주문상태</TableHead>
              <TableHead>수취인</TableHead>
              <TableHead className="w-[110px]">결제금액</TableHead>
              <TableHead className="w-[160px]">해외트래킹</TableHead>
              <TableHead className="w-[160px]">송장번호</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                  표시할 주문이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => (
                <TableRow
                  key={order.id}
                  className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(order.id) ? "bg-primary/5" : ""}`}
                  onClick={() => setDetailOrderId(order.id)}
                >
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(order.id)}
                      onChange={() => toggleSelect(order.id)}
                      aria-label={`${order.orderNumber} 선택`}
                    />
                  </TableCell>
                  <TableCell>{formatDate(order.orderDate ?? order.createdAt)}</TableCell>
                  <TableCell className="font-medium text-xs">{order.orderNumber}</TableCell>
                  <TableCell>{order.marketCode ?? "-"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={order.internalStatus}
                      onValueChange={(v) => handleStatusChange(order.id, v as OrderInternalStatus)}
                    >
                      <SelectTrigger className="h-7 text-xs w-[110px]">
                        <Badge variant={STATUS_BADGE_VARIANT[order.internalStatus] ?? "outline"} className="text-xs">
                          {STATUS_LABELS[order.internalStatus] ?? order.internalStatus}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs">{order.marketStatus ?? "-"}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="text-sm">{order.buyerName ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">{order.buyerPhone ?? "-"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{formatPrice(order.totalPrice)}</TableCell>
                  <TableCell>
                    {order.overseasTrackingNumber ? (
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium">{order.overseasTrackingNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.forwarderId ?? "포워더 미입력"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">미등록</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {order.trackingNumber ? (
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium">{order.trackingNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCourierLabel(order.courierCode, courierNamesByCode) ?? "택배사 미입력"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">미등록</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 주문 상세 다이얼로그 */}
      <OrderDetailDialog
        orderId={detailOrderId}
        courierNamesByCode={courierNamesByCode}
        onClose={() => setDetailOrderId(null)}
      />
    </div>
  );
}
