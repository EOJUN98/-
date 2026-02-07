"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  applyProductOptimizationAction,
  generateProductOptimizationAction
} from "@/actions/products";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface AiOptimizerPanelProps {
  productId: string;
  currentName: string;
  currentDescription: string | null;
}

type OptimizationTarget = "name" | "description";
type OptimizationTask = "rewrite" | "translate";

export function AiOptimizerPanel({ productId, currentName, currentDescription }: AiOptimizerPanelProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [target, setTarget] = useState<OptimizationTarget>("name");
  const [task, setTask] = useState<OptimizationTask>("rewrite");
  const [sourceText, setSourceText] = useState(currentName);
  const [suggestion, setSuggestion] = useState("");
  const [markTranslated, setMarkTranslated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    const result = await generateProductOptimizationAction({
      productId,
      target,
      task
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error);
      toast({
        title: "AI 제안 생성 실패",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    setSourceText(result.sourceText);
    setSuggestion(result.suggestion);
  }

  async function handleApply() {
    if (!suggestion.trim()) {
      setError("적용할 텍스트가 비어 있습니다");
      return;
    }

    setSaving(true);
    setError(null);

    const result = await applyProductOptimizationAction({
      productId,
      target,
      content: suggestion,
      markTranslated
    });

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      toast({
        title: "적용 실패",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "적용 완료",
      description: "AI 제안이 상품 정보에 반영되었습니다."
    });

    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h2 className="text-base font-semibold">AI 리라이팅/번역 승인</h2>
        <p className="text-sm text-muted-foreground">
          AI 제안을 생성한 뒤 내용을 확인하고 승인 적용하세요.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>대상</Label>
          <Select value={target} onValueChange={(value) => setTarget(value as OptimizationTarget)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">상품명</SelectItem>
              <SelectItem value="description">상세설명</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>작업</Label>
          <Select value={task} onValueChange={(value) => setTask(value as OptimizationTask)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rewrite">리라이팅</SelectItem>
              <SelectItem value="translate">번역</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="source-text">원문</Label>
        <textarea
          id="source-text"
          className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={sourceText}
          onChange={(event) => setSourceText(event.target.value)}
          disabled
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="suggestion-text">AI 제안</Label>
        <textarea
          id="suggestion-text"
          className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={suggestion}
          onChange={(event) => setSuggestion(event.target.value)}
          placeholder={target === "name" ? "상품명 제안이 여기에 표시됩니다" : "상세설명 제안이 여기에 표시됩니다"}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={markTranslated}
          onChange={(event) => setMarkTranslated(event.target.checked)}
        />
        적용 시 `is_translated=true`로 표시
      </label>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleGenerate} disabled={loading}>
          {loading ? "생성 중..." : "AI 제안 생성"}
        </Button>
        <Button onClick={handleApply} disabled={saving || !suggestion.trim()}>
          {saving ? "적용 중..." : "승인 후 적용"}
        </Button>
      </div>

      {target === "description" && !currentDescription ? (
        <p className="text-xs text-muted-foreground">
          현재 상세설명이 비어 있어 상품명을 기반으로 제안이 생성될 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}
