import { api, resolveAssetUrl } from "@/lib/api/client"
import type { AdminScent, Scent, ScentInput, ScentType } from "@/types/commerce"

function normalizeScent<T extends Scent>(scent: T): T {
  return { ...scent, image_url: scent.image_url ? resolveAssetUrl(scent.image_url) : null }
}

export const scentService = {
  /** Showcase page: visible scents only (perfume first, then natural; by name). */
  list: async (type?: ScentType) => (await api.get<Scent[]>("/scents", { type })).map(normalizeScent),

  // ----- admin
  listAdmin: async () => (await api.get<AdminScent[]>("/admin/scents")).map(normalizeScent),
  create: async (input: ScentInput) => normalizeScent(await api.post<AdminScent>("/admin/scents", input)),
  /** Partial update; e.g. `{ isActive: false }` hides the scent. */
  update: async (id: number, input: Partial<ScentInput>) => normalizeScent(await api.put<AdminScent>(`/admin/scents/${id}`, input)),
  remove: (id: number) => api.delete<{ id: number; deleted: true }>(`/admin/scents/${id}`),
}
