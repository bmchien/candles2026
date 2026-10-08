import { mkdirSync } from "node:fs"
import { expect, test as setup } from "@playwright/test"
import { ADMIN_STATE, AUTH_DIR, CUSTOMER_STATE, requireEnv, uid } from "./helpers"

setup.beforeAll(() => mkdirSync(AUTH_DIR, { recursive: true }))

// TEST 1: registration → logged in → protected page
setup("customer can register, is logged in and can open a protected page", async ({ page }) => {
  const email = `e2e.${uid().toLowerCase()}@example.com`
  await page.goto("/register")
  await page.getByLabel("Họ và tên").fill("Khách E2E")
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("Mật khẩu", { exact: true }).fill("E2eTest1234")
  await page.getByLabel("Xác nhận mật khẩu").fill("E2eTest1234")
  await page.getByRole("button", { name: "Tạo tài khoản" }).click()
  await expect(page.getByText("Xin chào Khách E2E!")).toBeVisible()
  await expect(page).toHaveURL("/")

  // Protected page: order history loads from GET /orders with the JWT (new account → empty state).
  await page.goto("/orders")
  await expect(page.getByRole("heading", { name: "Chưa có đơn hàng" })).toBeVisible()

  // Session survives a full reload (token restored and validated via GET /users/me).
  await page.reload()
  await expect(page.getByRole("heading", { name: "Chưa có đơn hàng" })).toBeVisible()
  await page.context().storageState({ path: CUSTOMER_STATE })
})

setup("invalid credentials show an error and do not log in", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Email", { exact: true }).fill(requireEnv("E2E_ADMIN_EMAIL"))
  await page.getByLabel("Mật khẩu", { exact: true }).fill("definitely-wrong-1")
  await page.getByRole("main").getByRole("button", { name: "Đăng nhập", exact: true }).click()
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Email hoặc mật khẩu không đúng.")
  await expect(page).toHaveURL(/\/login/)
})

// TEST 2 (admin part): login → JWT → admin dashboard
setup("admin can log in and lands on the dashboard", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Email", { exact: true }).fill(requireEnv("E2E_ADMIN_EMAIL"))
  await page.getByLabel("Mật khẩu", { exact: true }).fill(requireEnv("E2E_ADMIN_PASSWORD"))
  await page.getByRole("main").getByRole("button", { name: "Đăng nhập", exact: true }).click()
  await expect(page).toHaveURL("/admin")
  await expect(page.getByRole("heading", { name: "Tổng quan cửa hàng" })).toBeVisible()
  await page.context().storageState({ path: ADMIN_STATE })
})
