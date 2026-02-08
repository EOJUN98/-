"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Type } from "lucide-react";

interface NamingSettingsProps {
  productNamePrefix: string;
  productNameSuffix: string;
  optionNamePrefix: string;
  optionNameSuffix: string;
  onChange: (patch: Record<string, unknown>) => void;
}

export function NamingSettings({
  productNamePrefix,
  productNameSuffix,
  optionNamePrefix,
  optionNameSuffix,
  onChange,
}: NamingSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Type className="h-5 w-5" />
          상품/옵션명 관리
        </CardTitle>
        <CardDescription>
          상품명과 옵션명에 자동으로 접두사/접미사를 추가합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>상품명 접두사</Label>
            <Input
              value={productNamePrefix}
              onChange={(e) => onChange({ productNamePrefix: e.target.value })}
              placeholder="예: [당일출고]"
            />
          </div>
          <div className="grid gap-2">
            <Label>상품명 접미사</Label>
            <Input
              value={productNameSuffix}
              onChange={(e) => onChange({ productNameSuffix: e.target.value })}
              placeholder="예: (무료배송)"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>옵션명 접두사</Label>
            <Input
              value={optionNamePrefix}
              onChange={(e) => onChange({ optionNamePrefix: e.target.value })}
              placeholder="옵션 앞에 추가할 텍스트"
            />
          </div>
          <div className="grid gap-2">
            <Label>옵션명 접미사</Label>
            <Input
              value={optionNameSuffix}
              onChange={(e) => onChange({ optionNameSuffix: e.target.value })}
              placeholder="옵션 뒤에 추가할 텍스트"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          상품/옵션명 정책을 적용하지 않으면 수집된 원문 상품/옵션명 그대로 사용됩니다.
        </p>
      </CardContent>
    </Card>
  );
}
