"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  applyPolicyToProducts,
  fetchProductsWithPolicy,
  type ProductWithPolicy,
  type PolicyOption,
} from "@/actions/policy-apply";
import { ClipboardCheck, Search, X } from "lucide-react";

interface PolicyApplyTableProps {
  initialProducts: ProductWithPolicy[];
  policies: PolicyOption[];
  totalCount: number;
  appliedCount: number;
}

export function PolicyApplyTable({
  initialProducts,
  policies,
  totalCount: initTotal,
  appliedCount: initApplied,
}: PolicyApplyTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [products, setProducts] = useState(initialProducts);
  const [totalCount, setTotalCount] = useState(initTotal);
  const [appliedCount, setAppliedCount] = useState(initApplied);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [policyFilter, setPolicyFilter] = useState("all");
  const [bulkPolicyId, setBulkPolicyId] = useState("");

  const allSelected = products.length > 0 && selected.size === products.length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSearch() {
    startTransition(async () => {
      const result = await fetchProductsWithPolicy(search || undefined, policyFilter);
      if (result.success) {
        setProducts(result.products ?? []);
        setTotalCount(result.totalCount ?? 0);
        setAppliedCount(result.appliedCount ?? 0);
        setSelected(new Set());
      }
    });
  }

  function handleFilterChange(value: string) {
    setPolicyFilter(value);
    startTransition(async () => {
      const result = await fetchProductsWithPolicy(search || undefined, value);
      if (result.success) {
        setProducts(result.products ?? []);
        setTotalCount(result.totalCount ?? 0);
        setAppliedCount(result.appliedCount ?? 0);
        setSelected(new Set());
      }
    });
  }

  function handleApplyIndividual(productId: string, policyId: string | null) {
    startTransition(async () => {
      const result = await applyPolicyToProducts([productId], policyId || null);
      if (!result.success) {
        toast({ title: "적용 실패", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: policyId ? "정책 적용 완료" : "정책 해제 완료" });
      router.refresh();
      // Update local state
      const refreshed = await fetchProductsWithPolicy(search || undefined, policyFilter);
      if (refreshed.success) {
        setProducts(refreshed.products ?? []);
        setTotalCount(refreshed.totalCount ?? 0);
        setAppliedCount(refreshed.appliedCount ?? 0);
      }
    });
  }

  function handleBulkApply() {
    if (selected.size === 0) {
      toast({ title: "상품을 선택해주세요.", variant: "destructive" });
      return;
    }
    if (!bulkPolicyId) {
      toast({ title: "적용할 정책을 선택해주세요.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const result = await applyPolicyToProducts(Array.from(selected), bulkPolicyId);
      if (!result.success) {
        toast({ title: "일괄 적용 실패", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: `${result.updatedCount}개 상품에 정책 적용 완료` });
      setSelected(new Set());
      const refreshed = await fetchProductsWithPolicy(search || undefined, policyFilter);
      if (refreshed.success) {
        setProducts(refreshed.products ?? []);
        setTotalCount(refreshed.totalCount ?? 0);
        setAppliedCount(refreshed.appliedCount ?? 0);
      }
    });
  }

  function handleBulkRemove() {
    if (selected.size === 0) {
      toast({ title: "상품을 선택해주세요.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const result = await applyPolicyToProducts(Array.from(selected), null);
      if (!result.success) {
        toast({ title: "일괄 해제 실패", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: `${result.updatedCount}개 상품 정책 해제 완료` });
      setSelected(new Set());
      const refreshed = await fetchProductsWithPolicy(search || undefined, policyFilter);
      if (refreshed.success) {
        setProducts(refreshed.products ?? []);
        setTotalCount(refreshed.totalCount ?? 0);
        setAppliedCount(refreshed.appliedCount ?? 0);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 현황 카운트 */}
      <div className="flex items-center gap-4 text-sm">
        <span>전체 <strong>{totalCount}</strong>개</span>
        <span className="text-green-600">적용 <strong>{appliedCount}</strong>개</span>
        <span className="text-muted-foreground">미적용 <strong>{totalCount - appliedCount}</strong>개</span>
      </div>

      {/* 검색 + 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="상품명 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-60"
          />
          <Button variant="outline" size="sm" onClick={handleSearch} disabled={isPending}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <select
          value={policyFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">전체</option>
          <option value="none">미적용</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " (기본)" : ""}</option>
          ))}
        </select>
      </div>

      {/* 일괄 적용 바 */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <span className="text-sm font-medium">
          {selected.size > 0 ? `${selected.size}개 선택` : "일괄 적용"}
        </span>
        <select
          value={bulkPolicyId}
          onChange={(e) => setBulkPolicyId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">정책 선택...</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " (기본)" : ""}</option>
          ))}
        </select>
        <Button size="sm" onClick={handleBulkApply} disabled={isPending || selected.size === 0}>
          <ClipboardCheck className="mr-1 h-4 w-4" />
          선택 상품에 적용
        </Button>
        <Button size="sm" variant="outline" onClick={handleBulkRemove} disabled={isPending || selected.size === 0}>
          <X className="mr-1 h-4 w-4" />
          정책 해제
        </Button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-10 p-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="w-14 p-3">이미지</th>
              <th className="p-3 text-left">상품명</th>
              <th className="w-28 p-3 text-right">판매가</th>
              <th className="w-48 p-3 text-left">적용 정책</th>
              <th className="w-40 p-3 text-center">개별 적용</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  수집된 상품이 없습니다.
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleOne(product.id)}
                    />
                  </td>
                  <td className="p-3">
                    {product.mainImageUrl ? (
                      <Image
                        src={product.mainImageUrl}
                        alt=""
                        width={40}
                        height={40}
                        className="rounded border object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="h-10 w-10 rounded border bg-muted" />
                    )}
                  </td>
                  <td className="p-3">
                    <span className="line-clamp-2">{product.name}</span>
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {product.salePrice != null
                      ? `${product.salePrice.toLocaleString("ko-KR")}원`
                      : "-"}
                  </td>
                  <td className="p-3">
                    {product.policyName ? (
                      <Badge variant="secondary">{product.policyName}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">미적용</Badge>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <select
                      value={product.policyId ?? ""}
                      onChange={(e) =>
                        handleApplyIndividual(product.id, e.target.value || null)
                      }
                      disabled={isPending}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="">해제</option>
                      {policies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.isDefault ? " (기본)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
