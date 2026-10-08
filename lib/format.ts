import type { Order, OrderStatus, Product, ProductStatus, ScentType, ShippingMethod } from "@/types/commerce"

export const formatVnd = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value)
export const formatDate = (value: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value))
export const formatDateTime = (value: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
export const formatCompactVnd = (value: number) => new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(value)
/** YYYY-MM-DD (calendar day, no time zone shift) → dd/mm/yyyy; "—" when missing. */
export const formatDateOnly = (value: string | null | undefined) => (value ? value.split("-").reverse().join("/") : "—")

const pad = (n: number) => String(n).padStart(2, "0")
/** Today in the browser's time zone as YYYY-MM-DD (for <input type="date">). */
export const todayDateInput = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

export const formatOrderCode = (id: Order["id"]) => `#${String(id).padStart(6, "0")}`

/** Badge text for a product whose backend discount currently applies; null otherwise. */
export function discountLabel(product: Pick<Product, "price" | "final_price" | "discount">) {
  const { discount } = product
  if (!discount.is_active || product.final_price >= product.price) return null
  return discount.type === "PERCENT" ? `-${discount.value}%` : `-${formatVnd(discount.amount)}`
}

export const productStatusLabel: Record<ProductStatus, string> = { IN_STOCK: "Còn hàng", OUT_OF_STOCK: "Hết hàng" }
export const productStatusTone: Record<ProductStatus, string> = { IN_STOCK: "text-emerald-700", OUT_OF_STOCK: "text-slate-500" }
export const orderStatusLabel: Record<OrderStatus, string> = { AWAITING_DEPOSIT: "Chờ cọc", DEPOSITED: "Đã cọc", IN_PRODUCTION: "Đang làm", COMPLETED: "Đã hoàn thành", SHIPPING: "Đang giao", DELIVERED: "Đã giao", CANCELLED: "Huỷ" }
export const orderStatusTone: Record<OrderStatus, string> = { AWAITING_DEPOSIT: "text-amber-600", DEPOSITED: "text-blue-600", IN_PRODUCTION: "text-indigo-600", COMPLETED: "text-teal-600", SHIPPING: "text-violet-600", DELIVERED: "text-emerald-600", CANCELLED: "text-slate-500" }
/** Workflow order, for filters and charts. */
export const ORDER_STATUSES: OrderStatus[] = ["AWAITING_DEPOSIT", "DEPOSITED", "IN_PRODUCTION", "COMPLETED", "SHIPPING", "DELIVERED", "CANCELLED"]
export const scentTypeLabel: Record<ScentType, string> = { PERFUME: "Hương nước hoa", NATURAL: "Hương tự nhiên" }
export const shippingMethodLabel: Record<ShippingMethod, string> = { PICKUP: "Nhận hàng trực tiếp", DELIVERY: "Ship tận nhà" }

export function makeSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export function formatOrderAddress(order: Pick<Order, "shipping_method" | "address">) {
  if (order.shipping_method === "PICKUP" || !order.address) return "Nhận tại cửa hàng Chipscendle"
  return [order.address.detail, order.address.ward_name, order.address.province_name].filter(Boolean).join(", ")
}
