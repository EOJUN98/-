export interface MarginTier {
  id?: string;
  minPrice: number;
  maxPrice: number;
  marginRate: number;
  marginAmount: number;
  sortOrder: number;
}

export interface ProductPolicy {
  id: string;
  name: string;
  isDefault: boolean;
  // 마진
  baseMarginRate: number;
  baseMarginAmount: number;
  useTieredMargin: boolean;
  marginTiers: MarginTier[];
  // 배송비
  internationalShippingFee: number;
  shippingWeightUnit: string;
  shippingWeight: number | null;
  domesticShippingFee: number;
  freeShippingThreshold: number;
  freeShippingAmount: number;
  // 통화
  baseCurrency: string;
  exchangeRate: number;
  // 전송 마켓
  targetMarkets: string[];
  // 상세페이지 템플릿
  detailTemplateId: string | null;
  // 번역
  translationEnabled: boolean;
  translationSourceLang: string;
  translationTargetLang: string;
  // 워터마크
  watermarkEnabled: boolean;
  watermarkImageUrl: string | null;
  watermarkPosition: string;
  watermarkOpacity: number;
  // 수수료
  platformFeeRate: number;
  // 상품명 치환
  productNamePrefix: string;
  productNameSuffix: string;
  optionNamePrefix: string;
  optionNameSuffix: string;
  // 타임스탬프
  createdAt: string;
  updatedAt: string;
}

export interface PolicySummary {
  id: string;
  name: string;
  isDefault: boolean;
  baseMarginRate: number;
  targetMarkets: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DetailTemplate {
  id: string;
  name: string;
  headerHtml: string;
  footerHtml: string;
  cssStyle: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const AVAILABLE_MARKETS = [
  { code: "smartstore", label: "스마트스토어" },
  { code: "coupang", label: "쿠팡" },
  { code: "11st", label: "11번가" },
  { code: "gmarket", label: "G마켓" },
  { code: "auction", label: "옥션" },
  { code: "interpark", label: "인터파크" },
  { code: "tmon", label: "티몬" },
  { code: "wemakeprice", label: "위메프" },
] as const;

export const WATERMARK_POSITIONS = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
] as const;

export const LANGUAGES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "영어" },
  { code: "zh", label: "중국어" },
  { code: "ja", label: "일본어" },
] as const;

export const CURRENCY_OPTIONS = [
  { code: "KRW", label: "KRW (원화)" },
  { code: "USD", label: "USD (달러)" },
  { code: "CNY", label: "CNY (위안)" },
  { code: "JPY", label: "JPY (엔)" },
] as const;
