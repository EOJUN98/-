"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { saveDetailTemplate, deleteDetailTemplate } from "@/actions/policies";
import { FileCode, Plus, Trash2, Loader2 } from "lucide-react";
import type { DetailTemplate } from "@/types/policy";

interface TemplateSettingsProps {
  detailTemplateId: string | null;
  templates: DetailTemplate[];
  onChange: (templateId: string | null) => void;
}

export function TemplateSettings({ detailTemplateId, templates: initialTemplates, onChange }: TemplateSettingsProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHeader, setNewHeader] = useState("");
  const [newFooter, setNewFooter] = useState("");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleCreate() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const result = await saveDetailTemplate({
        name: newName,
        headerHtml: newHeader,
        footerHtml: newFooter,
        cssStyle: "",
        isDefault: false,
      });
      if (!result.success) {
        toast({ title: "템플릿 저장 실패", description: result.error, variant: "destructive" });
        return;
      }
      setTemplates((prev) => [
        ...prev,
        {
          id: result.templateId!,
          name: newName,
          headerHtml: newHeader,
          footerHtml: newFooter,
          cssStyle: "",
          isDefault: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      setShowCreate(false);
      setNewName("");
      setNewHeader("");
      setNewFooter("");
      toast({ title: "템플릿이 생성되었습니다" });
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteDetailTemplate(id);
      if (!result.success) {
        toast({ title: "삭제 실패", description: result.error, variant: "destructive" });
        return;
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (detailTemplateId === id) onChange(null);
      toast({ title: "템플릿이 삭제되었습니다" });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCode className="h-5 w-5" />
          상세페이지 템플릿
        </CardTitle>
        <CardDescription>상품 상세페이지에 적용할 템플릿을 선택합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 max-w-md">
          <Label>템플릿 선택</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={detailTemplateId ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">기본템플릿</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Template list */}
        {templates.length > 0 && (
          <div className="space-y-1">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{t.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(t.id)}
                  disabled={isPending}
                  className="text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {showCreate ? (
          <div className="rounded-md border p-3 space-y-3">
            <div className="grid gap-2">
              <Label>템플릿 이름</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="템플릿 이름" />
            </div>
            <div className="grid gap-2">
              <Label>헤더 HTML</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newHeader}
                onChange={(e) => setNewHeader(e.target.value)}
                placeholder="상품 상세 위에 표시할 HTML"
              />
            </div>
            <div className="grid gap-2">
              <Label>푸터 HTML</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newFooter}
                onChange={(e) => setNewFooter(e.target.value)}
                placeholder="상품 상세 아래에 표시할 HTML"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>취소</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} className="gap-1">
            <Plus className="h-4 w-4" />
            새 템플릿 만들기
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
