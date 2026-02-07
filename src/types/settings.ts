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
