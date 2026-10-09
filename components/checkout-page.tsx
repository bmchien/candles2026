"use client"

import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import useSWR from "swr"
import { z } from "zod"
import { toast } from "sonner"
import { AlertCircle, CheckCircle2, LockKeyhole, MapPin, Store, Truck } from "lucide-react"
import {
  formatShippingAddress,
  getAddressErrorMessage,
  getProvinces,
  getStorePickupInformation,
  getWards,
  isVietnamesePhoneNumber,
  type ShippingAddress,
} from "@/services/address.service"
import { formatDateOnly, formatVnd, todayDateInput } from "@/lib/format"
import type { AdministrativeLocation, Cart, CheckoutInput } from "@/types/commerce"

const DESIRED_DATE_MAX_DAYS = 180

const checkoutSchema = z.object({
  name: z.string().trim().min(2, "Vui lòng nhập họ và tên."),
  phone: z.string().trim().refine(isVietnamesePhoneNumber, "Vui lòng nhập số điện thoại Việt Nam hợp lệ."),
  shippingMethod: z.enum(["PICKUP", "DELIVERY"]),
  // Same window as the backend (today … +180 days); the backend re-checks it in Vietnam time.
  desiredDate: z.string().min(1, "Vui lòng chọn ngày nhận mong muốn.").refine((v) => v >= todayDateInput() && v <= todayDateInput(DESIRED_DATE_MAX_DAYS), `Ngày nhận cần từ hôm nay đến tối đa ${DESIRED_DATE_MAX_DAYS} ngày tới.`),
  provinceCode: z.string().optional(),
  wardCode: z.string().optional(),
  detail: z.string().optional(),
}).superRefine((values, context) => {
  if (values.shippingMethod !== "DELIVERY") return

  if (!values.provinceCode) context.addIssue({ code: "custom", path: ["provinceCode"], message: "Vui lòng chọn tỉnh/thành phố." })
  if (!values.wardCode) context.addIssue({ code: "custom", path: ["wardCode"], message: "Vui lòng chọn phường/xã." })
  if (!values.detail?.trim()) context.addIssue({ code: "custom", path: ["detail"], message: "Vui lòng nhập địa chỉ chi tiết." })
})

type CheckoutFormValues = z.infer<typeof checkoutSchema>

interface CheckoutPageProps {
  cart: Cart
  defaultName?: string
  /** Sends the order to the backend; resolves when the request has finished. */
  onPlaceOrder: (order: CheckoutInput) => Promise<void>
}

const fieldClass = "h-11 w-full rounded-xl border border-border bg-white px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-muted/40"

function ErrorMessage({ children }: { children?: string }) {
  if (!children) return null
  return <span className="mt-1 block text-xs text-destructive">{children}</span>
}

function AddressLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive">
      <AlertCircle size={14} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">Thử tải lại</button>
    </div>
  )
}

export function CheckoutPage({ cart, defaultName = "", onPlaceOrder }: CheckoutPageProps) {
  const { register, handleSubmit, watch, setValue, clearErrors, formState: { errors, isSubmitting } } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { shippingMethod: "DELIVERY", name: defaultName, desiredDate: "", provinceCode: "", wardCode: "", detail: "" },
  })
  const shippingMethod = watch("shippingMethod")
  const provinceCode = watch("provinceCode") ?? ""
  const wardCode = watch("wardCode") ?? ""
  const { data: provinces, error: provincesError, isLoading: provincesLoading, mutate: retryProvinces } = useSWR<AdministrativeLocation[]>("checkout-vietnam-provinces", getProvinces)
  const { data: wards, error: wardsError, isLoading: wardsLoading, mutate: retryWards } = useSWR<AdministrativeLocation[]>(
    provinceCode ? ["checkout-vietnam-wards", provinceCode] as const : null,
    ([, selectedProvinceCode]: readonly [string, string]) => getWards(selectedProvinceCode),
  )
  // Prices and totals come from the backend cart; the order total is recalculated server-side.
  const items = cart.items
  const provinceField = register("provinceCode")

  const submitOrder = handleSubmit(async (values) => {
    let address: ShippingAddress | null = null

    if (values.shippingMethod === "DELIVERY") {
      const province = provinces?.find((item) => item.code === values.provinceCode)
      const ward = wards?.find((item) => item.code === values.wardCode)
      if (!province || !ward || !values.detail?.trim()) {
        toast.error("Vui lòng chọn đầy đủ địa chỉ nhận hàng.")
        return
      }
      address = {
        provinceCode: province.code,
        provinceName: province.name,
        wardCode: ward.code,
        wardName: ward.name,
        detail: values.detail.trim(),
      }
    }

    await onPlaceOrder({
      customerName: values.name.trim(),
      phone: values.phone.replace(/[\s.-]/g, ""),
      shippingMethod: values.shippingMethod,
      desiredDate: values.desiredDate,
      address,
    })
  })

  if (!items.length) {
    return (
      <main className="mx-auto max-w-[1120px] px-4 py-16 text-center sm:px-7 lg:px-10">
        <h1 className="font-serif text-3xl">Chưa có sản phẩm để thanh toán</h1>
        <p className="mt-3 text-sm text-muted-foreground">Hãy thêm món đồ yêu thích vào giỏ trước nhé.</p>
        <Link href="/products" className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Đến cửa hàng</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-[1120px] px-4 py-10 sm:px-7 lg:px-10">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-primary">Hoàn tất đơn hàng</p>
      <h1 className="mb-8 font-serif text-4xl">Sắp xong rồi.</h1>
      <form onSubmit={submitOrder} className="grid gap-8 lg:grid-cols-[1fr_370px]">
        <section className="rounded-2xl border border-border bg-white p-5 sm:p-7">
          <h2 className="font-serif text-2xl">Thông tin giao hàng</h2>
          <p className="mt-1 text-sm text-muted-foreground">Điền thông tin để chúng tôi chuẩn bị đơn hàng cho bạn.</p>

          <fieldset className="mt-6">
            <legend className="mb-3 text-sm font-semibold">Hình thức nhận hàng</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { value: "PICKUP", title: "Nhận hàng trực tiếp", description: "Nhận đơn hàng trực tiếp tại cửa hàng.", Icon: Store },
                { value: "DELIVERY", title: "Ship tận nhà", description: "Đơn hàng sẽ được giao đến địa chỉ của bạn.", Icon: Truck },
              ] as const).map(({ value, title, description, Icon }) => {
                const selected = shippingMethod === value
                return (
                  <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/30"}`}>
                    <input {...register("shippingMethod")} type="radio" value={value} className="mt-1 accent-primary" />
                    <Icon size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{title}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-sm font-semibold">Thông tin người nhận</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold">Họ và tên</span>
                <input {...register("name")} autoComplete="name" placeholder="Nguyễn An" className={fieldClass} aria-invalid={!!errors.name} />
                <ErrorMessage>{errors.name?.message}</ErrorMessage>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold">Số điện thoại</span>
                <input {...register("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="0900 000 000" className={fieldClass} aria-invalid={!!errors.phone} />
                <ErrorMessage>{errors.phone?.message}</ErrorMessage>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold">Ngày nhận mong muốn</span>
                <input {...register("desiredDate")} type="date" min={todayDateInput()} max={todayDateInput(DESIRED_DATE_MAX_DAYS)} className={fieldClass} aria-invalid={!!errors.desiredDate} />
                <span className="mt-1 block text-[11px] text-muted-foreground">Sản phẩm được làm thủ công; cửa hàng sẽ liên hệ xác nhận nếu cần đổi ngày.</span>
                <ErrorMessage>{errors.desiredDate?.message}</ErrorMessage>
              </label>
            </div>
          </div>

          {shippingMethod === "DELIVERY" ? (
            <div className="mt-6 border-t border-border pt-5">
              <h3 className="text-sm font-semibold">Địa chỉ nhận hàng</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold">Tỉnh / Thành phố</span>
                  <select
                    {...provinceField}
                    value={provinceCode}
                    onChange={(event) => {
                      provinceField.onChange(event)
                      setValue("wardCode", "", { shouldDirty: true })
                      clearErrors("wardCode")
                    }}
                    disabled={provincesLoading || !!provincesError}
                    className={fieldClass}
                    aria-invalid={!!errors.provinceCode}
                  >
                    <option value="">{provincesLoading ? "Đang tải tỉnh/thành phố..." : "Chọn tỉnh/thành phố"}</option>
                    {(provinces ?? []).map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}
                  </select>
                  <ErrorMessage>{errors.provinceCode?.message}</ErrorMessage>
                  {provincesError && <AddressLoadError message={getAddressErrorMessage(provincesError)} onRetry={() => { void retryProvinces() }} />}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold">Phường / Xã</span>
                  <select
                    {...register("wardCode")}
                    value={wardCode}
                    disabled={!provinceCode || wardsLoading || !!wardsError}
                    className={fieldClass}
                    aria-invalid={!!errors.wardCode}
                  >
                    <option value="">{wardsLoading ? "Đang tải phường/xã..." : "Chọn phường/xã"}</option>
                    {(wards ?? []).map((ward) => <option key={ward.code} value={ward.code}>{ward.name}</option>)}
                  </select>
                  <ErrorMessage>{errors.wardCode?.message}</ErrorMessage>
                  {wardsError && <AddressLoadError message={getAddressErrorMessage(wardsError)} onRetry={() => { void retryWards() }} />}
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold">Địa chỉ chi tiết</span>
                  <input {...register("detail")} autoComplete="street-address" placeholder="Số nhà, tên đường..." className={fieldClass} aria-invalid={!!errors.detail} />
                  <ErrorMessage>{errors.detail?.message}</ErrorMessage>
                </label>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-[#f5f6f2] p-4 text-sm leading-6">
              <MapPin size={17} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
              <div><p className="font-semibold">Nhận tại cửa hàng</p><p className="text-muted-foreground">{getStorePickupInformation()}</p></div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-2 rounded-xl bg-[#f5f6f2] p-4 text-xs leading-5 text-muted-foreground">
            <LockKeyhole size={15} className="shrink-0 text-primary" aria-hidden="true" />
            Thông tin của bạn chỉ được dùng để xử lý đơn hàng này.
          </div>
        </section>

        <aside className="h-fit rounded-2xl border border-border bg-white p-5 sm:p-6">
          <h2 className="font-serif text-xl">Đơn hàng của bạn</h2><Link href="/cart" className="mt-1 inline-block text-[11px] font-semibold text-primary">Sửa số lượng hoặc ghi chú trong giỏ hàng</Link>
          <div className="mt-4 flex flex-col gap-3">
            {items.map((item) => (
              <div key={item.product_id} className="flex items-center gap-3">
                <img src={item.product.image} alt="" className="size-12 rounded-lg object-cover" />
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{item.product.name}</p><p className="text-[11px] text-muted-foreground">Số lượng: {item.quantity}</p>{item.note && <p data-testid="checkout-item-note" className="mt-0.5 line-clamp-2 text-[11px] italic text-[#5c4a2e]">Ghi chú: {item.note}</p>}{!item.available && <p className="text-[11px] font-semibold text-destructive">Không còn khả dụng</p>}</div>
                <span className="text-xs font-medium">{formatVnd(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="my-4 border-t border-border" />
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tạm tính ({cart.total_quantity} món)</span><span>{formatVnd(cart.total)}</span></div>
          <div className="mt-2 flex justify-between text-sm"><span className="text-muted-foreground">Ngày nhận mong muốn</span><span>{formatDateOnly(watch("desiredDate"))}</span></div>
          <div className="mt-2 flex justify-between text-sm"><span className="text-muted-foreground">Hình thức nhận hàng</span><span>{shippingMethod === "PICKUP" ? "Nhận hàng trực tiếp" : "Ship tận nhà"}</span></div>
          {shippingMethod === "DELIVERY" ? (
            provinceCode && wardCode && watch("detail")?.trim() ? (
              <div className="mt-4 rounded-xl bg-muted/50 p-3 text-xs leading-5">
                <p className="mb-1 font-semibold">Địa chỉ nhận hàng</p>
                <p className="text-muted-foreground">{formatShippingAddress({
                  detail: watch("detail") ?? "",
                  wardName: wards?.find((ward) => ward.code === wardCode)?.name ?? "",
                  provinceName: provinces?.find((province) => province.code === provinceCode)?.name ?? "",
                })}</p>
              </div>
            ) : <p className="mt-3 text-xs text-muted-foreground">Địa chỉ nhận hàng sẽ hiển thị sau khi bạn chọn đầy đủ.</p>
          ) : (
            <div className="mt-4 rounded-xl bg-muted/50 p-3 text-xs leading-5"><p className="mb-1 font-semibold">Nhận tại cửa hàng</p><p className="text-muted-foreground">{getStorePickupInformation()}</p></div>
          )}
          <div className="my-4 border-t border-border" />
          <div className="flex justify-between font-semibold"><span>Tổng cộng</span><span>{formatVnd(cart.total)}</span></div>
          <button type="submit" disabled={isSubmitting || cart.has_unavailable_items} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? "Đang xử lý..." : <><CheckCircle2 size={16} aria-hidden="true" /> Đặt hàng</>}
          </button>
          <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">{cart.has_unavailable_items ? "Vui lòng xóa sản phẩm không còn khả dụng khỏi giỏ trước khi đặt hàng." : "Giá và tổng tiền được hệ thống xác nhận lại khi bạn đặt hàng."}</p>
        </aside>
      </form>
    </main>
  )
}
