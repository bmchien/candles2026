/**
 * Single HTTP client for the NestJS backend.
 *
 * Backend contract (see e-commerce-backend-development/README.md §10):
 *   success:   { success: true, data }            (lists add `pagination`)
 *   error:     { success: false, message, code, details? }
 *
 * Every service in /services goes through `api`; UI components never call fetch directly
 * and never see the raw envelope.
 */

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface Paged<T> {
  items: T[]
  pagination: Pagination
}

interface SuccessEnvelope<T> {
  success: true
  data: T
  pagination?: Pagination
}

interface ErrorEnvelope {
  success: false
  message?: string
  code?: string
  details?: unknown
}

export interface ValidationDetail {
  field: string
  errors: string[]
}

/** Vietnamese messages for backend error codes (src/common/exceptions/error-codes.ts). */
const CODE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng.",
  EMAIL_ALREADY_EXISTS: "Email này đã được đăng ký.",
  USER_NOT_FOUND: "Không tìm thấy tài khoản.",
  PRODUCT_NOT_FOUND: "Không tìm thấy sản phẩm.",
  SCENT_NOT_FOUND: "Không tìm thấy mùi hương.",
  SCENT_NAME_EXISTS: "Tên mùi hương đã tồn tại.",
  PRODUCT_CODE_EXISTS: "Mã sản phẩm đã tồn tại.",
  PRODUCT_INACTIVE: "Sản phẩm hiện không được bán.",
  PRODUCT_OUT_OF_STOCK: "Sản phẩm đã hết hàng.",
  INVALID_DISCOUNT: "Thông tin giảm giá không hợp lệ.",
  CATEGORY_NOT_FOUND: "Không tìm thấy danh mục.",
  CATEGORY_IN_USE: "Danh mục đang có sản phẩm, chưa thể xóa.",
  CATEGORY_SLUG_EXISTS: "Slug danh mục đã tồn tại.",
  TAG_NOT_FOUND: "Không tìm thấy thẻ sản phẩm.",
  TAG_EXISTS: "Tên hoặc slug của thẻ đã tồn tại.",
  IMAGE_NOT_FOUND: "Không tìm thấy ảnh.",
  INVALID_FILE: "Tệp tải lên không hợp lệ.",
  CART_ITEM_NOT_FOUND: "Sản phẩm không có trong giỏ hàng.",
  CART_EMPTY: "Giỏ hàng đang trống.",
  CART_HAS_UNAVAILABLE_ITEMS: "Một số sản phẩm trong giỏ đã hết hàng hoặc ngừng bán. Vui lòng kiểm tra lại giỏ hàng.",
  ORDER_NOT_FOUND: "Không tìm thấy đơn hàng.",
  INVALID_SHIPPING_ADDRESS: "Địa chỉ nhận hàng không hợp lệ.",
  INVALID_STATUS_TRANSITION: "Không thể chuyển đơn hàng sang trạng thái này.",
  INVALID_DESIRED_DATE: "Ngày nhận mong muốn không hợp lệ (từ hôm nay đến tối đa 180 ngày).",
  EXPORT_TOO_LARGE: "Có quá nhiều đơn hàng để xuất. Vui lòng thu hẹp khoảng ngày hoặc trạng thái.",
  PROVINCE_NOT_FOUND: "Không tìm thấy tỉnh/thành phố.",
  ADDRESS_PROVIDER_ERROR: "Không thể tải dữ liệu địa chỉ. Vui lòng thử lại.",
  PAYLOAD_TOO_LARGE: "Tệp vượt quá dung lượng cho phép.",
  TOO_MANY_REQUESTS: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "Dữ liệu gửi lên chưa hợp lệ.",
  401: "Phiên đăng nhập đã hết hạn.",
  403: "Bạn không có quyền thực hiện thao tác này.",
  404: "Không tìm thấy dữ liệu yêu cầu.",
  409: "Thao tác không thể thực hiện do dữ liệu đã tồn tại.",
  413: "Tệp vượt quá dung lượng cho phép.",
  422: "Dữ liệu gửi lên chưa hợp lệ.",
  429: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
}

const SERVER_ERROR_MESSAGE = "Có lỗi xảy ra từ máy chủ. Vui lòng thử lại."
const NETWORK_ERROR_MESSAGE = "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối và thử lại."

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = "ApiError"
  }

  get validationDetails(): ValidationDetail[] {
    return Array.isArray(this.details) && this.code === "VALIDATION_ERROR" ? (this.details as ValidationDetail[]) : []
  }
}

function toApiError(status: number, body: ErrorEnvelope | null): ApiError {
  const code = body?.code
  if (code === "VALIDATION_ERROR" && Array.isArray(body?.details) && body.details.length) {
    const fields = [...new Set((body.details as ValidationDetail[]).map((d) => d.field))]
    return new ApiError(`Dữ liệu chưa hợp lệ: ${fields.join(", ")}.`, status, code, body.details)
  }
  const message =
    (code && CODE_MESSAGES[code]) ??
    (status >= 500 ? SERVER_ERROR_MESSAGE : STATUS_MESSAGES[status] ?? "Không thể hoàn tất yêu cầu. Vui lòng thử lại.")
  return new ApiError(message, status, code, body?.details)
}

// ------------------------------------------------------------------ auth token

const TOKEN_KEY = "chipscendle.access_token"
let accessToken: string | null = null
let unauthorizedHandler: (() => void) | null = null

function storages(): Storage[] {
  try {
    return typeof window === "undefined" ? [] : [window.localStorage, window.sessionStorage]
  } catch {
    return []
  }
}

/** Reads a token saved by a previous visit (localStorage = "remember me", sessionStorage otherwise). */
export function loadStoredToken(): string | null {
  for (const storage of storages()) {
    try {
      const token = storage.getItem(TOKEN_KEY)
      if (token) return (accessToken = token)
    } catch {
      // storage blocked: stay logged out
    }
  }
  return null
}

export function setAccessToken(token: string | null, remember = true) {
  accessToken = token
  const [local, session] = storages()
  try {
    local?.removeItem(TOKEN_KEY)
    session?.removeItem(TOKEN_KEY)
    if (token) (remember ? local : session)?.setItem(TOKEN_KEY, token)
  } catch {
    // storage blocked: the token still lives in memory for this tab
  }
}

export const hasAccessToken = () => accessToken !== null

// ------------------------------------------------------------------ guest cart token

const CART_TOKEN_KEY = "chipscendle.cart_token"

/** Token of the guest cart (issued by POST /cart/items), sent as X-Cart-Token on /cart requests. */
export function getCartToken(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(CART_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setCartToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(CART_TOKEN_KEY, token)
    else window.localStorage.removeItem(CART_TOKEN_KEY)
  } catch {
    // storage blocked: the guest cart lasts until the page is closed
  }
}

/** Called when an authenticated request is rejected with 401 (expired / revoked token). */
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

// ------------------------------------------------------------------ requests

type Query = Record<string, string | number | boolean | undefined | null>

export function toQueryString(values: Query) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
  })
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  query?: Query
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<SuccessEnvelope<T>> {
  if (!API_URL) throw new ApiError("Chưa cấu hình NEXT_PUBLIC_API_URL.", 0)
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData
  const sentToken = accessToken
  const cartToken = path.startsWith("/cart") ? getCartToken() : null
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}${options.query ? toQueryString(options.query) : ""}`, {
      method: options.method ?? "GET",
      signal: options.signal,
      // Public catalog responses carry `Cache-Control: max-age` + ETag. Always revalidate
      // (cheap 304 when unchanged) so admin edits and stock changes show up immediately.
      cache: "no-cache",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
        ...(sentToken ? { Authorization: `Bearer ${sentToken}` } : {}),
        ...(cartToken ? { "X-Cart-Token": cartToken } : {}),
      },
      body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0)
  }

  let body: SuccessEnvelope<T> | ErrorEnvelope | null = null
  try {
    body = (await response.json()) as SuccessEnvelope<T> | ErrorEnvelope
  } catch {
    body = null
  }

  if (!response.ok || !body || body.success !== true) {
    const error = toApiError(response.status || 500, body && body.success === false ? body : null)
    // A 401 on a request that carried a token means the session is no longer valid.
    if (response.status === 401 && sentToken && sentToken === accessToken) unauthorizedHandler?.()
    throw error
  }
  return body
}

/**
 * Downloads a file endpoint (non-JSON success response). Errors still come back as the JSON
 * error envelope and are turned into ApiError. The filename comes from Content-Disposition.
 */
async function download(path: string, query: Query | undefined, fallbackName: string): Promise<{ blob: Blob; filename: string }> {
  if (!API_URL) throw new ApiError("Chưa cấu hình NEXT_PUBLIC_API_URL.", 0)
  const sentToken = accessToken
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}${query ? toQueryString(query) : ""}`, {
      cache: "no-store",
      headers: sentToken ? { Authorization: `Bearer ${sentToken}` } : {},
    })
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0)
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorEnvelope | null
    if (response.status === 401 && sentToken && sentToken === accessToken) unauthorizedHandler?.()
    throw toApiError(response.status, body && body.success === false ? body : null)
  }
  const disposition = response.headers.get("Content-Disposition") ?? ""
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? fallbackName
  return { blob: await response.blob(), filename }
}

/** Saves a downloaded file in the browser. */
export function saveFile({ blob, filename }: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const api = {
  get: async <T>(path: string, query?: Query, signal?: AbortSignal) => (await request<T>(path, { query, signal })).data,
  getPaged: async <T>(path: string, query?: Query): Promise<Paged<T>> => {
    const body = await request<T[]>(path, { query })
    return { items: body.data, pagination: body.pagination ?? { page: 1, limit: body.data.length, total: body.data.length, totalPages: 1 } }
  },
  post: async <T>(path: string, body?: unknown) => (await request<T>(path, { method: "POST", body: body ?? {} })).data,
  put: async <T>(path: string, body?: unknown) => (await request<T>(path, { method: "PUT", body: body ?? {} })).data,
  patch: async <T>(path: string, body?: unknown) => (await request<T>(path, { method: "PATCH", body: body ?? {} })).data,
  delete: async <T>(path: string) => (await request<T>(path, { method: "DELETE" })).data,
  upload: async <T>(path: string, form: FormData) => (await request<T>(path, { method: "POST", body: form })).data,
  download,
}

/** Image URLs are external http(s) links; missing images fall back to a placeholder. */
export function resolveAssetUrl(url: string | null | undefined): string {
  return url || "/placeholder.svg"
}

/** User-facing message for any thrown value. Never exposes raw server output. */
export function formatApiError(error: unknown, fallback = "Đã có lỗi xảy ra. Vui lòng thử lại.") {
  if (error instanceof ApiError) return error.message
  return fallback
}

export function isApiError(error: unknown, status?: number, code?: string): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status) && (code === undefined || error.code === code)
}
