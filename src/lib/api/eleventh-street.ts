import { XMLParser } from "fast-xml-parser";

const API_BASE = "http://openapi.11st.co.kr/openapi/OpenApiService.tmall";

export interface EleventhStreetProduct {
  productCode: string;
  productName: string;
  productPrice: number;
  salePrice: number;
  productImage: string;
  productImage300: string;
  detailPageUrl: string;
  sellerNick: string;
  seller: string;
  delivery: string;
  reviewCount: number;
  buySatisfy: number;
  rating: string;
}

export interface EleventhStreetSearchResult {
  totalCount: number;
  products: EleventhStreetProduct[];
}

function getApiKey(): string {
  const key = process.env.ELEVENTH_STREET_API_KEY;
  if (!key) {
    throw new Error("ELEVENTH_STREET_API_KEY 환경변수가 설정되지 않았습니다");
  }
  return key;
}

function parseProduct(raw: Record<string, unknown>): EleventhStreetProduct {
  return {
    productCode: String(raw.ProductCode ?? ""),
    productName: String(raw.ProductName ?? ""),
    productPrice: Number(raw.ProductPrice ?? 0),
    salePrice: Number(raw.SalePrice ?? 0),
    productImage: String(raw.ProductImage ?? ""),
    productImage300: String(raw.ProductImage300 ?? raw.ProductImage ?? ""),
    detailPageUrl: String(raw.DetailPageUrl ?? ""),
    sellerNick: String(raw.SellerNick ?? ""),
    seller: String(raw.Seller ?? ""),
    delivery: String(raw.Delivery ?? ""),
    reviewCount: Number(raw.ReviewCount ?? 0),
    buySatisfy: Number(raw.BuySatisfy ?? 0),
    rating: String(raw.Rating ?? ""),
  };
}

export async function searchProducts(
  keyword: string,
  options?: {
    pageNum?: number;
    pageSize?: number;
    sortCd?: "CP" | "A" | "G" | "I" | "L" | "R";
  }
): Promise<EleventhStreetSearchResult> {
  const apiKey = getApiKey();
  const pageNum = options?.pageNum ?? 1;
  const pageSize = options?.pageSize ?? 30;
  const sortCd = options?.sortCd ?? "CP";

  const params = new URLSearchParams({
    key: apiKey,
    apiCode: "ProductSearch",
    keyword,
    pageNum: String(pageNum),
    pageSize: String(pageSize),
    sortCd,
  });

  const url = `${API_BASE}?${params.toString()}`;

  const response = await fetch(url, {
    headers: { Accept: "application/xml" },
  });

  if (!response.ok) {
    throw new Error(`11번가 API 호출 실패: HTTP ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const text = new TextDecoder("euc-kr").decode(buffer);

  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (tagName) => tagName === "Product",
  });

  const parsed = parser.parse(text);
  const root = parsed.ProductSearchResponse;

  if (!root?.Products) {
    return { totalCount: 0, products: [] };
  }

  const totalCount = Number(root.Products.TotalCount ?? 0);
  const rawProducts = root.Products.Product ?? [];
  const products = (Array.isArray(rawProducts) ? rawProducts : [rawProducts]).map(parseProduct);

  return { totalCount, products };
}
