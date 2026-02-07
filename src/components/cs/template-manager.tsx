"use client";

import { useMemo, useState, useTransition } from "react";

import { deleteCsTemplateAction, saveCsTemplateAction } from "@/actions/cs-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import type { CsTemplateItem } from "@/types/cs";

interface TemplateManagerProps {
  initialData: CsTemplateItem[];
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function TemplateManager({ initialData }: TemplateManagerProps) {
  const [templates, setTemplates] = useState(initialData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [shortcutKey, setShortcutKey] = useState("");
  const [content, setContent] = useState("");
  const [keyword, setKeyword] = useState("");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const filtered = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) {
      return templates;
    }

    return templates.filter((template) => {
      return (
        template.title.toLowerCase().includes(normalized) ||
        template.content.toLowerCase().includes(normalized) ||
        (template.shortcutKey ?? "").toLowerCase().includes(normalized)
      );
    });
  }, [templates, keyword]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setShortcutKey("");
    setContent("");
  }

  function startEdit(template: CsTemplateItem) {
    setEditingId(template.id);
    setTitle(template.title);
    setShortcutKey(template.shortcutKey ?? "");
    setContent(template.content);
  }

  function upsertTemplate(next: CsTemplateItem) {
    setTemplates((prev) => {
      const index = prev.findIndex((item) => item.id === next.id);
      if (index < 0) {
        return [next, ...prev];
      }

      const copied = [...prev];
      copied[index] = next;
      return copied;
    });
  }

  function removeTemplate(templateId: string) {
    setTemplates((prev) => prev.filter((item) => item.id !== templateId));
  }

  function submitTemplate() {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) {
      toast({
        title: "제목과 내용을 입력해주세요",
        variant: "destructive"
      });
      return;
    }

    startTransition(async () => {
      const result = await saveCsTemplateAction({
        templateId: editingId ?? undefined,
        title: trimmedTitle,
        content: trimmedContent,
        shortcutKey: shortcutKey.trim() || undefined
      });

      if (!result.success) {
        toast({
          title: "템플릿 저장 실패",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      upsertTemplate(result.template);
      resetForm();
      toast({
        title: editingId ? "템플릿이 수정되었습니다" : "템플릿이 생성되었습니다"
      });
    });
  }

  function deleteTemplate(templateId: string) {
    startTransition(async () => {
      const result = await deleteCsTemplateAction({
        templateId
      });

      if (!result.success) {
        toast({
          title: "템플릿 삭제 실패",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      removeTemplate(templateId);
      if (editingId === templateId) {
        resetForm();
      }
      toast({
        title: "템플릿이 삭제되었습니다"
      });
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="템플릿 제목" />
          <Input
            value={shortcutKey}
            onChange={(event) => setShortcutKey(event.target.value)}
            placeholder="단축키 (선택)"
            maxLength={10}
          />
        </div>
        <textarea
          className="min-h-[140px] w-full rounded-md border bg-background p-3 text-sm"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="자주 쓰는 답변 문구를 입력하세요"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">단축키는 최대 10자까지 저장됩니다.</p>
          <div className="flex gap-2">
            {editingId ? (
              <Button variant="outline" onClick={resetForm} disabled={isPending}>
                취소
              </Button>
            ) : null}
            <Button onClick={submitTemplate} disabled={isPending}>
              {editingId ? "템플릿 수정" : "템플릿 추가"}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="템플릿 제목/내용/단축키 검색"
            className="max-w-md"
          />
          <p className="text-sm text-muted-foreground">총 {filtered.length}개</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">제목</TableHead>
              <TableHead>내용</TableHead>
              <TableHead className="w-[120px]">단축키</TableHead>
              <TableHead className="w-[180px]">수정일</TableHead>
              <TableHead className="w-[150px] text-right">동작</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  등록된 템플릿이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">{template.title}</TableCell>
                  <TableCell>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                      {template.content}
                    </p>
                  </TableCell>
                  <TableCell>
                    {template.shortcutKey ? <Badge variant="secondary">{template.shortcutKey}</Badge> : "-"}
                  </TableCell>
                  <TableCell>{formatDate(template.updatedAt ?? template.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(template)} disabled={isPending}>
                        수정
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteTemplate(template.id)}
                        disabled={isPending}
                      >
                        삭제
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
