export type OrderInternalStatus = "collected" | "ordered" | "shipped" | "delivered" | "cancelled";

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
