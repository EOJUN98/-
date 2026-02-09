export type PublishMarketCode = "coupang" | "smartstore";

export type PublishStatus = "success" | "failed" | "pending" | null;

export interface ProductListItem {
  id: string;
  productCode: string | null;
  name: string;
  salePrice: number;
  costPrice: number;
  exchangeRate: number;
  marginRate: number;
  shippingFee: number;
  mainImageUrl: string | null;
  categoryId: number | null;
  stockQuantity: number;
  isTranslated: boolean;
  lastPublishStatus: PublishStatus;
  lastPublishError: string | null;
  lastPublishedAt: string | null;
  createdAt: string;
}

export interface ProductPricingSnapshot {
  salePrice: number;
  profit: number;
  baseCost: number;
  purchaseCost: number;
  totalRate: number;
}

export interface ProductPublishLogItem {
  id: string;
  marketConfigId: string | null;
  marketCode: string | null;
  marketProductId: string | null;
  status: PublishStatus;
  errorMessage: string | null;
  syncedAt: string | null;
}

export interface ProductDetailItem extends ProductListItem {
  descriptionHtml: string | null;
  subImagesUrl: string[];
  rawId: string | null;
  updatedAt: string | null;
  policyId: string | null;
  publishLogs: ProductPublishLogItem[];
}

export interface PolicyPricingBreakdown {
  costPrice: number;
  exchangeRate: number;
  purchaseCost: number;
  marginAmount: number;
  shippingFee: number;
  platformFee: number;
  salePrice: number;
  profit: number;
  marginRate: number;
  platformFeeRate: number;
}

export interface MarketPrice {
  marketCode: string;
  marketLabel: string;
  salePrice: number;
  platformFeeRate: number;
  profit: number;
}

export interface ProductPolicyDetail {
  id: string;
  name: string;
  baseMarginRate: number;
  baseMarginAmount: number;
  useTieredMargin: boolean;
  internationalShippingFee: number;
  domesticShippingFee: number;
  exchangeRate: number;
  platformFeeRate: number;
  targetMarkets: string[];
  marginTiers: Array<{
    minPrice: number;
    maxPrice: number;
    marginRate: number;
    marginAmount: number;
  }>;
}
