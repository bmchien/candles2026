import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { ADMIN_STATE, backend, createTestProduct, CUSTOMER_STATE, ddmmyyyy, deleteProductsByPrefix, inDays, tokenFromState, uid, vnd, type ApiProduct } from "./helpers"

test.use({ storageState: ADMIN_STATE })

const adminToken = () => tokenFromState(ADMIN_STATE)

// TEST 9: admin
test("dashboard shows statistics from GET /admin/dashboard", async ({ page, request }) => {
  const stats = await backend(request, adminToken()).get<{ products: { total: number; out_of_stock: number }; orders: { total: number } }>("/admin/dashboard")
  await page.goto("/admin")
  await expect(page.getByTestId("metric-0")).toHaveText(String(stats.products.total))
  await expect(page.getByTestId("metric-2")).toHaveText(String(stats.products.out_of_stock))
  await expect(page.getByTestId("metric-3")).toHaveText(String(stats.orders.total))
})

test("category CRUD", async ({ page }) => {
  const name = `E2E Danh mục ${uid()}`
  await page.goto("/admin/categories")
  await page.getByRole("button", { name: "Thêm danh mục" }).click()
  await page.getByLabel("Tên").fill(name)
  await page.getByRole("button", { name: "Lưu" }).click()
  await expect(page.getByText("Đã thêm mới")).toBeVisible()
  const row = page.getByTestId("taxonomy-row").filter({ hasText: name })
  await expect(row).toHaveCount(1)

  // Duplicate slug → backend 409 is shown
  await page.getByRole("button", { name: "Thêm danh mục" }).click()
  await page.getByLabel("Tên").fill(name)
  await page.getByRole("button", { name: "Lưu" }).click()
  await expect(page.getByText("Slug danh mục đã tồn tại.")).toBeVisible()
  await page.getByRole("button", { name: "Hủy" }).click()

  await row.getByRole("button", { name: `Sửa ${name}` }).click()
  await page.getByLabel("Tên").fill(`${name} sửa`)
  await page.getByRole("button", { name: "Lưu" }).click()
  const edited = page.getByTestId("taxonomy-row").filter({ hasText: `${name} sửa` })
  await expect(edited).toHaveCount(1)

  page.once("dialog", (d) => void d.accept())
  await edited.getByRole("button", { name: `Xóa ${name} sửa` }).click()
  await expect(page.getByText(`Đã xóa ${name} sửa`)).toBeVisible()
  await expect(edited).toHaveCount(0)
})

test("deleting a category that has products shows the backend conflict", async ({ page, request }) => {
  const categories = await backend(request).get<{ name: string; product_count: number }[]>("/categories")
  const used = categories.find((c) => c.product_count > 0)!
  await page.goto("/admin/categories")
  page.once("dialog", (d) => void d.accept())
  await page.getByTestId("taxonomy-row").filter({ hasText: used.name }).getByRole("button", { name: `Xóa ${used.name}` }).click()
  await expect(page.getByText("Danh mục đang có sản phẩm, chưa thể xóa.")).toBeVisible()
})

test("tag CRUD", async ({ page }) => {
  const name = `E2E Thẻ ${uid()}`
  await page.goto("/admin/tags")
  await page.getByRole("button", { name: "Thêm thẻ" }).click()
  await page.getByLabel("Tên").fill(name)
  await page.getByRole("button", { name: "Lưu" }).click()
  const row = page.getByTestId("taxonomy-row").filter({ hasText: name })
  await expect(row).toHaveCount(1)
  await row.getByRole("button", { name: `Sửa ${name}` }).click()
  await page.getByLabel("Tên").fill(`${name} sửa`)
  await page.getByRole("button", { name: "Lưu" }).click()
  const edited = page.getByTestId("taxonomy-row").filter({ hasText: `${name} sửa` })
  await expect(edited).toHaveCount(1)
  page.once("dialog", (d) => void d.accept())
  await edited.getByRole("button", { name: `Xóa ${name} sửa` }).click()
  await expect(edited).toHaveCount(0)
})

const IMG_A = "https://picsum.photos/seed/e2e-ui-a/800/800"
const IMG_B = "https://picsum.photos/seed/e2e-ui-b/800/800"
const IMG_C = "https://picsum.photos/seed/e2e-ui-c/800/800"

test("product CRUD: create, edit discount/tags/images, hide/show, stock, delete", async ({ page, request }) => {
  test.setTimeout(150_000)
  const code = `E2E-UI-${uid()}`
  const tags = await backend(request).get<{ id: number; name: string; slug: string }[]>("/tags")
  try {
    await page.goto("/admin/products/new")
    await page.getByLabel("Mã SKU / code").fill(code)
    await page.getByLabel("Tên sản phẩm").fill(`E2E Sản phẩm giao diện ${code}`)
    await page.getByLabel("Mô tả ngắn").fill("Tạo từ giao diện quản trị")
    await page.getByLabel("Danh mục").selectOption({ index: 1 })
    await page.getByLabel("Giá gốc (₫)").fill("500000")
    await page.getByLabel("Loại giảm giá").selectOption("FIXED")
    await page.getByLabel("Giá trị giảm").fill("50000")
    await page.getByLabel("Đường dẫn ảnh 1").fill(IMG_A)
    await page.getByRole("button", { name: "Thêm ảnh" }).click()
    await page.getByLabel("Đường dẫn ảnh 2").fill(IMG_B)
    await expect(page.getByRole("img", { name: "Xem trước ảnh chính" })).toHaveAttribute("src", IMG_A)
    await page.getByRole("button", { name: tags[0].name, exact: true }).click()
    await page.getByRole("button", { name: "Lưu sản phẩm" }).click()
    await expect(page.getByText("Đã tạo sản phẩm mới")).toBeVisible()
    await expect(page).toHaveURL("/admin/products")

    // Created product is visible to customers with backend-computed price and tag
    const [created] = await backend(request).get<ApiProduct[]>(`/products?q=${code}`)
    expect(created.final_price).toBe(450000)
    expect(created.tags.map((t) => t.slug)).toContain(tags[0].slug)
    const createdDetail = await backend(request).get<{ images: { url: string }[] }>(`/products/${code}`)
    expect(createdDetail.images.map((i) => i.url)).toEqual([IMG_A, IMG_B])

    await page.getByLabel("Tìm sản phẩm").fill(code)
    const row = page.getByTestId("admin-product-row").filter({ hasText: code })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(vnd(450000))

    // Edit: switch to a 20% discount and add a second tag
    await row.getByRole("button", { name: /Chỉnh sửa/ }).click()
    await expect(page.getByLabel("Mã SKU / code")).toHaveValue(code)
    await page.getByLabel("Loại giảm giá").selectOption("PERCENT")
    await page.getByLabel("Giá trị giảm").fill("20")
    await page.getByRole("button", { name: tags[1].name, exact: true }).click()
    // Images: add a third, move it to the front (new main image), remove the old second one
    await expect(page.getByTestId("product-image-row")).toHaveCount(2)
    await page.getByRole("button", { name: "Thêm ảnh" }).click()
    await page.getByLabel("Đường dẫn ảnh 3").fill(IMG_C)
    await page.getByRole("button", { name: "Đưa ảnh 3 lên trước" }).click()
    await page.getByRole("button", { name: "Đưa ảnh 2 lên trước" }).click()
    await page.getByRole("button", { name: "Xóa ảnh 3" }).click()
    await expect(page.getByRole("img", { name: "Xem trước ảnh chính" })).toHaveAttribute("src", IMG_C)
    await page.getByRole("button", { name: "Lưu sản phẩm" }).click()
    await expect(page.getByText("Đã cập nhật sản phẩm")).toBeVisible()
    const editedDetail = await backend(request).get<{ images: { url: string }[] }>(`/products/${code}`)
    expect(editedDetail.images.map((i) => i.url)).toEqual([IMG_C, IMG_A])
    let [after] = await backend(request).get<ApiProduct[]>(`/products?q=${code}`)
    expect(after.final_price).toBe(400000)
    expect(after.tags).toHaveLength(2)

    // Stock status toggle
    await page.getByLabel("Tìm sản phẩm").fill(code)
    await row.getByRole("button", { name: /Đổi tình trạng kho/ }).click()
    await expect(row).toContainText("Hết hàng")
    ;[after] = await backend(request).get<ApiProduct[]>(`/products?q=${code}`)
    expect(after.status).toBe("OUT_OF_STOCK")

    // Hide → not visible to customers
    await row.getByRole("button", { name: "Đang hiện" }).click()
    await expect(row.getByRole("button", { name: "Đang ẩn" })).toBeVisible()
    expect(await backend(request).get<ApiProduct[]>(`/products?q=${code}`)).toHaveLength(0)
    await page.goto(`/products/${code}`)
    await expect(page.getByRole("heading", { name: "Không tìm thấy sản phẩm" })).toBeVisible()

    // Delete
    await page.goto("/admin/products")
    await page.getByLabel("Tìm sản phẩm").fill(code)
    page.once("dialog", (d) => void d.accept())
    await row.getByRole("button", { name: /Xóa/ }).click()
    await expect(page.getByText("Đã xóa sản phẩm")).toBeVisible()
    await expect(row).toHaveCount(0)
  } finally {
    await deleteProductsByPrefix(request, adminToken(), code)
  }
})

test("order management: list, detail, status transitions", async ({ page, request }) => {
  // Arrange: a customer order through the real API
  const product = await createTestProduct(request, adminToken())
  const customer = backend(request, tokenFromState(CUSTOMER_STATE))
  try {
    await customer.delete("/cart")
    await customer.post("/cart/items", { productId: product.id, quantity: 1 })
    const order = await customer.post<{ id: number }>("/orders", { customerName: "Khách Quản Trị", phone: "0912345678", shippingMethod: "PICKUP", desiredDate: inDays(4) })
    const orderCode = `#${String(order.id).padStart(6, "0")}`

    await page.goto("/admin/orders")
    await page.getByLabel("Tìm đơn hàng").fill(String(order.id))
    const row = page.getByTestId("admin-order-row")
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(orderCode)
    await expect(row).toContainText("Khách Quản Trị")
    await expect(row).toContainText(ddmmyyyy(inDays(4)))

    // Every status is offered, in workflow order
    const ALL = ["Chờ cọc", "Đã cọc", "Đang làm", "Đã hoàn thành", "Đang giao", "Đã giao", "Huỷ"]
    const select = row.getByRole("combobox")
    await expect(select.locator("option")).toHaveText(ALL)
    await select.selectOption("IN_PRODUCTION") // skip ahead
    await expect(page.getByText("Đã cập nhật trạng thái đơn hàng")).toBeVisible()
    await expect(select).toHaveValue("IN_PRODUCTION")
    await expect(select.locator("option")).toHaveText(ALL)

    await row.getByRole("button", { name: "Xem đơn hàng" }).click()
    await expect(page).toHaveURL(`/admin/orders/${order.id}`)
    await expect(page.getByRole("heading", { name: orderCode })).toBeVisible()
    await expect(page.getByTestId("order-total")).toHaveText(vnd(270000))
    await expect(page.getByTestId("order-desired-date")).toHaveText(ddmmyyyy(inDays(4)))
    const detailSelect = page.getByRole("combobox", { name: /Trạng thái đơn/ })
    await detailSelect.selectOption("DELIVERED")
    await expect(detailSelect).toHaveValue("DELIVERED")
    await detailSelect.selectOption("DEPOSITED") // back, to fix a mistake
    await expect(detailSelect).toHaveValue("DEPOSITED")
    page.once("dialog", (d) => void d.accept()) // cancelling asks for confirmation
    await detailSelect.selectOption("CANCELLED")
    await expect(detailSelect).toHaveValue("CANCELLED")
    await detailSelect.selectOption("AWAITING_DEPOSIT") // reopen
    await expect(detailSelect).toHaveValue("AWAITING_DEPOSIT")
    await expect(detailSelect).toBeEnabled()
  } finally {
    await deleteProductsByPrefix(request, adminToken(), product.code)
  }
})

test("orders can be exported to Excel by status and order date range", async ({ page, request }) => {
  const product = await createTestProduct(request, adminToken())
  const customer = backend(request, tokenFromState(CUSTOMER_STATE))
  try {
    await customer.delete("/cart")
    await customer.post("/cart/items", { productId: product.id, quantity: 1 })
    await customer.post("/orders", { customerName: "Khách Xuất Excel", phone: "0912345678", shippingMethod: "PICKUP", desiredDate: inDays(2) })
    const today = inDays(0)

    await page.goto("/admin/orders")
    await page.getByLabel("Lọc theo trạng thái").selectOption("AWAITING_DEPOSIT")
    await page.getByLabel("Đặt từ ngày").fill(today)
    await page.getByLabel("Đặt đến ngày").fill(today)
    await expect(page.getByTestId("admin-order-row").filter({ hasText: "Khách Xuất Excel" }).first()).toBeVisible()

    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Xuất Excel" }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`don-hang_${today}_${today}_awaiting_deposit.xlsx`)
    const file = readFileSync((await download.path())!)
    expect(file.subarray(0, 2).toString()).toBe("PK") // .xlsx is a zip container
    expect(file.length).toBeGreaterThan(2000)
    await expect(page.getByText("Đã xuất file Excel")).toBeVisible()

    // An inverted range is rejected before calling the API
    await page.getByLabel("Đặt từ ngày").fill(inDays(1))
    await expect(page.getByText("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Xuất Excel" })).toBeDisabled()
  } finally {
    await deleteProductsByPrefix(request, adminToken(), product.code)
  }
})

// TEST 12: CSV import
test("CSV import shows backend import summary and row errors", async ({ page, request }) => {
  const code = `E2E-CSV-${uid()}`
  const categories = await backend(request).get<{ slug: string }[]>("/categories")
  const csv = [
    "code,name,category,price,discount_type,discount_value,status,is_active",
    `${code}-1,E2E CSV hợp lệ,${categories[0].slug},120000,PERCENT,10,IN_STOCK,true`,
    `${code}-2,E2E CSV sai danh mục,khong-ton-tai,100000,,,IN_STOCK,true`,
    `${code}-3,E2E CSV sai giá,${categories[0].slug},abc,,,IN_STOCK,true`,
  ].join("\n")
  try {
    await page.goto("/admin/products")
    await page.getByRole("button", { name: "Import CSV" }).click()
    await page.getByTestId("csv-input").setInputFiles({ name: "products.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
    await expect(page.getByText("3 dòng sẵn sàng")).toBeVisible()
    await page.getByRole("button", { name: "Import 3 dòng" }).click()
    const result = page.getByTestId("import-result")
    await expect(result).toContainText("1/3 dòng thành công · 2 dòng lỗi")
    await expect(result).toContainText("Dòng 3:")
    await expect(result).toContainText("Dòng 4:")
    const [imported] = await backend(request).get<ApiProduct[]>(`/products?q=${code}-1`)
    expect(imported.final_price).toBe(108000)

    // Missing required column is caught before upload
    await page.getByTestId("csv-input").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("code,name\nA,B\n") })
    await expect(page.getByText("Thiếu cột bắt buộc: category")).toBeVisible()
    await expect(page.getByRole("button", { name: /^Import \d+ dòng$/ })).toBeDisabled()
  } finally {
    await deleteProductsByPrefix(request, adminToken(), code)
  }
})
