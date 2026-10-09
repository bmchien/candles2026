import { api, resolveAssetUrl, type Paged } from "@/lib/api/client"
import type { Product, ProductFilters } from "@/types/commerce"

/** Missing images fall back to a placeholder. */
export function normalizeProduct<T extends Product>(product: T): T {
  return { ...product, images: product.images.map((image) => ({ ...image, url: resolveAssetUrl(image.url) })) }
}

export const productService = {
  list: async (filters: ProductFilters = {}): Promise<Paged<Product>> => {
    const page = await api.getPaged<Product>("/products", { ...filters })
    return { ...page, items: page.items.map(normalizeProduct) }
  },
  /** 404 (PRODUCT_NOT_FOUND) for missing *and* inactive products. */
  byCode: async (code: string) => normalizeProduct(await api.get<Product>(`/products/${encodeURIComponent(code)}`)),
}
