import { expect, test } from "@playwright/test"
import { ADMIN_STATE, backend, tokenFromState, uid } from "./helpers"

const IMAGE = "https://picsum.photos/seed/e2e-jasmine/600/450"

test.describe("scent showcase", () => {
  test.use({ storageState: ADMIN_STATE })

  test("admin adds a scent with an image URL; visitors see it, filter it, and it disappears when hidden", async ({ page, browser, request }) => {
    const name = `E2E Hoa nhài ${uid()}`
    const api = backend(request, tokenFromState(ADMIN_STATE))
    try {
      // Admin: create
      await page.goto("/admin/scents")
      await page.getByRole("button", { name: "Thêm mùi hương" }).click()
      await page.getByLabel("Tên mùi hương").fill(name)
      await page.getByLabel("Loại mùi").selectOption("NATURAL")
      await page.getByLabel("Mô tả").fill("Hương hoa nhài trắng, dịu và thanh.\nHợp phòng ngủ.")
      await page.getByLabel("Đường dẫn ảnh").fill("ftp://example.com/hoa-nhai.png")
      await page.getByRole("button", { name: "Lưu", exact: true }).click()
      await expect(page.getByText("Đường dẫn ảnh phải bắt đầu bằng http:// hoặc https://")).toBeVisible()
      await page.getByLabel("Đường dẫn ảnh").fill(IMAGE)
      await expect(page.getByRole("img", { name: "Xem trước ảnh mùi hương" })).toHaveAttribute("src", IMAGE)
      await page.getByRole("button", { name: "Lưu", exact: true }).click()
      await expect(page.getByText("Đã thêm mùi hương")).toBeVisible()
      const row = page.getByTestId("admin-scent-row").filter({ hasText: name })
      await expect(row).toContainText("Hương tự nhiên")
      await expect(row.locator("img")).toHaveAttribute("src", IMAGE)

      // Visitor (no login): sees it, with its type, description and image
      const visitor = await browser.newContext()
      const guest = await visitor.newPage()
      await guest.goto("/")
      await guest.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("button", { name: "Mùi hương" }).click()
      await expect(guest).toHaveURL("/scents")
      const card = guest.getByTestId("scent-card").filter({ hasText: name })
      await expect(card).toContainText("Hương tự nhiên")
      await expect(card).toContainText("Hợp phòng ngủ.")
      await expect(card.locator("img")).toHaveAttribute("src", IMAGE)
      await expect(guest.getByRole("button", { name: /Thêm .* vào giỏ/ })).toHaveCount(0) // display only

      // Filter by scent type
      await guest.getByRole("tab", { name: "Hương nước hoa" }).click()
      await expect(guest).toHaveURL("/scents?type=PERFUME")
      await expect(card).toHaveCount(0)
      await guest.getByRole("tab", { name: "Hương tự nhiên" }).click()
      await expect(card).toHaveCount(1)

      // Admin hides it → no longer shown to visitors
      await row.getByRole("button", { name: "Đang hiện" }).click()
      await expect(row.getByRole("button", { name: "Đang ẩn" })).toBeVisible()
      await guest.reload()
      await expect(guest.getByTestId("scent-card").filter({ hasText: name })).toHaveCount(0)
      await visitor.close()

      // Admin edits, then deletes
      await row.getByRole("button", { name: `Sửa ${name}` }).click()
      await page.getByLabel("Loại mùi").selectOption("PERFUME")
      await page.getByRole("button", { name: "Lưu", exact: true }).click()
      await expect(row).toContainText("Hương nước hoa")
      page.once("dialog", (d) => void d.accept())
      await row.getByRole("button", { name: `Xóa ${name}` }).click()
      await expect(row).toHaveCount(0)
    } finally {
      const left = await api.get<{ id: number; name: string }[]>("/admin/scents")
      for (const s of left.filter((s) => s.name === name)) await api.delete(`/admin/scents/${s.id}`)
    }
  })
})
