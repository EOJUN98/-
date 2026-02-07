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
  publishLogs: ProductPublishLogItem[];
}
