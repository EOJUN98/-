"use client";

import { useMemo, useState, useTransition } from "react";

import { saveMarketConfigAction, testMarketConnectionAction } from "@/actions/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { MarketConfigSummary, SupportedMarketCode } from "@/types/settings";

interface MarketConfigPanelProps {
  initialConfigs: MarketConfigSummary[];
}

interface MarketFormState {
  apiKey: string;
  secretKey: string;
  vendorId: string;
  isActive: boolean;
  defaultDeliveryFee: string;
  defaultReturnFee: string;
}

const MARKET_META: Record<SupportedMarketCode, { title: string; description: string }> = {
  smartstore: {
    title: "네이버 스마트스토어",
    description: "client_id / client_secret를 등록하여 상품 전송을 활성화합니다."
  },
  coupang: {
    title: "쿠팡",
    description: "access_key / secret_key / vendor_id를 등록하여 상품 전송을 활성화합니다."
  },
  "11st": {
    title: "11번가 (준비중)",
    description: "전송 모듈 구현 전이며, 설정/카테고리 매핑부터 연결합니다."
  },
  gmarket: {
    title: "G마켓 (준비중)",
    description: "전송 모듈 구현 전이며, 설정/카테고리 매핑부터 연결합니다."
  },
  auction: {
    title: "옥션 (준비중)",
    description: "전송 모듈 구현 전이며, 설정/카테고리 매핑부터 연결합니다."
  }
};

const MARKET_ORDER: SupportedMarketCode[] = ["smartstore", "coupang", "11st", "gmarket", "auction"];

function toFormState(config: MarketConfigSummary | undefined): MarketFormState {
  return {
    apiKey: "",
    secretKey: "",
    vendorId: "",
    isActive: config?.isActive ?? false,
    defaultDeliveryFee: String(config?.defaultDeliveryFee ?? 0),
    defaultReturnFee: String(config?.defaultReturnFee ?? 3000)
  };
}

function toMap(configs: MarketConfigSummary[]) {
  const map = new Map<SupportedMarketCode, MarketConfigSummary>();
  for (const config of configs) {
    map.set(config.marketCode, config);
  }
  return map;
}

export function MarketConfigPanel({ initialConfigs }: MarketConfigPanelProps) {
  const [configs, setConfigs] = useState(initialConfigs);
  const [savingMarket, setSavingMarket] = useState<SupportedMarketCode | null>(null);
  const [testingMarket, setTestingMarket] = useState<SupportedMarketCode | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const formsInit = useMemo(() => {
    const byMarket = toMap(initialConfigs);
    return {
      smartstore: toFormState(byMarket.get("smartstore")),
      coupang: toFormState(byMarket.get("coupang")),
      "11st": toFormState(byMarket.get("11st")),
      gmarket: toFormState(byMarket.get("gmarket")),
      auction: toFormState(byMarket.get("auction")),
    } as Record<SupportedMarketCode, MarketFormState>;
  }, [initialConfigs]);

  const [forms, setForms] = useState(formsInit);

  const configByMarket = useMemo(() => toMap(configs), [configs]);

  function updateForm(
    marketCode: SupportedMarketCode,
    patch: Partial<MarketFormState>
  ) {
    setForms((prev) => ({
      ...prev,
      [marketCode]: {
        ...prev[marketCode],
        ...patch
      }
    }));
  }

  function upsertConfig(next: MarketConfigSummary) {
    setConfigs((prev) => {
      const nextMap = toMap(prev);
      nextMap.set(next.marketCode, next);
      return MARKET_ORDER.map((marketCode) => {
        return nextMap.get(marketCode) ?? {
          id: null,
          marketCode,
          isConfigured: false,
          vendorConfigured: false,
          isActive: false,
          defaultDeliveryFee: 0,
          defaultReturnFee: 3000,
          updatedAt: null
        };
      });
    });
  }

  function save(marketCode: SupportedMarketCode) {
    const form = forms[marketCode];

    setSavingMarket(marketCode);
    startTransition(async () => {
      const result = await saveMarketConfigAction({
        marketCode,
        apiKey: form.apiKey.trim() || undefined,
        secretKey: form.secretKey.trim() || undefined,
        vendorId: marketCode === "coupang" ? form.vendorId.trim() || undefined : undefined,
        isActive: form.isActive,
        defaultDeliveryFee: Number(form.defaultDeliveryFee) || 0,
        defaultReturnFee: Number(form.defaultReturnFee) || 0
      });

      setSavingMarket(null);

      if (!result.success) {
        toast({
          title: `${MARKET_META[marketCode].title} 저장 실패`,
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      upsertConfig(result.config);
      updateForm(marketCode, {
        apiKey: "",
        secretKey: ""
      });

      toast({
        title: `${MARKET_META[marketCode].title} 저장 완료`,
        description: "민감 키는 암호화되어 저장되었습니다"
      });
    });
  }

  async function testConnection(marketCode: SupportedMarketCode) {
    setTestingMarket(marketCode);
    const result = await testMarketConnectionAction(marketCode);
    setTestingMarket(null);

    if (!result.success) {
      toast({
        title: `${MARKET_META[marketCode].title} 연결 실패`,
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    toast({
      title: `${MARKET_META[marketCode].title} 연결 성공`,
      description: result.message
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {MARKET_ORDER.map((marketCode) => {
        const meta = MARKET_META[marketCode];
        const config = configByMarket.get(marketCode);
        const form = forms[marketCode];
        const saving = isPending && savingMarket === marketCode;

        return (
          <Card key={marketCode}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{meta.title}</CardTitle>
                <Badge variant={config?.isConfigured ? "secondary" : "outline"}>
                  {config?.isConfigured ? "연동됨" : "미설정"}
                </Badge>
              </div>
              <CardDescription>{meta.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor={`${marketCode}-api`}>API Key</Label>
                <Input
                  id={`${marketCode}-api`}
                  type="password"
                  value={form.apiKey}
                  onChange={(event) => updateForm(marketCode, { apiKey: event.target.value })}
                  placeholder={config?.isConfigured ? "새 키 입력 시 덮어쓰기" : "API Key 입력"}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`${marketCode}-secret`}>Secret Key</Label>
                <Input
                  id={`${marketCode}-secret`}
                  type="password"
                  value={form.secretKey}
                  onChange={(event) => updateForm(marketCode, { secretKey: event.target.value })}
                  placeholder={config?.isConfigured ? "새 키 입력 시 덮어쓰기" : "Secret Key 입력"}
                />
              </div>

              {marketCode === "coupang" ? (
                <div className="grid gap-2">
                  <Label htmlFor={`${marketCode}-vendor`}>Vendor ID</Label>
                  <Input
                    id={`${marketCode}-vendor`}
                    value={form.vendorId}
                    onChange={(event) => updateForm(marketCode, { vendorId: event.target.value })}
                    placeholder={config?.vendorConfigured ? "현재 값 유지 또는 재입력" : "업체코드 입력"}
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor={`${marketCode}-delivery`}>기본 배송비</Label>
                  <Input
                    id={`${marketCode}-delivery`}
                    type="number"
                    min={0}
                    value={form.defaultDeliveryFee}
                    onChange={(event) =>
                      updateForm(marketCode, { defaultDeliveryFee: event.target.value })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`${marketCode}-return`}>기본 반품비</Label>
                  <Input
                    id={`${marketCode}-return`}
                    type="number"
                    min={0}
                    value={form.defaultReturnFee}
                    onChange={(event) => updateForm(marketCode, { defaultReturnFee: event.target.value })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => updateForm(marketCode, { isActive: event.target.checked })}
                />
                마켓 연동 활성화
              </label>
            </CardContent>
            <CardFooter className="justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {config?.updatedAt
                  ? `최근 저장: ${new Date(config.updatedAt).toLocaleString("ko-KR")}`
                  : "저장 이력 없음"}
              </span>
              <div className="flex gap-2">
                {config?.isConfigured && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection(marketCode)}
                    disabled={testingMarket === marketCode}
                  >
                    {testingMarket === marketCode ? "테스트 중..." : "연결 테스트"}
                  </Button>
                )}
                <Button onClick={() => save(marketCode)} disabled={saving}>
                  {saving ? "저장 중..." : "저장"}
                </Button>
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
