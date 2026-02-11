"use client";

import { useMemo, useState, useTransition } from "react";

import { saveDefaultCourierSettingAction } from "@/actions/settings";
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
import type { CourierCompany } from "@/types/settings";

interface CourierPanelProps {
  initialCompanies: CourierCompany[];
  initialDefaultCourierCode: string | null;
}

export function CourierPanel({ initialCompanies, initialDefaultCourierCode }: CourierPanelProps) {
  const [defaultCourierCode, setDefaultCourierCode] = useState<string>(initialDefaultCourierCode ?? "none");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const companies = useMemo(() => {
    return [...initialCompanies].sort((a, b) => a.id - b.id);
  }, [initialCompanies]);

  function handleSave() {
    const next = defaultCourierCode === "none" ? null : defaultCourierCode;
    startTransition(async () => {
      const result = await saveDefaultCourierSettingAction({ defaultCourierCode: next });
      if (!result.success) {
        toast({ title: "기본 택배사 저장 실패", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "기본 택배사 저장 완료" });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>택배사 설정</CardTitle>
        <CardDescription>
          송장 업로드 및 마켓 전송 시 사용할 기본 택배사와 마켓별 택배사 코드 매핑을 관리합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2 max-w-sm">
          <Label>기본 택배사</Label>
          <Select value={defaultCourierCode} onValueChange={setDefaultCourierCode}>
            <SelectTrigger>
              <SelectValue placeholder="기본 택배사 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">미지정</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            미지정이면 송장 업로드 시 기본값(CJ) 또는 파일 내 택배사 값을 우선 사용하도록 처리합니다.
          </p>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">내부코드</TableHead>
                <TableHead>택배사명</TableHead>
                <TableHead className="w-[120px]">쿠팡</TableHead>
                <TableHead className="w-[140px]">스마트스토어</TableHead>
                <TableHead className="w-[120px]">11번가</TableHead>
                <TableHead className="w-[120px]">G마켓</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    등록된 택배사가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.code}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="text-xs">{c.coupangCode ?? "-"}</TableCell>
                    <TableCell className="text-xs">{c.smartstoreCode ?? "-"}</TableCell>
                    <TableCell className="text-xs">{c.eleventhCode ?? "-"}</TableCell>
                    <TableCell className="text-xs">{c.gmarketCode ?? "-"}</TableCell>
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

