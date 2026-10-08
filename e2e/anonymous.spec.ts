import { expect, test } from "@playwright/test"

// TEST 10 (anonymous): admin area requires an admin login
test("anonymous visitor sees the admin login gate, not admin data", async ({ page }) => {
  await page.goto("/admin/products")
  await expect(page.getByRole("heading", { name: "Khu vực dành cho quản trị viên" })).toBeVisible()
  await page.getByRole("button", { name: "Đăng nhập quản trị" }).click()
  await expect(page).toHaveURL("/login?next=/admin")
})

test("protected customer pages ask for login (the cart does not)", async ({ page }) => {
  for (const path of ["/orders", "/checkout"]) {
    await page.goto(path)
    await expect(page.getByRole("heading", { name: "Vui lòng đăng nhập" })).toBeVisible()
  }
  await page.goto("/cart")
  await expect(page.getByRole("heading", { name: "Chiếc giỏ đang chờ bạn" })).toBeVisible()
})

test("backend errors are shown as an error state, not a blank page", async ({ page }) => {
  await page.route("**/products?**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, message: "Internal server error", code: "INTERNAL_ERROR", stack: "Error: secret stack" }) }))
  await page.goto("/products")
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Có lỗi xảy ra từ máy chủ. Vui lòng thử lại.")
  await expect(page.getByText("secret stack")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Thử lại" })).toBeVisible()
})
