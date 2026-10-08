import { api } from "@/lib/api/client"
import type { Category } from "@/types/commerce"

export interface NameSlugInput {
  name: string
  slug?: string
}

export const categoryService = {
  list: () => api.get<Category[]>("/categories"),
  create: (input: NameSlugInput) => api.post<Category>("/admin/categories", input),
  update: (id: number, input: Partial<NameSlugInput>) => api.put<Category>(`/admin/categories/${id}`, input),
  /** 409 CATEGORY_IN_USE while products still use the category. */
  remove: (id: number) => api.delete<{ id: number; deleted: true }>(`/admin/categories/${id}`),
}
