import Link from "next/link";
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardStats } from "@/lib/queries/dashboard";

const SITE_LABELS: Record<string, string> = {
  "11st": "11번가",
  gmarket: "G마켓",
  aliexpress: "AliExpress",
  taobao: "Taobao",
};

const MARKET_LABELS: Record<string, string> = {
  coupang: "쿠팡",
  smartstore: "스마트스토어",
  "11st": "11번가",
  gmarket: "G마켓",
  auction: "옥션",
};

function formatPrice(value: number) {
  return value.toLocaleString() + "원";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DashboardHomePage() {
  const { data: stats, error } = await getDashboardStats();

  if (error || !stats) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">대시보드</h1>
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error ?? "데이터를 불러올 수 없습니다"}
        </div>
      </section>
    );
  }

  const publishTotal = stats.publishSuccess + stats.publishFailed + stats.publishPending;
  const publishRate = publishTotal > 0
    ? Math.round((stats.publishSuccess / publishTotal) * 1000) / 10
    : 0;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">대시보드</h1>

      {/* KPI 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>전체 상품</CardDescription>
            <CardTitle className="text-3xl">{stats.totalProducts.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              번역완료 {stats.translatedProducts} / 정책적용 {stats.policyAppliedProducts}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>수집 원본</CardDescription>
            <CardTitle className="text-3xl">{stats.totalRawProducts.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(stats.rawBySite).map(([site, count]) => (
                <Badge key={site} variant="outline" className="text-xs">
                  {SITE_LABELS[site] ?? site} {count}
                </Badge>
              ))}
              {Object.keys(stats.rawBySite).length === 0 && (
                <p className="text-xs text-muted-foreground">수집 데이터 없음</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>전송 성공률</CardDescription>
            <CardTitle className="text-3xl">{publishRate}%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              성공 {stats.publishSuccess} / 실패 {stats.publishFailed} / 대기 {stats.publishPending}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>전송 총 시도</CardDescription>
            <CardTitle className="text-3xl">{publishTotal.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1">
              {publishTotal > 0 && (
                <>
                  <div
                    className="h-2 rounded-full bg-green-500"
                    style={{ width: `${(stats.publishSuccess / publishTotal) * 100}%` }}
                  />
                  <div
                    className="h-2 rounded-full bg-red-500"
                    style={{ width: `${(stats.publishFailed / publishTotal) * 100}%` }}
                  />
                  <div
                    className="h-2 rounded-full bg-yellow-400"
                    style={{ width: `${(stats.publishPending / publishTotal) * 100}%` }}
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 최근 상품 & 전송 로그 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 최근 등록 상품 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">최근 등록 상품</CardTitle>
              <Link href="/products" className="text-sm text-primary hover:underline">
                전체보기
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {stats.recentProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">등록된 상품이 없습니다</p>
            ) : (
              <div className="space-y-3">
                {stats.recentProducts.map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${product.id}`}
                    className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50 transition-colors"
                  >
                    {product.mainImageUrl ? (
                      <Image
                        src={product.mainImageUrl}
                        alt={product.name}
                        width={40}
                        height={40}
                        className="rounded object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                        N/A
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(product.createdAt)}</p>
                    </div>
                    <span className="text-sm font-medium text-primary">{formatPrice(product.salePrice)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 최근 전송 로그 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">최근 마켓 전송</CardTitle>
              <Link href="/product-update" className="text-sm text-primary hover:underline">
                전체보기
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {stats.recentPublishLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">전송 이력이 없습니다</p>
            ) : (
              <div className="space-y-3">
                {stats.recentPublishLogs.map((log) => (
                  <div key={log.id} className="flex items-center gap-3 p-2">
                    {log.status === "success" ? (
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                    ) : log.status === "failed" ? (
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-yellow-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{log.productName}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(log.syncedAt)}</p>
                    </div>
                    {log.marketCode && (
                      <Badge variant="outline" className="text-xs">
                        {MARKET_LABELS[log.marketCode] ?? log.marketCode}
                      </Badge>
                    )}
                    <Badge
                      variant={log.status === "success" ? "default" : log.status === "failed" ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {log.status === "success" ? "성공" : log.status === "failed" ? "실패" : "대기"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
