import type {
  ProductPricingSnapshot,
  PolicyPricingBreakdown,
  MarketPrice,
  ProductPolicyDetail,
} from "@/types/product";
import { AVAILABLE_MARKETS } from "@/types/policy";

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

// Default platform fee rates per market (approximate)
const MARKET_FEE_RATES: Record<string, number> = {
  coupang: 10.8,
  smartstore: 5.5,
  "11st": 12,
  gmarket: 12,
  auction: 12,
  interpark: 13,
  tmon: 12,
  wemakeprice: 12,
};

function getMarginForPrice(
  policy: ProductPolicyDetail,
  costPrice: number
): { rate: number; amount: number } {
  if (policy.useTieredMargin && policy.marginTiers.length > 0) {
    const tier = policy.marginTiers.find(
      (t) => costPrice >= t.minPrice && costPrice <= t.maxPrice
    );
    if (tier) {
      return { rate: tier.marginRate, amount: tier.marginAmount };
    }
  }
  return { rate: policy.baseMarginRate, amount: policy.baseMarginAmount };
}

export function calculatePolicyPricing(
  costPrice: number,
  policy: ProductPolicyDetail
): PolicyPricingBreakdown {
  const cp = Math.max(0, toFiniteNumber(costPrice, 0));
  const exRate = Math.max(0, toFiniteNumber(policy.exchangeRate, 1));
  const purchaseCost = cp * exRate;

  const margin = getMarginForPrice(policy, cp);
  const marginAmount = margin.amount > 0
    ? margin.amount
    : Math.round(purchaseCost * (margin.rate / 100));

  const shippingFee = policy.internationalShippingFee + policy.domesticShippingFee;
  const platformFeeRate = toFiniteNumber(policy.platformFeeRate, 0);

  const baseCost = purchaseCost + marginAmount + shippingFee;
  const denominator = Math.max(0.01, 1 - platformFeeRate / 100);
  const rawSalePrice = baseCost / denominator;
  const salePrice = Math.ceil(rawSalePrice / 100) * 100;
  const platformFee = Math.round(salePrice * (platformFeeRate / 100));
  const profit = salePrice - purchaseCost - shippingFee - platformFee;

  return {
    costPrice: cp,
    exchangeRate: exRate,
    purchaseCost: Math.round(purchaseCost),
    marginAmount,
    shippingFee,
    platformFee,
    salePrice,
    profit,
    marginRate: margin.rate,
    platformFeeRate,
  };
}

export function calculateMarketPrices(
  costPrice: number,
  policy: ProductPolicyDetail,
  feeRatesByMarketCode?: Record<string, number>
): MarketPrice[] {
  const cp = Math.max(0, toFiniteNumber(costPrice, 0));
  const exRate = Math.max(0, toFiniteNumber(policy.exchangeRate, 1));
  const purchaseCost = cp * exRate;

  const margin = getMarginForPrice(policy, cp);
  const marginAmount = margin.amount > 0
    ? margin.amount
    : Math.round(purchaseCost * (margin.rate / 100));

  const shippingFee = policy.internationalShippingFee + policy.domesticShippingFee;
  const baseCost = purchaseCost + marginAmount + shippingFee;

  const markets = policy.targetMarkets.length > 0
    ? policy.targetMarkets
    : Object.keys(feeRatesByMarketCode ?? MARKET_FEE_RATES);

  return markets.map((code) => {
    const feeRate = feeRatesByMarketCode?.[code] ?? MARKET_FEE_RATES[code] ?? 10;
    const denominator = Math.max(0.01, 1 - feeRate / 100);
    const rawPrice = baseCost / denominator;
    const salePrice = Math.ceil(rawPrice / 100) * 100;
    const platformFee = Math.round(salePrice * (feeRate / 100));
    const profit = salePrice - purchaseCost - shippingFee - platformFee;
    const marketInfo = AVAILABLE_MARKETS.find((m) => m.code === code);

    return {
      marketCode: code,
      marketLabel: marketInfo?.label ?? code,
      salePrice,
      platformFeeRate: feeRate,
      profit,
    };
  });
}
