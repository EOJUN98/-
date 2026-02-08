"use client";

import { useState } from "react";
import {
  search11stProducts,
  collect11stProducts,
  batchCrawl11stDetails,
  bulkCollect11stProducts,
} from "@/actions/sourcing-11st";
import { createCollectionJob } from "@/actions/sourcing";
import type { EleventhStreetProduct } from "@/lib/api/eleventh-street";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";

type SiteId = "11st" | "aliexpress" | "taobao";

const SITE_OPTIONS: { value: SiteId; label: string }[] = [
  { value: "11st", label: "11번가" },
  { value: "aliexpress", label: "AliExpress" },
  { value: "taobao", label: "Taobao" },
];

const SORT_OPTIONS = [
  { value: "CP", label: "추천순" },
  { value: "A", label: "최신순" },
  { value: "G", label: "평점순" },
  { value: "I", label: "할인율순" },
  { value: "L", label: "저가순" },
  { value: "R", label: "리뷰순" },
] as const;

interface CrawlStatus {
  [productCode: string]: "crawling" | "done" | "error";
}

export function EleventhStreetSearch() {
  const [siteId, setSiteId] = useState<SiteId>("11st");
  const [keyword, setKeyword] = useState("");
  const [searchUrl, setSearchUrl] = useState("");
  const [totalTarget, setTotalTarget] = useState(100);
  const [bulkTarget, setBulkTarget] = useState(100);
  const [sortCd, setSortCd] = useState<string>("CP");
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [bulkCollecting, setBulkCollecting] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [products, setProducts] = useState<EleventhStreetProduct[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus>({});
  const { toast } = useToast();

  const pageSize = 30;
  const totalPages = Math.ceil(totalCount / pageSize);
  const is11st = siteId === "11st";

  async function handleSearch(page?: number) {
    if (!keyword.trim()) return;
    setLoading(true);
    setSelected(new Set());
    setCrawlStatus({});

    const targetPage = page ?? 1;
    const result = await search11stProducts({
      keyword: keyword.trim(),
      pageNum: targetPage,
      pageSize,
      sortCd: sortCd as "CP" | "A" | "G" | "I" | "L" | "R",
    });

    setLoading(false);

    if (!result.success) {
      toast({ title: "검색 실패", description: result.error, variant: "destructive" });
      return;
    }

    setProducts(result.products ?? []);
    setTotalCount(result.totalCount ?? 0);
    setPageNum(targetPage);
  }

  async function handleBulkCollect() {
    if (!keyword.trim()) {
      toast({ title: "검색어를 입력해주세요", variant: "destructive" });
      return;
    }

    setBulkCollecting(true);
    const result = await bulkCollect11stProducts({
      keyword: keyword.trim(),
      totalTarget: bulkTarget,
      sortCd: sortCd as "CP" | "A" | "G" | "I" | "L" | "R",
    });
    setBulkCollecting(false);

    if (!result.success) {
      toast({
        title: "대량 수집 실패",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "대량 수집 완료",
      description: `${result.totalCollected}개 상품이 상품관리에 자동 등록되었습니다. (${result.pagesProcessed}페이지 처리)`,
    });
  }

  async function handleExtensionCollect(e: React.FormEvent) {
    e.preventDefault();
    if (!searchUrl.trim()) return;

    setLoading(true);
    const result = await createCollectionJob({
      siteId: siteId as "aliexpress" | "taobao",
      searchUrl,
      totalTarget,
    });
    setLoading(false);

    if (!result.success) {
      toast({ title: "수집 실패", description: result.error, variant: "destructive" });
      return;
    }

    setSearchUrl("");
    toast({
      title: "수집 작업 생성 완료",
      description: "Extension이 곧 수집을 시작합니다.",
    });
  }

  function toggleSelect(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map((p) => p.productCode)));
  }

  async function handleCollect() {
    const selectedProducts = products.filter((p) => selected.has(p.productCode));
    if (selectedProducts.length === 0) {
      toast({ title: "상품을 선택해주세요", variant: "destructive" });
      return;
    }

    setCollecting(true);
    const result = await collect11stProducts({ products: selectedProducts });
    setCollecting(false);

    if (!result.success) {
      toast({ title: "수집 실패", description: result.error, variant: "destructive" });
      return;
    }

    toast({
      title: "수집 완료",
      description: `${result.insertedCount}개 상품이 상품관리에 자동 등록되었습니다.`,
    });
  }

  async function handleCrawlDetails() {
    const selectedCodes = products
      .filter((p) => selected.has(p.productCode))
      .map((p) => p.productCode);

    if (selectedCodes.length === 0) {
      toast({ title: "상품을 선택해주세요", variant: "destructive" });
      return;
    }

    const selectedProducts = products.filter((p) => selected.has(p.productCode));
    setCollecting(true);
    const collectResult = await collect11stProducts({ products: selectedProducts });
    setCollecting(false);

    if (!collectResult.success) {
      toast({ title: "기본 수집 실패", description: collectResult.error, variant: "destructive" });
      return;
    }

    setCrawling(true);
    const statusUpdate: CrawlStatus = {};
    selectedCodes.forEach((code) => { statusUpdate[code] = "crawling"; });
    setCrawlStatus(statusUpdate);

    const result = await batchCrawl11stDetails({ productCodes: selectedCodes });
    setCrawling(false);

    if (!result.success) {
      toast({ title: "크롤링 실패", description: result.error, variant: "destructive" });
      return;
    }

    const newStatus: CrawlStatus = {};
    let successCount = 0;
    let failCount = 0;
    let totalDetailImages = 0;

    for (const r of result.results ?? []) {
      if (r.success) {
        newStatus[r.productCode] = "done";
        successCount++;
        totalDetailImages += r.detailImageCount ?? 0;
      } else {
        newStatus[r.productCode] = "error";
        failCount++;
      }
    }
    setCrawlStatus(newStatus);

    toast({
      title: "상세정보 크롤링 완료",
      description: `성공 ${successCount}개, 실패 ${failCount}개 (상세이미지 총 ${totalDetailImages}장)`,
    });
  }

  function formatPrice(price: number) {
    return price.toLocaleString("ko-KR") + "원";
  }

  function getCrawlBadge(code: string) {
    const status = crawlStatus[code];
    if (!status) return null;
    if (status === "crawling") {
      return (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          크롤링중
        </Badge>
      );
    }
    if (status === "done") {
      return (
        <Badge variant="default" className="gap-1 text-xs bg-green-600">
          <CheckCircle2 className="h-3 w-3" />
          완료
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="gap-1 text-xs">
        <XCircle className="h-3 w-3" />
        실패
      </Badge>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          상품 검색 및 수집
        </CardTitle>
        <CardDescription>
          수집 사이트를 선택하고 상품을 검색하여 수집합니다
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Site Selector */}
        <div className="w-[200px] space-y-2">
          <Label>수집 사이트</Label>
          <Select value={siteId} onValueChange={(v) => {
            setSiteId(v as SiteId);
            setProducts([]);
            setTotalCount(0);
            setSelected(new Set());
            setCrawlStatus({});
          }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SITE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 11st: Keyword Search */}
        {is11st && (
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
              className="flex gap-3 items-end"
            >
              <div className="flex-1 space-y-2">
                <Label htmlFor="keyword">검색어</Label>
                <Input
                  id="keyword"
                  placeholder="검색할 상품명을 입력하세요"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  required
                />
              </div>
              <div className="w-[140px] space-y-2">
                <Label>정렬</Label>
                <Select value={sortCd} onValueChange={setSortCd}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={loading || bulkCollecting} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                검색
              </Button>
            </form>

            {/* Bulk Collect */}
            <div className="flex gap-3 items-end rounded-lg border border-dashed p-3">
              <div className="w-[140px] space-y-2">
                <Label htmlFor="bulkTarget">대량 수집 목표</Label>
                <Input
                  id="bulkTarget"
                  type="number"
                  min={1}
                  max={3000}
                  value={bulkTarget}
                  onChange={(e) => setBulkTarget(Number(e.target.value))}
                />
              </div>
              <Button
                onClick={handleBulkCollect}
                disabled={!keyword.trim() || bulkCollecting || loading}
                className="gap-2"
              >
                {bulkCollecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                대량 수집
              </Button>
              <p className="text-xs text-muted-foreground self-center">
                검색어로 자동 페이지 넘김하며 {bulkTarget}개까지 수집합니다
              </p>
            </div>
          </>
        )}

        {/* AliExpress / Taobao: URL + Extension */}
        {!is11st && (
          <form onSubmit={handleExtensionCollect} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <div className="space-y-2">
                <Label htmlFor="url">검색/상품 URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder={
                    siteId === "aliexpress"
                      ? "https://www.aliexpress.com/item/..."
                      : "https://item.taobao.com/item.htm?id=..."
                  }
                  value={searchUrl}
                  onChange={(e) => setSearchUrl(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target">수집 목표 수</Label>
                <Input
                  id="target"
                  type="number"
                  min={1}
                  max={500}
                  value={totalTarget}
                  onChange={(e) => setTotalTarget(Number(e.target.value))}
                />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              수집 시작
            </Button>
            <p className="text-xs text-muted-foreground">
              Chrome Extension이 설치되어 있어야 합니다
            </p>
          </form>
        )}

        {/* 11st Results */}
        {is11st && products.length > 0 && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                총 {totalCount.toLocaleString()}개 결과 (페이지 {pageNum}/{totalPages})
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {selected.size === products.length ? "전체 해제" : "전체 선택"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleCollect}
                  disabled={collecting || crawling || selected.size === 0}
                  className="gap-2"
                >
                  {collecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  기본 수집 ({selected.size})
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCrawlDetails}
                  disabled={collecting || crawling || selected.size === 0}
                  className="gap-2"
                >
                  {crawling ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                  상세정보 크롤링 ({selected.size})
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <div
                  key={p.productCode}
                  className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    selected.has(p.productCode) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                  onClick={() => toggleSelect(p.productCode)}
                >
                  <Checkbox
                    checked={selected.has(p.productCode)}
                    onCheckedChange={() => toggleSelect(p.productCode)}
                    className="mt-1"
                  />
                  <img
                    src={p.productImage300 || p.productImage}
                    alt={p.productName}
                    className="h-20 w-20 rounded object-cover flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium line-clamp-2">{p.productName}</p>
                      {getCrawlBadge(p.productCode)}
                    </div>
                    <p className="mt-1 text-sm font-bold text-primary">
                      {formatPrice(p.salePrice > 0 ? p.salePrice : p.productPrice)}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{p.sellerNick}</span>
                      {p.delivery && <span>· {p.delivery}</span>}
                      {p.reviewCount > 0 && <span>· 리뷰 {p.reviewCount}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pageNum <= 1 || loading}
                onClick={() => handleSearch(pageNum - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {pageNum} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pageNum >= totalPages || loading}
                onClick={() => handleSearch(pageNum + 1)}
              >
                다음
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {is11st && !loading && products.length === 0 && totalCount === 0 && keyword && (
          <p className="text-center text-sm text-muted-foreground py-8">
            검색 결과가 없습니다
          </p>
        )}
      </CardContent>
    </Card>
  );
}
