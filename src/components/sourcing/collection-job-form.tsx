"use client";

import { useState } from "react";
import { createCollectionJob } from "@/actions/sourcing";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Search } from "lucide-react";

interface CollectionJobFormProps {
  onJobCreated?: (jobId: string) => void;
}

export function CollectionJobForm({ onJobCreated }: CollectionJobFormProps) {
  const [siteId, setSiteId] = useState<"aliexpress" | "taobao">("aliexpress");
  const [displayName, setDisplayName] = useState("");
  const [searchUrl, setSearchUrl] = useState("");
  const [totalTarget, setTotalTarget] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await createCollectionJob({
      siteId,
      displayName: displayName.trim() ? displayName.trim() : undefined,
      searchUrl,
      totalTarget,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "알 수 없는 오류");
      return;
    }

    setSearchUrl("");
    setDisplayName("");
    toast({
      title: "수집 작업 생성 완료",
      description: "Extension이 곧 수집을 시작합니다.",
    });
    onJobCreated?.(result.jobId!);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          상품 수집
        </CardTitle>
        <CardDescription>
          수집할 사이트와 URL을 입력하면 Extension이 자동으로 상품을 수집합니다
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="site">수집 사이트</Label>
              <Select
                value={siteId}
                onValueChange={(v) => setSiteId(v as "aliexpress" | "taobao")}
              >
                <SelectTrigger id="site">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aliexpress">AliExpress</SelectItem>
                  <SelectItem value="taobao">Taobao</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">검색필터명 (선택)</Label>
            <Input
              id="displayName"
              placeholder="예: 알리 여름 원피스"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
            />
          </div>

          <div className="flex items-end gap-4">
            <div className="w-[180px] space-y-2">
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
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              수집 시작
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
