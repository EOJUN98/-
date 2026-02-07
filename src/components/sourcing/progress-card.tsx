"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";

interface CollectionJobRow {
  id: string;
  site_id: string;
  search_url: string;
  status: string;
  total_target: number;
  total_collected: number;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  created_at: string;
}

interface ProgressCardProps {
  jobs: CollectionJobRow[];
  loading: boolean;
}

const STATUS_MAP: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }
> = {
  pending: {
    label: "대기",
    variant: "outline",
    icon: <Clock className="h-3 w-3" />,
  },
  processing: {
    label: "수집중",
    variant: "default",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    label: "완료",
    variant: "secondary",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "실패",
    variant: "destructive",
    icon: <XCircle className="h-3 w-3" />,
  },
};

function getStatusInfo(status: string) {
  return STATUS_MAP[status] ?? STATUS_MAP.pending;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProgressCard({ jobs, loading }: ProgressCardProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          수집 작업 현황
        </CardTitle>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 수집 작업이 없습니다. 위 폼에서 수집을 시작해보세요.
          </p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const info = getStatusInfo(job.status);
              const progress =
                job.total_target > 0
                  ? Math.round(
                      (job.total_collected / job.total_target) * 100
                    )
                  : 0;

              return (
                <div
                  key={job.id}
                  className="flex items-center gap-4 rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={info.variant} className="gap-1">
                        {info.icon}
                        {info.label}
                      </Badge>
                      <span className="text-xs font-medium uppercase text-muted-foreground">
                        {job.site_id}
                      </span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {job.search_url}
                    </p>
                    {job.error_message && (
                      <p className="mt-1 text-xs text-destructive">
                        {job.error_message}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium">
                      {job.total_collected}/{job.total_target}
                    </div>
                    <div className="mt-1 h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDate(job.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
