import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { AiOptimizerPanel } from "@/components/products/ai-optimizer-panel";
import { ImageEditor } from "@/components/products/image-editor";
import { PublishLogTable } from "@/components/products/publish-log-table";
import { PublishRetryQueuePanel } from "@/components/products/publish-retry-queue-panel";
import { calculateSalePrice, calculatePolicyPricing, calculateMarketPrices } from "@/lib/logic/pricing";
import { getProductDetailForDashboard } from "@/lib/queries/products";
import type { ProductPublishLogItem } from "@/types/product";

interface ProductDetailPageProps {
  params: {
    id: string;
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatPrice(value: number) {
  return value.toLocaleString() + "원";
}

function summarizePublishLogs(logs: ProductPublishLogItem[]) {
  const total = logs.length;
  const successCount = logs.filter((log) => log.status === "success").length;
  const failedCount = logs.filter((log) => log.status === "failed").length;
  const pendingCount = logs.filter((log) => !log.status || log.status === "pending").length;
  const successRate = total > 0 ? Math.round((successCount / total) * 1000) / 10 : 0;

  const reasonMap = new Map<string, number>();
  for (const log of logs) {
    if (log.status !== "failed") {
      continue;
    }
    const normalizedReason = (log.errorMessage ?? "원인 미상").trim() || "원인 미상";
    reasonMap.set(normalizedReason, (reasonMap.get(normalizedReason) ?? 0) + 1);
  }

  const topFailureReasons = Array.from(reasonMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => ({ reason, count }));

  const latestFailure = logs.find((log) => log.status === "failed") ?? null;
  const latestSuccess = logs.find((log) => log.status === "success") ?? null;

  return {
    total,
    successCount,
    failedCount,
    pendingCount,
    successRate,
    topFailureReasons,
    latestFailure,
    latestSuccess
  };
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { data: product, policyDetail, marketFeeRates, error } = await getProductDetailForDashboard(params.id);

  if (!product && !error) {
    notFound();
  }

  if (error && !product) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">상품 상세</h1>
          <Button asChild variant="outline">
            <Link href="/products">목록으로</Link>
          </Button>
        </div>
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      </section>
    );
  }

  if (!product) {
    notFound();
  }

  const pricing = calculateSalePrice({
    costPrice: product.costPrice,
    exchangeRate: product.exchangeRate,
    shippingFee: product.shippingFee,
    marginRate: product.marginRate,
    marketFeeRate: 11
  });

  const policyPricing = policyDetail
    ? calculatePolicyPricing(product.costPrice, policyDetail)
    : null;

  const marketPrices = policyDetail
    ? calculateMarketPrices(product.costPrice, policyDetail, marketFeeRates ?? undefined)
    : null;

  const publishSummary = summarizePublishLogs(product.publishLogs);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">상품 상세</h1>
          <p className="text-muted-foreground">상품코드: {product.productCode ?? "-"}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/products">목록으로</Link>
        </Button>
      </div>

      {/* 기본 정보 + 정책 정보 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{product.name}</CardTitle>
              <CardDescription>
                생성일 {formatDate(product.createdAt)} / 최근수정 {formatDate(product.updatedAt)}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {product.isTranslated ? (
                <Badge variant="secondary">번역 완료</Badge>
              ) : (
                <Badge variant="outline">미번역</Badge>
              )}
              {policyDetail ? (
                <Badge className="bg-blue-600">{policyDetail.name}</Badge>
              ) : (
                <Badge variant="outline">정책 미적용</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p className="font-medium text-muted-foreground">상품 기본 정보</p>
            <p>원가: {formatPrice(product.costPrice)}</p>
            <p>환율: {product.exchangeRate.toLocaleString()}</p>
            <p>마진율: {product.marginRate.toFixed(1)}%</p>
            <p>배송비: {formatPrice(product.shippingFee)}</p>
            <p>재고: {product.stockQuantity.toLocaleString()}개</p>
            <p>카테고리 ID: {product.categoryId ?? "미지정"}</p>
            <p>현재 판매가: <span className="font-bold text-primary">{formatPrice(product.salePrice)}</span></p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium text-muted-foreground">기본 가격 계산 (정책 미적용)</p>
            <p>매입원가: {formatPrice(pricing.purchaseCost)} ({product.costPrice.toLocaleString()} x {product.exchangeRate})</p>
            <p>기본원가: {formatPrice(pricing.baseCost)}</p>
            <p>예상판매가: {formatPrice(pricing.salePrice)}</p>
            <p>예상이익: <span className={pricing.profit >= 0 ? "text-green-600" : "text-red-600"}>{formatPrice(pricing.profit)}</span></p>
          </div>
        </CardContent>
      </Card>

      {/* 정책 기반 가격 계산 (정책이 적용된 경우) */}
      {policyPricing && policyDetail && (
        <Card>
          <CardHeader>
            <CardTitle>정책 기반 가격 계산</CardTitle>
            <CardDescription>적용 정책: {policyDetail.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 가격 분해 */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between text-lg font-bold mb-3">
                <span>판매가</span>
                <span className="text-primary">{formatPrice(policyPricing.salePrice)}</span>
              </div>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">원가 (매입가)</span>
                  <span>{formatPrice(policyPricing.purchaseCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    마진{policyPricing.marginRate > 0 ? ` (${policyPricing.marginRate}%)` : " (고정)"}
                  </span>
                  <span className="text-blue-600">+ {formatPrice(policyPricing.marginAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">배송비 (국제+국내)</span>
                  <span>+ {formatPrice(policyPricing.shippingFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">플랫폼 수수료 ({policyPricing.platformFeeRate}%)</span>
                  <span className="text-orange-600">+ {formatPrice(policyPricing.platformFee)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>예상 순이익</span>
                  <span className={policyPricing.profit >= 0 ? "text-green-600" : "text-red-600"}>
                    {formatPrice(policyPricing.profit)}
                  </span>
                </div>
              </div>
            </div>

            {/* 단계별 마진 정보 */}
            {policyDetail.useTieredMargin && policyDetail.marginTiers.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">단계별 마진 설정</p>
                <div className="grid gap-1 text-sm">
                  {policyDetail.marginTiers.map((tier, idx) => (
                    <div key={idx} className="flex justify-between text-muted-foreground">
                      <span>{formatPrice(tier.minPrice)} ~ {formatPrice(tier.maxPrice)}</span>
                      <span>
                        {tier.marginRate > 0 ? `${tier.marginRate}%` : ""}
                        {tier.marginAmount > 0 ? ` + ${formatPrice(tier.marginAmount)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 마켓별 예상 판매가 (정책이 적용된 경우) */}
      {marketPrices && marketPrices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>마켓별 예상 판매가</CardTitle>
            <CardDescription>마켓 수수료율에 따른 차등 가격</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {marketPrices.map((mp) => (
                <div key={mp.marketCode} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{mp.marketLabel}</span>
                    <Badge variant="outline" className="text-xs">{mp.platformFeeRate}%</Badge>
                  </div>
                  <p className="text-lg font-bold text-primary">{formatPrice(mp.salePrice)}</p>
                  <p className={`text-xs ${mp.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                    순이익: {formatPrice(mp.profit)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ImageEditor productId={product.id} initialImageUrl={product.mainImageUrl} />

      <AiOptimizerPanel
        productId={product.id}
        currentName={product.name}
        currentDescription={product.descriptionHtml}
      />

      <Card>
        <CardHeader>
          <CardTitle>전송 분석</CardTitle>
          <CardDescription>최근 전송 로그 기반 성능 지표</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p>전체 시도: {publishSummary.total}건</p>
            <p>성공: {publishSummary.successCount}건</p>
            <p>실패: {publishSummary.failedCount}건</p>
            <p>대기: {publishSummary.pendingCount}건</p>
            <p>성공률: {publishSummary.successRate.toFixed(1)}%</p>
            <p>최근 성공: {formatDate(publishSummary.latestSuccess?.syncedAt ?? null)}</p>
            <p>최근 실패: {formatDate(publishSummary.latestFailure?.syncedAt ?? null)}</p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium">최근 실패 원인 TOP 3</p>
            {publishSummary.topFailureReasons.length === 0 ? (
              <p className="text-muted-foreground">실패 이력이 없습니다.</p>
            ) : (
              publishSummary.topFailureReasons.map((item) => (
                <p key={item.reason} className="truncate text-muted-foreground">
                  - {item.reason} ({item.count}건)
                </p>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <PublishRetryQueuePanel productId={product.id} logs={product.publishLogs} />

      <Card>
        <CardHeader>
          <CardTitle>전송 로그</CardTitle>
          <CardDescription>최근 전송 이력 (상태/마켓/키워드 필터 지원)</CardDescription>
        </CardHeader>
        <CardContent>
          <PublishLogTable logs={product.publishLogs} />
        </CardContent>
      </Card>
    </section>
  );
}
