"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  fetchCollectedProducts,
  fetchRawProductStatusSummary,
  deleteRawProducts,
  convertRawToProducts,
  deleteRawProductsByJob,
  convertRawToProductsByJob,
  type RawProductRow,
} from "@/actions/sourcing-11st";
import { updateCollectionJobCategoryAction, updateCollectionJobDisplayNameAction, updateCollectionJobPolicyAction } from "@/actions/sourcing";
import { fetchPolicySummaryList, type PolicyOption } from "@/actions/policy-apply";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

type CollectionJobLike = {
  id: string;
  site_id: string;
  search_url: string;
  display_name?: string | null;
  options?: Record<string, unknown> | null;
  status: string;
  created_at: string;
};

type JobFilterValue = "all" | "unassigned" | "unassigned_only" | string;
type StatusFilterValue = "all" | "collected" | "detail_crawled" | "converted";

function formatJobLabel(job: CollectionJobLike) {
  const displayName = (job.display_name ?? "").trim()
    || (typeof job.options?.displayName === "string" ? job.options.displayName.trim() : "");
  const shortUrl = job.search_url.length > 60 ? job.search_url.slice(0, 57) + "..." : job.search_url;
  const date = new Date(job.created_at).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (displayName) return `${displayName} · ${job.site_id.toUpperCase()} · ${date}`;
  return `${job.site_id.toUpperCase()} · ${date} · ${shortUrl}`;
}

export function CollectedProductsCard({ jobs = [] }: { jobs?: CollectionJobLike[] }) {
  const [products, setProducts] = useState<RawProductRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [statusSummary, setStatusSummary] = useState<{ total: number; collected: number; detail_crawled: number; converted: number; other: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jobFilter, setJobFilter] = useState<JobFilterValue>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [optimisticJobNames, setOptimisticJobNames] = useState<Record<string, string>>({});
  const [optimisticJobPolicies, setOptimisticJobPolicies] = useState<Record<string, string | null>>({});
  const [optimisticJobCategories, setOptimisticJobCategories] = useState<Record<string, number | null>>({});
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<string>("");
  const [policyOptions, setPolicyOptions] = useState<PolicyOption[]>([]);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function toJobIdParam(value: JobFilterValue): string | null | undefined {
    if (value === "all") return undefined;
    // UX decision: "미지정"은 '전체 표시' 의미로 사용(미지정만 필터링하지 않음).
    if (value === "unassigned") return undefined;
    if (value === "unassigned_only") return null;
    return value;
  }

  function toStatusParam(value: StatusFilterValue): string | undefined {
    if (value === "all") return undefined;
    return value;
  }

  const loadSummary = useCallback(async (jobValue: JobFilterValue) => {
    setSummaryLoading(true);
    const res = await fetchRawProductStatusSummary(toJobIdParam(jobValue));
    setSummaryLoading(false);
    if (!res.success) {
      setStatusSummary(null);
      return;
    }
    setStatusSummary(res.summary ?? null);
  }, []);

  const loadProducts = useCallback(async (
    targetPage: number,
    jobValue: JobFilterValue,
    statusValue: StatusFilterValue
  ) => {
    setLoading(true);
    setSelected(new Set());
    const result = await fetchCollectedProducts(
      targetPage,
      pageSize,
      toJobIdParam(jobValue),
      toStatusParam(statusValue)
    );
    setLoading(false);

    if (!result.success) {
      toast({ title: "조회 실패", description: result.error, variant: "destructive" });
      return;
    }

    setProducts(result.products ?? []);
    setTotalCount(result.totalCount ?? 0);
    setPage(targetPage);
  }, [pageSize, toast]);

  useEffect(() => {
    loadProducts(1, jobFilter, statusFilter);
    loadSummary(jobFilter);
  }, [jobFilter, statusFilter, loadProducts, loadSummary]);

  useEffect(() => {
    setPolicyLoading(true);
    fetchPolicySummaryList()
      .then((res) => {
        if (res.success) setPolicyOptions(res.policies ?? []);
      })
      .finally(() => setPolicyLoading(false));
  }, []);

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
    loadProducts(page, jobFilter, statusFilter);
    loadSummary(jobFilter);
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
    loadProducts(page, jobFilter, statusFilter);
    loadSummary(jobFilter);
  }

  async function handleConvertAll() {
    setConverting(true);

    // Fetch all raw product IDs
    const allIds: string[] = [];
    let fetchPage = 1;
    while (true) {
      const result = await fetchCollectedProducts(
        fetchPage,
        100,
        toJobIdParam(jobFilter),
        toStatusParam(statusFilter)
      );
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
    loadProducts(page, jobFilter, statusFilter);
    loadSummary(jobFilter);
  }

  async function handleConvertSelectedGroup() {
    if (!selectedJob) return;
    setConverting(true);
    const result = await convertRawToProductsByJob({ jobId: selectedJob.id });
    setConverting(false);

    if (!result.success) {
      toast({ title: "그룹 변환 실패", description: result.error, variant: "destructive" });
      return;
    }

    toast({
      title: "그룹 변환 완료",
      description: `${result.convertedCount ?? 0}개 상품이 상품관리에 등록되었습니다.`,
    });
    loadProducts(page, jobFilter, statusFilter);
    loadSummary(jobFilter);
  }

  async function handleDeleteSelectedGroup() {
    if (!selectedJob) return;
    setDeleting(true);
    const result = await deleteRawProductsByJob({ jobId: selectedJob.id });
    setDeleting(false);

    if (!result.success) {
      toast({ title: "그룹 삭제 실패", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: "그룹 상품 삭제 완료", description: `${result.deletedCount ?? 0}개 삭제됨` });
    loadProducts(1, jobFilter, statusFilter);
    loadSummary(jobFilter);
  }

  const summaryTotal = statusSummary?.total ?? 0;
  const denom = Math.max(1, summaryTotal);
  const collectedPct = Math.round(((statusSummary?.collected ?? 0) / denom) * 100);
  const detailPct = Math.round(((statusSummary?.detail_crawled ?? 0) / denom) * 100);
  const convertedPct = Math.round(((statusSummary?.converted ?? 0) / denom) * 100);
  const otherPct = Math.max(0, 100 - collectedPct - detailPct - convertedPct);

  const selectedJob = useMemo(() => {
    if (jobFilter === "all" || jobFilter === "unassigned" || jobFilter === "unassigned_only") return null;
    return jobs.find((j) => j.id === jobFilter) ?? null;
  }, [jobFilter, jobs]);

  const selectedJobName = useMemo(() => {
    if (!selectedJob) return "";
    const optimistic = (optimisticJobNames[selectedJob.id] ?? "").trim();
    if (optimistic) return optimistic;
    const name = (selectedJob.display_name ?? "").trim()
      || (typeof selectedJob.options?.displayName === "string" ? selectedJob.options.displayName.trim() : "");
    return name;
  }, [optimisticJobNames, selectedJob]);

  const selectedJobPolicyId = useMemo(() => {
    if (!selectedJob) return null;
    if (Object.prototype.hasOwnProperty.call(optimisticJobPolicies, selectedJob.id)) {
      return optimisticJobPolicies[selectedJob.id] ?? null;
    }
    const options = (selectedJob.options ?? {}) as Record<string, unknown>;
    return typeof options.policyId === "string" ? options.policyId : null;
  }, [optimisticJobPolicies, selectedJob]);

  const selectedJobCategoryId = useMemo(() => {
    if (!selectedJob) return null;
    if (Object.prototype.hasOwnProperty.call(optimisticJobCategories, selectedJob.id)) {
      return optimisticJobCategories[selectedJob.id] ?? null;
    }
    const options = (selectedJob.options ?? {}) as Record<string, unknown>;
    const value = options.categoryId;
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    return null;
  }, [optimisticJobCategories, selectedJob]);

  useEffect(() => {
    if (!selectedJob) {
      setCategoryDraft("");
      setCategoryOpen(false);
      return;
    }
    setCategoryDraft(selectedJobCategoryId ? String(selectedJobCategoryId) : "");
  }, [selectedJob, selectedJobCategoryId]);

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
              총 {totalCount.toLocaleString()}개 표시중
            </CardDescription>
            {selectedJobName && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="max-w-[520px] truncate">
                  선택 그룹: {selectedJobName}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  그룹 기준 요약은 아래에 표시됩니다
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={jobFilter}
              onValueChange={(value) => {
                setJobFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[360px]">
                <SelectValue placeholder="수집 그룹 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 그룹</SelectItem>
                <SelectItem value="unassigned">그룹 미지정(전체 표시)</SelectItem>
                <SelectItem value="unassigned_only">그룹 미지정만 보기</SelectItem>
                {jobs.map((job) => {
                  const override = (optimisticJobNames[job.id] ?? "").trim();
                  const jobForLabel = override
                    ? {
                        ...job,
                        display_name: override,
                        options: { ...(job.options ?? {}), displayName: override },
                      }
                    : job;

                  return (
                    <SelectItem key={job.id} value={job.id}>
                      {formatJobLabel(jobForLabel)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedJob && (
              <Dialog
                open={editOpen}
                onOpenChange={(open) => {
                  setEditOpen(open);
                  if (open) setEditName(selectedJobName);
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    그룹명 수정
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>검색필터명 수정</DialogTitle>
                    <DialogDescription>
                      이 그룹(수집 작업)의 표시 이름을 변경합니다.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={80}
                      placeholder="예: 알리 여름 원피스"
                    />
                    <p className="text-xs text-muted-foreground">
                      1~80자. 저장 후 그룹 선택 드롭다운에 반영됩니다.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => {
                        const next = editName.trim();
                        if (!next) {
                          toast({ title: "필터명을 입력해주세요", variant: "destructive" });
                          return;
                        }
                        startTransition(async () => {
                          const res = await updateCollectionJobDisplayNameAction({
                            jobId: selectedJob.id,
                            displayName: next,
                          });
                          if (!res.success) {
                            toast({ title: "수정 실패", description: res.error, variant: "destructive" });
                            return;
                          }
                          setOptimisticJobNames((prev) => ({ ...prev, [selectedJob.id]: next }));
                          toast({ title: "그룹명이 수정되었습니다" });
                          setEditOpen(false);
                        });
                      }}
                      disabled={isPending}
                    >
                      {isPending ? "저장 중..." : "저장"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {selectedJob && (
              <Dialog
                open={categoryOpen}
                onOpenChange={(open) => {
                  setCategoryOpen(open);
                  if (open) setCategoryDraft(selectedJobCategoryId ? String(selectedJobCategoryId) : "");
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    카테고리 설정
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>카테고리 ID 설정</DialogTitle>
                    <DialogDescription>
                      이 그룹에서 변환되는 상품의 `category_id`(마켓 카테고리 ID)를 지정합니다.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="categoryId">카테고리 ID (숫자)</Label>
                    <Input
                      id="categoryId"
                      inputMode="numeric"
                      placeholder="예: 50000000"
                      value={categoryDraft}
                      onChange={(e) => setCategoryDraft(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      비워두면 미지정(null)로 저장됩니다.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => {
                        const trimmed = categoryDraft.trim();
                        const categoryId = trimmed ? Number(trimmed) : null;
                        if (trimmed) {
                          const n = Number(trimmed);
                          if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
                            toast({ title: "카테고리 ID는 양의 정수여야 합니다", variant: "destructive" });
                            return;
                          }
                        }
                        if (trimmed && categoryId === null) {
                          toast({ title: "카테고리 ID는 양의 정수여야 합니다", variant: "destructive" });
                          return;
                        }
                        startTransition(async () => {
                          const res = await updateCollectionJobCategoryAction({
                            jobId: selectedJob.id,
                            categoryId,
                            categoryLabel: null,
                          });
                          if (!res.success) {
                            toast({ title: "저장 실패", description: res.error, variant: "destructive" });
                            return;
                          }
                          setOptimisticJobCategories((prev) => ({ ...prev, [selectedJob.id]: categoryId }));
                          toast({ title: "그룹 카테고리가 저장되었습니다" });
                          setCategoryOpen(false);
                        });
                      }}
                      disabled={isPending}
                    >
                      {isPending ? "저장 중..." : "저장"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {selectedJob && (
              <Select
                value={selectedJobPolicyId ?? "none"}
                onValueChange={(value) => {
                  const nextPolicyId = value === "none" ? null : value;
                  startTransition(async () => {
                    const res = await updateCollectionJobPolicyAction({
                      jobId: selectedJob.id,
                      policyId: nextPolicyId,
                    });
                    if (!res.success) {
                      toast({ title: "정책 저장 실패", description: res.error, variant: "destructive" });
                      return;
                    }
                    setOptimisticJobPolicies((prev) => ({ ...prev, [selectedJob.id]: nextPolicyId }));
                    toast({ title: "그룹 정책이 저장되었습니다" });
                  });
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="그룹 정책" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">정책 미지정</SelectItem>
                  {policyOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.isDefault ? " (기본)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as StatusFilterValue);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="collected">수집완료</SelectItem>
                <SelectItem value="detail_crawled">상세완료</SelectItem>
                <SelectItem value="converted">변환완료</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadProducts(page, jobFilter, statusFilter)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {policyLoading && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                정책 불러오는 중
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">그룹 합계: {summaryTotal.toLocaleString()}개</Badge>
            <Badge variant="outline">수집완료 {statusSummary?.collected?.toLocaleString() ?? 0}</Badge>
            <Badge variant="outline">상세완료 {statusSummary?.detail_crawled?.toLocaleString() ?? 0}</Badge>
            <Badge variant="outline">변환완료 {statusSummary?.converted?.toLocaleString() ?? 0}</Badge>
            {(statusSummary?.other ?? 0) > 0 && (
              <Badge variant="outline">기타 {statusSummary?.other?.toLocaleString() ?? 0}</Badge>
            )}
            {summaryLoading && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                요약 불러오는 중
              </span>
            )}
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="flex h-full w-full">
              <div className="h-full bg-slate-400" style={{ width: `${collectedPct}%` }} />
              <div className="h-full bg-blue-500" style={{ width: `${detailPct}%` }} />
              <div className="h-full bg-emerald-500" style={{ width: `${convertedPct}%` }} />
              <div className="h-full bg-muted-foreground/40" style={{ width: `${otherPct}%` }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            그룹 내 상태 분포(수집완료/상세완료/변환완료/기타)
          </p>
        </div>

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
              {selectedJob && (
                <>
                  <Button
                    size="sm"
                    onClick={handleConvertSelectedGroup}
                    disabled={converting || deleting}
                    className="gap-1"
                  >
                    {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                    그룹 전체 변환
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelectedGroup}
                    disabled={deleting || converting}
                    className="gap-1"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    그룹 전체 삭제
                  </Button>
                </>
              )}
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
                      // eslint-disable-next-line @next/next/no-img-element
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
                  onClick={() => loadProducts(page - 1, jobFilter, statusFilter)}
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
                  onClick={() => loadProducts(page + 1, jobFilter, statusFilter)}
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
