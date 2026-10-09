import { expect, test, type Page } from "@playwright/test"
import { ADMIN_STATE, backend, createTestProduct, CUSTOMER_STATE, ddmmyyyy, deleteProductsByPrefix, inDays, tokenFromState, vnd, type ApiProduct } from "./helpers"

test.use({ storageState: CUSTOMER_STATE })

let product: ApiProduct
let adminToken: string

test.beforeAll(async ({ request }) => {
  adminToken = tokenFromState(ADMIN_STATE)
  product = await createTestProduct(request, adminToken) // 300 000 ₫ −10% → 270 000 ₫
})

test.afterAll(async ({ request }) => {
  await deleteProductsByPrefix(request, adminToken, product.code)
})

test.beforeEach(async ({ request }) => {
  await backend(request, tokenFromState(CUSTOMER_STATE)).delete("/cart")
})

async function addTestProduct(page: Page, quantity = 1) {
  await page.goto(`/products/${product.code}`)
  for (let i = 1; i < quantity; i++) await page.getByRole("button", { name: "Tăng số lượng" }).click()
  await page.getByRole("button", { name: "Thêm vào giỏ" }).click()
  await expect(page.getByText("Đã thêm vào giỏ hàng")).toBeVisible()
}

// TEST 5: cart
test("cart: add, change quantity, remove — totals come from the backend", async ({ page }) => {
  await addTestProduct(page, 2)
  await expect(page.getByTestId("cart-count")).toHaveText("2")

  await page.goto("/cart")
  const item = page.getByTestId("cart-item")
  await expect(item).toHaveCount(1)
  await expect(page.getByTestId("cart-total")).toHaveText(vnd(540000))

  await item.getByRole("button", { name: "Tăng số lượng" }).click()
  await expect(page.getByTestId("cart-item-quantity")).toHaveText("3")
  await expect(page.getByTestId("cart-total")).toHaveText(vnd(810000))

  await item.getByRole("button", { name: "Giảm số lượng" }).click()
  await expect(page.getByTestId("cart-item-quantity")).toHaveText("2")
  await expect(page.getByTestId("cart-total")).toHaveText(vnd(540000))

  // The cart lives on the server: it survives a browser refresh.
  await page.reload()
  await expect(page.getByTestId("cart-item-quantity")).toHaveText("2")

  await item.getByRole("button", { name: `Xóa ${product.name}` }).click()
  await expect(page.getByRole("heading", { name: "Chiếc giỏ đang chờ bạn" })).toBeVisible()
})

// TEST 6: pickup checkout
test("checkout with PICKUP creates an order and clears the cart", async ({ page }) => {
  await addTestProduct(page, 2)
  await page.goto("/checkout")
  await page.getByRole("group", { name: "Hình thức nhận hàng" }).getByText("Nhận hàng trực tiếp").click()
  await expect(page.getByLabel("Tỉnh / Thành phố")).toHaveCount(0)
  await page.getByLabel("Họ và tên").fill("Khách Nhận Tại Quầy")
  await page.getByLabel("Số điện thoại").fill("0912 345 678")
  await page.getByLabel("Ngày nhận mong muốn").fill(inDays(7))
  await page.getByRole("button", { name: "Đặt hàng" }).click()

  await expect(page).toHaveURL(/\/orders\/\d+$/)
  await expect(page.getByText("Đặt hàng thành công!")).toBeVisible()
  await expect(page.getByTestId("order-total")).toHaveText(vnd(540000))
  await expect(page.getByTestId("order-address")).toHaveText("Nhận tại cửa hàng Chipscendle")
  await expect(page.getByTestId("order-desired-date")).toHaveText(ddmmyyyy(inDays(7)))
  await expect(page.getByText("Chờ cọc")).toBeVisible()
  await expect(page.getByTestId("cart-count")).toHaveCount(0)
})

test("checkout requires a desired receive date from today on", async ({ page }) => {
  await addTestProduct(page)
  await page.goto("/checkout")
  await page.getByRole("group", { name: "Hình thức nhận hàng" }).getByText("Nhận hàng trực tiếp").click()
  await page.getByLabel("Họ và tên").fill("Khách Chọn Ngày")
  await page.getByLabel("Số điện thoại").fill("0912345678")
  await page.getByRole("button", { name: "Đặt hàng" }).click()
  await expect(page.getByText("Vui lòng chọn ngày nhận mong muốn.")).toBeVisible()
  await page.getByLabel("Ngày nhận mong muốn").fill(inDays(-1))
  await page.getByRole("button", { name: "Đặt hàng" }).click()
  await expect(page.getByText("Ngày nhận cần từ hôm nay đến tối đa 180 ngày tới.")).toBeVisible()
  await expect(page).toHaveURL("/checkout")
  await expect(page.getByRole("complementary").getByText(ddmmyyyy(inDays(-1)))).toBeVisible()
})

test("each product can carry a note (colour, scent…) from product page to cart, checkout and the order", async ({ page, request }) => {
  const NOTE = "Màu hồng pastel, hương hoa nhài\nKhắc chữ: An"
  await page.goto(`/products/${product.code}`)
  await page.getByLabel(/Ghi chú cho sản phẩm/).fill("Màu hồng pastel")
  await page.getByRole("button", { name: "Thêm vào giỏ" }).click()
  await expect(page.getByText("Đã thêm vào giỏ hàng")).toBeVisible()
  await expect(page.getByLabel(/Ghi chú cho sản phẩm/)).toHaveValue("") // cleared after adding

  // Adding the same product again with another note keeps both notes
  await page.getByLabel(/Ghi chú cho sản phẩm/).fill("Hương hoa nhài")
  await page.getByRole("button", { name: "Thêm vào giỏ" }).click()
  await expect(page.getByTestId("cart-count")).toHaveText("2")

  // Edit the note in the cart: saved on the server when the field loses focus
  await page.goto("/cart")
  const note = page.getByTestId("cart-item-note")
  await expect(note).toHaveValue("Màu hồng pastel | Hương hoa nhài")
  await note.fill(NOTE)
  await page.getByRole("heading", { name: "Tóm tắt đơn hàng" }).click()
  await expect(page.getByText("Đã lưu ghi chú")).toBeVisible()
  await page.reload()
  await expect(note).toHaveValue(NOTE)

  // Checkout shows it; the order keeps it
  await page.goto("/checkout")
  await expect(page.getByTestId("checkout-item-note")).toContainText("Màu hồng pastel, hương hoa nhài")
  await page.getByRole("group", { name: "Hình thức nhận hàng" }).getByText("Nhận hàng trực tiếp").click()
  await page.getByLabel("Họ và tên").fill("Khách Ghi Chú")
  await page.getByLabel("Số điện thoại").fill("0912345678")
  await page.getByLabel("Ngày nhận mong muốn").fill(inDays(5))
  await page.getByRole("button", { name: "Đặt hàng" }).click()
  await expect(page).toHaveURL(/\/orders\/\d+$/)
  await expect(page.getByTestId("order-item-note")).toHaveText(`Ghi chú: ${NOTE}`)

  // …and the shop sees it in the admin order
  const orderId = page.url().split("/").pop()
  const adminOrder = await backend(request, adminToken).get<{ items: { note: string | null }[] }>(`/admin/orders/${orderId}`)
  expect(adminOrder.items[0].note).toBe(NOTE)
})

// TEST 7: delivery checkout with cascading address
test("checkout with DELIVERY: province → wards, ward resets on province change", async ({ page }) => {
  await addTestProduct(page)
  await page.goto("/checkout")
  await page.getByRole("group", { name: "Hình thức nhận hàng" }).getByText("Ship tận nhà").click()
  await page.getByLabel("Họ và tên").fill("Khách Giao Tận Nhà")
  await page.getByLabel("Số điện thoại").fill("0987654321")
  await page.getByLabel("Ngày nhận mong muốn").fill(inDays(10))

  const province = page.getByLabel("Tỉnh / Thành phố")
  const ward = page.getByLabel("Phường / Xã")
  await expect(province.locator("option")).not.toHaveCount(1) // provinces loaded from GET /address/provinces
  await expect(ward).toBeDisabled()

  await province.selectOption({ label: "Thành phố Hà Nội" })
  await expect(ward).toBeEnabled()
  await expect(ward.locator("option")).not.toHaveCount(1)
  await ward.selectOption({ index: 1 })
  const firstWard = await ward.inputValue()
  expect(firstWard).not.toBe("")

  // Changing the province resets the ward selection
  await province.selectOption({ label: "Thành phố Đà Nẵng" })
  await expect(ward).toHaveValue("")
  await expect(ward.locator("option")).not.toHaveCount(1)

  // Submitting without a ward is blocked client-side
  await page.getByLabel("Địa chỉ chi tiết").fill("12 Bạch Đằng")
  await page.getByRole("button", { name: "Đặt hàng" }).click()
  await expect(page.getByText("Vui lòng chọn phường/xã.")).toBeVisible()

  await ward.selectOption({ index: 1 })
  const wardName = (await ward.locator("option:checked").textContent())!.trim()
  await page.getByRole("button", { name: "Đặt hàng" }).click()
  await expect(page).toHaveURL(/\/orders\/\d+$/)
  await expect(page.getByTestId("order-address")).toHaveText(`12 Bạch Đằng, ${wardName}, Thành phố Đà Nẵng`)
  await expect(page.getByTestId("order-desired-date")).toHaveText(ddmmyyyy(inDays(10)))
  await expect(page.getByTestId("order-total")).toHaveText(vnd(270000))
})

// TEST 8 + spec §10: product sells out after being added → backend rejects → meaningful error
test("product that sells out after being added blocks checkout with a clear message", async ({ page, request }) => {
  await addTestProduct(page)
  await page.goto("/checkout")
  await page.getByRole("group", { name: "Hình thức nhận hàng" }).getByText("Nhận hàng trực tiếp").click()
  await page.getByLabel("Họ và tên").fill("Khách Hết Hàng")
  await page.getByLabel("Số điện thoại").fill("0912345678")
  await page.getByLabel("Ngày nhận mong muốn").fill(inDays(3))

  await backend(request, adminToken).patch(`/admin/products/${product.id}/status`, { status: "OUT_OF_STOCK" })
  try {
    await page.getByRole("button", { name: "Đặt hàng" }).click()
    await expect(page.getByText("Một số sản phẩm trong giỏ đã hết hàng hoặc ngừng bán. Vui lòng kiểm tra lại giỏ hàng.")).toBeVisible()
    await expect(page).toHaveURL("/cart")
    await expect(page.getByText("Sản phẩm đã hết hàng. Vui lòng xóa khỏi giỏ.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Tiến hành đặt hàng" })).toBeDisabled()

    // A fresh product page reflects the new stock status immediately.
    await page.goto(`/products/${product.code}`)
    await expect(page.getByRole("button", { name: "Hết hàng" })).toBeDisabled()
  } finally {
    await backend(request, adminToken).patch(`/admin/products/${product.id}/status`, { status: "IN_STOCK" })
  }
})

test("stale page: adding a product that just sold out shows the backend error", async ({ page, request }) => {
  await page.goto(`/products/${product.code}`)
  await expect(page.getByRole("button", { name: "Thêm vào giỏ" })).toBeEnabled()
  await backend(request, adminToken).patch(`/admin/products/${product.id}/status`, { status: "OUT_OF_STOCK" })
  try {
    await page.getByRole("button", { name: "Thêm vào giỏ" }).click()
    await expect(page.getByText("Sản phẩm đã hết hàng.")).toBeVisible()
    await expect(page.getByTestId("cart-count")).toHaveCount(0)
  } finally {
    await backend(request, adminToken).patch(`/admin/products/${product.id}/status`, { status: "IN_STOCK" })
  }
})

// TEST 11: order history keeps the historical price
test("order history shows the price paid even after the product price changes", async ({ page, request }) => {
  await addTestProduct(page)
  await page.goto("/checkout")
  await page.getByRole("group", { name: "Hình thức nhận hàng" }).getByText("Nhận hàng trực tiếp").click()
  await page.getByLabel("Họ và tên").fill("Khách Lịch Sử")
  await page.getByLabel("Số điện thoại").fill("0912345678")
  await page.getByLabel("Ngày nhận mong muốn").fill(inDays(3))
  await page.getByRole("button", { name: "Đặt hàng" }).click()
  await expect(page).toHaveURL(/\/orders\/\d+$/)
  const orderUrl = page.url()

  await backend(request, adminToken).put(`/admin/products/${product.id}`, { price: 999000, discountType: "NONE" })
  try {
    await page.goto("/orders")
    await expect(page.getByTestId("order-row").first()).toContainText(vnd(270000))
    await page.getByTestId("order-row").first().click()
    await expect(page).toHaveURL(orderUrl.replace(/^https?:\/\/[^/]+/, ""))
    await expect(page.getByTestId("order-item-price")).toHaveText(vnd(270000))
    await expect(page.getByTestId("order-total")).toHaveText(vnd(270000))
    await expect(page.getByText("Nhận hàng trực tiếp").first()).toBeVisible()
  } finally {
    await backend(request, adminToken).put(`/admin/products/${product.id}`, { price: 300000, discountType: "PERCENT", discountValue: 10 })
  }
})

// TEST 10: authorization
test("customer cannot access the admin area", async ({ page }) => {
  await page.goto("/admin")
  await expect(page.getByRole("heading", { name: "Bạn không có quyền truy cập" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Tổng quan cửa hàng" })).toHaveCount(0)
})

test("an invalid stored token is discarded and the user is asked to log in", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.setItem("chipscendle.access_token", "invalid.token.value"))
  await page.goto("/orders")
  await expect(page.getByRole("heading", { name: "Vui lòng đăng nhập" })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem("chipscendle.access_token"))).toBeNull()
})
