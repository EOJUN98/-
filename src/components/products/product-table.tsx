"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { publishProductAction } from "@/actions/publish-product";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import type { ProductListItem, PublishMarketCode } from "@/types/product";

import { ProductSheet } from "./product-sheet";

interface ProductTableProps {
  initialData: ProductListItem[];
}

const PUBLISH_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  success: { label: "전송 성공", variant: "secondary" },
  failed: { label: "전송 실패", variant: "destructive" },
  pending: { label: "전송 대기", variant: "outline" }
};

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

export function ProductTable({ initialData }: ProductTableProps) {
  const [products, setProducts] = useState(initialData);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ProductListItem | null>(null);
  const [publishingKey, setPublishingKey] = useState<string | null>(null);
  const { toast } = useToast();

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return products;
    }

    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(keyword) ||
        (product.productCode ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [products, search]);

  const allVisibleSelected =
    filteredProducts.length > 0 && filteredProducts.every((product) => selectedIds.has(product.id));

  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }

    const next = new Set<string>();
    for (const product of filteredProducts) {
      next.add(product.id);
    }
    setSelectedIds(next);
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function upsertProduct(nextProduct: ProductListItem) {
    setProducts((prev) => prev.map((product) => (product.id === nextProduct.id ? { ...product, ...nextProduct } : product)));
  }

  async function publishSingle(productId: string, marketCode: PublishMarketCode) {
    setPublishingKey(`${productId}:${marketCode}`);
    const result = await publishProductAction({ productId, marketCode, optimizeTitle: true });
    setPublishingKey(null);

    if (!result.success) {
      toast({
        title: `${marketCode} 전송 실패`,
        description: result.error,
        variant: "destructive"
      });

      setProducts((prev) =>
        prev.map((product) =>
          product.id === productId
            ? {
                ...product,
                lastPublishStatus: "failed",
                lastPublishError: result.error,
                lastPublishedAt: new Date().toISOString()
              }
            : product
        )
      );
      return;
    }

    toast({
      title: `${marketCode} 전송 완료`,
      description: `마켓 상품 ID: ${result.marketProductId}`
    });

    setProducts((prev) =>
      prev.map((product) =>
        product.id === productId
          ? {
              ...product,
              lastPublishStatus: "success",
              lastPublishError: null,
              lastPublishedAt: new Date().toISOString()
            }
          : product
      )
    );
  }

  async function publishSelected(marketCode: PublishMarketCode) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }

    let success = 0;
    let failed = 0;

    for (const id of ids) {
      // Keep requests sequential to avoid rate-limit bursts on marketplace APIs.
      // eslint-disable-next-line no-await-in-loop
      const result = await publishProductAction({ productId: id, marketCode, optimizeTitle: true });
      if (result.success) {
        success += 1;
      } else {
        failed += 1;
      }

      setProducts((prev) =>
        prev.map((product) =>
          product.id === id
            ? {
                ...product,
                lastPublishStatus: result.success ? "success" : "failed",
                lastPublishError: result.success ? null : result.error,
                lastPublishedAt: new Date().toISOString()
              }
            : product
        )
      );
    }

    toast({
      title: `${marketCode} 일괄 전송 완료`,
      description: `성공 ${success}건, 실패 ${failed}건`
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="상품명 또는 상품코드 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="sm:w-[320px]"
          />
          <span className="text-sm text-muted-foreground">총 {filteredProducts.length}개</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => publishSelected("coupang")}
            disabled={selectedIds.size === 0}
          >
            선택 쿠팡 전송
          </Button>
          <Button
            variant="outline"
            onClick={() => publishSelected("smartstore")}
            disabled={selectedIds.size === 0}
          >
            선택 스마트스토어 전송
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleSelectAll(event.target.checked)}
                  aria-label="전체 선택"
                />
              </TableHead>
              <TableHead className="w-[88px]">이미지</TableHead>
              <TableHead>상품명</TableHead>
              <TableHead className="w-[120px]">판매가</TableHead>
              <TableHead className="w-[140px]">전송상태</TableHead>
              <TableHead className="w-[140px]">최근전송</TableHead>
              <TableHead className="w-[300px] text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  조건에 맞는 상품이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => {
                const publishBadge = product.lastPublishStatus
                  ? PUBLISH_BADGE[product.lastPublishStatus]
                  : null;

                return (
                  <TableRow key={product.id}>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={(event) => toggleSelect(product.id, event.target.checked)}
                        aria-label={`${product.name} 선택`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="relative h-14 w-14 overflow-hidden rounded border bg-muted">
                        {product.mainImageUrl ? (
                          <Image src={product.mainImageUrl} alt={product.name} fill className="object-cover" />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="line-clamp-2 font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.productCode ?? "코드 없음"}</p>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {product.salePrice.toLocaleString()}원
                    </TableCell>
                    <TableCell>
                      {publishBadge ? (
                        <Badge variant={publishBadge.variant}>{publishBadge.label}</Badge>
                      ) : (
                        <Badge variant="outline">미전송</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(product.lastPublishedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/products/${product.id}`}>상세</Link>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditing(product)}>
                          수정
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={publishingKey === `${product.id}:coupang`}
                          onClick={() => publishSingle(product.id, "coupang")}
                        >
                          쿠팡
                        </Button>
                        <Button
                          size="sm"
                          disabled={publishingKey === `${product.id}:smartstore`}
                          onClick={() => publishSingle(product.id, "smartstore")}
                        >
                          스마트스토어
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ProductSheet
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        product={editing}
        onUpdated={(nextProduct) => {
          upsertProduct(nextProduct);
          toast({
            title: "상품이 업데이트되었습니다",
            description: `${nextProduct.salePrice.toLocaleString()}원으로 재계산되었습니다.`
          });
        }}
      />
    </div>
  );
}
