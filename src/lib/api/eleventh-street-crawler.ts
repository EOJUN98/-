const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface EleventhStreetProductDetail {
  productCode: string;
  productName: string;
  price: number;
  finalPrice: number;
  categoryPath: string;
  categoryIds: {
    large: string;
    medium: string;
    small: string;
  };
  sellerId: string;
  sellerName: string;
  mainImages: string[];
  detailImages: string[];
  optionCount: number;
  optionNames: string;
  ogDescription: string;
  deliveryType: string;
  isAdult: boolean;
}

function extractJsonVar(html: string, varName: string): Record<string, unknown> | null {
  const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(\\{[\\s\\S]*?\\});`, "m");
  const match = html.match(regex);
  if (!match) return null;

  try {
    // Clean up JS object to valid JSON
    const cleaned = match[1]
      .replace(/\/\/[^\n]*/g, "") // remove single-line comments
      .replace(/,\s*}/g, "}") // trailing commas
      .replace(/,\s*]/g, "]")
      .replace(/(\w+)\s*:/g, '"$1":') // unquoted keys
      .replace(/"(\w+)":/g, (_, key) => `"${key}":`) // ensure proper quoting
      .replace(/:\s*'([^']*)'/g, ': "$1"') // single quotes to double
      .replace(/:\s*function\s*\([^)]*\)\s*\{[^}]*\}/g, ': null'); // remove functions

    return JSON.parse(cleaned);
  } catch {
    // Fallback: extract individual fields
    const fields: Record<string, unknown> = {};
    const fieldRegex = /(\w+)\s*:\s*(?:"([^"]*?)"|'([^']*?)'|(\d+(?:\.\d+)?)|(\btrue\b|\bfalse\b))/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(match[1])) !== null) {
      const key = fieldMatch[1];
      const value = fieldMatch[2] ?? fieldMatch[3] ?? fieldMatch[4] ?? fieldMatch[5];
      if (value === "true") fields[key] = true;
      else if (value === "false") fields[key] = false;
      else if (fieldMatch[4]) fields[key] = Number(value);
      else fields[key] = value;
    }
    return Object.keys(fields).length > 0 ? fields : null;
  }
}

export async function crawlProductDetail(
  productCode: string
): Promise<EleventhStreetProductDetail> {
  const url = `https://www.11st.co.kr/products/${productCode}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`11번가 상품 페이지 요청 실패: HTTP ${response.status}`);
  }

  const html = await response.text();

  // 1. Extract productPrdInfo
  const prdInfo = extractJsonVar(html, "productPrdInfo");

  const productName =
    String(prdInfo?.prdNm ?? "") ||
    extractMeta(html, "og:title")?.replace(/\[11번가\]\s*/, "") ||
    "";

  const price = Number(prdInfo?.selPrc ?? 0);
  const finalPrice = Number(prdInfo?.finalDscPrc ?? price);

  const categoryIds = {
    large: String(prdInfo?.ldispCtgrNo ?? ""),
    medium: String(prdInfo?.mdispCtgrNo ?? ""),
    small: String(prdInfo?.sdispCtgrNo ?? ""),
  };

  const sellerId = String(prdInfo?.sellerId ?? "");
  const deliveryType = String(prdInfo?.deliveryType ?? "");
  const isAdult = prdInfo?.isAdultProduct === "Y" || prdInfo?.isAdultProduct === true;

  // 2. Extract og:description for category path
  const ogDescription = extractMeta(html, "og:description") ?? "";
  const categoryPath = ogDescription.split(",")[0]?.trim() ?? "";

  // 3. Extract main images (product thumbnails)
  const mainImagePattern =
    /(?:src|data-src)="((?:https?:)?\/\/cdn\.011st\.com\/[^"]*?(?:\/product\/|\/dl\/)[^"]+\.(?:jpg|png|webp|gif)[^"]*?)"/g;
  const mainImagesRaw = new Set<string>();
  let imgMatch;
  while ((imgMatch = mainImagePattern.exec(html)) !== null) {
    let imgUrl = imgMatch[1];
    if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
    imgUrl = imgUrl.replace(/\\$/, "");
    // Normalize to 600x600 for better quality
    imgUrl = imgUrl.replace(/resize\/\d+x\d+/, "resize/600x600");
    if (!imgUrl.includes("no_image")) {
      mainImagesRaw.add(imgUrl);
    }
  }
  const mainImages = [...mainImagesRaw];

  // 4. Extract detail/description images
  const detailImagePattern =
    /(?:https?:)?\/\/cdn\.011st\.com\/11dims\/resize\/720\/[^"\s]+/g;
  const detailImagesRaw = new Set<string>();
  let detailMatch;
  while ((detailMatch = detailImagePattern.exec(html)) !== null) {
    let imgUrl = detailMatch[0];
    if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
    detailImagesRaw.add(imgUrl);
  }
  const detailImages = [...detailImagesRaw];

  // 5. Extract option info
  const optInfo = extractJsonVar(html, "productOptInfo");
  const optionCount = Number(optInfo?.optCnt ?? 0);
  const optionNames = String(optInfo?.optItemNms ?? "");

  // 6. Seller name from og:title or page
  const sellerNickMatch = html.match(
    /c_product_store_name[^>]*>([^<]+)</
  );
  const sellerName = sellerNickMatch?.[1]?.trim() ?? sellerId;

  return {
    productCode,
    productName,
    price,
    finalPrice,
    categoryPath,
    categoryIds,
    sellerId,
    sellerName,
    mainImages,
    detailImages,
    optionCount,
    optionNames,
    ogDescription,
    deliveryType,
    isAdult,
  };
}

function extractMeta(html: string, property: string): string | null {
  const regex = new RegExp(
    `<meta\\s+(?:property|name)="${property}"\\s+content="([^"]*?)"`,
    "i"
  );
  const match = html.match(regex);
  return match?.[1] ?? null;
}
