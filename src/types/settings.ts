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

export interface MarketFeeConfig {
  marketCode: string;
  marketLabel: string;
  feeRate: number;
}

export interface CourierCompany {
  id: number;
  code: string;
  name: string;
  coupangCode: string | null;
  smartstoreCode: string | null;
  eleventhCode: string | null;
  gmarketCode: string | null;
  isActive: boolean;
}

export interface UserCourierSetting {
  id: string;
  userId: string;
  defaultCourierCode: string | null;
  marketConfigId: string | null;
  courierCode: string | null;
  createdAt: string;
}

export interface ForwarderCompany {
  id: number;
  code: string;
  name: string;
  homepageUrl: string | null;
  apiType: string | null;
  isActive: boolean;
}

export interface UserForwarderSetting {
  id: string;
  userId: string;
  defaultForwarderCode: string | null;
  marketConfigId: string | null;
  forwarderCode: string | null;
  createdAt: string;
}

export const DEFAULT_MARKET_FEES: MarketFeeConfig[] = [
  { marketCode: "coupang", marketLabel: "쿠팡", feeRate: 10.8 },
  { marketCode: "smartstore", marketLabel: "스마트스토어", feeRate: 5.5 },
  { marketCode: "11st", marketLabel: "11번가", feeRate: 12 },
  { marketCode: "gmarket", marketLabel: "G마켓", feeRate: 12 },
  { marketCode: "auction", marketLabel: "옥션", feeRate: 12 },
  { marketCode: "interpark", marketLabel: "인터파크", feeRate: 13 },
  { marketCode: "tmon", marketLabel: "티몬", feeRate: 12 },
  { marketCode: "wemakeprice", marketLabel: "위메프", feeRate: 12 },
];
