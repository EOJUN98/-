"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
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
import type { OrderListItem } from "@/types/order";

interface OrderTableProps {
  initialData: OrderListItem[];
}

const STATUS_LABELS: Record<string, string> = {
  collected: "수집됨",
  ordered: "발주완료",
  shipped: "배송중",
  delivered: "배송완료",
  cancelled: "취소"
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  collected: "outline",
  ordered: "default",
  shipped: "secondary",
  delivered: "secondary",
  cancelled: "destructive"
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

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

export function OrderTable({ initialData }: OrderTableProps) {
  const [keyword, setKeyword] = useState("");
  const [marketFilter, setMarketFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const marketOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        initialData
          .map((order) => order.marketCode)
          .filter((value): value is string => Boolean(value))
      )
    );

    return values.sort();
  }, [initialData]);

  const filteredOrders = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return initialData.filter((order) => {
      if (marketFilter !== "all" && order.marketCode !== marketFilter) {
        return false;
      }

      if (statusFilter !== "all" && order.internalStatus !== statusFilter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return (
        order.orderNumber.toLowerCase().includes(normalizedKeyword) ||
        (order.buyerName ?? "").toLowerCase().includes(normalizedKeyword) ||
        (order.buyerPhone ?? "").toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [initialData, keyword, marketFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_180px_180px_auto] md:items-center">
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="주문번호/수취인/전화번호 검색"
        />

        <Select value={marketFilter} onValueChange={setMarketFilter}>
          <SelectTrigger>
            <SelectValue placeholder="마켓" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 마켓</SelectItem>
            {marketOptions.map((market) => (
              <SelectItem key={market} value={market}>
                {market}
              </SelectItem>
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
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <p className="text-sm text-muted-foreground">총 {filteredOrders.length}건</p>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">주문일시</TableHead>
              <TableHead className="w-[180px]">주문번호</TableHead>
              <TableHead className="w-[120px]">마켓</TableHead>
              <TableHead className="w-[110px]">내부상태</TableHead>
              <TableHead className="w-[120px]">주문상태</TableHead>
              <TableHead>수취인</TableHead>
              <TableHead className="w-[120px]">결제금액</TableHead>
              <TableHead className="w-[180px]">송장번호</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                  표시할 주문이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{formatDate(order.orderDate ?? order.createdAt)}</TableCell>
                  <TableCell className="font-medium">{order.orderNumber}</TableCell>
                  <TableCell>{order.marketCode ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[order.internalStatus] ?? "outline"}>
                      {STATUS_LABELS[order.internalStatus] ?? order.internalStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.marketStatus ?? "-"}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p>{order.buyerName ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">{order.buyerPhone ?? "-"}</p>
                    </div>
                  </TableCell>
                  <TableCell>{formatPrice(order.totalPrice)}</TableCell>
                  <TableCell>
                    {order.trackingNumber ? (
                      <div className="space-y-0.5">
                        <p className="font-medium">{order.trackingNumber}</p>
                        <p className="text-xs text-muted-foreground">{order.courierCode ?? "택배사 미입력"}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">미등록</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
