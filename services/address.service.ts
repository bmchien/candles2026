import { api, formatApiError } from "@/lib/api/client"
import type { AdministrativeLocation, ShippingAddress, ShippingMethod } from "@/types/commerce"

export type { AdministrativeLocation, ShippingAddress, ShippingMethod } from "@/types/commerce"

const STORE_PICKUP_INFORMATION = "Cửa hàng Chipscendle · Nhân viên sẽ xác nhận địa chỉ và thời gian nhận hàng sau khi đặt đơn."

/** Vietnamese provinces (2-level structure since 07/2025), served and cached by the backend. */
export const getProvinces = () => api.get<AdministrativeLocation[]>("/address/provinces")

export const getWards = (provinceCode: string) => api.get<AdministrativeLocation[]>(`/address/provinces/${encodeURIComponent(provinceCode)}/wards`)

export function getAddressErrorMessage(error: unknown) {
  return formatApiError(error, "Đã có lỗi khi tải dữ liệu địa chỉ. Vui lòng thử lại.")
}

/** Same rule as the backend CreateOrderDto: 0xxxxxxxxx or +84xxxxxxxxx (9–10 digits after the prefix). */
export function isVietnamesePhoneNumber(phone: string) {
  return /^(0|\+84)\d{9,10}$/.test(phone.replace(/[\s.-]/g, ""))
}

export function getStorePickupInformation() {
  return STORE_PICKUP_INFORMATION
}

export function formatShippingAddress(address: Pick<ShippingAddress, "detail" | "wardName" | "provinceName">) {
  return [address.detail, address.wardName, address.provinceName].filter(Boolean).join(", ")
}
