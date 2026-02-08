"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchCollectedProducts,
  deleteRawProducts,
  convertRawToProducts,
  type RawProductRow,
} from "@/actions/sourcing-11st";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Loader2,
  Package,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ArrowRightLeft,
} from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  collected: { label: "수집완료", variant: "outline" },
  detail_crawled: { label: "상세완료", variant: "default" },
  converted: { label: "변환완료", variant: "secondary" },
};

function getStatus(status: string) {
  return STATUS_MAP[status] ?? { label: status, variant: "outline" as const };
}

function formatPrice(price: number, currency: string) {
  if (currency === "KRW") return price.toLocaleString("ko-KR") + "원";
  return `${currency} ${price.toLocaleString()}`;
}

export function CollectedProductsCard() {
  const [products, setProducts] = useState<RawProductRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const loadProducts = useCallback(async (targetPage: number) => {
    setLoading(true);
    setSelected(new Set());
    const result = await fetchCollectedProducts(targetPage, pageSize);
    setLoading(false);

    if (!result.success) {
      toast({ title: "조회 실패", description: result.error, variant: "destructive" });
      return;
    }

    setProducts(result.products ?? []);
    setTotalCount(result.totalCount ?? 0);
    setPage(targetPage);
  }, [toast]);

  useEffect(() => {
    loadProducts(1);
  }, [loadProducts]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map((p) => p.id)));
  }

  async function handleDelete() {
    if (selected.size === 0) return;

    setDeleting(true);
    const result = await deleteRawProducts([...selected]);
    setDeleting(false);

    if (!result.success) {
      toast({ title: "삭제 실패", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: `${selected.size}개 상품 삭제됨` });
    loadProducts(page);
  }

  async function handleConvert() {
    if (selected.size === 0) return;

    setConverting(true);
    const result = await convertRawToProducts([...selected]);
    setConverting(false);

    if (!result.success) {
      toast({ title: "변환 실패", description: result.error, variant: "destructive" });
      return;
    }

    toast({
      title: "상품관리로 변환 완료",
      description: `${result.convertedCount}개 상품이 상품관리에 등록되었습니다.`,
    });
    loadProducts(page);
  }

  async function handleConvertAll() {
    setConverting(true);

    // Fetch all raw product IDs
    const allIds: string[] = [];
    let fetchPage = 1;
    while (true) {
      const result = await fetchCollectedProducts(fetchPage, 100);
      if (!result.success || !result.products || result.products.length === 0) break;
      allIds.push(...result.products.map((p) => p.id));
      if (allIds.length >= (result.totalCount ?? 0)) break;
      fetchPage++;
    }

    if (allIds.length === 0) {
      setConverting(false);
      toast({ title: "변환할 상품이 없습니다", variant: "destructive" });
      return;
    }

    const result = await convertRawToProducts(allIds);
    setConverting(false);

    if (!result.success) {
      toast({ title: "변환 실패", description: result.error, variant: "destructive" });
      return;
    }

    toast({
      title: "전체 변환 완료",
      description: `${result.convertedCount}개 상품이 상품관리에 등록되었습니다.`,
    });
    loadProducts(page);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              수집된 상품 목록
            </CardTitle>
            <CardDescription>
              총 {totalCount.toLocaleString()}개 수집됨
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadProducts(page)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            수집된 상품이 없습니다. 위에서 상품을 검색하고 수집해보세요.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {selected.size === products.length ? "전체 해제" : "전체 선택"}
              </Button>
              {selected.size > 0 && (
                <>
                  <Button
                    size="sm"
                    onClick={handleConvert}
                    disabled={converting || deleting}
                    className="gap-1"
                  >
                    {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                    상품관리로 변환 ({selected.size})
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting || converting}
                    className="gap-1"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    삭제 ({selected.size})
                  </Button>
                </>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleConvertAll}
                disabled={converting || deleting}
                className="gap-1"
              >
                {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                전체 상품관리로 변환
              </Button>
            </div>

            {/* Product List */}
            <div className="space-y-2">
              {products.map((p) => {
                const statusInfo = getStatus(p.status);
                const firstImage = Array.isArray(p.images_json) ? p.images_json[0] : null;

                return (
                  <div
                    key={p.id}
                    className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selected.has(p.id) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleSelect(p.id)}
                  >
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleSelect(p.id)}
                      className="mt-1"
                    />
                    {firstImage && (
                      <img
                        src={firstImage}
                        alt={p.title_origin}
                        className="h-16 w-16 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium line-clamp-1">{p.title_origin}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className="text-xs uppercase">
                            {p.site_id}
                          </Badge>
                          <Badge variant={statusInfo.variant} className="text-xs">
                            {statusInfo.label}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-sm font-bold text-primary">
                        {formatPrice(p.price_origin, p.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleString("ko-KR")}
                        {p.raw_data && typeof p.raw_data === "object" && "categoryPath" in p.raw_data && (
                          <span> · {String(p.raw_data.categoryPath)}</span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => loadProducts(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => loadProducts(page + 1)}
                >
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
