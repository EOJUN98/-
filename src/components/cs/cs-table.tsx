"use client";

import { useMemo, useState, useTransition } from "react";

import { replyCsInquiryAction } from "@/actions/cs-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import type { CsInquiryListItem, CsTemplateItem } from "@/types/cs";

interface CsTableProps {
  initialData: CsInquiryListItem[];
  templates?: CsTemplateItem[];
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

export function CsTable({ initialData, templates = [] }: CsTableProps) {
  const [inquiries, setInquiries] = useState(initialData);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const inquiry of initialData) {
      seeded[inquiry.id] = inquiry.replyContent ?? "";
    }
    return seeded;
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const filtered = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return inquiries.filter((inquiry) => {
      if (statusFilter === "answered" && !inquiry.isAnswered) {
        return false;
      }

      if (statusFilter === "unanswered" && inquiry.isAnswered) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return (
        (inquiry.title ?? "").toLowerCase().includes(normalizedKeyword) ||
        (inquiry.content ?? "").toLowerCase().includes(normalizedKeyword) ||
        (inquiry.writerId ?? "").toLowerCase().includes(normalizedKeyword) ||
        (inquiry.inquiryId ?? "").toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [inquiries, keyword, statusFilter]);

  const templateById = useMemo(() => {
    const map = new Map<string, CsTemplateItem>();
    for (const template of templates) {
      map.set(template.id, template);
    }
    return map;
  }, [templates]);

  function setDraft(id: string, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: value
    }));
  }

  function applyInquiryPatch(id: string, patch: Partial<CsInquiryListItem>) {
    setInquiries((prev) => prev.map((inquiry) => (inquiry.id === id ? { ...inquiry, ...patch } : inquiry)));
  }

  function saveReply(inquiry: CsInquiryListItem) {
    const reply = (drafts[inquiry.id] ?? "").trim();
    if (!reply) {
      toast({
        title: "답변 내용을 입력해주세요",
        variant: "destructive"
      });
      return;
    }

    setSavingId(inquiry.id);
    startTransition(async () => {
      const result = await replyCsInquiryAction({
        inquiryRecordId: inquiry.id,
        replyContent: reply
      });

      setSavingId(null);

      if (!result.success) {
        toast({
          title: "답변 저장 실패",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      applyInquiryPatch(inquiry.id, {
        replyContent: result.inquiry.replyContent,
        isAnswered: result.inquiry.isAnswered
      });

      toast({
        title: "답변 저장 완료"
      });
    });
  }

  function applyTemplate(inquiryId: string, templateId: string) {
    const template = templateById.get(templateId);
    if (!template) {
      return;
    }
    setDraft(inquiryId, template.content);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_180px_auto] md:items-center">
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="문의 제목/내용/작성자 검색"
        />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="unanswered">미답변</SelectItem>
            <SelectItem value="answered">답변완료</SelectItem>
          </SelectContent>
        </Select>

        <p className="text-sm text-muted-foreground">총 {filtered.length}건</p>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">접수일시</TableHead>
              <TableHead className="w-[110px]">마켓</TableHead>
              <TableHead className="w-[120px]">문의번호</TableHead>
              <TableHead className="w-[100px]">작성자</TableHead>
              <TableHead>문의</TableHead>
              <TableHead className="w-[360px]">답변</TableHead>
              <TableHead className="w-[120px]">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  표시할 CS 문의가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((inquiry) => {
                const saving = isPending && savingId === inquiry.id;

                return (
                  <TableRow key={inquiry.id}>
                    <TableCell>{formatDate(inquiry.inquiryDate ?? inquiry.createdAt)}</TableCell>
                    <TableCell>{inquiry.marketCode ?? "-"}</TableCell>
                    <TableCell>{inquiry.inquiryId ?? "-"}</TableCell>
                    <TableCell>{inquiry.writerId ?? "-"}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{inquiry.title ?? "(제목 없음)"}</p>
                        <p className="max-w-[440px] whitespace-pre-wrap text-sm text-muted-foreground">
                          {inquiry.content ?? "(내용 없음)"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Select onValueChange={(value) => applyTemplate(inquiry.id, value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="답변 템플릿 선택 (선택)" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.length === 0 ? (
                              <SelectItem value="__none__" disabled>
                                등록된 템플릿 없음
                              </SelectItem>
                            ) : (
                              templates.map((template) => (
                                <SelectItem key={template.id} value={template.id}>
                                  {template.shortcutKey ? `[${template.shortcutKey}] ` : ""}
                                  {template.title}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <textarea
                          className="min-h-[88px] w-full rounded-md border bg-background p-2 text-sm"
                          value={drafts[inquiry.id] ?? ""}
                          onChange={(event) => setDraft(inquiry.id, event.target.value)}
                          placeholder="답변 내용을 입력하세요"
                        />
                        <div className="flex justify-end">
                          <Button size="sm" onClick={() => saveReply(inquiry)} disabled={saving}>
                            {saving ? "저장 중..." : "답변 저장"}
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={inquiry.isAnswered ? "secondary" : "outline"}>
                        {inquiry.isAnswered ? "답변완료" : "미답변"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
