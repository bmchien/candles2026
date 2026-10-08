import { readFileSync } from "node:fs"
import path from "node:path"
import type { APIRequestContext } from "@playwright/test"

export const API_URL = process.env.E2E_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
export const AUTH_DIR = path.join(__dirname, ".auth")
export const ADMIN_STATE = path.join(AUTH_DIR, "admin.json")
export const CUSTOMER_STATE = path.join(AUTH_DIR, "customer.json")
export const TOKEN_KEY = "chipscendle.access_token"

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name} to run the e2e tests (see playwright.config.ts).`)
  return value
}

/** Reads the JWT that the UI login stored in localStorage. */
export function tokenFromState(file: string): string {
  const state = JSON.parse(readFileSync(file, "utf8")) as { origins: { localStorage: { name: string; value: string }[] }[] }
  const token = state.origins.flatMap((o) => o.localStorage).find((item) => item.name === TOKEN_KEY)?.value
  if (!token) throw new Error(`No token in ${file}`)
  return token
}

interface Envelope<T> { success: boolean; data: T; code?: string; message?: string }

/** Thin client for arranging test data through the real backend API. */
export function backend(request: APIRequestContext, token?: string) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined
  const unwrap = async <T>(res: Awaited<ReturnType<APIRequestContext["get"]>>) => {
    const body = (await res.json()) as Envelope<T>
    if (!res.ok()) throw new Error(`${res.status()} ${body.code}: ${body.message}`)
    return body.data
  }
  return {
    get: async <T>(p: string) => unwrap<T>(await request.get(API_URL + p, { headers })),
    post: async <T>(p: string, data: unknown) => unwrap<T>(await request.post(API_URL + p, { headers, data })),
    put: async <T>(p: string, data: unknown) => unwrap<T>(await request.put(API_URL + p, { headers, data })),
    patch: async <T>(p: string, data: unknown) => unwrap<T>(await request.patch(API_URL + p, { headers, data })),
    delete: async <T>(p: string) => unwrap<T>(await request.delete(API_URL + p, { headers })),
  }
}

export interface ApiProduct { id: number; code: string; name: string; price: number; final_price: number; status: string; tags: { slug: string }[]; category: { id: number; slug: string } }
export interface ApiCategory { id: number; name: string; slug: string }

/** Local calendar day + n, YYYY-MM-DD (for <input type="date"> and desiredDate). */
export function inDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export const ddmmyyyy = (date: string) => date.split("-").reverse().join("/")

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase()

export const vnd = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value)

/** Creates an IN_STOCK product with a 10% discount in an existing category; returns it. */
export async function createTestProduct(request: APIRequestContext, adminToken: string, overrides: Record<string, unknown> = {}) {
  const api = backend(request, adminToken)
  const categories = await api.get<ApiCategory[]>("/categories")
  const code = `E2E-${uid()}`
  return api.post<ApiProduct>("/admin/products", {
    code,
    name: `E2E Nến thơm ${code}`,
    shortDescription: "Sản phẩm kiểm thử tự động",
    categoryId: categories[0].id,
    price: 300000,
    discountType: "PERCENT",
    discountValue: 10,
    status: "IN_STOCK",
    isActive: true,
    images: [{ url: "https://picsum.photos/seed/e2e-candle/800/800" }],
    ...overrides,
  })
}

export async function deleteProductsByPrefix(request: APIRequestContext, adminToken: string, prefix: string) {
  const api = backend(request, adminToken)
  const products = await api.get<ApiProduct[]>(`/admin/products?q=${encodeURIComponent(prefix)}&limit=100`)
  for (const p of products.filter((item) => item.code.startsWith(prefix))) await api.delete(`/admin/products/${p.id}`)
}
