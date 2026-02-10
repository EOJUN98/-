export type OrderInternalStatus =
  | "collected"
  | "ordered"
  | "overseas_shipping"
  | "domestic_arrived"
  | "shipped"
  | "delivered"
  | "confirmed"
  | "cancelled"
  | "returned"
  | "exchanged";

export interface OrderListItem {
  id: string;
  orderNumber: string;
  marketCode: string | null;
  marketStatus: string | null;
  internalStatus: OrderInternalStatus | string;
  buyerName: string | null;
  buyerPhone: string | null;
  shippingAddress: string | null;
  totalPrice: number;
  orderDate: string | null;
  trackingNumber: string | null;
  courierCode: string | null;
  createdAt: string;
}

export interface OrderItemDetail {
  id: string;
  marketProductName: string | null;
  marketOptionName: string | null;
  quantity: number;
  unitPrice: number;
}

export interface OrderDetail extends OrderListItem {
  personalCustomsCode: string | null;
  items: OrderItemDetail[];
}
