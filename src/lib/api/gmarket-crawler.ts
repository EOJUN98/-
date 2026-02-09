const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface GmarketProductDetail {
  productCode: string;
  productName: string;
  price: number;
  finalPrice: number;
  categoryPath: string;
  sellerId: string;
  sellerName: string;
  mainImages: string[];
  detailImages: string[];
  optionCount: number;
  ogDescription: string;
  deliveryType: string;
}

export async function crawlProductDetail(
  productCode: string
): Promise<GmarketProductDetail> {
  const url = `https://item.gmarket.co.kr/Item?goodscode=${productCode}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`지마켓 상품 페이지 요청 실패: HTTP ${response.status}`);
  }

  const html = await response.text();

  // 1. Extract product name from og:title or page title
  const productName =
    extractMeta(html, "og:title")?.replace(/\s*-\s*G마켓.*$/, "").trim() ||
    extractTitle(html) ||
    "";

  // 2. Extract prices
  const priceMatch = html.match(/ItemPrice[^}]*?OriginalPrice['":\s]*([\d,]+)/) ||
    html.match(/정가[^<]*([\d,]+)/) ||
    html.match(/"price"\s*:\s*"?([\d,]+)/);
  const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) : 0;

  const finalPriceMatch = html.match(/ItemPrice[^}]*?SalePrice['":\s]*([\d,]+)/) ||
    html.match(/판매가[^<]*([\d,]+)/) ||
    html.match(/"salePrice"\s*:\s*"?([\d,]+)/) ||
    html.match(/class="price_real[^"]*"[^>]*>([\d,]+)/);
  const finalPrice = finalPriceMatch
    ? parseInt(finalPriceMatch[1].replace(/,/g, ""), 10)
    : price;

  // 3. Extract category path
  const categoryMatch = html.match(/class="location[^"]*"[\s\S]*?<\/div>/) ||
    html.match(/"category"\s*:\s*"([^"]*)"/);
  const categoryPath = categoryMatch
    ? categoryMatch[0]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";

  // 4. Extract seller info
  const sellerIdMatch = html.match(/SellerNo['":\s]*(\d+)/) ||
    html.match(/sellerno[=:]\s*['"]?(\d+)/i);
  const sellerId = sellerIdMatch?.[1] ?? "";

  const sellerNameMatch = html.match(/class="link__seller[^"]*"[^>]*>([^<]+)/) ||
    html.match(/SellerName['":\s]*['"]([^'"]+)/) ||
    html.match(/seller_name['":\s]*['"]([^'"]+)/i);
  const sellerName = sellerNameMatch?.[1]?.trim() ?? "";

  // 5. Extract main images
  const mainImages: string[] = [];
  const mainImgPattern =
    /(?:src|data-src)="(https?:\/\/[^"]*?(?:gmarket|gmkt|g9)[^"]*\.(?:jpg|png|webp|gif)[^"]*?)"/gi;
  const seenMain = new Set<string>();
  let imgMatch;
  while ((imgMatch = mainImgPattern.exec(html)) !== null) {
    let imgUrl = imgMatch[1];
    if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
    // Filter main product images (typically larger size)
    if (
      (imgUrl.includes("/Item/") || imgUrl.includes("/image/") || imgUrl.includes("thumbnail")) &&
      !imgUrl.includes("icon") &&
      !imgUrl.includes("logo") &&
      !imgUrl.includes("banner") &&
      !seenMain.has(imgUrl)
    ) {
      seenMain.add(imgUrl);
      mainImages.push(imgUrl);
    }
  }

  // 6. Extract detail/description images
  const detailImages: string[] = [];
  // Gmarket detail images are often loaded via iframe or separate API
  const detailImgPattern =
    /(?:src|data-src)="(https?:\/\/[^"]*?(?:image_g9|gmarket|gmkt)[^"]*\.(?:jpg|png|webp|gif)[^"]*?)"/gi;
  const seenDetail = new Set<string>(seenMain);
  let detailMatch;
  while ((detailMatch = detailImgPattern.exec(html)) !== null) {
    let imgUrl = detailMatch[1];
    if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
    if (
      !imgUrl.includes("icon") &&
      !imgUrl.includes("logo") &&
      !imgUrl.includes("banner") &&
      !imgUrl.includes("button") &&
      !seenDetail.has(imgUrl)
    ) {
      seenDetail.add(imgUrl);
      detailImages.push(imgUrl);
    }
  }

  // 7. Extract option count
  const optionMatch = html.match(/optionCount['":\s]*(\d+)/) ||
    html.match(/class="box__option[\s\S]*?<\/div>/);
  const optionCount = optionMatch?.[1] ? parseInt(optionMatch[1], 10) : 0;

  // 8. Extract og:description
  const ogDescription = extractMeta(html, "og:description") ?? "";

  // 9. Extract delivery type
  const deliveryMatch = html.match(/배송비[^<]*?(무료|[\d,]+원)/) ||
    html.match(/class="text__delivery[^"]*"[^>]*>([^<]+)/);
  const deliveryType = deliveryMatch?.[1]?.trim() ?? "";

  return {
    productCode,
    productName,
    price,
    finalPrice,
    categoryPath,
    sellerId,
    sellerName,
    mainImages,
    detailImages,
    optionCount,
    ogDescription,
    deliveryType,
  };
}

function extractMeta(html: string, property: string): string | null {
  const regex = new RegExp(
    `<meta\\s+(?:property|name)="${property}"\\s+content="([^"]*?)"`,
    "i"
  );
  const match = html.match(regex);
  if (match) return match[1];

  // Try reverse order (content before property)
  const regex2 = new RegExp(
    `<meta\\s+content="([^"]*?)"\\s+(?:property|name)="${property}"`,
    "i"
  );
  const match2 = html.match(regex2);
  return match2?.[1] ?? null;
}

function extractTitle(html: string): string {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? "";
}
