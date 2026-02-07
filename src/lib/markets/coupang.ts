import crypto from "crypto";

import type { PublishResult, PublishableProduct } from "@/lib/markets/types";

export interface CoupangConfig {
  accessKey: string;
  secretKey: string;
  vendorId: string;
}

function formatCoupangDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function createCoupangAuthHeader(
  method: "POST" | "GET" | "PUT" | "DELETE",
  path: string,
  config: CoupangConfig
) {
  const signedDate = formatCoupangDate(new Date());
  const message = `${signedDate}${method}${path}`;
  const signature = crypto
    .createHmac("sha256", config.secretKey)
    .update(message)
    .digest("hex");

  return `CEA algorithm=HmacSHA256, access-key=${config.accessKey}, signed-date=${signedDate}, signature=${signature}`;
}

export async function uploadToCoupang(
  product: PublishableProduct,
  config: CoupangConfig
): Promise<PublishResult> {
  const path = "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products";
  const authorization = createCoupangAuthHeader("POST", path, config);

  const payload = {
    displayCategoryCode: product.categoryId,
    sellerProductName: product.name,
    vendorId: config.vendorId,
    saleStartedAt: new Date().toISOString(),
    saleEndedAt: "2099-12-31T23:59:59",
    items: [
      {
        itemName: product.name,
        originalPrice: product.salePrice,
        salePrice: product.salePrice,
        maximumBuyCount: 999,
        images: [{ type: "REPRESENTATION", url: product.mainImageUrl }]
      }
    ]
  };

  const response = await fetch(`https://api-gateway.coupang.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
      "X-EXTENDED-TIMEOUT": "90000"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const result = (await response.json().catch(() => null)) as
    | {
        code?: string;
        message?: string;
        data?: { sellerProductId?: string | number };
      }
    | null;

  if (!response.ok) {
    throw new Error(result?.message ?? `Coupang upload failed (${response.status})`);
  }

  if (result?.code && result.code !== "SUCCESS") {
    throw new Error(result.message ?? "Coupang API returned non-success status");
  }

  const marketProductId = result?.data?.sellerProductId;
  if (!marketProductId) {
    throw new Error("Coupang product id was not returned");
  }

  return {
    marketProductId: String(marketProductId),
    rawResponse: result
  };
}
