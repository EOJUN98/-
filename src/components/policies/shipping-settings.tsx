"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck } from "lucide-react";

interface ShippingSettingsProps {
  internationalShippingFee: number;
  shippingWeightUnit: string;
  shippingWeight: number | null;
  domesticShippingFee: number;
  freeShippingThreshold: number;
  freeShippingAmount: number;
  onChange: (patch: Record<string, unknown>) => void;
}

export function ShippingSettings({
  internationalShippingFee,
  shippingWeightUnit,
  shippingWeight,
  domesticShippingFee,
  freeShippingThreshold,
  freeShippingAmount,
  onChange,
}: ShippingSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          배송비 설정
        </CardTitle>
        <CardDescription>국제운송료와 국내배송비를 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-2">
            <Label>국제운송료 (원)</Label>
            <Input
              type="number"
              min={0}
              value={internationalShippingFee}
              onChange={(e) => onChange({ internationalShippingFee: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-2">
            <Label>배송무게</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={shippingWeight ?? ""}
              onChange={(e) => onChange({ shippingWeight: e.target.value ? Number(e.target.value) : null })}
              placeholder="무게 입력"
            />
          </div>
          <div className="grid gap-2">
            <Label>무게 단위</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={shippingWeightUnit}
              onChange={(e) => onChange({ shippingWeightUnit: e.target.value })}
            >
              <option value="KG">KG</option>
              <option value="LB">LB</option>
              <option value="G">G</option>
            </select>
          </div>
        </div>

        <div className="grid gap-2 max-w-xs">
          <Label>국내 배송비 (원)</Label>
          <Input
            type="number"
            min={0}
            value={domesticShippingFee}
            onChange={(e) => onChange({ domesticShippingFee: Number(e.target.value) })}
          />
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <p className="text-sm font-medium">조건부 배송비 추가</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>상품가격이 (원) 이하이면</Label>
              <Input
                type="number"
                min={0}
                value={freeShippingThreshold}
                onChange={(e) => onChange({ freeShippingThreshold: Number(e.target.value) })}
                placeholder="예: 30000"
              />
            </div>
            <div className="grid gap-2">
              <Label>일괄 배송비 추가 (원)</Label>
              <Input
                type="number"
                min={0}
                value={freeShippingAmount}
                onChange={(e) => onChange({ freeShippingAmount: Number(e.target.value) })}
                placeholder="예: 2500"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            상품가격이 설정 금액 이하인 경우 배송비를 상품가에 추가합니다.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
