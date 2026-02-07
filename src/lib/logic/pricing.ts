import type { ProductPricingSnapshot } from "@/types/product";

export interface PricingParams {
  costPrice: number;
  exchangeRate: number;
  shippingFee: number;
  marginRate: number;
  marketFeeRate: number;
}

function toFiniteNumber(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

export function calculateSalePrice(params: PricingParams): ProductPricingSnapshot {
  const costPrice = Math.max(0, toFiniteNumber(params.costPrice, 0));
  const exchangeRate = Math.max(0, toFiniteNumber(params.exchangeRate, 1));
  const shippingFee = Math.max(0, toFiniteNumber(params.shippingFee, 0));
  const marginRate = Math.max(0, toFiniteNumber(params.marginRate, 0));
  const marketFeeRate = Math.max(0, toFiniteNumber(params.marketFeeRate, 0));

  const purchaseCost = costPrice * exchangeRate;
  const baseCost = purchaseCost + shippingFee;
  const totalRate = marginRate + marketFeeRate;

  // Prevent divide-by-zero for extreme invalid rates.
  const denominator = Math.max(0.01, 1 - totalRate / 100);
  const rawSalePrice = baseCost / denominator;
  const salePrice = Math.ceil(rawSalePrice / 10) * 10;
  const marketFee = salePrice * (marketFeeRate / 100);
  const profit = salePrice - baseCost - marketFee;

  return {
    salePrice: Math.max(0, Math.round(salePrice)),
    profit: Math.round(profit),
    baseCost: Math.round(baseCost),
    purchaseCost: Math.round(purchaseCost),
    totalRate
  };
}
