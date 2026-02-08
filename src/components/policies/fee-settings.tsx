"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Receipt } from "lucide-react";

interface FeeSettingsProps {
  platformFeeRate: number;
  onChange: (patch: Record<string, unknown>) => void;
}

export function FeeSettings({ platformFeeRate, onChange }: FeeSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          수수료 설정
        </CardTitle>
        <CardDescription>마켓 플랫폼 수수료를 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 max-w-xs">
          <Label>플랫폼 수수료율 (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={platformFeeRate}
            onChange={(e) => onChange({ platformFeeRate: Number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">
            판매가에서 차감되는 마켓 수수료율입니다.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
