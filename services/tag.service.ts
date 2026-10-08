import { api } from "@/lib/api/client"
import type { NameSlugInput } from "@/services/category.service"
import type { Tag } from "@/types/commerce"

export const tagService = {
  list: () => api.get<Tag[]>("/tags"),
  create: (input: NameSlugInput) => api.post<Tag>("/admin/tags", input),
  update: (id: number, input: Partial<NameSlugInput>) => api.put<Tag>(`/admin/tags/${id}`, input),
  /** Detaches the tag from every product. */
  remove: (id: number) => api.delete<{ id: number; deleted: true }>(`/admin/tags/${id}`),
}
