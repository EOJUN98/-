"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  fetchProductsForUpdate,
  bulkUpdateProducts,
  bulkPublishToMarkets,
  type ProductForUpdate,
  type UpdateField,
} from "@/actions/product-update";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  Upload,
  ArrowUpCircle,
  Search,
} from "lucide-react";

const SITE_OPTIONS = [
  { value: "all", label: "전체 사이트" },
  { value: "11st", label: "11번가" },
  { value: "gmarket", label: "G마켓" },
  { value: "aliexpress", label: "AliExpress" },
  { value: "taobao", label: "Taobao" },
];

const PUBLISH_STATUS_OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "published", label: "전송 완료" },
  { value: "unpublished", label: "미전송" },
  { value: "failed", label: "전송 실패" },
];

const UPDATE_FIELDS: { value: UpdateField; label: string }[] = [
  { value: "price", label: "가격" },
  { value: "stock", label: "재고" },
  { value: "image", label: "이미지" },
  { value: "description", label: "상세설명" },
];

const MARKET_OPTIONS = [
  { code: "coupang", label: "쿠팡" },
  { code: "smartstore", label: "스마트스토어" },
  { code: "11st", label: "11번가" },
  { code: "gmarket", label: "G마켓" },
  { code: "auction", label: "옥션" },
];

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

export function ProductUpdateTable() {
  const [products, setProducts] = useState<ProductForUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Update options
  const [selectedFields, setSelectedFields] = useState<Set<UpdateField>>(new Set());
  const [selectedMarkets, setSelectedMarkets] = useState<Set<string>>(new Set());

  const { toast } = useToast();

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const result = await fetchProductsForUpdate({
      search: search || undefined,
      siteId: siteFilter,
      publishStatus: statusFilter,
    });
    setLoading(false);

    if (!result.success) {
      toast({ title: "로딩 실패", description: result.error, variant: "destructive" });
      return;
    }
    setProducts(result.products ?? []);
  }, [search, siteFilter, statusFilter, toast]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Counts
  const totalCount = products.length;
  const publishedCount = products.filter((p) => p.lastPublishStatus === "success").length;
  const unpublishedCount = products.filter((p) => !p.lastPublishStatus).length;
  const failedCount = products.filter((p) => p.lastPublishStatus === "failed").length;

  function toggleAll() {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleField(field: UpdateField) {
    const next = new Set(selectedFields);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    setSelectedFields(next);
  }

  function toggleMarket(code: string) {
    const next = new Set(selectedMarkets);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelectedMarkets(next);
  }

  async function handleBulkUpdate() {
    if (selected.size === 0) {
      toast({ title: "상품을 선택해주세요", variant: "destructive" });
      return;
    }
    if (selectedFields.size === 0) {
      toast({ title: "업데이트 항목을 선택해주세요", variant: "destructive" });
      return;
    }

    setUpdating(true);
    const result = await bulkUpdateProducts(
      Array.from(selected),
      Array.from(selectedFields)
    );
    setUpdating(false);

    if (!result.success) {
      toast({ title: "업데이트 실패", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: "업데이트 완료", description: `${result.updatedCount}개 상품 업데이트됨` });
    loadProducts();
  }

  async function handleBulkPublish() {
    if (selected.size === 0) {
      toast({ title: "상품을 선택해주세요", variant: "destructive" });
      return;
    }
    if (selectedMarkets.size === 0) {
      toast({ title: "전송할 마켓을 선택해주세요", variant: "destructive" });
      return;
    }

    setPublishing(true);
    const result = await bulkPublishToMarkets(
      Array.from(selected),
      Array.from(selectedMarkets)
    );
    setPublishing(false);

    if (!result.success) {
      toast({ title: "전송 실패", description: result.error, variant: "destructive" });
      return;
    }

    toast({
      title: "마켓 전송 완료",
      description: `성공 ${result.successCount}건 / 실패 ${result.failedCount}건`,
    });
    loadProducts();
  }

  function getPublishBadge(status: string | null) {
    if (status === "success") return <Badge className="bg-green-600 text-xs">전송완료</Badge>;
    if (status === "failed") return <Badge variant="destructive" className="text-xs">전송실패</Badge>;
    if (status === "pending") return <Badge variant="outline" className="text-xs">대기중</Badge>;
    return <Badge variant="secondary" className="text-xs">미전송</Badge>;
  }

  return (
    <div className="space-y-4">
      {/* 상태 카운트 */}
      <div className="flex gap-4 text-sm">
        <span>전체 <strong>{totalCount}</strong>개</span>
        <span className="text-green-600">전송완료 <strong>{publishedCount}</strong></span>
        <span className="text-muted-foreground">미전송 <strong>{unpublishedCount}</strong></span>
        <span className="text-red-600">실패 <strong>{failedCount}</strong></span>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label>상품 검색</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="상품명 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadProducts()}
              className="pl-9"
            />
          </div>
        </div>
        <div className="w-[140px] space-y-1">
          <Label>수집 사이트</Label>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SITE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[140px] space-y-1">
          <Label>전송 상태</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PUBLISH_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="icon" onClick={loadProducts} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* 액션 바 */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex flex-wrap gap-6">
          {/* 업데이트 항목 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">업데이트 항목</p>
            <div className="flex gap-3">
              {UPDATE_FIELDS.map((field) => (
                <label key={field.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedFields.has(field.value)}
                    onCheckedChange={() => toggleField(field.value)}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>

          {/* 전송 마켓 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">전송 마켓</p>
            <div className="flex gap-3">
              {MARKET_OPTIONS.map((market) => (
                <label key={market.code} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedMarkets.has(market.code)}
                    onCheckedChange={() => toggleMarket(market.code)}
                  />
                  {market.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleBulkUpdate}
            disabled={updating || selected.size === 0 || selectedFields.size === 0}
            className="gap-2"
          >
            {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
            선택 상품 업데이트 ({selected.size}개)
          </Button>
          <Button
            onClick={handleBulkPublish}
            disabled={publishing || selected.size === 0 || selectedMarkets.size === 0}
            variant="secondary"
            className="gap-2"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            마켓 전송 ({selected.size}개)
          </Button>
        </div>
      </div>

      {/* 상품 테이블 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          조건에 맞는 상품이 없습니다
        </p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-10 p-2">
                  <Checkbox
                    checked={selected.size === products.length && products.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="w-14 p-2">이미지</th>
                <th className="p-2 text-left">상품명</th>
                <th className="w-24 p-2 text-right">판매가</th>
                <th className="w-16 p-2 text-center">재고</th>
                <th className="w-20 p-2 text-center">사이트</th>
                <th className="w-20 p-2 text-center">정책</th>
                <th className="w-20 p-2 text-center">전송상태</th>
                <th className="w-28 p-2 text-center">최근전송</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className={`border-t hover:bg-muted/30 ${selected.has(product.id) ? "bg-primary/5" : ""}`}
                >
                  <td className="p-2 text-center">
                    <Checkbox
                      checked={selected.has(product.id)}
                      onCheckedChange={() => toggleOne(product.id)}
                    />
                  </td>
                  <td className="p-2">
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
                  </td>
                  <td className="p-2">
                    <p className="font-medium line-clamp-1">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.productCode ?? "-"}</p>
                  </td>
                  <td className="p-2 text-right font-medium">
                    {formatPrice(product.salePrice)}
                  </td>
                  <td className="p-2 text-center">{product.stockQuantity}</td>
                  <td className="p-2 text-center">
                    <Badge variant="outline" className="text-xs">
                      {product.siteId === "11st" ? "11번가" :
                       product.siteId === "gmarket" ? "G마켓" :
                       product.siteId === "aliexpress" ? "Ali" :
                       product.siteId === "taobao" ? "Taobao" :
                       product.siteId ?? "-"}
                    </Badge>
                  </td>
                  <td className="p-2 text-center">
                    {product.policyName ? (
                      <Badge className="bg-blue-600 text-xs">{product.policyName}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-2 text-center">
                    {getPublishBadge(product.lastPublishStatus)}
                  </td>
                  <td className="p-2 text-center text-xs text-muted-foreground">
                    {formatDate(product.lastPublishedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
