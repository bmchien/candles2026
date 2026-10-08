import { expect, test } from "@playwright/test"
import { backend, uid, vnd, type ApiCategory, type ApiProduct } from "./helpers"

// TEST 3: product browsing against real backend data
test.describe("storefront (anonymous)", () => {
  test("product list loads from the backend and paginates", async ({ page, request }) => {
    const all = await backend(request).get<ApiProduct[]>("/products?limit=100")
    await page.goto("/products")
    await expect(page.getByTestId("product-total")).toHaveText(`${all.length} sản phẩm`)
    const cards = page.getByTestId("product-card")
    await expect(cards).toHaveCount(Math.min(8, all.length))
    // Newest first, as returned by the API
    await expect(cards.first()).toHaveAttribute("data-product-code", all[0].code)
    if (all.length > 8) {
      await page.getByRole("button", { name: "Trang sau" }).click()
      await expect(page).toHaveURL(/page=2/)
      await expect(cards.first()).toHaveAttribute("data-product-code", all[8].code)
    }
  })

  test("search, category, status and price filters query the backend", async ({ page, request }) => {
    const api = backend(request)
    const [first] = await api.get<ApiProduct[]>("/products?limit=1")
    await page.goto("/products")
    await page.getByLabel("Tìm theo tên, mã hoặc thẻ").fill(first.code)
    await expect(page).toHaveURL(new RegExp(`q=${first.code}`))
    await expect(page.getByTestId("product-card").first()).toHaveAttribute("data-product-code", first.code)

    const categories = await api.get<ApiCategory[]>("/categories")
    const category = categories[0]
    const inCategory = await api.get<ApiProduct[]>(`/products?category=${category.slug}&limit=100`)
    await page.goto("/products")
    await page.getByLabel("Danh mục").selectOption(category.slug)
    await expect(page).toHaveURL(new RegExp(`category=${category.slug}`))
    await expect(page.getByTestId("product-total")).toHaveText(`${inCategory.length} sản phẩm`)

    const outOfStock = await api.get<ApiProduct[]>("/products?status=OUT_OF_STOCK&limit=100")
    await page.goto("/products")
    await page.getByLabel("Tình trạng").selectOption("OUT_OF_STOCK")
    await expect(page.getByTestId("product-total")).toHaveText(`${outOfStock.length} sản phẩm`)
    await expect(page.getByTestId("product-card").first().getByText("Hết hàng")).toBeVisible()

    const ranged = await api.get<ApiProduct[]>("/products?min_price=1000000&max_price=5000000&limit=100")
    await page.goto("/products")
    await page.getByLabel("Giá từ").fill("1000000")
    await page.getByLabel("Giá đến").fill("5000000")
    await expect(page).toHaveURL(/max_price=5000000/)
    await expect(page.getByTestId("product-total")).toHaveText(`${ranged.length} sản phẩm`)
  })

  // TEST 4: header "Sản phẩm" dropdown → tag → /products?tag=…
  test("header dropdown lists backend tags and filters by tag", async ({ page, request }) => {
    const tags = await backend(request).get<{ name: string; slug: string; product_count: number }[]>("/tags")
    const tag = tags.find((t) => t.product_count > 0)!
    const tagged = await backend(request).get<ApiProduct[]>(`/products?tag=${tag.slug}&limit=100`)
    await page.goto("/")
    await page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("button", { name: "Sản phẩm", exact: true }).hover()
    const menu = page.getByRole("menu")
    await expect(menu.getByRole("menuitem")).toHaveCount(1 + (await backend(request).get<unknown[]>("/categories")).length + tags.length)
    await menu.getByRole("menuitem", { name: tag.name, exact: true }).click()
    await expect(page).toHaveURL(`/products?tag=${tag.slug}`)
    await expect(page.getByRole("heading", { name: tag.name })).toBeVisible()
    await expect(page.getByTestId("product-total")).toHaveText(`${tagged.length} sản phẩm`)
    const codes = await page.getByTestId("product-card").evaluateAll((els) => els.map((el) => el.getAttribute("data-product-code")))
    expect(codes).toEqual(tagged.slice(0, 8).map((p) => p.code))
  })

  test("discounted product shows backend final price and crossed-out original price", async ({ page, request }) => {
    const [sale] = await backend(request).get<ApiProduct[]>("/products?on_sale=true&limit=1")
    test.skip(!sale, "no discounted product in the catalog")
    await page.goto(`/products/${encodeURIComponent(sale.code)}`)
    await expect(page.getByRole("heading", { name: sale.name })).toBeVisible()
    await expect(page.getByTestId("final-price")).toHaveText(vnd(sale.final_price))
    const original = page.getByTestId("original-price")
    await expect(original).toHaveText(vnd(sale.price))
    await expect(original).toHaveCSS("text-decoration-line", "line-through")
  })

  test("OUT_OF_STOCK product shows 'Hết hàng' and cannot be added", async ({ page, request }) => {
    const [oos] = await backend(request).get<ApiProduct[]>("/products?status=OUT_OF_STOCK&limit=1")
    test.skip(!oos, "no out-of-stock product in the catalog")
    await page.goto(`/products/${encodeURIComponent(oos.code)}`)
    await expect(page.getByRole("button", { name: "Hết hàng" })).toBeDisabled()
  })

  test("unknown / hidden product shows a not-found page", async ({ page }) => {
    await page.goto("/products/NO-SUCH-PRODUCT-123")
    await expect(page.getByRole("heading", { name: "Không tìm thấy sản phẩm" })).toBeVisible()
  })

  test("guest cart: add without login, survives reload, is merged into the account at login", async ({ page, request }) => {
    const [product] = await backend(request).get<ApiProduct[]>("/products?status=IN_STOCK&limit=1")
    await page.goto(`/products/${encodeURIComponent(product.code)}`)
    await page.getByRole("button", { name: "Tăng số lượng" }).click()
    await page.getByRole("button", { name: "Thêm vào giỏ" }).click()
    await expect(page.getByText("Đã thêm vào giỏ hàng")).toBeVisible()
    await expect(page.getByTestId("cart-count")).toHaveText("2")
    expect(await page.evaluate(() => localStorage.getItem("chipscendle.cart_token"))).toMatch(/^[A-Za-z0-9_-]{43}$/)

    // The guest cart lives on the server: same contents and backend prices after a reload.
    await page.goto("/cart")
    await page.reload()
    await expect(page.getByTestId("cart-item")).toHaveCount(1)
    await expect(page.getByTestId("cart-item-quantity")).toHaveText("2")
    await expect(page.getByTestId("cart-total")).toHaveText(vnd(product.final_price * 2))

    // Checkout requires an account; the cart follows the customer into it.
    await page.getByRole("button", { name: "Đăng nhập để đặt hàng" }).click()
    await expect(page).toHaveURL("/login?next=/checkout")
    await page.getByRole("main").getByRole("button", { name: "Đăng ký", exact: true }).click()
    await expect(page).toHaveURL(/\/register\?next=/)
    await page.getByLabel("Họ và tên").fill("Khách Vãng Lai")
    await page.getByLabel("Email", { exact: true }).fill(`e2e.guest.${uid().toLowerCase()}@example.com`)
    await page.getByLabel("Mật khẩu", { exact: true }).fill("E2eTest1234")
    await page.getByLabel("Xác nhận mật khẩu").fill("E2eTest1234")
    await page.getByRole("button", { name: "Tạo tài khoản" }).click()

    await expect(page).toHaveURL("/checkout")
    await expect(page.getByText("Đã chuyển 1 sản phẩm từ giỏ hàng vào tài khoản của bạn.")).toBeVisible()
    await expect(page.getByRole("complementary").getByText(product.name)).toBeVisible()
    await expect(page.getByTestId("cart-count")).toHaveText("2")
    expect(await page.evaluate(() => localStorage.getItem("chipscendle.cart_token"))).toBeNull()
  })
})
