"use client";

import { useState, useTransition } from "react";

import { saveSourcingConfigAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { SourcingConfig } from "@/types/settings";
import { Settings2 } from "lucide-react";

interface SourcingConfigPanelProps {
  initialConfig: SourcingConfig;
}

export function SourcingConfigPanel({ initialConfig }: SourcingConfigPanelProps) {
  const [form, setForm] = useState({
    pageDelayMs: String(initialConfig.pageDelayMs),
    crawlDelayMs: String(initialConfig.crawlDelayMs),
    bulkMaxTarget: String(initialConfig.bulkMaxTarget),
    pageSize: String(initialConfig.pageSize),
    autoConvert: initialConfig.autoConvert,
    defaultMarginRate: String(initialConfig.defaultMarginRate),
  });
  const [updatedAt, setUpdatedAt] = useState(initialConfig.updatedAt);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function update(patch: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveSourcingConfigAction({
        pageDelayMs: Number(form.pageDelayMs) || 300,
        crawlDelayMs: Number(form.crawlDelayMs) || 500,
        bulkMaxTarget: Number(form.bulkMaxTarget) || 3000,
        pageSize: Number(form.pageSize) || 50,
        autoConvert: form.autoConvert,
        defaultMarginRate: Number(form.defaultMarginRate) || 30,
      });

      if (!result.success) {
        toast({
          title: "수집 설정 저장 실패",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      setUpdatedAt(result.config.updatedAt);
      toast({ title: "수집 설정 저장 완료" });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          수집 설정
        </CardTitle>
        <CardDescription>
          상품 수집 시 적용되는 속도, 수량, 마진율 등을 설정합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="page-delay">페이지 수집 딜레이 (ms)</Label>
            <Input
              id="page-delay"
              type="number"
              min={100}
              max={5000}
              step={100}
              value={form.pageDelayMs}
              onChange={(e) => update({ pageDelayMs: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              대량 수집 시 페이지 간 대기 시간 (100~5000ms)
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="crawl-delay">상세 크롤링 딜레이 (ms)</Label>
            <Input
              id="crawl-delay"
              type="number"
              min={100}
              max={5000}
              step={100}
              value={form.crawlDelayMs}
              onChange={(e) => update({ crawlDelayMs: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              상품 상세정보 크롤링 간 대기 시간 (100~5000ms)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="bulk-max">대량 수집 최대 수량</Label>
            <Input
              id="bulk-max"
              type="number"
              min={100}
              max={10000}
              step={100}
              value={form.bulkMaxTarget}
              onChange={(e) => update({ bulkMaxTarget: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              한 번에 수집 가능한 최대 상품 수 (100~10000)
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="page-size">페이지당 수집 수량</Label>
            <Input
              id="page-size"
              type="number"
              min={10}
              max={100}
              step={10}
              value={form.pageSize}
              onChange={(e) => update({ pageSize: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              API 요청당 가져올 상품 수 (10~100)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="margin-rate">기본 마진율 (%)</Label>
            <Input
              id="margin-rate"
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.defaultMarginRate}
              onChange={(e) => update({ defaultMarginRate: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              수집 시 자동 적용되는 판매가 마진율
            </p>
          </div>

          <div className="grid gap-2">
            <Label>자동 변환</Label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <input
                type="checkbox"
                checked={form.autoConvert}
                onChange={(e) => update({ autoConvert: e.target.checked })}
              />
              수집 시 자동으로 상품관리에 등록
            </label>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {updatedAt
            ? `최근 저장: ${new Date(updatedAt).toLocaleString("ko-KR")}`
            : "저장 이력 없음"}
        </span>
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "저장 중..." : "저장"}
        </Button>
      </CardFooter>
    </Card>
  );
}
