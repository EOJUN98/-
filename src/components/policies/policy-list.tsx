"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPolicy,
  deletePolicy,
  copyPolicy,
  setDefaultPolicy,
} from "@/actions/policies";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Plus,
  Copy,
  Trash2,
  Star,
  FileText,
  Loader2,
  ChevronRight,
} from "lucide-react";
import type { PolicySummary } from "@/types/policy";

interface PolicyListProps {
  initialPolicies: PolicySummary[];
}

export function PolicyList({ initialPolicies }: PolicyListProps) {
  const [policies, setPolicies] = useState(initialPolicies);
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  function handleCreate() {
    startTransition(async () => {
      const result = await createPolicy();
      if (!result.success) {
        toast({ title: "정책 생성 실패", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "새 정책이 생성되었습니다" });
      router.push(`/policies/${result.policyId}`);
    });
  }

  function handleCopy(id: string) {
    setActionId(id);
    startTransition(async () => {
      const result = await copyPolicy(id);
      setActionId(null);
      if (!result.success) {
        toast({ title: "복사 실패", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "정책이 복사되었습니다" });
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setActionId(id);
    startTransition(async () => {
      const result = await deletePolicy(id);
      setActionId(null);
      if (!result.success) {
        toast({ title: "삭제 실패", description: result.error, variant: "destructive" });
        return;
      }
      setPolicies((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "정책이 삭제되었습니다" });
    });
  }

  function handleSetDefault(id: string) {
    setActionId(id);
    startTransition(async () => {
      const result = await setDefaultPolicy(id);
      setActionId(null);
      if (!result.success) {
        toast({ title: "기본 정책 설정 실패", description: result.error, variant: "destructive" });
        return;
      }
      setPolicies((prev) =>
        prev.map((p) => ({ ...p, isDefault: p.id === id }))
      );
      toast({ title: "기본 정책이 설정되었습니다" });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">정책 관리</h1>
          <p className="text-muted-foreground">
            상품 가격, 배송비, 마켓 전송 등의 정책을 관리합니다.
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isPending} className="gap-1">
          {isPending && !actionId ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          새 정책 만들기
        </Button>
      </div>

      {policies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              등록된 정책이 없습니다. 새 정책을 만들어보세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {policies.map((policy) => {
            const busy = isPending && actionId === policy.id;
            return (
              <Card
                key={policy.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => router.push(`/policies/${policy.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{policy.name}</CardTitle>
                      {policy.isDefault && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="mr-1 h-3 w-3" />
                          기본
                        </Badge>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <CardDescription>
                    마진율 {policy.baseMarginRate}%
                    {policy.targetMarkets.length > 0 && (
                      <> · {policy.targetMarkets.join(", ")}</>
                    )}
                    {" · "}
                    {new Date(policy.updatedAt).toLocaleDateString("ko-KR")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {!policy.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(policy.id)}
                        disabled={busy}
                        className="gap-1 text-xs"
                      >
                        <Star className="h-3 w-3" />
                        기본 설정
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(policy.id)}
                      disabled={busy}
                      className="gap-1 text-xs"
                    >
                      <Copy className="h-3 w-3" />
                      복사
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(policy.id)}
                      disabled={busy}
                      className="gap-1 text-xs text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                      삭제
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
