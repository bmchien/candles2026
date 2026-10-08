import { api, resolveAssetUrl, type Paged } from "@/lib/api/client"
import type { CheckoutInput, Order, OrderItem, OrderStatus } from "@/types/commerce"

export type RawOrder<T extends Order = Order> = Omit<T, "items"> & { items: (Omit<OrderItem, "image"> & { image: string | null })[] }

export function normalizeOrder<T extends Order>(order: RawOrder<T>): T {
  return { ...order, items: order.items.map((item) => ({ ...item, image: resolveAssetUrl(item.image) })) } as unknown as T
}

export const orderService = {
  /**
   * Checkout from the server-side cart. Only customer and shipping data is sent:
   * the backend re-validates products, recalculates prices and clears the cart.
   */
  create: async (input: CheckoutInput) => {
    const { customerName, phone, shippingMethod, address, desiredDate } = input
    const body = shippingMethod === "DELIVERY" ? { customerName, phone, shippingMethod, desiredDate, address } : { customerName, phone, shippingMethod, desiredDate }
    return normalizeOrder(await api.post<RawOrder>("/orders", body))
  },
  mine: async (query: { status?: OrderStatus; page?: number; limit?: number } = {}): Promise<Paged<Order>> => {
    const page = await api.getPaged<RawOrder>("/orders", query)
    return { ...page, items: page.items.map((order) => normalizeOrder(order)) }
  },
  byId: async (id: number | string) => normalizeOrder(await api.get<RawOrder>(`/orders/${encodeURIComponent(String(id))}`)),
}
