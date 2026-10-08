import { api, type Paged } from "@/lib/api/client"
import { normalizeOrder, type RawOrder } from "@/services/order.service"
import { normalizeProduct } from "@/services/product.service"
import type { AdminOrder, AdminOrderFilters, AdminProduct, AdminProductFilters, Dashboard, ImportSummary, OrderStatus, ProductInput, ProductStatus } from "@/types/commerce"

type RawDashboard = Omit<Dashboard, "recent_orders"> & { recent_orders: RawOrder<AdminOrder>[] }

export const adminService = {
  dashboard: async (): Promise<Dashboard> => {
    const data = await api.get<RawDashboard>("/admin/dashboard")
    return { ...data, recent_orders: data.recent_orders.map((order) => normalizeOrder<AdminOrder>(order)) }
  },

  // ----- products
  listProducts: async (filters: AdminProductFilters = {}): Promise<Paged<AdminProduct>> => {
    const page = await api.getPaged<AdminProduct>("/admin/products", { ...filters })
    return { ...page, items: page.items.map(normalizeProduct) }
  },
  getProduct: async (id: number | string) => normalizeProduct(await api.get<AdminProduct>(`/admin/products/${encodeURIComponent(String(id))}`)),
  createProduct: async (input: ProductInput) => normalizeProduct(await api.post<AdminProduct>("/admin/products", input)),
  /** Partial update: omitted fields stay unchanged; `tagIds` / `images` replace. */
  updateProduct: async (id: number, input: Partial<ProductInput>) => normalizeProduct(await api.put<AdminProduct>(`/admin/products/${id}`, input)),
  setProductStatus: async (id: number, status: ProductStatus) => normalizeProduct(await api.patch<AdminProduct>(`/admin/products/${id}/status`, { status })),
  setProductVisibility: async (id: number, isActive: boolean) => normalizeProduct(await api.patch<AdminProduct>(`/admin/products/${id}/visibility`, { isActive })),
  deleteProduct: (id: number) => api.delete<{ id: number; deleted: true }>(`/admin/products/${id}`),
  /** Rows are upserted by `code`; invalid rows are reported in `errors` without blocking the others. */
  importProducts: (file: File) => {
    const form = new FormData()
    form.append("file", file)
    return api.upload<ImportSummary>("/admin/products/import", form)
  },

  // ----- orders
  listOrders: async (filters: AdminOrderFilters = {}): Promise<Paged<AdminOrder>> => {
    const page = await api.getPaged<RawOrder<AdminOrder>>("/admin/orders", { ...filters })
    return { ...page, items: page.items.map((order) => normalizeOrder<AdminOrder>(order)) }
  },
  getOrder: async (id: number | string) => normalizeOrder<AdminOrder>(await api.get<RawOrder<AdminOrder>>(`/admin/orders/${encodeURIComponent(String(id))}`)),
  /** Excel (.xlsx) of every order matching the filters (no pagination; max 10 000 orders). */
  exportOrders: (filters: Omit<AdminOrderFilters, "page" | "limit"> = {}) =>
    api.download("/admin/orders/export", { ...filters }, "don-hang.xlsx"),
  /** 400 INVALID_STATUS_TRANSITION unless `status` is in the order's `allowed_transitions`. */
  updateOrderStatus: async (id: number, status: OrderStatus) => normalizeOrder<AdminOrder>(await api.put<RawOrder<AdminOrder>>(`/admin/orders/${id}/status`, { status })),
}
