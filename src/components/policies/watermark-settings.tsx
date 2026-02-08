"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stamp } from "lucide-react";
import { WATERMARK_POSITIONS } from "@/types/policy";

const POSITION_LABELS: Record<string, string> = {
  "top-left": "좌상단",
  "top-center": "상단 중앙",
  "top-right": "우상단",
  "center-left": "좌측 중앙",
  "center": "정중앙",
  "center-right": "우측 중앙",
  "bottom-left": "좌하단",
  "bottom-center": "하단 중앙",
  "bottom-right": "우하단",
};

interface WatermarkSettingsProps {
  watermarkEnabled: boolean;
  watermarkImageUrl: string | null;
  watermarkPosition: string;
  watermarkOpacity: number;
  onChange: (patch: Record<string, unknown>) => void;
}

export function WatermarkSettings({
  watermarkEnabled,
  watermarkImageUrl,
  watermarkPosition,
  watermarkOpacity,
  onChange,
}: WatermarkSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Stamp className="h-5 w-5" />
          워터마크 관리
        </CardTitle>
        <CardDescription>상품이미지에 추가할 워터마크를 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={watermarkEnabled}
            onChange={(e) => onChange({ watermarkEnabled: e.target.checked })}
          />
          워터마크 적용
        </label>

        {watermarkEnabled && (
          <div className="space-y-4">
            <div className="grid gap-2 max-w-md">
              <Label>워터마크 이미지 URL</Label>
              <Input
                value={watermarkImageUrl ?? ""}
                onChange={(e) => onChange({ watermarkImageUrl: e.target.value || null })}
                placeholder="https://... 워터마크 이미지 URL"
              />
            </div>

            <div className="grid gap-2">
              <Label>위치 선택</Label>
              <div className="grid grid-cols-3 gap-1 max-w-xs">
                {WATERMARK_POSITIONS.map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      watermarkPosition === pos
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => onChange({ watermarkPosition: pos })}
                  >
                    {POSITION_LABELS[pos]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 max-w-xs">
              <Label>투명도 ({Math.round(watermarkOpacity * 100)}%)</Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={watermarkOpacity}
                onChange={(e) => onChange({ watermarkOpacity: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
