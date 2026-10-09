/**
 * Types of the data the UI works with. They mirror the backend responses
 * (snake_case fields, numeric ids, money as VND numbers) — see the backend Swagger at /docs.
 * The service layer (/services) is the only place that converts raw responses into these.
 */

export type ProductStatus = "IN_STOCK" | "OUT_OF_STOCK"
export type DiscountType = "NONE" | "PERCENT" | "FIXED"
export type UserRole = "CUSTOMER" | "ADMIN"
/** Handmade-order workflow; see backend src/orders/order-status.ts for allowed transitions. */
export type OrderStatus = "AWAITING_DEPOSIT" | "DEPOSITED" | "IN_PRODUCTION" | "COMPLETED" | "SHIPPING" | "DELIVERED" | "CANCELLED"
export type ShippingMethod = "PICKUP" | "DELIVERY"
export type ProductSort = "newest" | "oldest" | "price_asc" | "price_desc" | "name_asc" | "name_desc"

export interface CategoryRef {
  id: number
  name: string
  slug: string
}

export interface Category extends CategoryRef {
  /** Number of active products */
  product_count: number
}

export type TagRef = CategoryRef
export type Tag = Category

export interface Discount {
  type: DiscountType
  value: number
  start: string | null
  end: string | null
  /** Whether the discount applies right now (server time) */
  is_active: boolean
  /** price - final_price */
  amount: number
}

export interface ProductImage {
  id: number
  /** Absolute URL, ready for <img src> */
  url: string
  position: number
}

export interface Product {
  id: number
  code: string
  name: string
  short_description: string | null
  /** Only present on detail responses */
  description?: string | null
  price: number
  /** Authoritative discounted price computed by the backend */
  final_price: number
  discount: Discount
  category: CategoryRef
  tags: TagRef[]
  images: ProductImage[]
  status: ProductStatus
  created_at?: string
  updated_at?: string
}

export interface AdminProduct extends Product {
  description: string | null
  is_active: boolean
  category_id: number
  created_at: string
  updated_at: string
}

export interface ProductFilters {
  q?: string
  category?: string
  tag?: string
  min_price?: number
  max_price?: number
  status?: ProductStatus
  on_sale?: boolean
  sort?: ProductSort
  page?: number
  limit?: number
}

export interface AdminProductFilters extends ProductFilters {
  is_active?: boolean
}

/** Body of POST /admin/products (PUT accepts any subset). */
export interface ProductInput {
  code: string
  name: string
  shortDescription?: string
  description?: string
  categoryId: number
  price: number
  discountType?: DiscountType
  discountValue?: number
  discountStart?: string | null
  discountEnd?: string | null
  status?: ProductStatus
  isActive?: boolean
  tagIds?: number[]
  images?: { url: string; position?: number }[]
}

export type ScentType = "PERFUME" | "NATURAL"

/** A scent on the showcase page (display only, not sold directly). */
export interface Scent {
  id: number
  name: string
  description: string
  type: ScentType
  /** Absolute URL (resolved by the service layer) or null */
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface AdminScent extends Scent {
  is_active: boolean
}

/** Body of POST /admin/scents (PUT accepts any subset). */
export interface ScentInput {
  name: string
  description: string
  type: ScentType
  imageUrl?: string | null
  isActive?: boolean
}

export interface ImportSummary {
  total: number
  success: number
  failed: number
  created: number
  updated: number
  errors: { row: number; message: string }[]
}

export interface User {
  id: number
  name: string
  email: string
  role: UserRole
}

export interface AuthResult {
  access_token: string
  user: User
}

export interface CartItem {
  product_id: number
  product: {
    id: number
    code: string
    name: string
    image: string
    status: ProductStatus
  }
  quantity: number
  /** Customer's note for this product (colour, scent, message…) */
  note: string | null
  unit_price: number
  final_price: number
  subtotal: number
  available: boolean
  unavailable_reason: "INACTIVE" | "OUT_OF_STOCK" | null
}

export interface Cart {
  id: number | null
  items: CartItem[]
  /** Sum of quantities of available items */
  total_quantity: number
  /** Sum of subtotals of available items */
  total: number
  has_unavailable_items: boolean
}

/** Result of moving a guest cart into the user's cart after login. */
export interface CartMergeResult {
  /** Lines moved into the user cart */
  merged: number
  /** Lines dropped because the product is hidden or out of stock */
  skipped: number
}

export interface AdministrativeLocation {
  code: string
  name: string
}

export interface ShippingAddress {
  provinceCode: string
  provinceName: string
  wardCode: string
  wardName: string
  detail: string
}

/** Body of POST /orders. Prices and totals are never sent: the backend recalculates them. */
export interface CheckoutInput {
  customerName: string
  phone: string
  shippingMethod: ShippingMethod
  address: ShippingAddress | null
  /** Desired receive date, YYYY-MM-DD (Vietnam calendar day) */
  desiredDate: string
}

export interface OrderAddress {
  province_code: string
  province_name: string
  ward_code: string
  ward_name: string
  detail: string
}

export interface OrderItem {
  id: number
  /** null when the product was deleted later; the snapshot below is kept */
  product_id: number | null
  product_code: string
  product_name: string
  image: string
  /** Unit price paid (final price at purchase time) */
  price: number
  quantity: number
  subtotal: number
  /** Customer's note for this product, copied from the cart */
  note: string | null
}

export interface Order {
  id: number
  status: OrderStatus
  shipping_method: ShippingMethod
  customer_name: string
  customer_phone: string
  /** null for PICKUP */
  address: OrderAddress | null
  /** Desired receive date, YYYY-MM-DD; null for orders placed before the field existed */
  desired_date: string | null
  total_amount: number
  item_count: number
  items: OrderItem[]
  created_at: string
  updated_at: string
}

export interface AdminOrder extends Order {
  user: User
  allowed_transitions: OrderStatus[]
}

export interface AdminOrderFilters {
  status?: OrderStatus
  customer?: string
  id?: number
  shipping_method?: ShippingMethod
  /** Order date range; plain YYYY-MM-DD dates are Vietnam days (inclusive) */
  from?: string
  to?: string
  page?: number
  limit?: number
}

export interface Dashboard {
  products: { total: number; active: number; inactive: number; in_stock: number; out_of_stock: number }
  orders: { total: number; today: number; by_status: Partial<Record<OrderStatus, { count: number; amount: number }>> }
  /** Sum of DELIVERED orders */
  revenue: { delivered_total: number; delivered_last_30_days: number }
  customers: { total: number }
  catalog: { categories: number; tags: number }
  top_products: { product_code: string; product_name: string; quantity_sold: number; revenue: number }[]
  recent_orders: AdminOrder[]
  generated_at: string
}
