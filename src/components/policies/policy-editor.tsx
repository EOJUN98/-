"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePolicy } from "@/actions/policies";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import type { ProductPolicy, DetailTemplate } from "@/types/policy";
import { MarginSettings } from "./margin-settings";
import { ShippingSettings } from "./shipping-settings";
import { MarketSelection } from "./market-selection";
import { TemplateSettings } from "./template-settings";
import { TranslationSettings } from "./translation-settings";
import { WatermarkSettings } from "./watermark-settings";
import { FeeSettings } from "./fee-settings";
import { NamingSettings } from "./naming-settings";

interface PolicyEditorProps {
  policy: ProductPolicy;
  templates: DetailTemplate[];
}

export function PolicyEditor({ policy, templates }: PolicyEditorProps) {
  const [form, setForm] = useState({
    name: policy.name,
    baseMarginRate: policy.baseMarginRate,
    baseMarginAmount: policy.baseMarginAmount,
    useTieredMargin: policy.useTieredMargin,
    marginTiers: policy.marginTiers,
    internationalShippingFee: policy.internationalShippingFee,
    shippingWeightUnit: policy.shippingWeightUnit,
    shippingWeight: policy.shippingWeight,
    domesticShippingFee: policy.domesticShippingFee,
    freeShippingThreshold: policy.freeShippingThreshold,
    freeShippingAmount: policy.freeShippingAmount,
    baseCurrency: policy.baseCurrency,
    exchangeRate: policy.exchangeRate,
    targetMarkets: policy.targetMarkets,
    detailTemplateId: policy.detailTemplateId,
    translationEnabled: policy.translationEnabled,
    translationSourceLang: policy.translationSourceLang,
    translationTargetLang: policy.translationTargetLang,
    watermarkEnabled: policy.watermarkEnabled,
    watermarkImageUrl: policy.watermarkImageUrl,
    watermarkPosition: policy.watermarkPosition,
    watermarkOpacity: policy.watermarkOpacity,
    platformFeeRate: policy.platformFeeRate,
    productNamePrefix: policy.productNamePrefix,
    productNameSuffix: policy.productNameSuffix,
    optionNamePrefix: policy.optionNamePrefix,
    optionNameSuffix: policy.optionNameSuffix,
  });

  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function update(patch: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updatePolicy(policy.id, form);
      if (!result.success) {
        toast({ title: "저장 실패", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "정책이 저장되었습니다" });
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/policies")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Input
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                className="h-8 w-64 text-lg font-semibold"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              최근 저장: {new Date(policy.updatedAt).toLocaleString("ko-KR")}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isPending} className="gap-1">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          저장
        </Button>
      </div>

      {/* Sections */}
      <div className="grid gap-4">
        <MarginSettings
          baseMarginRate={form.baseMarginRate}
          baseMarginAmount={form.baseMarginAmount}
          useTieredMargin={form.useTieredMargin}
          marginTiers={form.marginTiers}
          baseCurrency={form.baseCurrency}
          exchangeRate={form.exchangeRate}
          onChange={update}
        />

        <ShippingSettings
          internationalShippingFee={form.internationalShippingFee}
          shippingWeightUnit={form.shippingWeightUnit}
          shippingWeight={form.shippingWeight}
          domesticShippingFee={form.domesticShippingFee}
          freeShippingThreshold={form.freeShippingThreshold}
          freeShippingAmount={form.freeShippingAmount}
          onChange={update}
        />

        <MarketSelection
          targetMarkets={form.targetMarkets}
          onChange={(targetMarkets) => update({ targetMarkets })}
        />

        <TemplateSettings
          detailTemplateId={form.detailTemplateId}
          templates={templates}
          onChange={(detailTemplateId) => update({ detailTemplateId })}
        />

        <TranslationSettings
          translationEnabled={form.translationEnabled}
          translationSourceLang={form.translationSourceLang}
          translationTargetLang={form.translationTargetLang}
          onChange={update}
        />

        <WatermarkSettings
          watermarkEnabled={form.watermarkEnabled}
          watermarkImageUrl={form.watermarkImageUrl}
          watermarkPosition={form.watermarkPosition}
          watermarkOpacity={form.watermarkOpacity}
          onChange={update}
        />

        <FeeSettings
          platformFeeRate={form.platformFeeRate}
          onChange={update}
        />

        <NamingSettings
          productNamePrefix={form.productNamePrefix}
          productNameSuffix={form.productNameSuffix}
          optionNamePrefix={form.optionNamePrefix}
          optionNameSuffix={form.optionNameSuffix}
          onChange={update}
        />
      </div>

      {/* Bottom Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending} className="gap-1">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          저장
        </Button>
      </div>
    </div>
  );
}
