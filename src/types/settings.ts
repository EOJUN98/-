import type { PublishMarketCode } from "@/types/product";

export type SupportedMarketCode = PublishMarketCode;

export interface MarketConfigSummary {
  id: string | null;
  marketCode: SupportedMarketCode;
  isConfigured: boolean;
  vendorConfigured: boolean;
  isActive: boolean;
  defaultDeliveryFee: number;
  defaultReturnFee: number;
  updatedAt: string | null;
}

export interface SourcingConfig {
  pageDelayMs: number;
  crawlDelayMs: number;
  bulkMaxTarget: number;
  pageSize: number;
  autoConvert: boolean;
  defaultMarginRate: number;
  updatedAt: string | null;
}
