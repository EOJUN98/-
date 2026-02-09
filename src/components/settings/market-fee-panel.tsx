"use client";

import { useState, useTransition } from "react";

import { saveMarketFeeRatesAction } from "@/actions/settings";
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
import type { MarketFeeConfig } from "@/types/settings";

interface MarketFeePanelProps {
  initialFees: MarketFeeConfig[];
}

export function MarketFeePanel({ initialFees }: MarketFeePanelProps) {
  const [fees, setFees] = useState(
    initialFees.map((f) => ({ ...f, feeRate: String(f.feeRate) }))
  );
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function updateFee(marketCode: string, value: string) {
    setFees((prev) =>
      prev.map((f) => f.marketCode === marketCode ? { ...f, feeRate: value } : f)
    );
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveMarketFeeRatesAction({
        fees: fees.map((f) => ({
          marketCode: f.marketCode,
          feeRate: Number(f.feeRate) || 0,
        })),
      });

      if (!result.success) {
        toast({ title: "수수료율 저장 실패", description: result.error, variant: "destructive" });
        return;
      }

      toast({ title: "마켓별 수수료율 저장 완료" });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>마켓별 수수료율</CardTitle>
        <CardDescription>
          각 마켓의 판매 수수료율(%)을 설정합니다. 가격 계산 및 수익 시뮬레이션에 사용됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {fees.map((fee) => (
            <div key={fee.marketCode} className="grid gap-1.5">
              <Label htmlFor={`fee-${fee.marketCode}`} className="text-xs">
                {fee.marketLabel}
              </Label>
              <div className="flex items-center gap-1">
                <Input
                  id={`fee-${fee.marketCode}`}
                  type="number"
                  min={0}
                  max={50}
                  step={0.1}
                  value={fee.feeRate}
                  onChange={(e) => updateFee(fee.marketCode, e.target.value)}
                  className="h-8 text-sm"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={handleSave} disabled={isPending} size="sm">
          {isPending ? "저장 중..." : "수수료율 저장"}
        </Button>
      </CardFooter>
    </Card>
  );
}
