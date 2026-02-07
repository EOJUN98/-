export interface PublishableProduct {
  id: string;
  name: string;
  descriptionHtml: string;
  categoryId: number;
  salePrice: number;
  mainImageUrl: string;
  stockQuantity: number;
}

export interface PublishResult {
  marketProductId: string;
  rawResponse: unknown;
}
