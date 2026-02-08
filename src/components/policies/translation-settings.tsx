"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Languages } from "lucide-react";
import { LANGUAGES } from "@/types/policy";

interface TranslationSettingsProps {
  translationEnabled: boolean;
  translationSourceLang: string;
  translationTargetLang: string;
  onChange: (patch: Record<string, unknown>) => void;
}

export function TranslationSettings({
  translationEnabled,
  translationSourceLang,
  translationTargetLang,
  onChange,
}: TranslationSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          번역 관리
        </CardTitle>
        <CardDescription>상품정보를 번역하기 위한 정책을 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={translationEnabled}
            onChange={(e) => onChange({ translationEnabled: e.target.checked })}
          />
          번역 관리 정책 활성화
        </label>

        {translationEnabled && (
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div className="grid gap-2">
              <Label>원본 언어</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={translationSourceLang}
                onChange={(e) => onChange({ translationSourceLang: e.target.value })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>대상 언어</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={translationTargetLang}
                onChange={(e) => onChange({ translationTargetLang: e.target.value })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {!translationEnabled && (
          <p className="text-xs text-muted-foreground">
            번역 정책을 적용하지 않으면 수집된 원문 상품명/옵션명이 그대로 사용됩니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
