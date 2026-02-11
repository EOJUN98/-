"use client";

import { useMemo, useState, useTransition } from "react";

import { saveDefaultForwarderSettingAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import type { ForwarderCompany } from "@/types/settings";

interface ForwarderPanelProps {
  initialCompanies: ForwarderCompany[];
  initialDefaultForwarderCode: string | null;
}

export function ForwarderPanel({ initialCompanies, initialDefaultForwarderCode }: ForwarderPanelProps) {
  const [defaultForwarderCode, setDefaultForwarderCode] = useState<string>(initialDefaultForwarderCode ?? "none");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const companies = useMemo(() => {
    return [...initialCompanies].sort((a, b) => a.id - b.id);
  }, [initialCompanies]);

  function handleSave() {
    const next = defaultForwarderCode === "none" ? null : defaultForwarderCode;
    startTransition(async () => {
      const result = await saveDefaultForwarderSettingAction({ defaultForwarderCode: next });
      if (!result.success) {
        toast({ title: "기본 포워더 저장 실패", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "기본 포워더 저장 완료" });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>배송대행지(포워더) 설정</CardTitle>
        <CardDescription>
          주문 수집/처리 시 사용할 기본 포워더와 포워더 마스터 목록을 관리합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2 max-w-sm">
          <Label>기본 포워더</Label>
          <Select value={defaultForwarderCode} onValueChange={setDefaultForwarderCode}>
            <SelectTrigger>
              <SelectValue placeholder="기본 포워더 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">미지정</SelectItem>
              {companies.map((f) => (
                <SelectItem key={f.code} value={f.code}>
                  {f.name} ({f.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            미지정이면 주문별 포워더 입력값을 우선 사용하고, 입력이 없으면 공란으로 유지됩니다.
          </p>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">코드</TableHead>
                <TableHead>포워더명</TableHead>
                <TableHead className="w-[120px]">API 타입</TableHead>
                <TableHead>홈페이지</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                    등록된 포워더가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.code}</TableCell>
                    <TableCell>{f.name}</TableCell>
                    <TableCell className="text-xs">{f.apiType ?? "-"}</TableCell>
                    <TableCell className="text-xs">{f.homepageUrl ?? "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "저장 중..." : "저장"}
        </Button>
      </CardFooter>
    </Card>
  );
}

