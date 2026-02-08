"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, DollarSign } from "lucide-react";
import type { MarginTier } from "@/types/policy";
import { CURRENCY_OPTIONS } from "@/types/policy";

interface MarginSettingsProps {
  baseMarginRate: number;
  baseMarginAmount: number;
  useTieredMargin: boolean;
  marginTiers: MarginTier[];
  baseCurrency: string;
  exchangeRate: number;
  onChange: (patch: Record<string, unknown>) => void;
}

export function MarginSettings({
  baseMarginRate,
  baseMarginAmount,
  useTieredMargin,
  marginTiers,
  baseCurrency,
  exchangeRate,
  onChange,
}: MarginSettingsProps) {
  function addTier() {
    const lastMax = marginTiers.length > 0 ? marginTiers[marginTiers.length - 1].maxPrice : 0;
    onChange({
      marginTiers: [
        ...marginTiers,
        {
          minPrice: lastMax + 1,
          maxPrice: lastMax + 10000,
          marginRate: baseMarginRate,
          marginAmount: 0,
          sortOrder: marginTiers.length,
        },
      ],
    });
  }

  function removeTier(index: number) {
    onChange({ marginTiers: marginTiers.filter((_, i) => i !== index) });
  }

  function updateTier(index: number, patch: Partial<MarginTier>) {
    onChange({
      marginTiers: marginTiers.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          마진/가격 설정
        </CardTitle>
        <CardDescription>기본 마진율과 가격범위별 차등 마진을 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-2">
            <Label>기본 마진율 (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={baseMarginRate}
              onChange={(e) => onChange({ baseMarginRate: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-2">
            <Label>마진금액 (원)</Label>
            <Input
              type="number"
              min={0}
              value={baseMarginAmount}
              onChange={(e) => onChange({ baseMarginAmount: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              마진금액 입력 시 마진율 대신 적용
            </p>
          </div>
          <div className="grid gap-2">
            <Label>기준통화</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={baseCurrency}
              onChange={(e) => onChange({ baseCurrency: e.target.value })}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {baseCurrency !== "KRW" && (
          <div className="grid gap-2 max-w-xs">
            <Label>환율 (1 {baseCurrency} = ? KRW)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={exchangeRate}
              onChange={(e) => onChange({ exchangeRate: Number(e.target.value) })}
            />
          </div>
        )}

        {/* Tiered margin toggle */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useTieredMargin}
            onChange={(e) => onChange({ useTieredMargin: e.target.checked })}
          />
          상품가격별 범위마진 설정
        </label>

        {useTieredMargin && (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_8px_1fr_1fr_1fr_40px] gap-2 items-center text-xs text-muted-foreground font-medium">
              <span>이상 (원)</span>
              <span></span>
              <span>미만 (원)</span>
              <span>마진율 (%)</span>
              <span>마진금액 (원)</span>
              <span></span>
            </div>
            {marginTiers.map((tier, i) => (
              <div key={i} className="grid grid-cols-[1fr_8px_1fr_1fr_1fr_40px] gap-2 items-center">
                <Input
                  type="number"
                  min={0}
                  value={tier.minPrice}
                  onChange={(e) => updateTier(i, { minPrice: Number(e.target.value) })}
                />
                <span className="text-center text-muted-foreground">~</span>
                <Input
                  type="number"
                  min={1}
                  value={tier.maxPrice}
                  onChange={(e) => updateTier(i, { maxPrice: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={tier.marginRate}
                  onChange={(e) => updateTier(i, { marginRate: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  min={0}
                  value={tier.marginAmount}
                  onChange={(e) => updateTier(i, { marginAmount: Number(e.target.value) })}
                />
                <Button variant="ghost" size="sm" onClick={() => removeTier(i)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addTier} className="gap-1">
              <Plus className="h-4 w-4" />
              상품가격범위 추가하기
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
