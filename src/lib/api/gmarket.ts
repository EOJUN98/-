const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface GmarketProduct {
  productCode: string;
  productName: string;
  productPrice: number;
  salePrice: number;
  productImage: string;
  productImage300: string;
  detailPageUrl: string;
  sellerName: string;
  delivery: string;
  reviewCount: number;
  rating: string;
}

export interface GmarketSearchResult {
  totalCount: number;
  products: GmarketProduct[];
}

/**
 * 지마켓 상품 검색 (웹 스크래핑 기반)
 * URL: https://browse.gmarket.co.kr/search?keyword=검색어&p=페이지
 */
export async function searchProducts(
  keyword: string,
  options?: {
    pageNum?: number;
    pageSize?: number;
    sortType?: "recm" | "date" | "lowp" | "highp" | "popr";
  }
): Promise<GmarketSearchResult> {
  const pageNum = options?.pageNum ?? 1;
  const sortType = options?.sortType ?? "recm";

  const params = new URLSearchParams({
    keyword,
    p: String(pageNum),
    s: sortType,
  });

  const url = `https://browse.gmarket.co.kr/search?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`지마켓 검색 요청 실패: HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseSearchResults(html);
}

function parseSearchResults(html: string): GmarketSearchResult {
  const products: GmarketProduct[] = [];

  // Extract total count
  const totalCountMatch = html.match(/총\s*<[^>]*>(\d[\d,]*)<\/?\w*>\s*개/);
  const totalCount = totalCountMatch
    ? parseInt(totalCountMatch[1].replace(/,/g, ""), 10)
    : 0;

  // Parse product items from search result HTML
  // Gmarket uses class="box__item-container" or "box__component" for each product
  const itemPattern =
    /class="box__item-container"[\s\S]*?(?=class="box__item-container"|<\/ul>|$)/g;
  let itemMatch;

  while ((itemMatch = itemPattern.exec(html)) !== null) {
    const block = itemMatch[0];
    const product = parseProductBlock(block);
    if (product) {
      products.push(product);
    }
  }

  // Fallback: try alternative HTML structure
  if (products.length === 0) {
    const altPattern =
      /class="box__component"[\s\S]*?(?=class="box__component"|$)/g;
    let altMatch;
    while ((altMatch = altPattern.exec(html)) !== null) {
      const block = altMatch[0];
      const product = parseProductBlock(block);
      if (product) {
        products.push(product);
      }
    }
  }

  // Second fallback: JSON-LD or script data
  if (products.length === 0) {
    const scriptProducts = parseScriptData(html);
    if (scriptProducts.length > 0) {
      return { totalCount: totalCount || scriptProducts.length, products: scriptProducts };
    }
  }

  return { totalCount: totalCount || products.length, products };
}

function parseProductBlock(block: string): GmarketProduct | null {
  // Extract product code (goods code)
  const codeMatch = block.match(/goodscode[=:][\s"']*(\d+)/i) ||
    block.match(/data-montelena-goodscode="(\d+)"/) ||
    block.match(/item\/(\d+)/) ||
    block.match(/goods\/(\d+)/);
  if (!codeMatch) return null;

  const productCode = codeMatch[1];

  // Extract product name
  const nameMatch = block.match(/class="text__item"[^>]*>([^<]+)/) ||
    block.match(/title="([^"]+)"/) ||
    block.match(/alt="([^"]+)"/);
  const productName = nameMatch?.[1]?.trim() ?? "";
  if (!productName) return null;

  // Extract price
  const priceMatch = block.match(/class="text__value[^"]*"[^>]*>([\d,]+)/) ||
    block.match(/class="box__price-sale[\s\S]*?([\d,]+)\s*원/);
  const salePrice = priceMatch
    ? parseInt(priceMatch[1].replace(/,/g, ""), 10)
    : 0;

  // Extract original price
  const origPriceMatch = block.match(/class="text__value--origin[^"]*"[^>]*>([\d,]+)/);
  const productPrice = origPriceMatch
    ? parseInt(origPriceMatch[1].replace(/,/g, ""), 10)
    : salePrice;

  // Extract image
  const imgMatch = block.match(/(?:src|data-src)="(https?:\/\/[^"]*?(?:gmarket|g-search|gmkt)[^"]*\.(?:jpg|png|webp|gif)[^"]*?)"/i) ||
    block.match(/(?:src|data-src)="(https?:\/\/[^"]*?image[^"]*\.(?:jpg|png|webp|gif)[^"]*?)"/i);
  const productImage = imgMatch?.[1] ?? "";

  // Extract seller
  const sellerMatch = block.match(/class="text__seller[^"]*"[^>]*>([^<]+)/) ||
    block.match(/seller[^"]*"[^>]*>([^<]+)/);
  const sellerName = sellerMatch?.[1]?.trim() ?? "";

  // Extract delivery info
  const deliveryMatch = block.match(/class="text__delivery[^"]*"[^>]*>([^<]+)/) ||
    block.match(/배송비[^<]*(무료|[\d,]+원)/);
  const delivery = deliveryMatch?.[1]?.trim() ?? "";

  // Extract review count
  const reviewMatch = block.match(/리뷰\s*([\d,]+)/) ||
    block.match(/class="text__review[^"]*"[^>]*>([\d,]+)/);
  const reviewCount = reviewMatch
    ? parseInt(reviewMatch[1].replace(/,/g, ""), 10)
    : 0;

  // Extract rating
  const ratingMatch = block.match(/class="text__rating[^"]*"[^>]*>([\d.]+)/);
  const rating = ratingMatch?.[1] ?? "";

  return {
    productCode,
    productName,
    productPrice,
    salePrice: salePrice || productPrice,
    productImage,
    productImage300: productImage,
    detailPageUrl: `https://item.gmarket.co.kr/Item?goodscode=${productCode}`,
    sellerName,
    delivery,
    reviewCount,
    rating,
  };
}

function parseScriptData(html: string): GmarketProduct[] {
  // Try to extract product data from __NEXT_DATA__ or embedded JSON
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nextDataMatch) return [];

  try {
    const data = JSON.parse(nextDataMatch[1]);
    const items = data?.props?.pageProps?.searchData?.items ??
      data?.props?.pageProps?.items ??
      [];

    return (items as Record<string, unknown>[]).map((item: Record<string, unknown>) => ({
      productCode: String(item.goodsCode ?? item.itemId ?? ""),
      productName: String(item.itemName ?? item.goodsName ?? ""),
      productPrice: Number(item.originalPrice ?? item.itemPrice ?? 0),
      salePrice: Number(item.salePrice ?? item.itemPrice ?? 0),
      productImage: String(item.imageUrl ?? item.image ?? ""),
      productImage300: String(item.imageUrl ?? item.image ?? ""),
      detailPageUrl: `https://item.gmarket.co.kr/Item?goodscode=${item.goodsCode ?? item.itemId ?? ""}`,
      sellerName: String(item.sellerName ?? ""),
      delivery: String(item.deliveryFee ?? ""),
      reviewCount: Number(item.reviewCount ?? 0),
      rating: String(item.rating ?? ""),
    })).filter((p: GmarketProduct) => p.productCode && p.productName);
  } catch {
    return [];
  }
}
