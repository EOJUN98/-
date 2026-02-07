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
import type { ProductPublishLogItem } from "@/types/product";

interface PublishLogTableProps {
  logs: ProductPublishLogItem[];
}

type StatusFilter = "all" | "success" | "failed" | "pending";

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeStatus(status: ProductPublishLogItem["status"]) {
  return status ?? "pending";
}

export function PublishLogTable({ logs }: PublishLogTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  const marketOptions = useMemo(() => {
    const set = new Set<string>();
    for (const log of logs) {
      if (log.marketCode) {
        set.add(log.marketCode);
      }
    }

    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return logs.filter((log) => {
      const status = normalizeStatus(log.status);

      if (statusFilter !== "all" && status !== statusFilter) {
        return false;
      }

      const market = log.marketCode ?? "unknown";
      if (marketFilter !== "all" && market !== marketFilter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return (
        (log.marketProductId ?? "").toLowerCase().includes(normalizedKeyword) ||
        (log.errorMessage ?? "").toLowerCase().includes(normalizedKeyword) ||
        market.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [keyword, logs, marketFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[180px_180px_1fr]">
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <SelectTrigger>
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">상태 전체</SelectItem>
            <SelectItem value="success">성공</SelectItem>
            <SelectItem value="failed">실패</SelectItem>
            <SelectItem value="pending">대기</SelectItem>
          </SelectContent>
        </Select>

        <Select value={marketFilter} onValueChange={setMarketFilter}>
          <SelectTrigger>
            <SelectValue placeholder="마켓" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">마켓 전체</SelectItem>
            {marketOptions.map((marketCode) => (
              <SelectItem key={marketCode} value={marketCode}>
                {marketCode}
              </SelectItem>
            ))}
            <SelectItem value="unknown">미확인</SelectItem>
          </SelectContent>
        </Select>

        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="마켓상품ID/오류 메시지 검색"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>상태</TableHead>
            <TableHead>마켓</TableHead>
            <TableHead>마켓상품ID</TableHead>
            <TableHead>오류</TableHead>
            <TableHead>시간</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredLogs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                필터 조건에 맞는 전송 로그가 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            filteredLogs.map((log) => {
              const status = normalizeStatus(log.status);

              return (
                <TableRow key={log.id}>
                  <TableCell>
                    <Badge
                      variant={
                        status === "success"
                          ? "secondary"
                          : status === "failed"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {status}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.marketCode ?? "unknown"}</TableCell>
                  <TableCell>{log.marketProductId ?? "-"}</TableCell>
                  <TableCell className="max-w-[360px] truncate text-xs text-muted-foreground">
                    {log.errorMessage ?? "-"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(log.syncedAt)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
