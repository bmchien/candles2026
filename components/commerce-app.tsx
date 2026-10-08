"use client"

import Image from "next/image"
import { CheckoutPage as CheckoutFormPage } from "@/components/checkout-page"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast, Toaster } from "sonner"
import useSWR, { SWRConfig, useSWRConfig } from "swr"
import {
  AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Box, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList,
  Download, Eye, FileSpreadsheet, Filter, Flower2, Heart, Home, ImagePlus, LayoutDashboard,
  LockKeyhole, LogOut, Menu, Minus, Package, Pencil, Plus, Search, ShieldCheck,
  ShoppingBag, ShoppingCart, SlidersHorizontal, Sparkles, Tag, Trash2, Truck, UserRound,
  X, Zap,
} from "lucide-react"
import { ApiError, formatApiError, isApiError, saveFile } from "@/lib/api/client"
import {
  discountLabel, formatCompactVnd, formatDate, formatDateOnly, formatDateTime, formatOrderAddress, formatOrderCode, formatVnd,
  makeSlug, ORDER_STATUSES, orderStatusLabel, scentTypeLabel, orderStatusTone, productStatusLabel, productStatusTone, shippingMethodLabel,
} from "@/lib/format"
import { CATEGORIES_KEY, TAGS_KEY, useCategories, useTags } from "@/hooks/use-catalog"
import { useSession } from "@/hooks/use-session"
import { adminService } from "@/services/admin.service"
import { authService } from "@/services/auth.service"
import { cartService, MAX_CART_ITEM_QUANTITY } from "@/services/cart.service"
import { categoryService } from "@/services/category.service"
import { orderService } from "@/services/order.service"
import { productService } from "@/services/product.service"
import { scentService } from "@/services/scent.service"
import { tagService } from "@/services/tag.service"
import type {
  AdminOrder, AdminProduct, AdminProductFilters, AdminScent, AuthResult, Cart, Category, CheckoutInput, DiscountType,
  ImportSummary, OrderStatus, Product, ProductFilters, ProductInput, ProductSort, ProductStatus, ScentType, Tag as ProductTag, User,
} from "@/types/commerce"

const buttonBase = "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50"
const buttonPrimary = `${buttonBase} bg-primary text-primary-foreground hover:bg-primary/90`
const buttonOutline = `${buttonBase} border border-border bg-white text-foreground hover:bg-muted`
const buttonQuiet = `${buttonBase} text-muted-foreground hover:bg-muted hover:text-foreground`
const fieldClass = "h-11 w-full rounded-xl border border-border bg-white px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
const areaClass = "min-h-28 w-full rounded-xl border border-border bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
const compactButton = "inline-flex size-9 items-center justify-center rounded-full border border-border bg-white text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
const adminNav = [
  { label: "Tổng quan", href: "/admin", icon: LayoutDashboard },
  { label: "Sản phẩm", href: "/admin/products", icon: Package },
  { label: "Danh mục", href: "/admin/categories", icon: Box },
  { label: "Thẻ sản phẩm", href: "/admin/tags", icon: Tag },
  { label: "Mùi hương", href: "/admin/scents", icon: Flower2 },
  { label: "Đơn hàng", href: "/admin/orders", icon: ClipboardList },
]
const DASHBOARD_KEY = "admin-dashboard"
const LISTING_PAGE_SIZE = 8
const ADMIN_PAGE_SIZE = 20

type Navigate = (href: string) => void

/** SWR key of the current cart: the user's server cart, or the guest cart (X-Cart-Token). */
const cartKeyFor = (user: User | null) => (user ? ["cart", user.id] : ["cart", "guest"]) as readonly ["cart", number | "guest"]

/** Only same-site relative paths are accepted as post-login redirects. */
const safeNext = (value: string | null) => (value && value.startsWith("/") && !value.startsWith("//") ? value : null)

function Logo({ onClick }: { admin?: boolean; onClick?: () => void }) {
  return <button onClick={onClick} className="flex items-center gap-2.5 text-left" aria-label="Chipscendle — về trang chủ">
    {/* 192px export of public/logobg.png (transparent edges trimmed) */}
    <img src="/logo.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-full" />
    <span className="leading-tight"><span className="block font-serif text-[18px] font-semibold tracking-tight">Chipscendle</span><span className="block text-[9px] uppercase tracking-[.12em] text-muted-foreground">A scent a day keeps the stress away</span></span>
  </button>
}

function StatusPill({ children, tone = "bg-emerald-50 text-emerald-800" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}><span className="size-1.5 rounded-full bg-current opacity-70" />{children}</span>
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div>{eyebrow && <p className="mb-2 text-[11px] font-bold uppercase tracking-[.22em] text-primary">{eyebrow}</p>}<h2 className="font-serif text-3xl font-medium tracking-tight sm:text-[38px]">{title}</h2>{description && <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>{action}</div>
}

/** Skeleton shown while an API request is in flight. */
function LoadingGrid({ count = 4, label = "Đang tải dữ liệu" }: { count?: number; label?: string }) {
  return <div aria-label={label} aria-busy="true" className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">{Array.from({ length: count }, (_, index) => <div key={index} className="animate-pulse"><div className="aspect-[.88] rounded-2xl bg-muted" /><div className="mt-3 h-3 w-2/3 rounded bg-muted" /><div className="mt-2 h-3 w-1/2 rounded bg-muted" /></div>)}</div>
}

function LoadingBlock({ label = "Đang tải dữ liệu..." }: { label?: string }) {
  return <div role="status" aria-busy="true" className="flex min-h-48 items-center justify-center rounded-2xl border border-border bg-white p-8 text-sm text-muted-foreground"><span className="mr-2 size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />{label}</div>
}

/** Error state for failed API requests: never a blank screen, always a retry. */
function ErrorState({ error, onRetry, title = "Không thể tải dữ liệu" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return <div role="alert" className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center"><AlertCircle className="mb-2 text-rose-700" size={22} /><p className="font-medium text-rose-900">{title}</p><p className="mt-1 text-sm text-rose-800">{formatApiError(error)}</p>{onRetry && <button onClick={onRetry} className={`${buttonOutline} mt-4`}>Thử lại</button>}</div>
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  return <div className="mt-8 flex items-center justify-center gap-2"><button className={compactButton} aria-label="Trang trước" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} /></button>{Array.from({ length: totalPages }, (_, i) => <button key={i} onClick={() => onChange(i + 1)} aria-current={page === i + 1 ? "page" : undefined} className={`size-9 rounded-full text-xs font-semibold ${page === i + 1 ? "bg-primary text-white" : "hover:bg-muted"}`}>{i + 1}</button>)}<button className={compactButton} aria-label="Trang sau" disabled={page >= totalPages} onClick={() => onChange(page + 1)}><ChevronRight size={16} /></button></div>
}

function ProductCard({ product, onAdd, onOpen }: { product: Product; onAdd: (product: Product) => void; onOpen: (product: Product) => void }) {
  const sale = discountLabel(product)
  const outOfStock = product.status === "OUT_OF_STOCK"
  return <article className="group min-w-0" data-testid="product-card" data-product-code={product.code}>
    <div className="relative mb-3 aspect-[.88] overflow-hidden rounded-2xl bg-[#f0efeb]">
      <button onClick={() => onOpen(product)} className="absolute inset-0 z-0" aria-label={`Xem ${product.name}`}>
        <img src={product.images[0]?.url ?? "/placeholder.svg"} alt={product.name} loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
      </button>
      {sale && <span className="absolute left-3 top-3 z-[1] rounded-full bg-[#f4e3db] px-2.5 py-1 text-[10px] font-bold text-[#9f4c32]">{sale}</span>}
      {outOfStock && <span className="absolute bottom-3 left-3 z-[1] rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Hết hàng</span>}
      <button onClick={() => toast.success("Đã lưu sản phẩm yêu thích")} className="absolute right-3 top-3 z-[1] flex size-9 items-center justify-center rounded-full bg-white/90 text-foreground transition hover:bg-white" aria-label="Lưu yêu thích"><Heart size={16} /></button>
      <button onClick={() => onAdd(product)} disabled={outOfStock} className="absolute bottom-3 right-3 z-[1] flex size-10 items-center justify-center rounded-full bg-white text-primary shadow-sm transition hover:bg-primary hover:text-white disabled:opacity-50" aria-label={`Thêm ${product.name} vào giỏ`}><Plus size={17} /></button>
    </div>
    <button onClick={() => onOpen(product)} className="block w-full text-left">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{product.category.name} · {product.code}</p>
      <h3 className="truncate text-[14px] font-medium leading-5 group-hover:text-primary">{product.name}</h3>
      <p className="mt-1 truncate text-xs text-muted-foreground">{product.short_description}</p>
      <div className="mt-2 flex items-center gap-2"><span className="text-sm font-semibold" data-testid="final-price">{formatVnd(product.final_price)}</span>{product.final_price < product.price && <span className="text-xs text-muted-foreground line-through" data-testid="original-price">{formatVnd(product.price)}</span>}</div>
    </button>
  </article>
}

function ProductsMenu({ onSelect, itemClass }: { onSelect: (href: string) => void; itemClass: string }) {
  const { data: categories, error: categoriesError } = useCategories()
  const { data: tags, error: tagsError } = useTags()
  return <>
    <button role="menuitem" className={itemClass} onClick={() => onSelect("/products")}>Tất cả sản phẩm</button>
    <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Danh mục</p>
    {categoriesError ? <p className="px-3 py-1 text-xs text-destructive">Không tải được danh mục</p> : !categories ? <p className="px-3 py-1 text-xs text-muted-foreground">Đang tải...</p> : categories.map((category) => <button key={category.id} role="menuitem" className={itemClass} onClick={() => onSelect(`/products?category=${encodeURIComponent(category.slug)}`)}>{category.name}</button>)}
    <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Thẻ sản phẩm</p>
    {tagsError ? <p className="px-3 py-1 text-xs text-destructive">Không tải được thẻ</p> : !tags ? <p className="px-3 py-1 text-xs text-muted-foreground">Đang tải...</p> : tags.map((tag) => <button key={tag.id} role="menuitem" className={itemClass} onClick={() => onSelect(`/products?tag=${encodeURIComponent(tag.slug)}`)}>{tag.name}</button>)}
  </>
}

function SiteHeader({ count, user, onNavigate, onLogout }: { count: number; user: User | null; onNavigate: Navigate; onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [productsMenuOpen, setProductsMenuOpen] = useState(false)
  const [mobileProductsOpen, setMobileProductsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const submitSearch = (event: React.FormEvent) => { event.preventDefault(); onNavigate(`/products?q=${encodeURIComponent(search.trim())}`); setMenuOpen(false) }
  return <>
    <div className="bg-primary px-4 py-2 text-center text-[10px] font-medium tracking-wide text-white sm:text-xs">Một món quà nhỏ cho ngày thường</div>
    <header className="sticky top-0 z-40 border-b border-border/80 bg-[#fbfaf8]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between gap-5 px-4 sm:px-7 lg:px-10">
        <Logo onClick={() => onNavigate("/")} />
        <nav className="hidden items-center gap-7 text-[13px] font-medium text-muted-foreground lg:flex" aria-label="Điều hướng chính">
          <button onClick={() => onNavigate("/products")}>Tất cả sản phẩm</button>
          <div className="relative" onMouseEnter={() => setProductsMenuOpen(true)} onMouseLeave={() => setProductsMenuOpen(false)}>
            <button type="button" aria-haspopup="true" aria-expanded={productsMenuOpen} onClick={() => setProductsMenuOpen((open) => !open)}>Sản phẩm</button>
            {productsMenuOpen && <div className="absolute left-0 top-full z-50 max-h-[70vh] min-w-56 overflow-auto rounded-xl border border-border bg-[#fbfaf8] p-2 shadow-lg" role="menu">
              <ProductsMenu itemClass="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onSelect={(href) => { onNavigate(href); setProductsMenuOpen(false) }} />
            </div>}
          </div>
          <button onClick={() => onNavigate("/scents")}>Mùi hương</button><button onClick={() => onNavigate("/products?on_sale=true")}>Ưu đãi</button><button onClick={() => onNavigate("/orders")}>Đơn hàng</button>
        </nav>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <form onSubmit={submitSearch} className="hidden h-10 items-center gap-2 rounded-full border border-border bg-white px-3.5 md:flex"><Search size={15} className="text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm sản phẩm" placeholder="Tìm kiếm..." className="w-40 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70 lg:w-48" /><button type="submit" className="sr-only">Tìm kiếm</button></form>
          <button onClick={() => onNavigate(user ? (user.role === "ADMIN" ? "/admin" : "/orders") : "/login")} className="hidden size-10 items-center justify-center rounded-full border border-border bg-white text-muted-foreground hover:text-primary sm:flex" aria-label={user ? `Tài khoản ${user.name}` : "Đăng nhập"} title={user?.name}><UserRound size={17} /></button>
          {user && <button onClick={onLogout} className="hidden size-10 items-center justify-center rounded-full border border-border bg-white text-muted-foreground hover:text-destructive sm:flex" aria-label="Đăng xuất"><LogOut size={16} /></button>}
          <button onClick={() => onNavigate("/cart")} className="relative flex size-10 items-center justify-center rounded-full bg-primary text-white" aria-label={`Giỏ hàng có ${count} sản phẩm`}><ShoppingBag size={17} />{count > 0 && <span data-testid="cart-count" className="absolute -right-1 -top-1 flex size-[18px] items-center justify-center rounded-full border-2 border-[#fbfaf8] bg-[#d88b65] text-[9px] font-bold text-white">{count}</span>}</button>
          <button onClick={() => setMenuOpen(!menuOpen)} className="flex size-10 items-center justify-center rounded-full border border-border lg:hidden" aria-label={menuOpen ? "Đóng menu" : "Mở menu"}>{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
      </div>
      {menuOpen && <div className="border-t border-border bg-[#fbfaf8] px-4 py-4 lg:hidden"><form onSubmit={submitSearch} className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm sản phẩm" className="w-full bg-transparent text-sm outline-none" /></form><div className="grid gap-1 text-sm"><button className="rounded-lg px-3 py-2.5 text-left" onClick={() => { onNavigate("/products"); setMenuOpen(false) }}>Tất cả sản phẩm</button><button type="button" aria-expanded={mobileProductsOpen} onClick={() => setMobileProductsOpen((open) => !open)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left">Sản phẩm<ChevronDown size={15} className={mobileProductsOpen ? "rotate-180 transition-transform" : "transition-transform"} /></button>{mobileProductsOpen && <div className="ml-3 grid gap-1 border-l border-border pl-2"><ProductsMenu itemClass="rounded-lg px-3 py-2 text-left" onSelect={(href) => { onNavigate(href); setMenuOpen(false) }} /></div>}<button className="rounded-lg px-3 py-2.5 text-left" onClick={() => { onNavigate("/scents"); setMenuOpen(false) }}>Mùi hương</button><button className="rounded-lg px-3 py-2.5 text-left" onClick={() => { onNavigate("/products?on_sale=true"); setMenuOpen(false) }}>Ưu đãi</button><button className="rounded-lg px-3 py-2.5 text-left" onClick={() => { onNavigate(user ? "/orders" : "/login"); setMenuOpen(false) }}>Tài khoản & đơn hàng</button>{user && <button className="rounded-lg px-3 py-2.5 text-left text-destructive" onClick={() => { onLogout(); setMenuOpen(false) }}>Đăng xuất</button>}</div></div>}
    </header>
  </>
}

function SiteFooter({ onNavigate }: { onNavigate: Navigate }) {
  return <footer className="mt-20 bg-[#e9eee8] px-5 py-12 sm:px-8"><div className="mx-auto grid max-w-[1250px] gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]"><div><Logo onClick={() => onNavigate("/")} /><p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">Những chiếc nến thơm được làm thủ công bằng sự chăm chút, để mỗi ngày bình thường cũng thơm dịu và thư thái hơn.</p></div><div><p className="mb-3 text-xs font-bold uppercase tracking-widest">Khám phá</p><div className="grid gap-2.5 text-sm text-muted-foreground"><button className="text-left" onClick={() => onNavigate("/products")}>Tất cả sản phẩm</button><button className="text-left" onClick={() => onNavigate("/scents")}>Mùi hương</button><button className="text-left" onClick={() => onNavigate("/products?on_sale=true")}>Đang ưu đãi</button><button className="text-left" onClick={() => onNavigate("/orders")}>Theo dõi đơn hàng</button></div></div><div><p className="mb-3 text-xs font-bold uppercase tracking-widest">Chăm sóc</p><div className="grid gap-2.5 text-sm text-muted-foreground"><span>Giao hàng & đổi trả</span><span>Hướng dẫn dùng nến</span><span>Liên hệ với chúng tôi</span></div></div><div><p className="mb-3 text-xs font-bold uppercase tracking-widest">Mùi hương mới mỗi mùa</p><p className="mb-3 text-sm text-muted-foreground">Nhận tin về mùi hương mới và ưu đãi sớm nhất.</p><form onSubmit={(e) => { e.preventDefault(); toast.success("Cảm ơn bạn đã đăng ký nhận tin!") }} className="flex rounded-full border border-border bg-white p-1"><input aria-label="Email nhận tin" type="email" required placeholder="Địa chỉ email" className="min-w-0 flex-1 bg-transparent px-3 text-xs outline-none" /><button aria-label="Đăng ký nhận tin" className="flex size-9 items-center justify-center rounded-full bg-primary text-white"><ArrowRight size={15} /></button></form></div></div><div className="mx-auto mt-10 max-w-[1250px] border-t border-border/80 pt-5 text-xs text-muted-foreground">© 2026 Chipscendle. Nến thơm làm thủ công tại Việt Nam.</div></footer>
}

function ProductGrid({ items, onAdd, onOpen, empty = "Chưa tìm thấy sản phẩm phù hợp." }: { items: Product[]; onAdd: (p: Product) => void; onOpen: (p: Product) => void; empty?: string }) {
  if (!items.length) return <div className="col-span-full flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-white p-8 text-center"><ShoppingBag className="mb-3 text-primary/60" /><p className="font-medium">{empty}</p><p className="mt-1 text-sm text-muted-foreground">Hãy thử thay đổi bộ lọc hoặc quay lại sau nhé.</p></div>
  return <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">{items.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} onOpen={onOpen} />)}</div>
}

/** Product list section backed by GET /products with loading / empty / error states. */
function RemoteProductGrid({ filters, onAdd, onOpen, empty }: { filters: ProductFilters; onAdd: (p: Product) => void; onOpen: (p: Product) => void; empty?: string }) {
  const { data, error, isLoading, mutate } = useSWR(["products", filters], () => productService.list(filters))
  if (error) return <ErrorState error={error} onRetry={() => void mutate()} />
  if (isLoading || !data) return <LoadingGrid count={filters.limit ?? 4} />
  return <ProductGrid items={data.items} onAdd={onAdd} onOpen={onOpen} empty={empty} />
}

function HomePage({ onAdd, onOpen, onNavigate }: { onAdd: (p: Product) => void; onOpen: (p: Product) => void; onNavigate: Navigate }) {
  const { data: categories, error: categoriesError, mutate: retryCategories } = useCategories()
  const { data: sale } = useSWR(["products", { on_sale: true, limit: 4 }], () => productService.list({ on_sale: true, limit: 4 }))
  return <>
    <section className="mx-auto max-w-[1320px] px-4 pt-5 sm:px-7 lg:px-10 lg:pt-8"><div className="relative min-h-[520px] overflow-hidden rounded-[28px] bg-[#ece8df] sm:min-h-[570px] lg:min-h-[600px]">
      <Image src="/images/hero-still-life.png" alt="Góc nhà ấm áp với những chiếc nến thơm Chipscendle" fill priority sizes="(max-width: 768px) 100vw, 1280px" className="object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#f3eee5]/95 via-[#f3eee5]/75 to-transparent sm:via-[#f3eee5]/55" />
      <div className="relative flex min-h-[520px] max-w-[590px] flex-col justify-center px-7 py-12 sm:min-h-[570px] sm:px-12 lg:min-h-[600px] lg:px-16"><p className="mb-5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] text-primary"><span className="size-1.5 rounded-full bg-primary" /> Nến thơm Handmade</p><h1 className="max-w-[540px] font-serif text-[46px] font-medium leading-[1.08] tracking-[-.045em] text-[#253b32] sm:text-[62px] lg:text-[70px]">Những điều dịu dàng, cho mỗi ngày.</h1><p className="mt-5 max-w-[390px] text-sm leading-7 text-[#56645b] sm:text-base">Nến thơm thủ công với màu sắc, hình dáng và mùi hương dành cho từng khoảnh khắc: để thư giãn, để tặng, hay chỉ để căn phòng thêm ấm.</p><div className="mt-8 flex flex-wrap gap-3"><button className={buttonPrimary} onClick={() => onNavigate("/products")}>Khám phá bộ sưu tập <ArrowRight size={16} /></button><button className={`${buttonBase} border border-[#405447]/20 bg-white/50 text-[#35483d] hover:bg-white`} onClick={() => onNavigate("/products?on_sale=true")}>Xem ưu đãi</button></div><div className="mt-10 flex items-center gap-5 text-xs text-[#536258]"><span className="flex items-center gap-1.5"><Truck size={15} /> Giao hàng toàn quốc</span></div></div><div className="absolute bottom-6 right-7 hidden items-center gap-2 rounded-full border border-white/50 bg-white/50 px-4 py-2 text-[10px] font-medium tracking-wide text-[#4f5f54] backdrop-blur sm:flex">Quà tặng 20/10 <ArrowUpRight size={13} /></div>
    </div></section>
    <section className="mx-auto max-w-[1250px] px-4 py-16 sm:px-7 lg:px-10"><SectionHeading eyebrow="Chọn theo cảm hứng" title="Mỗi mùi hương, một tâm trạng." description="Từ hương hoa dịu nhẹ đến hương gỗ ấm áp, hãy chọn chiếc nến hợp với không gian và cảm xúc của bạn." />{categoriesError ? <ErrorState error={categoriesError} onRetry={() => void retryCategories()} /> : !categories ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="min-h-36 animate-pulse rounded-2xl bg-muted" />)}</div> : <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{categories.map((category, i) => <button key={category.id} onClick={() => onNavigate(`/products?category=${encodeURIComponent(category.slug)}`)} className={`group flex min-h-36 flex-col justify-between rounded-2xl p-5 text-left transition hover:-translate-y-0.5 ${["bg-[#e9eee8]", "bg-[#f1e8dd]", "bg-[#eeeaf1]", "bg-[#e8eef0]"][i % 4]}`}><span className="flex size-10 items-center justify-center rounded-full bg-white/75 text-primary">{i % 4 === 0 ? <ShoppingCart size={18} /> : i % 4 === 1 ? <Home size={18} /> : i % 4 === 2 ? <Sparkles size={18} /> : <Zap size={18} />}</span><span className="flex items-end justify-between"><span><span className="block font-serif text-lg">{category.name}</span><span className="mt-1 block text-xs text-muted-foreground">{category.product_count} sản phẩm</span></span><ArrowUpRight className="text-primary transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" size={17} /></span></button>)}</div>}</section>
    <section className="mx-auto max-w-[1250px] px-4 pb-16 sm:px-7 lg:px-10"><SectionHeading eyebrow="Được yêu mến" title="Những sản phẩm được yêu thích." action={<button className={`${buttonQuiet} px-3`} onClick={() => onNavigate("/products")}>Xem tất cả <ArrowRight size={15} /></button>} /><RemoteProductGrid filters={{ status: "IN_STOCK", limit: 4 }} onAdd={onAdd} onOpen={onOpen} /></section>
    {sale && sale.items.length > 0 && <section className="bg-[#f0eee8] py-14"><div className="mx-auto max-w-[1250px] px-4 sm:px-7 lg:px-10"><SectionHeading eyebrow="Một chút ưu đãi" title="Thơm dịu hơn, giá dễ thương hơn." action={<button className={buttonOutline} onClick={() => onNavigate("/products?on_sale=true")}>Xem ưu đãi <ArrowRight size={15} /></button>} /><ProductGrid items={sale.items} onAdd={onAdd} onOpen={onOpen} /></div></section>}
    <section className="mx-auto max-w-[1250px] px-4 py-16 sm:px-7 lg:px-10"><div className="flex flex-col items-start justify-between gap-6 rounded-[26px] bg-primary px-7 py-9 text-white sm:flex-row sm:items-center sm:px-12 sm:py-11"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.22em] text-white/65">Quà tặng từ mùi hương</p><h2 className="font-serif text-3xl sm:text-4xl">Tặng một mùi hương, gửi một lời thương.</h2><p className="mt-2 max-w-lg text-sm leading-6 text-white/75">Một chiếc nến thơm là món quà nhỏ mà ấm áp, cho người thương, cho bạn bè, hay cho chính bạn.</p></div><button onClick={() => onNavigate("/products")} className={`${buttonBase} shrink-0 bg-white text-primary hover:bg-white/90`}>Chọn quà tặng <ArrowRight size={16} /></button></div></section>
  </>
}

const SORT_OPTIONS: ProductSort[] = ["newest", "price_asc", "price_desc"]

/** Storefront listing. The URL query string is the source of truth for every filter. */
function ListingPage({ onAdd, onOpen }: { onAdd: (p: Product) => void; onOpen: (p: Product) => void }) {
  const router = useRouter()
  const params = useSearchParams()
  const { data: categories } = useCategories()
  const { data: tags } = useTags()
  const [showFilters, setShowFilters] = useState(false)
  const numberParam = (key: string) => { const value = Number(params.get(key)); return params.get(key) && Number.isFinite(value) && value >= 0 ? value : undefined }
  const sortParam = params.get("sort") as ProductSort | null
  const statusParam = params.get("status")
  const filters: ProductFilters = {
    q: params.get("q")?.trim() || undefined,
    category: params.get("category") || undefined,
    tag: params.get("tag") || undefined,
    status: statusParam === "IN_STOCK" || statusParam === "OUT_OF_STOCK" ? statusParam : undefined,
    on_sale: params.get("on_sale") === "true" || undefined,
    min_price: numberParam("min_price"),
    max_price: numberParam("max_price"),
    sort: sortParam && SORT_OPTIONS.includes(sortParam) ? sortParam : "newest",
    page: Math.max(1, Math.floor(numberParam("page") ?? 1)),
    limit: LISTING_PAGE_SIZE,
  }
  const [query, setQuery] = useState(filters.q ?? "")
  const [minPrice, setMinPrice] = useState(params.get("min_price") ?? "")
  const [maxPrice, setMaxPrice] = useState(params.get("max_price") ?? "")
  useEffect(() => { setQuery(params.get("q") ?? ""); setMinPrice(params.get("min_price") ?? ""); setMaxPrice(params.get("max_price") ?? "") }, [params])

  const update = useCallback((changes: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params.toString())
    Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key) })
    if (resetPage) next.delete("page")
    const qs = next.toString()
    router.replace(qs ? `/products?${qs}` : "/products", { scroll: false })
  }, [params, router])

  // Free-text and price inputs are applied after the user stops typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      const changes: Record<string, string | undefined> = {}
      if (query.trim() !== (params.get("q") ?? "")) changes.q = query.trim() || undefined
      if (minPrice !== (params.get("min_price") ?? "")) changes.min_price = minPrice || undefined
      if (maxPrice !== (params.get("max_price") ?? "")) changes.max_price = maxPrice || undefined
      if (Object.keys(changes).length) update(changes)
    }, 400)
    return () => clearTimeout(timer)
  }, [query, minPrice, maxPrice, params, update])

  const { data, error, isLoading, mutate } = useSWR(["products", filters], () => productService.list(filters), { keepPreviousData: true })
  const total = data?.pagination.total ?? 0
  const pages = Math.max(1, data?.pagination.totalPages ?? 1)
  const activeTag = tags?.find((t) => t.slug === filters.tag)
  const activeCategory = categories?.find((c) => c.slug === filters.category || String(c.id) === filters.category)
  const title = filters.on_sale ? "Đang ưu đãi" : activeTag ? activeTag.name : activeCategory ? activeCategory.name : "Tất cả sản phẩm"
  const reset = () => router.replace(filters.q ? `/products?q=${encodeURIComponent(filters.q)}` : "/products", { scroll: false })
  const filterPanel = <div className="flex flex-col gap-5"><div><label className="mb-2 block text-xs font-semibold" htmlFor="filter-category">Danh mục</label><select id="filter-category" value={filters.category ?? ""} onChange={(e) => update({ category: e.target.value || undefined })} className={fieldClass}><option value="">Tất cả danh mục</option>{categories?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div><div><label className="mb-2 block text-xs font-semibold" htmlFor="filter-tag">Thẻ sản phẩm</label><select id="filter-tag" value={filters.tag ?? ""} onChange={(e) => update({ tag: e.target.value || undefined })} className={fieldClass}><option value="">Tất cả thẻ</option>{tags?.map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}</select></div><div><label className="mb-2 block text-xs font-semibold">Khoảng giá (₫)</label><div className="grid grid-cols-2 gap-2"><input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} type="number" min={0} placeholder="Từ" aria-label="Giá từ" className={fieldClass} /><input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} type="number" min={0} placeholder="Đến" aria-label="Giá đến" className={fieldClass} /></div></div><div><label className="mb-2 block text-xs font-semibold" htmlFor="filter-status">Tình trạng</label><select id="filter-status" value={filters.status ?? "ALL"} onChange={(e) => update({ status: e.target.value === "ALL" ? undefined : e.target.value })} className={fieldClass}><option value="ALL">Tất cả sản phẩm</option><option value="IN_STOCK">Còn hàng</option><option value="OUT_OF_STOCK">Hết hàng</option></select></div><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={!!filters.on_sale} onChange={(e) => update({ on_sale: e.target.checked ? "true" : undefined })} className="size-4 accent-primary" /> Chỉ sản phẩm đang ưu đãi</label><button onClick={reset} className="text-left text-xs font-semibold text-primary">Xóa bộ lọc</button></div>
  return <main className="mx-auto max-w-[1320px] px-4 py-10 sm:px-7 lg:px-10"><div className="mb-2 text-xs text-muted-foreground">Trang chủ <span className="px-1.5">/</span> Cửa hàng</div><SectionHeading eyebrow="Tuyển chọn mỗi ngày" title={title} description="Nến thơm làm thủ công, đủ mùi hương cho mọi góc nhà và mọi tâm trạng." /><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex h-11 min-w-[240px] flex-1 items-center gap-2 rounded-full border border-border bg-white px-4 sm:max-w-sm"><Search size={16} className="text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tên nến, mùi hương, mã hoặc thẻ..." aria-label="Tìm theo tên, mã hoặc thẻ" className="w-full bg-transparent text-sm outline-none" /></div><div className="flex items-center gap-2"><button onClick={() => setShowFilters(!showFilters)} className={`${buttonOutline} lg:hidden`}><SlidersHorizontal size={15} /> Bộ lọc</button><select value={filters.sort} onChange={(e) => update({ sort: e.target.value === "newest" ? undefined : e.target.value })} aria-label="Sắp xếp sản phẩm" className={`${fieldClass} w-auto min-w-40`}><option value="newest">Mới nhất</option><option value="price_asc">Giá thấp đến cao</option><option value="price_desc">Giá cao đến thấp</option></select></div></div><div className="grid items-start gap-8 lg:grid-cols-[230px_1fr]"><aside className={`rounded-2xl border border-border bg-white p-5 ${showFilters ? "block" : "hidden"} lg:sticky lg:top-28 lg:block`}><div className="mb-5 flex items-center justify-between"><h2 className="font-serif text-xl">Bộ lọc</h2><Filter size={16} className="text-muted-foreground" /></div>{filterPanel}</aside><section aria-busy={isLoading}><div className="mb-4 flex items-center justify-between text-xs text-muted-foreground"><span data-testid="product-total">{data ? `${total} sản phẩm` : "Đang tải..."}</span><span>Trang {filters.page} / {pages}</span></div>{error ? <ErrorState error={error} onRetry={() => void mutate()} /> : !data ? <LoadingGrid count={LISTING_PAGE_SIZE} /> : <ProductGrid items={data.items} onAdd={onAdd} onOpen={onOpen} />}<Pagination page={filters.page ?? 1} totalPages={pages} onChange={(page) => update({ page: page > 1 ? String(page) : undefined }, false)} /></section></div></main>
}

function ProductDetailPage({ code, onAdd, onOpen }: { code: string; onAdd: (p: Product, quantity?: number) => void; onOpen: (p: Product) => void }) {
  const productCode = decodeURIComponent(code)
  const { data: product, error, isLoading, mutate } = useSWR(["product", productCode], () => productService.byCode(productCode))
  const { data: related } = useSWR(product ? ["products", { category: product.category.slug, limit: 5 }] : null, () => productService.list({ category: product!.category.slug, limit: 5 }))
  const [selected, setSelected] = useState(0)
  const [quantity, setQuantity] = useState(1)
  if (isApiError(error, 404)) return <EmptyPage title="Không tìm thấy sản phẩm" description="Sản phẩm có thể đã được chuyển đi hoặc không còn hiển thị." href="/products" action="Quay lại cửa hàng" />
  if (error) return <main className="mx-auto max-w-[1250px] px-4 py-9 sm:px-7 lg:px-10"><ErrorState error={error} onRetry={() => void mutate()} /></main>
  if (isLoading || !product) return <main className="mx-auto max-w-[1250px] px-4 py-9 sm:px-7 lg:px-10" aria-busy="true"><div className="grid gap-9 md:grid-cols-2"><div className="aspect-[.9] animate-pulse rounded-[24px] bg-muted" /><div className="space-y-4 py-2"><div className="h-4 w-40 animate-pulse rounded bg-muted" /><div className="h-10 w-3/4 animate-pulse rounded bg-muted" /><div className="h-6 w-1/3 animate-pulse rounded bg-muted" /></div></div></main>
  const outOfStock = product.status === "OUT_OF_STOCK"
  const sale = discountLabel(product)
  const relatedItems = (related?.items ?? []).filter((item) => item.id !== product.id).slice(0, 4)
  const images = product.images.length ? product.images : [{ id: 0, url: "/placeholder.svg", position: 0 }]
  return <main className="mx-auto max-w-[1250px] px-4 py-9 sm:px-7 lg:px-10"><div className="mb-7 flex items-center gap-2 text-xs text-muted-foreground"><button onClick={() => history.back()} className="flex items-center gap-1 hover:text-primary"><ArrowLeft size={14} /> Quay lại</button><span>/</span><span>{product.category.name}</span><span>/</span><span className="truncate text-foreground">{product.name}</span></div><div className="grid gap-9 md:grid-cols-2 lg:gap-14"><div className="grid gap-3 sm:grid-cols-[74px_1fr]"><div className="order-2 flex gap-2 overflow-x-auto sm:order-1 sm:flex-col">{images.map((img, i) => <button key={img.id + "-" + i} onClick={() => setSelected(i)} className={`size-[68px] shrink-0 overflow-hidden rounded-xl border-2 ${selected === i ? "border-primary" : "border-transparent"}`}><img src={img.url} alt={`${product.name}, ảnh ${i + 1}`} className="size-full object-cover" /></button>)}</div><div className="order-1 aspect-[.9] overflow-hidden rounded-[24px] bg-[#f0efeb] sm:order-2"><img src={images[Math.min(selected, images.length - 1)].url} alt={product.name} className="size-full object-cover" /></div></div><div className="py-2"><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">{product.category.name} · {product.code}</p><h1 className="mt-3 font-serif text-4xl leading-tight sm:text-[44px]">{product.name}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{product.short_description}</p><div className="mt-5 flex items-center gap-3"><span className="text-2xl font-semibold" data-testid="final-price">{formatVnd(product.final_price)}</span>{product.final_price < product.price && <><span className="text-sm text-muted-foreground line-through" data-testid="original-price">{formatVnd(product.price)}</span>{sale && <span className="rounded-full bg-[#f4e3db] px-2.5 py-1 text-xs font-semibold text-[#9f4c32]">{sale}</span>}</>}</div><div className="mt-5"><StatusPill tone={productStatusTone[product.status]}>{productStatusLabel[product.status]}</StatusPill></div><div className="my-6 border-t border-border" /><div className="flex flex-wrap gap-2">{product.tags.map((t) => <span key={t.id} className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">{t.name}</span>)}</div><div className="mt-6 whitespace-pre-line text-sm leading-7 text-muted-foreground">{product.description}</div><div className="mt-7 flex flex-wrap items-center gap-3"><div className="flex items-center rounded-full border border-border bg-white p-1"><button className="flex size-9 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" disabled={quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Giảm số lượng"><Minus size={14} /></button><span className="w-9 text-center text-sm font-semibold">{quantity}</span><button className="flex size-9 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" disabled={quantity >= MAX_CART_ITEM_QUANTITY} onClick={() => setQuantity(Math.min(MAX_CART_ITEM_QUANTITY, quantity + 1))} aria-label="Tăng số lượng"><Plus size={14} /></button></div><button className={`${buttonPrimary} min-w-52 flex-1 sm:flex-none`} disabled={outOfStock} onClick={() => onAdd(product, quantity)}><ShoppingBag size={16} />{outOfStock ? "Hết hàng" : "Thêm vào giỏ"}</button><button className={compactButton} onClick={() => toast.success("Đã lưu sản phẩm yêu thích")} aria-label="Yêu thích"><Heart size={17} /></button></div><div className="mt-7 grid gap-3 border-t border-border pt-5 text-xs text-muted-foreground sm:grid-cols-2"><p className="flex items-center gap-2"><Truck size={15} className="text-primary" /> Giao hàng toàn quốc</p><p className="flex items-center gap-2"><ShieldCheck size={15} className="text-primary" /> Đổi trả trong 7 ngày</p></div></div></div>{relatedItems.length > 0 && <section className="mt-16"><SectionHeading eyebrow="Cùng danh mục" title="Có thể bạn cũng thích" /><ProductGrid items={relatedItems} onAdd={onAdd} onOpen={onOpen} /></section>}</main>
}

function EmptyPage({ title, description, href, action }: { title: string; description: string; href: string; action: string }) {
  const router = useRouter()
  return <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center px-5 text-center"><span className="mb-5 flex size-16 items-center justify-center rounded-full bg-[#e9eee8] text-primary"><ShoppingBag size={25} /></span><h1 className="font-serif text-3xl">{title}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p><button onClick={() => router.push(href)} className={`${buttonPrimary} mt-6`}>{action} <ArrowRight size={15} /></button></div>
}

function LoginRequired({ description, next }: { description: string; next: string }) {
  return <EmptyPage title="Vui lòng đăng nhập" description={description} href={`/login?next=${encodeURIComponent(next)}`} action="Đăng nhập" />
}

function PageLoading() {
  return <main className="mx-auto max-w-[1100px] px-4 py-10 sm:px-7 lg:px-10"><LoadingBlock /></main>
}

const unavailableLabel = { INACTIVE: "Sản phẩm đã ngừng bán.", OUT_OF_STOCK: "Sản phẩm đã hết hàng." } as const

function CartPage({ cart, isGuest, error, onRetry, onChange, onNavigate }: { cart?: Cart; isGuest: boolean; error: unknown; onRetry: () => void; onChange: (action: () => Promise<Cart>, success?: string) => Promise<void>; onNavigate: Navigate }) {
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<Cart>, success?: string) => { setBusy(true); try { await onChange(action, success) } finally { setBusy(false) } }
  if (error) return <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-7 lg:px-10"><ErrorState error={error} onRetry={onRetry} title="Không thể tải giỏ hàng" /></main>
  if (!cart) return <PageLoading />
  if (!cart.items.length) return <EmptyPage title="Chiếc giỏ đang chờ bạn" description="Một chiếc nến thơm nhỏ có thể làm ngày hôm nay dịu dàng hơn." href="/products" action="Khám phá cửa hàng" />
  return <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-7 lg:px-10"><p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-primary">Giỏ hàng của bạn</p><h1 className="mb-8 font-serif text-4xl">Những mùi hương bạn đã chọn.</h1><div className="grid gap-8 lg:grid-cols-[1fr_360px]"><section className="flex flex-col gap-3" aria-busy={busy}>{cart.items.map((item) => <article key={item.product_id} data-testid="cart-item" data-product-code={item.product.code} className="flex gap-4 rounded-2xl border border-border bg-white p-3 sm:gap-5 sm:p-4"><button onClick={() => onNavigate(`/products/${item.product.code}`)} className="size-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-28"><img src={item.product.image} alt={item.product.name} className="size-full object-cover" /></button><div className="flex min-w-0 flex-1 flex-col justify-between py-1"><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.product.code}</p><button onClick={() => onNavigate(`/products/${item.product.code}`)} className="mt-1 text-left text-sm font-semibold sm:text-base">{item.product.name}</button><p className="mt-1 text-xs text-muted-foreground">{formatVnd(item.final_price)} / món{item.final_price < item.unit_price && <span className="ml-1.5 line-through">{formatVnd(item.unit_price)}</span>}</p>{!item.available && <p className="mt-1 text-[11px] font-semibold text-destructive">{item.unavailable_reason ? unavailableLabel[item.unavailable_reason] : "Sản phẩm hiện không khả dụng."} Vui lòng xóa khỏi giỏ.</p>}</div><div className="mt-3 flex items-center justify-between"><div className="flex items-center rounded-full border border-border p-0.5"><button className="flex size-7 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" disabled={busy || item.quantity <= 1} onClick={() => void run(() => cartService.setQuantity(item.product_id, item.quantity - 1))} aria-label="Giảm số lượng"><Minus size={13} /></button><span className="w-7 text-center text-xs font-semibold" data-testid="cart-item-quantity">{item.quantity}</span><button className="flex size-7 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" disabled={busy || !item.available || item.quantity >= MAX_CART_ITEM_QUANTITY} onClick={() => void run(() => cartService.setQuantity(item.product_id, item.quantity + 1))} aria-label="Tăng số lượng"><Plus size={13} /></button></div><div className="flex items-center gap-3"><span className="text-sm font-semibold">{formatVnd(item.subtotal)}</span><button disabled={busy} onClick={() => void run(() => cartService.remove(item.product_id), "Đã xóa sản phẩm khỏi giỏ")} className="text-muted-foreground hover:text-destructive" aria-label={`Xóa ${item.product.name}`}><Trash2 size={15} /></button></div></div></div></article>)}<button disabled={busy} onClick={() => { if (window.confirm("Xóa toàn bộ sản phẩm trong giỏ?")) void run(() => cartService.clear(), "Đã xóa giỏ hàng") }} className={`${buttonQuiet} self-start px-3 text-xs`}><Trash2 size={14} /> Xóa giỏ hàng</button></section><aside className="h-fit rounded-2xl border border-border bg-white p-5 sm:p-6"><h2 className="font-serif text-xl">Tóm tắt đơn hàng</h2><div className="mt-5 flex justify-between text-sm"><span className="text-muted-foreground">Tạm tính ({cart.total_quantity} món)</span><span>{formatVnd(cart.total)}</span></div><div className="my-5 border-t border-border" /><div className="flex justify-between font-semibold"><span>Tổng cộng</span><span data-testid="cart-total">{formatVnd(cart.total)}</span></div><p className="mt-1 text-right text-[10px] text-muted-foreground">Đã bao gồm thuế</p>{cart.has_unavailable_items && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-800">Giỏ hàng có sản phẩm không còn khả dụng. Vui lòng xóa trước khi thanh toán.</p>}<button disabled={busy || cart.has_unavailable_items} onClick={() => onNavigate(isGuest ? "/login?next=/checkout" : "/checkout")} className={`${buttonPrimary} mt-5 w-full`}>{isGuest ? "Đăng nhập để đặt hàng" : "Tiến hành đặt hàng"} <ArrowRight size={15} /></button>{isGuest && <p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground">Giỏ hàng sẽ được giữ nguyên và chuyển vào tài khoản sau khi bạn đăng nhập.</p>}<button onClick={() => onNavigate("/products")} className={`${buttonQuiet} mt-2 w-full`}>Tiếp tục mua sắm</button><div className="mt-5 rounded-xl bg-[#f5f6f2] p-3 text-xs leading-5 text-muted-foreground"><Truck size={14} className="mb-1 inline text-primary" /> Giá và tổng tiền được hệ thống tính lại khi bạn đặt hàng.</div></aside></div></main>
}

const loginSchema = z.object({ email: z.string().trim().email("Email chưa hợp lệ."), password: z.string().min(1, "Vui lòng nhập mật khẩu."), remember: z.boolean().optional() })
const registerSchema = z.object({ name: z.string().trim().min(2, "Vui lòng nhập họ tên."), email: z.string().trim().email("Email chưa hợp lệ."), password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự.").max(72, "Mật khẩu tối đa 72 ký tự.").regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, "Mật khẩu cần có cả chữ và số."), confirm: z.string().min(8, "Vui lòng xác nhận mật khẩu.") }).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Mật khẩu xác nhận chưa khớp." })
type LoginValues = z.infer<typeof loginSchema>
type RegisterValues = z.infer<typeof registerSchema>

function FieldError({ message }: { message?: string }) {
  return message ? <span className="mt-1 block text-xs text-destructive">{message}</span> : null
}

function LoginForm({ onAuthenticated }: { onAuthenticated: (result: AuthResult, remember: boolean) => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { remember: true } })
  const submit = async (values: LoginValues) => {
    setFormError(null)
    try { onAuthenticated(await authService.login(values.email, values.password), values.remember ?? true) } catch (error) { setFormError(formatApiError(error, "Không thể đăng nhập.")) }
  }
  return <form onSubmit={handleSubmit(submit)} className="mt-7 flex flex-col gap-4" noValidate><label className="block"><span className="mb-1.5 block text-xs font-semibold">Email</span><input {...register("email")} type="email" autoComplete="email" placeholder="ban@email.com" className={fieldClass} aria-invalid={!!errors.email} /><FieldError message={errors.email?.message} /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold">Mật khẩu</span><input {...register("password")} type="password" autoComplete="current-password" placeholder="Mật khẩu của bạn" className={fieldClass} aria-invalid={!!errors.password} /><FieldError message={errors.password?.message} /></label><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" {...register("remember")} className="size-4 accent-primary" /> Ghi nhớ đăng nhập</label>{formError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{formError}</p>}<button disabled={isSubmitting} className={`${buttonPrimary} mt-1 w-full`}>{isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"} <ArrowRight size={15} /></button></form>
}

function RegisterForm({ onAuthenticated }: { onAuthenticated: (result: AuthResult, remember: boolean) => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })
  const submit = async (values: RegisterValues) => {
    setFormError(null)
    try { onAuthenticated(await authService.register(values.name, values.email, values.password), true) } catch (error) { setFormError(formatApiError(error, "Không thể tạo tài khoản.")) }
  }
  const field = (name: keyof RegisterValues, label: string, type: string, placeholder: string, autoComplete: string) => <label className="block"><span className="mb-1.5 block text-xs font-semibold">{label}</span><input {...register(name)} type={type} autoComplete={autoComplete} placeholder={placeholder} className={fieldClass} aria-invalid={!!errors[name]} /><FieldError message={errors[name]?.message} /></label>
  return <form onSubmit={handleSubmit(submit)} className="mt-7 flex flex-col gap-4" noValidate>{field("name", "Họ và tên", "text", "Tên của bạn", "name")}{field("email", "Email", "email", "ban@email.com", "email")}{field("password", "Mật khẩu", "password", "Ít nhất 8 ký tự, có chữ và số", "new-password")}{field("confirm", "Xác nhận mật khẩu", "password", "Nhập lại mật khẩu", "new-password")}{formError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{formError}</p>}<button disabled={isSubmitting} className={`${buttonPrimary} mt-1 w-full`}>{isSubmitting ? "Đang tạo tài khoản..." : "Tạo tài khoản"} <ArrowRight size={15} /></button></form>
}

function AuthPage({ mode, onAuthenticated, onNavigate }: { mode: "login" | "register"; onAuthenticated: (result: AuthResult, remember: boolean) => void; onNavigate: Navigate }) {
  const registerMode = mode === "register"
  const next = useSearchParams().get("next")
  const switchHref = `${registerMode ? "/login" : "/register"}${next ? `?next=${encodeURIComponent(next)}` : ""}`
  return <main className="grid min-h-[calc(100vh-150px)] items-center px-4 py-10 sm:px-7 lg:grid-cols-2 lg:px-10"><div className="mx-auto w-full max-w-md"><button onClick={() => onNavigate("/")} className="mb-7 flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft size={14} /> Về trang chủ</button><p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-primary">{registerMode ? "Bắt đầu từ đây" : "Rất vui được gặp lại"}</p><h1 className="font-serif text-4xl">{registerMode ? "Tạo tài khoản mới." : "Chào mừng bạn trở lại."}</h1><p className="mt-2 text-sm text-muted-foreground">{registerMode ? "Lưu lại những mùi hương bạn yêu thích." : "Đăng nhập để theo dõi hành trình đơn hàng."}</p>{registerMode ? <RegisterForm onAuthenticated={onAuthenticated} /> : <LoginForm onAuthenticated={onAuthenticated} />}<p className="mt-5 text-center text-sm text-muted-foreground">{registerMode ? "Đã có tài khoản?" : "Chưa có tài khoản?"} <button className="font-semibold text-primary" onClick={() => onNavigate(switchHref)}>{registerMode ? "Đăng nhập" : "Đăng ký"}</button></p></div><div className="relative hidden min-h-[590px] overflow-hidden rounded-[28px] bg-[#e7e6dc] lg:block"><img src="/images/hero-still-life.png" alt="Góc nhà ấm áp cùng những chiếc nến thơm Chipscendle" className="absolute inset-0 size-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-[#20362a]/80 via-transparent to-transparent" /><div className="absolute bottom-10 left-10 max-w-md text-white"><p className="mb-3 text-xs uppercase tracking-[.2em] text-white/75">Chipscendle</p><p className="font-serif text-4xl leading-tight">Chọn một mùi hương khiến bạn muốn ở nhà thêm một chút.</p></div></div></main>
}

function OrdersPage({ onNavigate }: { onNavigate: Navigate }) {
  const [page, setPage] = useState(1)
  const { data, error, isLoading, mutate } = useSWR(["my-orders", page], () => orderService.mine({ page, limit: 10 }), { keepPreviousData: true })
  if (error) return <main className="mx-auto max-w-[1100px] px-4 py-10 sm:px-7 lg:px-10"><ErrorState error={error} onRetry={() => void mutate()} title="Không thể tải đơn hàng" /></main>
  if (isLoading || !data) return <PageLoading />
  if (!data.items.length) return <EmptyPage title="Chưa có đơn hàng" description="Đơn hàng đầu tiên của bạn sẽ xuất hiện ở đây." href="/products" action="Bắt đầu mua sắm" />
  return <main className="mx-auto max-w-[1100px] px-4 py-10 sm:px-7 lg:px-10"><p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-primary">Tài khoản của bạn</p><h1 className="font-serif text-4xl">Đơn hàng của tôi.</h1><p className="mt-2 text-sm text-muted-foreground">Theo dõi những chiếc nến đang được làm và gửi đến bạn.</p><div className="mt-7 flex flex-col gap-3">{data.items.map((order) => <button key={order.id} data-testid="order-row" onClick={() => onNavigate(`/orders/${order.id}`)} className="grid gap-4 rounded-2xl border border-border bg-white p-4 text-left transition hover:border-primary/30 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:p-5"><div><p className="text-[10px] text-muted-foreground">Mã đơn · {formatOrderCode(order.id)} · {shippingMethodLabel[order.shipping_method]}</p><p className="mt-1 text-sm font-semibold">{order.items.map((item) => item.product_name).join(", ")}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(order.created_at)} · {order.item_count} sản phẩm · Nhận ngày {formatDateOnly(order.desired_date)}</p></div><StatusPill tone={orderStatusTone[order.status]}>{orderStatusLabel[order.status]}</StatusPill><span className="flex items-center justify-between gap-3 text-sm font-semibold">{formatVnd(order.total_amount)} <ArrowRight size={15} className="text-muted-foreground" /></span></button>)}</div><Pagination page={page} totalPages={data.pagination.totalPages} onChange={setPage} /></main>
}

function OrderItemsSummary({ order }: { order: { items: AdminOrder["items"]; total_amount: number; shipping_method: AdminOrder["shipping_method"] } }) {
  return <><div className="mt-4 flex flex-col divide-y divide-border">{order.items.map((item) => <div key={item.id} data-testid="order-item" className="flex items-center gap-3 py-4"><img src={item.image} alt="" className="size-16 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.product_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.product_code} · SL {item.quantity}</p><p className="mt-1 text-xs text-muted-foreground">Giá tại thời điểm mua: <span data-testid="order-item-price">{formatVnd(item.price)}</span></p></div><span className="text-sm font-semibold">{formatVnd(item.subtotal)}</span></div>)}</div><div className="border-t border-border pt-3"><div className="flex justify-between text-xs text-muted-foreground"><span>Hình thức nhận hàng</span><span>{shippingMethodLabel[order.shipping_method]}</span></div><div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold"><span>Tổng cộng</span><span data-testid="order-total">{formatVnd(order.total_amount)}</span></div></div></>
}

function OrderDetailPage({ id, onNavigate }: { id: string; onNavigate: Navigate }) {
  const { data: order, error, isLoading, mutate } = useSWR(["order", id], () => orderService.byId(id))
  if (isApiError(error, 404) || isApiError(error, 400)) return <EmptyPage title="Không tìm thấy đơn hàng" description="Mã đơn hàng không hợp lệ hoặc không thuộc tài khoản của bạn." href="/orders" action="Về đơn hàng" />
  if (error) return <main className="mx-auto max-w-[1050px] px-4 py-10 sm:px-7 lg:px-10"><ErrorState error={error} onRetry={() => void mutate()} /></main>
  if (isLoading || !order) return <PageLoading />
  return <main className="mx-auto max-w-[1050px] px-4 py-10 sm:px-7 lg:px-10"><button onClick={() => onNavigate("/orders")} className="mb-6 flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft size={14} /> Danh sách đơn hàng</button><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-primary">Chi tiết đơn hàng</p><h1 className="mt-1 font-serif text-3xl" data-testid="order-code">{formatOrderCode(order.id)}</h1><p className="mt-1 text-xs text-muted-foreground">Đặt ngày {formatDateTime(order.created_at)}</p></div><StatusPill tone={orderStatusTone[order.status]}>{orderStatusLabel[order.status]}</StatusPill></div><div className="mt-7 grid gap-5 lg:grid-cols-[1fr_310px]"><section className="rounded-2xl border border-border bg-white p-5"><h2 className="font-serif text-xl">Sản phẩm đã đặt</h2><OrderItemsSummary order={order} /></section><aside className="h-fit rounded-2xl border border-border bg-white p-5"><h2 className="font-serif text-xl">Thông tin nhận hàng</h2><p className="mt-4 text-sm font-semibold">{order.customer_name}</p><p className="mt-1 text-xs text-muted-foreground">{order.customer_phone}</p><div className="my-4 border-t border-border" /><p className="text-xs text-muted-foreground">Ngày nhận mong muốn</p><p className="mt-1 text-sm font-semibold" data-testid="order-desired-date">{formatDateOnly(order.desired_date)}</p><div className="my-4 border-t border-border" /><p className="text-xs font-semibold">{shippingMethodLabel[order.shipping_method]}</p><p className="mt-2 flex items-start gap-2 text-sm leading-6 text-muted-foreground" data-testid="order-address"><Truck size={15} className="mt-1 shrink-0 text-primary" />{formatOrderAddress(order)}</p></aside></div></main>
}

// ============================================================================ admin

const isHttpOrUpload = (value: string) => /^(https?:\/\/\S+|\/uploads\/\S+)$/.test(value)
const productSchema = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9._-]{1,64}$/, "Mã chỉ gồm chữ, số, dấu . _ - (tối đa 64 ký tự)."), name: z.string().trim().min(2, "Tên sản phẩm là bắt buộc.").max(255), short_description: z.string().max(500, "Tối đa 500 ký tự."), description: z.string(), category_id: z.string().min(1, "Vui lòng chọn danh mục."), price: z.coerce.number().min(0, "Giá không được âm."), discount_type: z.enum(["NONE", "PERCENT", "FIXED"]), discount_value: z.coerce.number().min(0, "Giá trị giảm không được âm."), discount_start: z.string().optional(), discount_end: z.string().optional(), status: z.enum(["IN_STOCK", "OUT_OF_STOCK"]), is_active: z.boolean(), image: z.string().trim().refine((v) => !v || isHttpOrUpload(v), "Vui lòng nhập đường dẫn ảnh hợp lệ (http/https)."), tagIds: z.array(z.number()) }).superRefine((v, ctx) => { if (v.discount_type === "PERCENT" && v.discount_value > 100) ctx.addIssue({ code: "custom", path: ["discount_value"], message: "Phần trăm giảm tối đa là 100%." }); if (v.discount_type === "FIXED" && v.discount_value > v.price) ctx.addIssue({ code: "custom", path: ["discount_value"], message: "Mức giảm không thể cao hơn giá gốc." }); if (v.discount_start && v.discount_end && new Date(v.discount_start) > new Date(v.discount_end)) ctx.addIssue({ code: "custom", path: ["discount_end"], message: "Ngày kết thúc phải sau ngày bắt đầu." }) })
type ProductValues = z.infer<typeof productSchema>
type ProductFormInput = z.input<typeof productSchema>

/** yyyy-mm-dd in local time, for <input type="date"> */
const toDateInput = (iso: string | null | undefined) => { if (!iso) return ""; const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` }
const fromDateInput = (value: string | undefined, endOfDay: boolean) => value ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).toISOString() : null

function ProductEditor({ product, onSave, onCancel }: { product?: AdminProduct | null; onSave: (value: ProductValues) => Promise<void>; onCancel: () => void }) {
  const { data: categories } = useCategories()
  const { data: tags } = useTags()
  const defaultValues: ProductFormInput = product ? { code: product.code, name: product.name, short_description: product.short_description ?? "", description: product.description ?? "", category_id: String(product.category_id), price: product.price, discount_type: product.discount.type, discount_value: product.discount.value, discount_start: toDateInput(product.discount.start), discount_end: toDateInput(product.discount.end), status: product.status, is_active: product.is_active, image: product.images[0]?.url ?? "", tagIds: product.tags.map((t) => t.id) } : { code: "", name: "", short_description: "", description: "", category_id: "", price: 0, discount_type: "NONE", discount_value: 0, discount_start: "", discount_end: "", status: "IN_STOCK", is_active: true, image: "", tagIds: [] }
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<ProductFormInput, unknown, ProductValues>({ resolver: zodResolver(productSchema), defaultValues })
  const values = watch()
  const price = Number(values.price) || 0
  const discountValue = Number(values.discount_value) || 0
  // Preview only — the backend computes the authoritative final_price (incl. the discount window).
  const previewPrice = values.discount_type === "PERCENT" ? Math.round(price * (1 - discountValue / 100)) : values.discount_type === "FIXED" ? Math.max(0, price - discountValue) : price
  const input = (name: "code" | "name" | "short_description" | "price" | "discount_value" | "discount_start" | "discount_end" | "image", label: string, type = "text", placeholder = "") => <label className="block"><span className="mb-1.5 block text-xs font-semibold">{label}</span><input type={type} placeholder={placeholder} {...register(name)} className={fieldClass} aria-invalid={!!errors[name]} /><FieldError message={errors[name]?.message} /></label>
  return <form onSubmit={handleSubmit(onSave)} className="grid gap-6 xl:grid-cols-[1fr_320px]"><div className="flex flex-col gap-5"><section className="rounded-2xl border border-border bg-white p-5 sm:p-6"><h2 className="font-serif text-xl">Thông tin sản phẩm</h2><p className="mt-1 text-xs text-muted-foreground">Nội dung hiển thị trong cửa hàng.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{input("code", "Mã SKU / code", "text", "VD: HOM-001")}{input("name", "Tên sản phẩm", "text", "Tên sản phẩm")}{input("short_description", "Mô tả ngắn", "text", "Mô tả hiển thị trên thẻ")}<label className="block"><span className="mb-1.5 block text-xs font-semibold">Danh mục</span><select {...register("category_id")} className={fieldClass} aria-invalid={!!errors.category_id}><option value="">{categories ? "Chọn danh mục" : "Đang tải..."}</option>{categories?.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select><FieldError message={errors.category_id?.message} /></label><label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">Mô tả chi tiết</span><textarea {...register("description")} className={areaClass} placeholder="Chất liệu, công dụng, cách bảo quản..." /><FieldError message={errors.description?.message} /></label></div></section><section className="rounded-2xl border border-border bg-white p-5 sm:p-6"><h2 className="font-serif text-xl">Giá & ưu đãi</h2><div className="mt-5 grid gap-4 sm:grid-cols-3">{input("price", "Giá gốc (₫)", "number", "0")}<label className="block"><span className="mb-1.5 block text-xs font-semibold">Loại giảm giá</span><select {...register("discount_type")} className={fieldClass}><option value="NONE">Không giảm</option><option value="PERCENT">Phần trăm (%)</option><option value="FIXED">Số tiền cố định (₫)</option></select></label>{input("discount_value", "Giá trị giảm", "number", "0")}{input("discount_start", "Bắt đầu", "date")}{input("discount_end", "Kết thúc", "date")}<div className="flex flex-col justify-end rounded-xl bg-[#f1f4ef] p-3"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Giá bán dự kiến</span><span className="mt-1 text-lg font-bold text-primary">{formatVnd(previewPrice)}</span>{product && <span className="mt-1 text-[10px] text-muted-foreground">Giá hiện tại: {formatVnd(product.final_price)}</span>}</div></div></section></div><aside className="flex flex-col gap-5"><section className="rounded-2xl border border-border bg-white p-5"><h2 className="font-serif text-xl">Trạng thái</h2><label className="mt-4 block"><span className="mb-1.5 block text-xs font-semibold">Tình trạng kho</span><select {...register("status")} className={fieldClass}><option value="IN_STOCK">Còn hàng</option><option value="OUT_OF_STOCK">Hết hàng</option></select></label><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" {...register("is_active")} className="size-4 accent-primary" /> Hiển thị trong cửa hàng</label></section><section className="rounded-2xl border border-border bg-white p-5"><h2 className="font-serif text-xl">Ảnh & thẻ</h2><div className="mt-4 aspect-square overflow-hidden rounded-xl bg-muted"><img src={values.image || "/placeholder.svg"} alt="Xem trước ảnh sản phẩm" className="size-full object-cover" /></div><div className="mt-3">{input("image", "Đường dẫn ảnh chính", "url", "https://...")}{product && product.images.length > 1 && <p className="mt-1 text-[10px] text-muted-foreground">Sản phẩm có {product.images.length} ảnh; các ảnh còn lại được giữ nguyên.</p>}</div><div className="mt-4"><span className="mb-2 block text-xs font-semibold">Thẻ sản phẩm</span><div className="flex flex-wrap gap-2">{!tags && <span className="text-xs text-muted-foreground">Đang tải...</span>}{tags?.map((t) => { const active = values.tagIds.includes(t.id); return <button type="button" key={t.id} aria-pressed={active} onClick={() => setValue("tagIds", active ? values.tagIds.filter((id) => id !== t.id) : [...values.tagIds, t.id], { shouldDirty: true })} className={`rounded-full border px-3 py-1.5 text-xs ${active ? "border-primary bg-[#e9eee8] text-primary" : "border-border text-muted-foreground"}`}>{t.name}</button> })}</div></div></section><div className="flex gap-2"><button type="button" onClick={onCancel} className={`${buttonOutline} flex-1`}>Hủy</button><button disabled={isSubmitting} className={`${buttonPrimary} flex-1`}><Check size={15} /> {isSubmitting ? "Đang lưu..." : "Lưu sản phẩm"}</button></div></aside></form>
}

function AdminShell({ pathname, user, onNavigate, onLogout, children }: { pathname: string; user: User; onNavigate: Navigate; onLogout: () => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const { data: dashboard } = useSWR(DASHBOARD_KEY, adminService.dashboard)
  const pending = dashboard?.orders.by_status.AWAITING_DEPOSIT?.count ?? 0
  const active = (href: string) => href === "/admin" ? pathname === href : pathname.startsWith(href)
  return <div className="min-h-screen bg-[#f5f6f4] text-[#202a25]"><aside className={`fixed inset-y-0 left-0 z-50 w-[248px] border-r border-border bg-white px-4 py-5 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}><div className="flex items-center justify-between px-2"><Logo admin onClick={() => onNavigate("/admin")} /><button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Đóng menu"><X size={18} /></button></div><div className="mt-8 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Không gian quản lý</div><nav className="mt-3 grid gap-1" aria-label="Điều hướng quản trị">{adminNav.map(({ label, href, icon: Icon }) => <button key={href} onClick={() => { onNavigate(href); setOpen(false) }} className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${active(href) ? "bg-[#e9eee8] text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon size={17} />{label}{href === "/admin/orders" && pending > 0 && <span className="ml-auto rounded-full bg-[#f4e3db] px-2 py-0.5 text-[10px] font-bold text-[#9f4c32]">{pending}</span>}</button>)}</nav><div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-[#f5f6f2] p-4"><p className="text-xs font-semibold">Chipscendle store</p><p className="mt-1 text-[10px] text-muted-foreground">Gói cửa hàng · Đang hoạt động</p><button onClick={() => onNavigate("/")} className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary"><ArrowLeft size={13} /> Về cửa hàng</button></div></aside>{open && <button aria-label="Đóng menu nền" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/25 lg:hidden" />}<div className="min-h-screen lg:pl-[248px]"><header className="sticky top-0 z-30 flex h-[66px] items-center justify-between border-b border-border bg-white/90 px-4 backdrop-blur sm:px-7"><div className="flex items-center gap-3"><button onClick={() => setOpen(true)} className="flex size-9 items-center justify-center rounded-lg border border-border lg:hidden" aria-label="Mở menu"><Menu size={17} /></button><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span>Quản trị</span><ChevronRight size={13} /><span className="font-medium text-foreground">{adminNav.find((n) => active(n.href))?.label ?? "Chi tiết"}</span></div><span className="text-xs font-medium sm:hidden">{adminNav.find((n) => active(n.href))?.label ?? "Chi tiết"}</span></div><div className="flex items-center gap-3"><button className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Thông báo"><CircleHelp size={17} /></button><div className="flex items-center gap-2 border-l border-border pl-3"><span className="flex size-8 items-center justify-center rounded-full bg-[#e9eee8] text-xs font-bold text-primary">{user.name.slice(0, 1)}</span><span className="hidden text-xs font-semibold sm:block">{user.name}</span></div><button onClick={onLogout} aria-label="Đăng xuất" className="text-muted-foreground hover:text-destructive"><LogOut size={16} /></button></div></header><main className="mx-auto max-w-[1440px] p-4 sm:p-7">{children}</main></div></div>
}


function AdminDashboard({ onNavigate }: { onNavigate: Navigate }) {
  const { data: summary, error, mutate } = useSWR(DASHBOARD_KEY, adminService.dashboard)
  const { data: recentlyAdded } = useSWR(["admin-products", { limit: 4 }], () => adminService.listProducts({ limit: 4, sort: "newest" }))
  if (error) return <ErrorState error={error} onRetry={() => void mutate()} title="Không thể tải số liệu tổng quan" />
  if (!summary) return <LoadingBlock label="Đang tải số liệu..." />
  const byStatus = ORDER_STATUSES.map((status) => ({ status, count: summary.orders.by_status[status]?.count ?? 0 }))
  const maxCount = Math.max(1, ...byStatus.map((s) => s.count))
  const productTotal = Math.max(1, summary.products.total)
  const inStockPct = Math.round((summary.products.in_stock / productTotal) * 100)
  const metrics = [{ label: "Tổng sản phẩm", value: summary.products.total, delta: `${summary.catalog.categories} danh mục · ${summary.catalog.tags} thẻ`, icon: Package }, { label: "Đang hiển thị", value: summary.products.active, delta: "Trong cửa hàng", icon: Eye }, { label: "Hết hàng", value: summary.products.out_of_stock, delta: "Cần nhập thêm", icon: Box }, { label: "Tổng đơn hàng", value: summary.orders.total, delta: `${summary.orders.today} đơn hôm nay`, icon: ClipboardList }, { label: "Doanh thu", value: formatCompactVnd(summary.revenue.delivered_total) + " ₫", delta: `30 ngày: ${formatCompactVnd(summary.revenue.delivered_last_30_days)} ₫ · đơn đã giao`, icon: BarChart3 }]
  return <><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(summary.generated_at))}</p><h1 className="mt-1 font-serif text-3xl">Tổng quan cửa hàng</h1></div><button onClick={() => onNavigate("/admin/products/new")} className={buttonPrimary}><Plus size={15} /> Thêm sản phẩm</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(({ label, value, delta, icon: Icon }, i) => <div key={label} className="rounded-2xl border border-border bg-white p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><span className={`flex size-8 items-center justify-center rounded-xl ${i === 2 ? "bg-[#f4e3db] text-[#9f4c32]" : "bg-[#e9eee8] text-primary"}`}><Icon size={16} /></span></div><div className="mt-3 text-2xl font-semibold" data-testid={`metric-${i}`}>{value}</div><p className="mt-1 text-[10px] text-muted-foreground">{delta}</p></div>)}</div><div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]"><section className="rounded-2xl border border-border bg-white p-5"><div className="flex items-start justify-between"><div><h2 className="font-serif text-xl">Đơn hàng theo trạng thái</h2><p className="mt-1 text-xs text-muted-foreground">Toàn bộ đơn hàng trong hệ thống</p></div></div><div className="mt-5 flex h-48 items-end gap-3 border-b border-l border-border px-3 pb-2 pt-4">{byStatus.map(({ status, count }) => <div key={status} className="flex h-full flex-1 flex-col justify-end"><span className="mb-1 text-center text-[10px] font-semibold">{count}</span><div title={`${orderStatusLabel[status]}: ${count}`} className={`min-h-1 rounded-t-md ${status === "AWAITING_DEPOSIT" ? "bg-primary" : "bg-[#dce7dd]"}`} style={{ height: `${(count / maxCount) * 100}%` }} /></div>)}</div><div className="mt-2 flex gap-3 pl-3 text-[9px] text-muted-foreground">{byStatus.map(({ status }) => <span key={status} className="flex-1 text-center">{orderStatusLabel[status]}</span>)}</div></section><section className="rounded-2xl border border-border bg-white p-5"><h2 className="font-serif text-xl">Tình trạng sản phẩm</h2><p className="mt-1 text-xs text-muted-foreground">Phân bổ tồn kho</p><div className="mt-5 flex items-center gap-6"><div className="relative flex size-32 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#446b55 0 ${inStockPct}%, #d88b65 ${inStockPct}% 100%)` }}><div className="flex size-[88px] items-center justify-center rounded-full bg-white text-center"><span><strong className="block text-xl">{summary.products.total}</strong><small className="text-[9px] text-muted-foreground">sản phẩm</small></span></div></div><div className="grid gap-3 text-xs"><p className="flex items-center gap-2"><i className="size-2 rounded-full bg-primary" /> Còn hàng <strong>{summary.products.in_stock}</strong></p><p className="flex items-center gap-2"><i className="size-2 rounded-full bg-[#d88b65]" /> Hết hàng <strong>{summary.products.out_of_stock}</strong></p><p className="flex items-center gap-2"><i className="size-2 rounded-full bg-[#e8e9e4]" /> Đang ẩn <strong>{summary.products.inactive}</strong></p></div></div><button onClick={() => onNavigate("/admin/products")} className="mt-5 flex w-full items-center justify-center gap-1 border-t border-border pt-4 text-xs font-semibold text-primary">Quản lý sản phẩm <ArrowRight size={13} /></button></section></div><div className="mt-5 grid gap-5 xl:grid-cols-2"><section className="rounded-2xl border border-border bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-xl">Đơn hàng gần đây</h2><button onClick={() => onNavigate("/admin/orders")} className="text-xs font-semibold text-primary">Xem tất cả</button></div>{summary.recent_orders.length ? <div className="overflow-x-auto"><table className="w-full min-w-[530px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="pb-3 font-semibold">Mã đơn</th><th className="pb-3 font-semibold">Khách hàng</th><th className="pb-3 font-semibold">Ngày</th><th className="pb-3 font-semibold">Trạng thái</th><th className="pb-3 text-right font-semibold">Tổng</th></tr></thead><tbody>{summary.recent_orders.slice(0, 5).map((order) => <tr key={order.id} onClick={() => onNavigate(`/admin/orders/${order.id}`)} className="cursor-pointer border-t border-border/70 hover:bg-muted/40"><td className="py-3 font-semibold">{formatOrderCode(order.id)}</td><td className="py-3">{order.customer_name}</td><td className="py-3 text-muted-foreground">{formatDate(order.created_at)}</td><td className="py-3"><StatusPill tone={orderStatusTone[order.status]}>{orderStatusLabel[order.status]}</StatusPill></td><td className="py-3 text-right font-semibold">{formatVnd(order.total_amount)}</td></tr>)}</tbody></table></div> : <p className="py-8 text-center text-sm text-muted-foreground">Chưa có đơn hàng.</p>}</section><section className="rounded-2xl border border-border bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-xl">Sản phẩm mới thêm</h2><button onClick={() => onNavigate("/admin/products")} className="text-xs font-semibold text-primary">Xem tất cả</button></div>{!recentlyAdded ? <LoadingBlock /> : <div className="grid gap-2">{recentlyAdded.items.map((product) => <div key={product.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted/40"><img src={product.images[0]?.url ?? "/placeholder.svg"} alt="" className="size-11 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{product.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{product.code} · {product.category.name}</p></div><span className="text-xs font-semibold">{formatVnd(product.final_price)}</span></div>)}</div>}</section></div></>
}

function parseCsvLine(line: string) {
  const cells: string[] = []
  let value = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === "," && !quoted) { cells.push(value.trim()); value = "" }
    else value += char
  }
  cells.push(value.trim())
  return cells
}

/** Must match the backend importer (src/products/products-import.service.ts). */
const CSV_REQUIRED_COLUMNS = ["code", "name", "category", "price"]
const CSV_TEMPLATE = "code,name,short_description,description,category,price,discount_type,discount_value,discount_start,discount_end,status,is_active,tags\nHOM-101,Bình gốm Mùa thu,Gốm thủ công,Bình gốm tráng men thủ công,do-gia-dung,650000,PERCENT,10,2026-10-01,2026-12-31,IN_STOCK,true,ban-chay|qua-tang"

function CsvImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvTotalRows, setCsvTotalRows] = useState(0)
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = (file?: File) => {
    if (!file) return
    setResult(null)
    setCsvErrors([])
    setCsvFile(file)
    if (file.size > 5 * 1024 * 1024) { setCsvRows([]); setCsvErrors(["Tệp vượt quá giới hạn 5 MB."]); return }
    const reader = new FileReader()
    reader.onload = () => {
      const lines = String(reader.result ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim())
      const rows = lines.map(parseCsvLine)
      const headers = (rows[0] ?? []).map((header) => header.toLowerCase())
      // Only the header is checked here; every row is validated by the backend and reported back.
      setCsvErrors(CSV_REQUIRED_COLUMNS.filter((header) => !headers.includes(header)).map((header) => `Thiếu cột bắt buộc: ${header}`))
      setCsvTotalRows(Math.max(0, rows.length - 1))
      setCsvRows(rows.slice(0, 6))
    }
    reader.readAsText(file)
  }
  const importCsv = async () => {
    if (!csvFile || csvErrors.length) return
    setImporting(true)
    try {
      const summary = await adminService.importProducts(csvFile)
      setResult(summary)
      onImported()
      if (summary.failed) toast.warning(`Đã import ${summary.success}/${summary.total} dòng, ${summary.failed} dòng lỗi`)
      else toast.success(`Đã import ${summary.success} sản phẩm`)
    } catch (error) {
      setCsvErrors([formatApiError(error, "Không thể gửi yêu cầu import. Vui lòng thử lại.")])
      toast.error("Import chưa thành công")
    } finally {
      setImporting(false)
    }
  }
  const downloadTemplate = () => { const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "chipscendle-products-template.csv"; link.click(); URL.revokeObjectURL(url) }
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="csv-title" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-xl sm:p-7"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-widest text-primary">Tải dữ liệu hàng loạt</p><h2 id="csv-title" className="mt-1 font-serif text-2xl">Import sản phẩm từ CSV</h2></div><button onClick={onClose} className={compactButton} aria-label="Đóng"><X size={17} /></button></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Cột bắt buộc: <code>code, name, category, price</code>. Danh mục và thẻ (phân tách bằng <code>|</code>) khớp theo slug hoặc tên. Sản phẩm trùng mã sẽ được cập nhật.</p><button onClick={downloadTemplate} className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary"><Download size={14} /> Tải file mẫu CSV</button><input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" data-testid="csv-input" onChange={(e) => upload(e.target.files?.[0])} /><button onClick={() => inputRef.current?.click()} className="mt-5 flex min-h-32 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-primary/40 bg-[#f7f8f5] text-center"><FileSpreadsheet className="mb-2 text-primary" size={24} /><span className="text-sm font-semibold">{csvFile?.name || "Chọn tệp CSV để xem trước"}</span><span className="mt-1 text-[10px] text-muted-foreground">CSV · tối đa 5 MB</span></button>{csvErrors.length > 0 && <div role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{csvErrors.map((error, index) => <p key={index}>{error}</p>)}</div>}{csvRows.length > 0 && <><h3 className="mb-2 mt-5 text-xs font-semibold">Xem trước {csvTotalRows} dòng dữ liệu · 5 dòng đầu</h3><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[500px] text-left text-[10px]"><tbody>{csvRows.map((row, index) => <tr key={index} className={index === 0 ? "bg-muted font-semibold" : "border-t border-border"}>{row.map((cell, i) => <td key={i} className="px-3 py-2">{cell || "—"}</td>)}</tr>)}</tbody></table></div>{!csvErrors.length && !result && <p className="mt-2 text-[11px] text-emerald-700">✓ Đủ cột bắt buộc · {csvTotalRows} dòng sẵn sàng gửi lên máy chủ để kiểm tra</p>}</>}{result && <div data-testid="import-result" className={`mt-4 rounded-xl p-3 text-xs ${result.failed ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}><p className="font-semibold">Kết quả: {result.success}/{result.total} dòng thành công · {result.failed} dòng lỗi</p><p className="mt-1">Tạo mới {result.created} · Cập nhật {result.updated}</p>{result.errors.length > 0 && <ul className="mt-2 list-inside list-disc">{result.errors.slice(0, 20).map((error, index) => <li key={index}>Dòng {error.row}: {error.message}</li>)}</ul>}{result.errors.length > 20 && <p className="mt-1">Còn {result.errors.length - 20} lỗi khác.</p>}</div>}<div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className={buttonOutline}>Đóng</button><button onClick={importCsv} disabled={!csvFile || !csvRows.length || !!csvErrors.length || importing} className={buttonPrimary}>{importing ? "Đang import..." : `Import ${csvTotalRows} dòng`}</button></div></section></div>
}

function AdminProducts({ onNavigate }: { onNavigate: Navigate }) {
  const { mutate: globalMutate } = useSWRConfig()
  const { data: categories } = useCategories()
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [category, setCategory] = useState("")
  const [status, setStatus] = useState("ALL")
  const [active, setActive] = useState("ALL")
  const [page, setPage] = useState(1)
  const [showImport, setShowImport] = useState(false)
  useEffect(() => { const timer = setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1) }, 350); return () => clearTimeout(timer) }, [query])
  const filters: AdminProductFilters = { q: debouncedQuery || undefined, category: category || undefined, status: status === "ALL" ? undefined : status as ProductStatus, is_active: active === "ALL" ? undefined : active === "true", page, limit: ADMIN_PAGE_SIZE }
  const { data, error, isLoading, mutate } = useSWR(["admin-products", filters], () => adminService.listProducts(filters), { keepPreviousData: true })
  const refreshAll = () => { void mutate(); void globalMutate((key) => Array.isArray(key) && (key[0] === "products" || key[0] === "admin-products" || key[0] === "product")); void globalMutate(DASHBOARD_KEY); void globalMutate(CATEGORIES_KEY); void globalMutate(TAGS_KEY) }
  const run = async (action: () => Promise<unknown>, success: string) => { try { await action(); toast.success(success); refreshAll() } catch (err) { toast.error(formatApiError(err)) } }
  const rows = data?.items ?? []
  return <><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">Danh mục hàng hóa</p><h1 className="mt-1 font-serif text-3xl">Sản phẩm</h1><p className="mt-1 text-xs text-muted-foreground">Quản lý thông tin và trạng thái hiển thị trong cửa hàng.</p></div><div className="flex gap-2"><button onClick={() => setShowImport(true)} className={buttonOutline}><FileSpreadsheet size={15} /> Import CSV</button><button onClick={() => onNavigate("/admin/products/new")} className={buttonPrimary}><Plus size={15} /> Thêm sản phẩm</button></div></div><div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_190px_170px_170px]"><div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3"><Search size={15} className="text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên hoặc SKU..." aria-label="Tìm sản phẩm" className="w-full bg-transparent text-xs outline-none" /></div><select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} aria-label="Lọc theo danh mục" className={fieldClass}><option value="">Tất cả danh mục</option>{categories?.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Lọc theo tình trạng kho" className={fieldClass}><option value="ALL">Mọi trạng thái kho</option><option value="IN_STOCK">Còn hàng</option><option value="OUT_OF_STOCK">Hết hàng</option></select><select value={active} onChange={(e) => { setActive(e.target.value); setPage(1) }} aria-label="Lọc theo hiển thị" className={fieldClass}><option value="ALL">Hiện & ẩn</option><option value="true">Đang hiển thị</option><option value="false">Đang ẩn</option></select></div>{error ? <ErrorState error={error} onRetry={() => void mutate()} /> : isLoading && !data ? <LoadingBlock label="Đang tải sản phẩm..." /> : <div className="overflow-hidden rounded-2xl border border-border bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-xs"><thead className="bg-[#f6f7f4] text-[10px] uppercase tracking-wider text-muted-foreground"><tr>{["Sản phẩm", "Danh mục", "Giá gốc", "Giảm", "Giá bán", "Tình trạng", "Hiển thị", "Ngày tạo", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{rows.map((product) => <tr key={product.id} data-testid="admin-product-row" data-product-code={product.code} className="border-t border-border/70 hover:bg-muted/20"><td className="px-4 py-3"><div className="flex items-center gap-3"><img src={product.images[0]?.url ?? "/placeholder.svg"} alt="" className="size-10 rounded-lg object-cover" /><div><button onClick={() => onNavigate(`/admin/products/${product.id}/edit`)} className="font-semibold hover:text-primary">{product.name}</button><p className="mt-1 text-[10px] text-muted-foreground">{product.code}</p></div></div></td><td className="px-4 py-3">{product.category.name}</td><td className="px-4 py-3">{formatVnd(product.price)}</td><td className="px-4 py-3">{discountLabel(product) ?? "—"}</td><td className="px-4 py-3 font-semibold">{formatVnd(product.final_price)}</td><td className="px-4 py-3"><button title="Đổi tình trạng kho" aria-label={`Đổi tình trạng kho ${product.name}`} onClick={() => void run(() => adminService.setProductStatus(product.id, product.status === "IN_STOCK" ? "OUT_OF_STOCK" : "IN_STOCK"), "Đã cập nhật tình trạng kho")}><StatusPill tone={productStatusTone[product.status]}>{productStatusLabel[product.status]}</StatusPill></button></td><td className="px-4 py-3"><button onClick={() => void run(() => adminService.setProductVisibility(product.id, !product.is_active), product.is_active ? "Đã ẩn sản phẩm" : "Đã hiển thị sản phẩm")} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${product.is_active ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{product.is_active ? "Đang hiện" : "Đang ẩn"}</button></td><td className="px-4 py-3 text-muted-foreground">{formatDate(product.created_at)}</td><td className="px-4 py-3"><div className="flex items-center gap-1"><button aria-label={`Chỉnh sửa ${product.name}`} className={compactButton} onClick={() => onNavigate(`/admin/products/${product.id}/edit`)}><Pencil size={14} /></button><button aria-label={`Xóa ${product.name}`} className={compactButton} onClick={() => { if (window.confirm(`Xóa sản phẩm “${product.name}”? Lịch sử đơn hàng vẫn được giữ.`)) void run(() => adminService.deleteProduct(product.id), "Đã xóa sản phẩm") }}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table>{!rows.length && <div className="p-12 text-center text-sm text-muted-foreground">Không có sản phẩm phù hợp bộ lọc.</div>}</div></div>}{data && <p className="mt-3 text-xs text-muted-foreground">Hiển thị {rows.length} trên {data.pagination.total} sản phẩm.</p>}{data && <Pagination page={page} totalPages={data.pagination.totalPages} onChange={setPage} />}{showImport && <CsvImportDialog onClose={() => setShowImport(false)} onImported={refreshAll} />}</>
}

function AdminProductFormPage({ productId, onNavigate }: { productId?: string; onNavigate: Navigate }) {
  const { mutate: globalMutate } = useSWRConfig()
  const { data: product, error, mutate } = useSWR(productId ? ["admin-product", productId] : null, () => adminService.getProduct(productId!))
  const save = async (values: ProductValues) => {
    const base: ProductInput = { code: values.code, name: values.name, shortDescription: values.short_description.trim(), description: values.description, categoryId: Number(values.category_id), price: values.price, discountType: values.discount_type as DiscountType, discountValue: values.discount_type === "NONE" ? 0 : values.discount_value, status: values.status as ProductStatus, isActive: values.is_active, tagIds: values.tagIds }
    try {
      if (product) {
        const update: Partial<ProductInput> = { ...base }
        // Dates and images are only sent when changed, so the exact stored values are kept otherwise.
        if (values.discount_start !== toDateInput(product.discount.start)) update.discountStart = fromDateInput(values.discount_start, false)
        if (values.discount_end !== toDateInput(product.discount.end)) update.discountEnd = fromDateInput(values.discount_end, true)
        if (values.image !== (product.images[0]?.url ?? "")) update.images = [...(values.image ? [{ url: values.image }] : []), ...product.images.slice(1).map((image) => ({ url: image.url }))]
        await adminService.updateProduct(product.id, update)
      } else {
        await adminService.createProduct({ ...base, discountStart: fromDateInput(values.discount_start, false), discountEnd: fromDateInput(values.discount_end, true), images: values.image ? [{ url: values.image }] : [] })
      }
      toast.success(product ? "Đã cập nhật sản phẩm" : "Đã tạo sản phẩm mới")
      void globalMutate((key) => Array.isArray(key) && ["products", "admin-products", "admin-product", "product"].includes(String(key[0])))
      void globalMutate(DASHBOARD_KEY)
      void globalMutate(CATEGORIES_KEY)
      void globalMutate(TAGS_KEY)
      onNavigate("/admin/products")
    } catch (err) {
      toast.error(formatApiError(err, "Không thể lưu sản phẩm."))
    }
  }
  const header = <div className="mb-6 flex items-center gap-3"><button className={compactButton} onClick={() => onNavigate("/admin/products")} aria-label="Quay lại"><ArrowLeft size={16} /></button><div><p className="text-xs text-muted-foreground">Sản phẩm / {productId ? "Chỉnh sửa" : "Thêm mới"}</p><h1 className="font-serif text-3xl">{productId ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm mới"}</h1></div></div>
  if (productId && isApiError(error, 404)) return <>{header}<EmptyPage title="Không tìm thấy sản phẩm" description="Sản phẩm có thể đã bị xóa." href="/admin/products" action="Về danh sách" /></>
  if (productId && error) return <>{header}<ErrorState error={error} onRetry={() => void mutate()} /></>
  if (productId && !product) return <>{header}<LoadingBlock /></>
  return <>{header}<ProductEditor key={product?.id ?? "new-product"} product={product} onSave={save} onCancel={() => onNavigate("/admin/products")} /></>
}

function AdminTaxonomy({ kind }: { kind: "categories" | "tags" }) {
  const isCategory = kind === "categories"
  const categoriesQuery = useCategories()
  const tagsQuery = useTags()
  const { data, error, mutate } = isCategory ? categoriesQuery : tagsQuery
  const { mutate: globalMutate } = useSWRConfig()
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<Category | ProductTag | null>(null)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [dialog, setDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const service = isCategory ? categoryService : tagService
  const label = isCategory ? "danh mục" : "thẻ"
  const items = (data ?? []).filter((item) => `${item.name} ${item.slug}`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")))
  const open = (item?: Category | ProductTag) => { setEditing(item ?? null); setName(item?.name ?? ""); setSlug(item?.slug ?? ""); setDialog(true) }
  const refresh = () => { void mutate(); void globalMutate((key) => Array.isArray(key) && ["products", "admin-products", "product"].includes(String(key[0]))); void globalMutate(DASHBOARD_KEY) }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const input = { name: name.trim(), slug: slug.trim() || makeSlug(name) }
      if (editing) await service.update(editing.id, input); else await service.create(input)
      setDialog(false)
      refresh()
      toast.success(editing ? "Đã cập nhật" : "Đã thêm mới")
    } catch (err) {
      toast.error(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }
  const remove = async (item: Category | ProductTag) => {
    if (!window.confirm(`Xóa ${label} “${item.name}”?`)) return
    try { await service.remove(item.id); refresh(); toast.success(`Đã xóa ${item.name}`) } catch (err) { toast.error(formatApiError(err)) }
  }
  return <><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">Quản lý nội dung cửa hàng</p><h1 className="mt-1 font-serif text-3xl">{isCategory ? "Danh mục" : "Thẻ sản phẩm"}</h1></div><button onClick={() => open()} className={buttonPrimary}><Plus size={15} /> Thêm {label}</button></div><div className="mb-4 flex h-10 max-w-sm items-center gap-2 rounded-xl border border-border bg-white px-3"><Search size={15} className="text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Tìm ${label}...`} className="w-full bg-transparent text-xs outline-none" /></div>{error ? <ErrorState error={error} onRetry={() => void mutate()} /> : !data ? <LoadingBlock /> : <section className="overflow-hidden rounded-2xl border border-border bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-xs"><thead className="bg-[#f6f7f4] text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3">Tên</th><th className="px-5 py-3">Slug</th><th className="px-5 py-3">Sản phẩm đang bán</th><th className="px-5 py-3 text-right">Thao tác</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} data-testid="taxonomy-row" data-slug={item.slug} className="border-t border-border/70"><td className="px-5 py-4 font-semibold">{item.name}</td><td className="px-5 py-4 font-mono text-[11px] text-muted-foreground">{item.slug}</td><td className="px-5 py-4 text-muted-foreground">{item.product_count} sản phẩm</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button className={compactButton} onClick={() => open(item)} aria-label={`Sửa ${item.name}`}><Pencil size={14} /></button><button className={compactButton} onClick={() => void remove(item)} aria-label={`Xóa ${item.name}`}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table>{!items.length && <p className="p-10 text-center text-sm text-muted-foreground">Chưa có dữ liệu phù hợp.</p>}</div></section>}{dialog && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="taxonomy-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 id="taxonomy-title" className="font-serif text-2xl">{editing ? "Chỉnh sửa" : "Thêm"} {label}</h2><button onClick={() => setDialog(false)} className={compactButton} aria-label="Đóng"><X size={16} /></button></div><form onSubmit={save} className="mt-5 flex flex-col gap-4"><label className="text-xs font-semibold">Tên<input required value={name} onChange={(e) => { setName(e.target.value); if (!editing) setSlug(makeSlug(e.target.value)) }} className={`${fieldClass} mt-1.5`} /></label><label className="text-xs font-semibold">Slug<input required value={slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Chữ thường, số và dấu gạch ngang" onChange={(e) => setSlug(e.target.value)} className={`${fieldClass} mt-1.5`} /></label><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setDialog(false)} className={buttonOutline}>Hủy</button><button disabled={saving} className={buttonPrimary}>{saving ? "Đang lưu..." : "Lưu"}</button></div></form></section></div>}</>
}

/** Every status can be chosen (the backend allows any change); options follow the workflow order. */
function OrderStatusSelect({ order, onChanged, className }: { order: AdminOrder; onChanged: () => void; className: string }) {
  const [saving, setSaving] = useState(false)
  const change = async (status: OrderStatus) => {
    if (status === "CANCELLED" && !window.confirm(`Huỷ đơn ${formatOrderCode(order.id)}?`)) return
    setSaving(true)
    try { await adminService.updateOrderStatus(order.id, status); toast.success("Đã cập nhật trạng thái đơn hàng"); onChanged() } catch (err) { toast.error(formatApiError(err)) } finally { setSaving(false) }
  }
  const options = ORDER_STATUSES.filter((value) => value === order.status || order.allowed_transitions.includes(value))
  return <select value={order.status} disabled={saving} onChange={(e) => void change(e.target.value as OrderStatus)} aria-label={`Trạng thái đơn ${formatOrderCode(order.id)}`} className={className}>{options.map((value) => <option key={value} value={value}>{orderStatusLabel[value]}</option>)}</select>
}

function AdminOrders({ onNavigate }: { onNavigate: Navigate }) {
  const { mutate: globalMutate } = useSWRConfig()
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [status, setStatus] = useState("ALL")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  useEffect(() => { const timer = setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1) }, 350); return () => clearTimeout(timer) }, [query])
  const orderId = /^#?0*(\d+)$/.exec(debouncedQuery)?.[1]
  const rangeInvalid = !!from && !!to && from > to
  // Shared by the list and the Excel export, so the file contains exactly what is filtered.
  const criteria = { id: orderId ? Number(orderId) : undefined, customer: orderId ? undefined : debouncedQuery || undefined, status: status === "ALL" ? undefined : status as OrderStatus, from: from || undefined, to: to || undefined }
  const filters = { ...criteria, page, limit: ADMIN_PAGE_SIZE }
  const { data, error, isLoading, mutate } = useSWR(rangeInvalid ? null : ["admin-orders", filters], () => adminService.listOrders(filters), { keepPreviousData: true })
  const rows = data?.items ?? []
  const refresh = () => { void mutate(); void globalMutate(DASHBOARD_KEY) }
  const exportExcel = async () => {
    setExporting(true)
    try { saveFile(await adminService.exportOrders(criteria)); toast.success("Đã xuất file Excel") } catch (err) { toast.error(formatApiError(err, "Không thể xuất file Excel.")) } finally { setExporting(false) }
  }
  const resetDates = () => { setFrom(""); setTo(""); setPage(1) }
  return <><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">Bán hàng</p><h1 className="mt-1 font-serif text-3xl">Đơn hàng</h1><p className="mt-1 text-xs text-muted-foreground">Theo dõi, xác nhận và cập nhật trạng thái đơn hàng.</p></div><button onClick={() => void exportExcel()} disabled={exporting || rangeInvalid} className={buttonOutline}><FileSpreadsheet size={15} /> {exporting ? "Đang xuất..." : "Xuất Excel"}</button></div><div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_190px_170px_170px_auto]"><div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-3"><Search size={15} className="text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mã đơn, tên, SĐT hoặc email khách hàng" aria-label="Tìm đơn hàng" className="w-full bg-transparent text-xs outline-none" /></div><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Lọc theo trạng thái" className={fieldClass}><option value="ALL">Tất cả trạng thái</option>{ORDER_STATUSES.map((value) => <option key={value} value={value}>{orderStatusLabel[value]}</option>)}</select><label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-3 text-[11px] text-muted-foreground">Từ<input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1) }} aria-label="Đặt từ ngày" className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none" /></label><label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-3 text-[11px] text-muted-foreground">Đến<input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1) }} aria-label="Đặt đến ngày" className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none" /></label>{from || to ? <button onClick={resetDates} className={`${buttonQuiet} px-3 text-xs`}>Xóa ngày</button> : <span />}</div>{rangeInvalid && <p role="alert" className="mb-3 text-xs text-destructive">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}{error ? <ErrorState error={error} onRetry={() => void mutate()} /> : isLoading && !data ? <LoadingBlock label="Đang tải đơn hàng..." /> : <section className="overflow-hidden rounded-2xl border border-border bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-xs"><thead className="bg-[#f6f7f4] text-[10px] uppercase tracking-wider text-muted-foreground"><tr>{["Mã đơn", "Khách hàng", "Ngày đặt", "Ngày nhận", "Sản phẩm", "Tổng cộng", "Trạng thái", ""].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{rows.map((order) => <tr key={order.id} data-testid="admin-order-row" className="border-t border-border/70 hover:bg-muted/20"><td className="px-4 py-4 font-semibold">{formatOrderCode(order.id)}</td><td className="px-4 py-4"><p className="font-medium">{order.customer_name}</p><p className="mt-1 text-[10px] text-muted-foreground">{order.user.email} · {order.customer_phone}</p></td><td className="px-4 py-4 text-muted-foreground">{formatDate(order.created_at)}</td><td className="px-4 py-4">{formatDateOnly(order.desired_date)}</td><td className="px-4 py-4">{order.item_count} món</td><td className="px-4 py-4 font-semibold">{formatVnd(order.total_amount)}</td><td className="px-4 py-4"><OrderStatusSelect order={order} onChanged={refresh} className="max-w-36 rounded-full border border-border bg-white px-2.5 py-1.5 text-[10px]" /></td><td className="px-4 py-4"><button onClick={() => onNavigate(`/admin/orders/${order.id}`)} className={compactButton} aria-label="Xem đơn hàng"><Eye size={14} /></button></td></tr>)}</tbody></table>{!rows.length && <p className="p-10 text-center text-sm text-muted-foreground">Không có đơn hàng phù hợp.</p>}</div></section>}{data && <p className="mt-3 text-xs text-muted-foreground">{data.pagination.total} đơn hàng phù hợp bộ lọc.</p>}{data && <Pagination page={page} totalPages={data.pagination.totalPages} onChange={setPage} />}</>
}

function AdminOrderDetail({ id, onNavigate }: { id: string; onNavigate: Navigate }) {
  const { mutate: globalMutate } = useSWRConfig()
  const { data: order, error, mutate } = useSWR(["admin-order", id], () => adminService.getOrder(id))
  if (isApiError(error, 404) || isApiError(error, 400)) return <EmptyPage title="Không tìm thấy đơn hàng" description="Đơn hàng không tồn tại." href="/admin/orders" action="Về đơn hàng" />
  if (error) return <ErrorState error={error} onRetry={() => void mutate()} />
  if (!order) return <LoadingBlock />
  const refresh = () => { void mutate(); void globalMutate((key) => key === DASHBOARD_KEY || (Array.isArray(key) && key[0] === "admin-orders")) }
  return <><button onClick={() => onNavigate("/admin/orders")} className="mb-5 flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft size={14} /> Danh sách đơn hàng</button><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-muted-foreground">Đơn hàng / Chi tiết</p><h1 className="mt-1 font-serif text-3xl">{formatOrderCode(order.id)}</h1><p className="mt-1 text-xs text-muted-foreground">Đặt ngày {formatDateTime(order.created_at)}</p></div><OrderStatusSelect order={order} onChanged={refresh} className={`${fieldClass} w-auto min-w-40`} /></div><div className="grid gap-5 lg:grid-cols-[1fr_330px]"><section className="rounded-2xl border border-border bg-white p-5"><h2 className="font-serif text-xl">Sản phẩm trong đơn</h2><OrderItemsSummary order={order} /></section><aside className="h-fit rounded-2xl border border-border bg-white p-5"><h2 className="font-serif text-xl">Thông tin khách hàng</h2><p className="mt-4 text-sm font-semibold">{order.customer_name}</p><p className="mt-1 text-xs text-muted-foreground">{order.user.email}</p><p className="mt-1 text-xs text-muted-foreground">{order.customer_phone}</p><div className="my-4 border-t border-border" /><p className="text-xs text-muted-foreground">Ngày nhận mong muốn</p><p className="mt-1 text-sm font-semibold" data-testid="order-desired-date">{formatDateOnly(order.desired_date)}</p><div className="my-4 border-t border-border" /><p className="text-xs font-semibold">{shippingMethodLabel[order.shipping_method]}</p><p className="mt-2 flex gap-2 text-xs leading-6 text-muted-foreground"><Truck size={15} className="mt-1 shrink-0 text-primary" />{formatOrderAddress(order)}</p></aside></div></>
}

function AdminGate({ user, onNavigate }: { user: User | null; onNavigate: Navigate }) {
  if (user) return <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-[#f4e3db] text-[#9f4c32]"><LockKeyhole size={22} /></span><h1 className="mt-5 font-serif text-3xl">Bạn không có quyền truy cập</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Khu vực này chỉ dành cho quản trị viên. Tài khoản {user.email} không có quyền quản trị.</p><button onClick={() => onNavigate("/")} className={`${buttonPrimary} mt-5`}>Về cửa hàng <ArrowRight size={15} /></button></div>
  return <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-[#e9eee8] text-primary"><LockKeyhole size={22} /></span><h1 className="mt-5 font-serif text-3xl">Khu vực dành cho quản trị viên</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Đăng nhập bằng tài khoản admin để quản lý cửa hàng.</p><button onClick={() => onNavigate("/login?next=/admin")} className={`${buttonPrimary} mt-5`}>Đăng nhập quản trị <ArrowRight size={15} /></button></div>
}

// ============================================================================ scents (display only)

const SCENT_FILTERS: { value: ScentType | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "PERFUME", label: scentTypeLabel.PERFUME },
  { value: "NATURAL", label: scentTypeLabel.NATURAL },
]
const scentTypeTone: Record<ScentType, string> = { PERFUME: "bg-[#eeeaf1] text-[#5b4a6b]", NATURAL: "bg-[#e9eee8] text-primary" }

/** Showcase of the shop's scents: for browsing only, nothing is sold here. */
function ScentsPage({ onNavigate }: { onNavigate: Navigate }) {
  const router = useRouter()
  const params = useSearchParams()
  const typeParam = params.get("type")
  const type: ScentType | undefined = typeParam === "PERFUME" || typeParam === "NATURAL" ? typeParam : undefined
  const { data, error, isLoading, mutate } = useSWR(["scents", type ?? "all"], () => scentService.list(type))
  return <main className="mx-auto max-w-[1250px] px-4 py-10 sm:px-7 lg:px-10"><div className="mb-2 text-xs text-muted-foreground">Trang chủ <span className="px-1.5">/</span> Mùi hương</div><SectionHeading eyebrow="Thư viện mùi hương" title="Mỗi mùi hương, một câu chuyện." description="Khám phá những mùi hương của Chipscendle: từ hương nước hoa sang trọng đến hương tự nhiên mộc mạc. Tìm mùi bạn thích rồi chọn chiếc nến mang mùi hương ấy." /><div className="mb-7 flex flex-wrap gap-2" role="tablist" aria-label="Lọc theo loại mùi">{SCENT_FILTERS.map(({ value, label }) => { const active = (type ?? "") === value; return <button key={label} role="tab" aria-selected={active} onClick={() => router.replace(value ? `/scents?type=${value}` : "/scents", { scroll: false })} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${active ? "border-primary bg-primary text-white" : "border-border bg-white text-muted-foreground hover:text-foreground"}`}>{label}</button> })}</div>{error ? <ErrorState error={error} onRetry={() => void mutate()} title="Không thể tải mùi hương" /> : isLoading || !data ? <LoadingGrid count={6} label="Đang tải mùi hương" /> : !data.length ? <div className="flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-white p-8 text-center"><Flower2 className="mb-3 text-primary/60" /><p className="font-medium">Chưa có mùi hương nào{type ? ` thuộc nhóm ${scentTypeLabel[type].toLowerCase()}` : ""}.</p><p className="mt-1 text-sm text-muted-foreground">Những mùi hương mới sẽ sớm được giới thiệu tại đây.</p></div> : <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{data.map((scent) => <article key={scent.id} data-testid="scent-card" className="min-w-0"><div className="relative mb-4 aspect-[4/3] overflow-hidden rounded-2xl bg-[#f0efeb]">{scent.image_url ? <img src={scent.image_url} alt={scent.name} loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-primary/40"><Flower2 size={42} /></div>}<span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold ${scentTypeTone[scent.type]}`}>{scentTypeLabel[scent.type]}</span></div><h3 className="font-serif text-2xl leading-tight">{scent.name}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{scent.description}</p></article>)}</div>}<div className="mt-14 flex flex-col items-start justify-between gap-4 rounded-[22px] bg-[#f0eee8] px-6 py-7 sm:flex-row sm:items-center sm:px-9"><div><p className="font-serif text-2xl">Đã tìm được mùi hương yêu thích?</p><p className="mt-1 text-sm text-muted-foreground">Xem những sản phẩm đang có trong cửa hàng.</p></div><button onClick={() => onNavigate("/products")} className={buttonPrimary}>Xem nến thơm <ArrowRight size={15} /></button></div></main>
}

const MAX_SCENT_IMAGE_BYTES = 5 * 1024 * 1024

function AdminScents() {
  const { mutate: globalMutate } = useSWRConfig()
  const { data, error, mutate } = useSWR("admin-scents", scentService.listAdmin)
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<AdminScent | null>(null)
  const [dialog, setDialog] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState<ScentType>("PERFUME")
  const [description, setDescription] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const items = (data ?? []).filter((s) => `${s.name} ${s.description}`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")))
  const refresh = () => { void mutate(); void globalMutate((key) => Array.isArray(key) && key[0] === "scents") }
  const open = (scent?: AdminScent) => { setEditing(scent ?? null); setName(scent?.name ?? ""); setType(scent?.type ?? "PERFUME"); setDescription(scent?.description ?? ""); setImageUrl(scent?.image_url ?? ""); setFile(null); setPreview(null); setIsActive(scent?.is_active ?? true); setDialog(true) }
  const pickFile = (picked?: File) => {
    if (!picked) return
    if (!/^image\/(jpeg|png|webp|gif)$/.test(picked.type)) { toast.error("Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF."); return }
    if (picked.size > MAX_SCENT_IMAGE_BYTES) { toast.error("Ảnh vượt quá 5 MB."); return }
    setFile(picked)
    setPreview(URL.createObjectURL(picked))
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !description.trim()) return
    setSaving(true)
    try {
      // A chosen file is uploaded first; its URL is then stored on the scent.
      const finalUrl = file ? await scentService.uploadImage(file) : imageUrl.trim() || null
      const input = { name: name.trim(), type, description: description.trim(), imageUrl: finalUrl, isActive }
      if (editing) await scentService.update(editing.id, input); else await scentService.create(input)
      setDialog(false)
      refresh()
      toast.success(editing ? "Đã cập nhật mùi hương" : "Đã thêm mùi hương")
    } catch (err) {
      toast.error(formatApiError(err, "Không thể lưu mùi hương."))
    } finally {
      setSaving(false)
    }
  }
  const toggle = async (scent: AdminScent) => {
    try { await scentService.update(scent.id, { isActive: !scent.is_active }); refresh(); toast.success(scent.is_active ? "Đã ẩn mùi hương" : "Đã hiển thị mùi hương") } catch (err) { toast.error(formatApiError(err)) }
  }
  const remove = async (scent: AdminScent) => {
    if (!window.confirm(`Xóa mùi hương “${scent.name}”?`)) return
    try { await scentService.remove(scent.id); refresh(); toast.success(`Đã xóa ${scent.name}`) } catch (err) { toast.error(formatApiError(err)) }
  }
  const shownImage = preview ?? (imageUrl.trim() || null)
  return <><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">Trang trưng bày</p><h1 className="mt-1 font-serif text-3xl">Mùi hương</h1><p className="mt-1 text-xs text-muted-foreground">Các mùi hương hiển thị ở trang “Mùi hương” để khách tham khảo.</p></div><button onClick={() => open()} className={buttonPrimary}><Plus size={15} /> Thêm mùi hương</button></div><div className="mb-4 flex h-10 max-w-sm items-center gap-2 rounded-xl border border-border bg-white px-3"><Search size={15} className="text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm mùi hương..." aria-label="Tìm mùi hương" className="w-full bg-transparent text-xs outline-none" /></div>{error ? <ErrorState error={error} onRetry={() => void mutate()} /> : !data ? <LoadingBlock /> : <section className="overflow-hidden rounded-2xl border border-border bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[#f6f7f4] text-[10px] uppercase tracking-wider text-muted-foreground"><tr>{["Mùi hương", "Loại mùi", "Mô tả", "Hiển thị", ""].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{items.map((scent) => <tr key={scent.id} data-testid="admin-scent-row" className="border-t border-border/70"><td className="px-4 py-3"><div className="flex items-center gap-3">{scent.image_url ? <img src={scent.image_url} alt="" className="size-11 rounded-lg object-cover" /> : <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-primary/50"><Flower2 size={18} /></span>}<span className="font-semibold">{scent.name}</span></div></td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${scentTypeTone[scent.type]}`}>{scentTypeLabel[scent.type]}</span></td><td className="max-w-xs px-4 py-3 text-muted-foreground"><p className="line-clamp-2">{scent.description}</p></td><td className="px-4 py-3"><button onClick={() => void toggle(scent)} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${scent.is_active ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{scent.is_active ? "Đang hiện" : "Đang ẩn"}</button></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button className={compactButton} onClick={() => open(scent)} aria-label={`Sửa ${scent.name}`}><Pencil size={14} /></button><button className={compactButton} onClick={() => void remove(scent)} aria-label={`Xóa ${scent.name}`}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table>{!items.length && <p className="p-10 text-center text-sm text-muted-foreground">{data.length ? "Không có mùi hương phù hợp." : "Chưa có mùi hương nào. Bấm “Thêm mùi hương” để bắt đầu."}</p>}</div></section>}{dialog && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="scent-title" className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 id="scent-title" className="font-serif text-2xl">{editing ? "Chỉnh sửa mùi hương" : "Thêm mùi hương"}</h2><button onClick={() => setDialog(false)} className={compactButton} aria-label="Đóng"><X size={16} /></button></div><form onSubmit={save} className="mt-5 flex flex-col gap-4"><label className="text-xs font-semibold">Tên mùi hương<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={`${fieldClass} mt-1.5`} /></label><label className="text-xs font-semibold">Loại mùi<select value={type} onChange={(e) => setType(e.target.value as ScentType)} className={`${fieldClass} mt-1.5`}><option value="PERFUME">{scentTypeLabel.PERFUME}</option><option value="NATURAL">{scentTypeLabel.NATURAL}</option></select></label><label className="text-xs font-semibold">Mô tả<textarea required maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tầng hương, cảm giác, gợi ý không gian sử dụng..." className={`${areaClass} mt-1.5`} /></label><div><span className="text-xs font-semibold">Ảnh</span><div className="mt-1.5 flex items-start gap-3"><div className="size-24 shrink-0 overflow-hidden rounded-xl bg-muted">{shownImage ? <img src={shownImage} alt="Xem trước ảnh mùi hương" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-primary/40"><Flower2 size={26} /></span>}</div><div className="flex min-w-0 flex-1 flex-col gap-2"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" data-testid="scent-image-input" onChange={(e) => pickFile(e.target.files?.[0])} /><button type="button" onClick={() => fileRef.current?.click()} className={`${buttonOutline} self-start text-xs`}><ImagePlus size={14} /> {file ? file.name : "Tải ảnh lên"}</button><input value={file ? "" : imageUrl} disabled={!!file} onChange={(e) => setImageUrl(e.target.value)} placeholder="hoặc dán đường dẫn ảnh https://..." aria-label="Đường dẫn ảnh" className={fieldClass} />{(file || imageUrl) && <button type="button" onClick={() => { setFile(null); setPreview(null); setImageUrl("") }} className="self-start text-[11px] font-semibold text-destructive">Bỏ ảnh</button>}</div></div><p className="mt-1 text-[10px] text-muted-foreground">JPG, PNG, WEBP hoặc GIF · tối đa 5 MB</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 accent-primary" /> Hiển thị trên trang Mùi hương</label><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setDialog(false)} className={buttonOutline}>Hủy</button><button disabled={saving} className={buttonPrimary}>{saving ? "Đang lưu..." : "Lưu"}</button></div></form></section></div>}</>
}

/** SWR: don't hammer the API on client errors (4xx); retry server/network errors a few times. */
const swrConfig = {
  revalidateOnFocus: false,
  onErrorRetry: (error: unknown, _key: string, _config: unknown, revalidate: (opts: { retryCount: number }) => void, { retryCount }: { retryCount: number }) => {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) return
    if (retryCount >= 3) return
    setTimeout(() => revalidate({ retryCount }), 1500 * (retryCount + 1))
  },
}

export function CommerceApp() {
  return <SWRConfig value={swrConfig}><CommerceRoutes /></SWRConfig>
}

function CommerceRoutes() {
  const pathname = usePathname() || "/"
  const router = useRouter()
  const searchParams = useSearchParams()
  const { mutate: globalMutate, cache } = useSWRConfig()
  const navigate = useCallback((href: string) => router.push(href), [router])
  const handleExpired = useCallback(() => {
    toast.error("Phiên đăng nhập đã hết hạn.", { description: "Vui lòng đăng nhập lại." })
    router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
  }, [router])
  const { user, status, signIn, signOut, resolveUser } = useSession(handleExpired)
  const cartKey = status === "loading" ? null : cartKeyFor(user)
  const { data: cart, error: cartError, mutate: mutateCart } = useSWR(cartKey, cartService.get)

  // After login (or on a restored session), move any guest cart into the user's cart.
  const merging = useRef(false)
  useEffect(() => {
    if (!user || merging.current || !cartService.hasGuestCart()) return
    merging.current = true
    cartService.mergeGuestCart()
      .then(({ cart: merged, merge }) => {
        void globalMutate(cartKeyFor(user), merged, { revalidate: false })
        if (merge.merged) toast.success(`Đã chuyển ${merge.merged} sản phẩm từ giỏ hàng vào tài khoản của bạn.`)
        if (merge.skipped) toast.warning(`${merge.skipped} sản phẩm đã hết hàng hoặc ngừng bán nên không được chuyển vào giỏ.`)
      })
      .catch((error: unknown) => { if (!isApiError(error, 401)) toast.error(formatApiError(error, "Không thể chuyển giỏ hàng vào tài khoản.")) })
      .finally(() => { merging.current = false })
  }, [user, globalMutate])

  const clearPrivateCache = useCallback(() => {
    // Drop every cached response that belongs to the previous user.
    for (const key of cache.keys()) if (/cart|order|admin/.test(String(key))) cache.delete(key)
  }, [cache])

  const logout = () => { signOut(); clearPrivateCache(); toast.success("Đã đăng xuất"); navigate("/") }

  const onAuthenticated = (result: AuthResult, remember: boolean) => {
    clearPrivateCache()
    signIn(result, remember)
    toast.success(`Xin chào ${result.user.name}!`)
    navigate(safeNext(searchParams.get("next")) ?? (result.user.role === "ADMIN" ? "/admin" : pathname === "/register" ? "/" : "/orders"))
  }

  const addToCart = async (product: Product, quantity = 1) => {
    // Guests get a server-side guest cart; it is merged into their account when they log in.
    const currentUser = await resolveUser()
    try {
      await globalMutate(cartKeyFor(currentUser), cartService.add(product.id, quantity), { revalidate: false })
      toast.success("Đã thêm vào giỏ hàng", { description: product.name })
    } catch (error) {
      // e.g. 409 PRODUCT_OUT_OF_STOCK when the product sold out after the page was loaded
      toast.error(formatApiError(error, "Không thể thêm vào giỏ hàng."), { description: product.name })
      if (isApiError(error, 409) || isApiError(error, 404)) void globalMutate((key) => Array.isArray(key) && (key[0] === "products" || key[0] === "product"))
    }
  }

  const changeCart = async (action: () => Promise<Cart>, success?: string) => {
    try {
      await mutateCart(action(), { revalidate: false })
      if (success) toast.success(success)
    } catch (error) {
      toast.error(formatApiError(error, "Không thể cập nhật giỏ hàng."))
      void mutateCart()
    }
  }

  const placeOrder = async (values: CheckoutInput) => {
    try {
      const order = await orderService.create(values)
      await mutateCart()
      void globalMutate((key) => Array.isArray(key) && key[0] === "my-orders")
      toast.success("Đặt hàng thành công!")
      navigate(`/orders/${order.id}`)
    } catch (error) {
      if (isApiError(error, 409, "CART_HAS_UNAVAILABLE_ITEMS")) {
        const codes = Array.isArray(error.details) ? (error.details as { code: string | null }[]).map((d) => d.code).filter(Boolean).join(", ") : ""
        toast.error(error.message, { description: codes ? `Sản phẩm: ${codes}` : undefined })
        await mutateCart()
        navigate("/cart")
      } else if (isApiError(error, 400, "CART_EMPTY")) {
        toast.error(error.message)
        await mutateCart()
        navigate("/cart")
      } else {
        toast.error(formatApiError(error, "Không thể đặt hàng."))
      }
    }
  }

  const productRoute = pathname.match(/^\/products\/([^/]+)/)
  const orderRoute = pathname.match(/^\/orders\/([^/]+)/)
  const adminOrderRoute = pathname.match(/^\/admin\/orders\/([^/]+)/)
  const editRoute = pathname.match(/^\/admin\/products\/([^/]+)\/edit/)
  const currentPath = pathname + (searchParams.toString() ? `?${searchParams}` : "")
  let content: React.ReactNode

  if (pathname.startsWith("/admin")) {
    if (status === "loading") return <><Toaster position="top-right" richColors /><PageLoading /></>
    if (user?.role !== "ADMIN") return <><Toaster position="top-right" richColors /><AdminGate user={user} onNavigate={navigate} /></>
    if (pathname === "/admin" || pathname === "/admin/") content = <AdminDashboard onNavigate={navigate} />
    else if (pathname === "/admin/products") content = <AdminProducts onNavigate={navigate} />
    else if (pathname === "/admin/products/new") content = <AdminProductFormPage onNavigate={navigate} />
    else if (editRoute) content = <AdminProductFormPage key={editRoute[1]} productId={editRoute[1]} onNavigate={navigate} />
    else if (pathname === "/admin/categories") content = <AdminTaxonomy key="categories" kind="categories" />
    else if (pathname === "/admin/tags") content = <AdminTaxonomy key="tags" kind="tags" />
    else if (pathname === "/admin/scents") content = <AdminScents />
    else if (adminOrderRoute) content = <AdminOrderDetail key={adminOrderRoute[1]} id={adminOrderRoute[1]} onNavigate={navigate} />
    else if (pathname === "/admin/orders") content = <AdminOrders onNavigate={navigate} />
    else content = <AdminDashboard onNavigate={navigate} />
    return <><Toaster position="top-right" richColors /><AdminShell pathname={pathname} user={user} onNavigate={navigate} onLogout={logout}>{content}</AdminShell></>
  }

  const requireUser = (description: string, page: () => React.ReactNode) => status === "loading" ? <PageLoading /> : !user ? <LoginRequired description={description} next={currentPath} /> : page()
  const openProduct = (p: Product) => navigate(`/products/${encodeURIComponent(p.code)}`)

  if (productRoute) content = <ProductDetailPage key={productRoute[1]} code={productRoute[1]} onAdd={addToCart} onOpen={openProduct} />
  else if (pathname === "/products") content = <ListingPage onAdd={addToCart} onOpen={openProduct} />
  else if (pathname === "/scents") content = <ScentsPage onNavigate={navigate} />
  else if (pathname === "/cart") content = status === "loading" ? <PageLoading /> : <CartPage cart={cart} isGuest={!user} error={cartError} onRetry={() => void mutateCart()} onChange={changeCart} onNavigate={navigate} />
  else if (pathname === "/checkout") content = requireUser("Đăng nhập để tiếp tục thanh toán.", () => cartError ? <main className="mx-auto max-w-[1120px] px-4 py-10"><ErrorState error={cartError} onRetry={() => void mutateCart()} /></main> : !cart ? <PageLoading /> : <CheckoutFormPage cart={cart} defaultName={user?.name} onPlaceOrder={placeOrder} />)
  else if (pathname === "/login" || pathname === "/register") content = <AuthPage key={pathname} mode={pathname === "/login" ? "login" : "register"} onAuthenticated={onAuthenticated} onNavigate={navigate} />
  else if (orderRoute) content = requireUser("Đăng nhập để xem chi tiết đơn hàng.", () => <OrderDetailPage key={orderRoute[1]} id={orderRoute[1]} onNavigate={navigate} />)
  else if (pathname === "/orders") content = requireUser("Đăng nhập để theo dõi đơn hàng của bạn.", () => <OrdersPage onNavigate={navigate} />)
  else content = <HomePage onAdd={addToCart} onOpen={openProduct} onNavigate={navigate} />
  const cartCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0
  return <><Toaster position="top-right" richColors /><SiteHeader count={cartCount} user={user} onNavigate={navigate} onLogout={logout} /><div key={pathname}>{content}</div><SiteFooter onNavigate={navigate} /></>
}

export default CommerceApp
