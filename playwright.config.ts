import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end tests against the REAL backend (no API mocking).
 *
 * Prerequisites:
 *   - backend running (e-commerce-backend-development: `npm run start:dev`) on E2E_API_URL
 *   - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD: an ADMIN account (the backend seed admin)
 *
 * The tests create their own E2E-prefixed catalog data and customer accounts and delete the
 * catalog data afterwards. Orders created by the tests remain (orders cannot be deleted).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./e2e",
  // One shared database and an auth rate limit: run serially.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "vi-VN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "e2e", testMatch: /.*\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
