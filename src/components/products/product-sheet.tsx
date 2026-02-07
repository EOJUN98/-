"use client";

import { useEffect, useMemo, useState } from "react";

import { updateProductAction } from "@/actions/products";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateSalePrice } from "@/lib/logic/pricing";
import type { ProductListItem } from "@/types/product";

interface ProductSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductListItem | null;
  onUpdated: (product: ProductListItem) => void;
}

function parseInputNumber(raw: string, fallback: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

export function ProductSheet({ open, onOpenChange, product, onUpdated }: ProductSheetProps) {
  const [name, setName] = useState("");
  const [costPrice, setCostPrice] = useState("0");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [marginRate, setMarginRate] = useState("30");
  const [shippingFee, setShippingFee] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) {
      return;
    }

    setName(product.name);
    setCostPrice(String(product.costPrice));
    setExchangeRate(String(product.exchangeRate));
    setMarginRate(String(product.marginRate));
    setShippingFee(String(product.shippingFee));
    setError(null);
  }, [product]);

  const pricingPreview = useMemo(() => {
    return calculateSalePrice({
      costPrice: parseInputNumber(costPrice, 0),
      exchangeRate: parseInputNumber(exchangeRate, 1),
      shippingFee: parseInputNumber(shippingFee, 0),
      marginRate: parseInputNumber(marginRate, 30),
      marketFeeRate: 11
    });
  }, [costPrice, exchangeRate, marginRate, shippingFee]);

  async function handleSave() {
    if (!product) {
      return;
    }

    setSaving(true);
    setError(null);

    const result = await updateProductAction({
      id: product.id,
      name,
      costPrice: parseInputNumber(costPrice, 0),
      exchangeRate: parseInputNumber(exchangeRate, 1),
      marginRate: parseInputNumber(marginRate, 30),
      shippingFee: parseInputNumber(shippingFee, 0),
      marketFeeRate: 11
    });

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    onUpdated(result.product);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>상품 정보 수정</DialogTitle>
          <DialogDescription>
            원가/환율/마진율/배송비를 수정하면 판매가가 자동 재계산됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="product-name">상품명</Label>
            <Input id="product-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cost-price">원가</Label>
              <Input
                id="cost-price"
                type="number"
                min={0}
                value={costPrice}
                onChange={(event) => setCostPrice(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exchange-rate">환율</Label>
              <Input
                id="exchange-rate"
                type="number"
                min={0}
                step="0.01"
                value={exchangeRate}
                onChange={(event) => setExchangeRate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="margin-rate">마진율(%)</Label>
              <Input
                id="margin-rate"
                type="number"
                min={0}
                max={90}
                step="0.1"
                value={marginRate}
                onChange={(event) => setMarginRate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shipping-fee">배송비</Label>
              <Input
                id="shipping-fee"
                type="number"
                min={0}
                value={shippingFee}
                onChange={(event) => setShippingFee(event.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p>기본원가: {pricingPreview.baseCost.toLocaleString()}원</p>
            <p>예상판매가: {pricingPreview.salePrice.toLocaleString()}원</p>
            <p>예상이익: {pricingPreview.profit.toLocaleString()}원</p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving || !product}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
