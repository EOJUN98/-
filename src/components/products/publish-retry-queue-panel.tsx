"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { retryFailedPublishQueueAction } from "@/actions/publish-product";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { ProductPublishLogItem } from "@/types/product";

interface PublishRetryQueuePanelProps {
  productId: string;
  logs: ProductPublishLogItem[];
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function PublishRetryQueuePanel({ productId, logs }: PublishRetryQueuePanelProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [runningStrategy, setRunningStrategy] = useState<null | "latest_per_market" | "all">(null);

  const failedLogs = useMemo(
    () => logs.filter((log) => log.status === "failed"),
    [logs]
  );

  const latestFailedByMarket = useMemo(() => {
    const seen = new Set<string>();
    const items: ProductPublishLogItem[] = [];

    for (const log of failedLogs) {
      const marketCode = log.marketCode ?? "unknown";
      if (seen.has(marketCode)) {
        continue;
      }
      seen.add(marketCode);
      items.push(log);
    }

    return items;
  }, [failedLogs]);

  async function runRetry(strategy: "latest_per_market" | "all") {
    setRunningStrategy(strategy);

    const result = await retryFailedPublishQueueAction({
      productId,
      strategy,
      limit: strategy === "all" ? 20 : 10,
      optimizeTitle: false
    });

    setRunningStrategy(null);

    if (!result.success) {
      toast({
        title: "재시도 실행 실패",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "재시도 큐 실행 완료",
      description: `대상 ${result.totalQueued}건 / 성공 ${result.successCount}건 / 실패 ${result.failedCount}건`
    });

    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">실패 재시도 큐</h2>
          <p className="text-sm text-muted-foreground">
            최근 실패 로그를 기준으로 마켓 전송을 다시 시도합니다.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="destructive">실패 {failedLogs.length}건</Badge>
          <Badge variant="outline">마켓별 최신 {latestFailedByMarket.length}건</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => runRetry("latest_per_market")}
          disabled={runningStrategy !== null || latestFailedByMarket.length === 0}
        >
          {runningStrategy === "latest_per_market" ? "실행 중..." : "최신 실패 재시도(마켓별)"}
        </Button>
        <Button
          onClick={() => runRetry("all")}
          disabled={runningStrategy !== null || failedLogs.length === 0}
        >
          {runningStrategy === "all" ? "실행 중..." : "전체 실패 재시도"}
        </Button>
      </div>

      {failedLogs.length === 0 ? (
        <p className="text-sm text-muted-foreground">현재 실패 큐가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {failedLogs.slice(0, 5).map((log) => (
            <div key={log.id} className="rounded-md border p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{log.marketCode ?? "unknown"}</span>
                <span className="text-xs text-muted-foreground">{formatDate(log.syncedAt)}</span>
              </div>
              <p className="truncate text-xs text-muted-foreground">{log.errorMessage ?? "오류 메시지 없음"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
