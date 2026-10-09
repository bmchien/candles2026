import { api, getCartToken, hasAccessToken, resolveAssetUrl, setCartToken } from "@/lib/api/client"
import type { Cart, CartItem, CartMergeResult } from "@/types/commerce"

type RawCartItem = Omit<CartItem, "product"> & { product: Omit<CartItem["product"], "image"> & { image: string | null } }
type RawCart = Omit<Cart, "items"> & { items: RawCartItem[]; guest_token?: string }
type RawMergedCart = RawCart & { merge: CartMergeResult }

export const MAX_CART_ITEM_QUANTITY = 99
export const MAX_CART_NOTE_LENGTH = 500

const EMPTY_CART: Cart = { id: null, items: [], total_quantity: 0, total: 0, has_unavailable_items: false }

/** Strips transport details (guest token) and resolves image URLs. */
function normalizeCart({ guest_token: guestToken, ...cart }: RawCart): Cart {
  // A guest's first add creates a guest cart; keep its token for the next requests.
  if (guestToken) setCartToken(guestToken)
  return { ...cart, items: cart.items.map((item) => ({ ...item, product: { ...item.product, image: resolveAssetUrl(item.product.image) } })) }
}

/**
 * Every call returns the whole cart with server-computed prices and totals.
 * Logged in → the user's cart (Bearer JWT); guest → the guest cart (X-Cart-Token, added by the client).
 */
export const cartService = {
  get: async () => {
    // A guest who never added anything has no cart: no need to ask the server.
    if (!hasAccessToken() && !getCartToken()) return EMPTY_CART
    return normalizeCart(await api.get<RawCart>("/cart"))
  },
  /**
   * Adds to the quantity already in the cart. 409 PRODUCT_OUT_OF_STOCK for out-of-stock products.
   * A non-empty note is appended to the line's note (" | "); without one the existing note is kept.
   */
  add: async (productId: number, quantity = 1, note?: string) => {
    const trimmed = note?.trim()
    return normalizeCart(await api.post<RawCart>("/cart/items", { productId, quantity, ...(trimmed ? { note: trimmed } : {}) }))
  },
  setQuantity: async (productId: number, quantity: number) => normalizeCart(await api.put<RawCart>(`/cart/items/${productId}`, { quantity })),
  /** Saves the note of one line; an empty note removes it. */
  setNote: async (productId: number, note: string) => normalizeCart(await api.put<RawCart>(`/cart/items/${productId}`, { note: note.trim() || null })),
  remove: async (productId: number) => normalizeCart(await api.delete<RawCart>(`/cart/items/${productId}`)),
  clear: async () => normalizeCart(await api.delete<RawCart>("/cart")),
  hasGuestCart: () => getCartToken() !== null,
  /**
   * After login: moves the guest cart into the user's cart (requires the JWT). The guest cart
   * is deleted on the server, so the stored token is dropped.
   */
  mergeGuestCart: async () => {
    const { merge, ...cart } = await api.post<RawMergedCart>("/cart/merge")
    setCartToken(null)
    return { cart: normalizeCart(cart), merge }
  },
}
