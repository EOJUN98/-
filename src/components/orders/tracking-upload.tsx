"use client";

import { useState, useTransition } from "react";

import { uploadTrackingFileAction } from "@/actions/logistics-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export function TrackingUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lastSummary, setLastSummary] = useState<{
    fileName: string;
    totalRows: number;
    updatedCount: number;
    failedCount: number;
    marketSyncedCount: number;
    marketSyncFailedCount: number;
    marketSyncSkippedCount: number;
    courierMappingSummary: {
      defaultCourierCode: string | null;
      internalMappedCount: number;
      defaultAppliedCount: number;
      marketMappedCount: number;
      samples: Array<{
        orderNumber: string;
        marketCode: string | null;
        originalCourierCode: string | null;
        internalCourierCode: string | null;
        marketCourierCode: string | null;
      }>;
    };
  } | null>(null);
  const { toast } = useToast();

  function submit() {
    if (!file) {
      toast({
        title: "파일을 선택해주세요",
        variant: "destructive"
      });
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);

      const result = await uploadTrackingFileAction(formData);

      if (!result.success) {
        toast({
          title: "송장 업로드 실패",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setLastSummary({
        fileName: result.fileName,
        totalRows: result.totalRows,
        updatedCount: result.updatedCount,
        failedCount: result.failedCount,
        marketSyncedCount: result.marketSyncedCount,
        marketSyncFailedCount: result.marketSyncFailedCount,
        marketSyncSkippedCount: result.marketSyncSkippedCount,
        courierMappingSummary: result.courierMappingSummary
      });

      if (result.failedCount > 0 || result.marketSyncFailedCount > 0) {
        toast({
          title: "송장 업로드 완료 (부분 실패)",
          description: `DB 성공 ${result.updatedCount}건 / DB 실패 ${result.failedCount}건 / 마켓 실패 ${result.marketSyncFailedCount}건`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "송장 업로드 완료",
          description: `DB 반영 ${result.updatedCount}건 / 마켓 역전송 ${result.marketSyncedCount}건`
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>송장 업로드</CardTitle>
        <CardDescription>
          CSV/TSV/XLSX 파일의 주문번호·운송장번호를 일괄 반영합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {lastSummary ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            최근 처리: {lastSummary.fileName} / 총 {lastSummary.totalRows}건 / DB 성공 {lastSummary.updatedCount}건 / DB 실패 {lastSummary.failedCount}건 / 마켓 성공 {lastSummary.marketSyncedCount}건 / 마켓 실패 {lastSummary.marketSyncFailedCount}건 / 마켓 생략 {lastSummary.marketSyncSkippedCount}건
            <div className="mt-2 space-y-1">
              <p>
                택배사 매핑: 내부코드 변환 {lastSummary.courierMappingSummary.internalMappedCount}건 / 기본값 적용 {lastSummary.courierMappingSummary.defaultAppliedCount}건 / 마켓코드 변환 {lastSummary.courierMappingSummary.marketMappedCount}건
              </p>
              <p>
                기본 택배사: {lastSummary.courierMappingSummary.defaultCourierCode ?? "미지정"}
              </p>
              {lastSummary.courierMappingSummary.samples.length > 0 ? (
                <div className="pt-1 text-xs">
                  {lastSummary.courierMappingSummary.samples.map((sample, idx) => (
                    <p key={`${sample.orderNumber}-${idx}`}>
                      {sample.marketCode ?? "-"} / {sample.originalCourierCode ?? "미입력"} → {sample.internalCourierCode ?? "미지정"} → {sample.marketCourierCode ?? "미지정"}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={submit} disabled={isPending || !file}>
          {isPending ? "업로드 중..." : "송장 일괄 반영"}
        </Button>
      </CardFooter>
    </Card>
  );
}
