import type { PublishResult, PublishableProduct } from "@/lib/markets/types";

export interface SmartStoreConfig {
  clientId: string;
  clientSecret: string;
}

interface SmartStoreTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export async function getSmartStoreAccessToken(config: SmartStoreConfig) {
  const response = await fetch("https://api.commerce.naver.com/external/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
      type: "SELF"
    }),
    cache: "no-store"
  });

  const result = (await response.json().catch(() => null)) as SmartStoreTokenResponse | null;
  if (!response.ok || !result?.access_token) {
    const description = result?.error_description ?? result?.error ?? null;
    throw new Error(
      description
        ? `Failed to fetch SmartStore access token: ${description}`
        : `Failed to fetch SmartStore access token (HTTP ${response.status})`
    );
  }

  return result.access_token;
}

export async function uploadToSmartStore(
  product: PublishableProduct,
  config: SmartStoreConfig
): Promise<PublishResult> {
  const accessToken = await getSmartStoreAccessToken(config);

  const payload = {
    originProduct: {
      statusType: "SALE",
      name: product.name,
      leafCategoryId: product.categoryId,
      images: {
        representativeImage: {
          url: product.mainImageUrl
        }
      },
      detailContent: {
        editorType: "HTML",
        content: product.descriptionHtml || `<p>${product.name}</p>`
      },
      salePrice: product.salePrice,
      stockQuantity: product.stockQuantity,
      deliveryInfo: {
        deliveryType: "DELIVERY",
        deliveryAttributeType: "NORMAL",
        deliveryFee: { type: "FREE" }
      }
    }
  };

  const response = await fetch("https://api.commerce.naver.com/external/v1/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const result = (await response.json().catch(() => null)) as
    | { originProductNo?: string | number; message?: string }
    | null;

  if (!response.ok) {
    throw new Error(result?.message ?? `SmartStore upload failed (${response.status})`);
  }

  if (!result?.originProductNo) {
    throw new Error("SmartStore product id was not returned");
  }

  return {
    marketProductId: String(result.originProductNo),
    rawResponse: result
  };
}
