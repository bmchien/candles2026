# Chipscendle — storefront & admin (Next.js)

Next.js 16 frontend for the NestJS API in `../e-commerce-backend-development`. All data (catalog, auth, cart, orders, admin, Vietnamese addresses) comes from that backend; there is no mock data.

## Setup

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:3001 (backend PORT)
npm run dev                  # http://localhost:3000
```

The backend must be running and must allow this origin (`FRONTEND_URL=http://localhost:3000` in the backend `.env`).

## Structure

- `lib/api/client.ts` — the only HTTP client: base URL, JWT header, `{ success, data }` envelope unwrapping, Vietnamese error messages (`ApiError`), 401 handling.
- `services/*.service.ts` — one typed module per backend domain (auth, product, category, tag, cart, order, address, admin).
- `types/commerce.ts` — response/request types matching the backend contract (numeric ids, snake_case responses, camelCase request bodies).
- `hooks/` — session (token restore + `/users/me`) and catalog (categories/tags) hooks; data fetching uses SWR.
- `components/commerce-app.tsx` — client-side routes (storefront + `/admin`); `components/checkout-page.tsx` — checkout.

Guests can use the cart without logging in: the backend issues a guest cart token (stored in `localStorage`, sent as `X-Cart-Token` on `/cart` requests), and the guest cart is merged into the account right after login or registration. Checkout requires login.

Prices, discounts and totals are always the backend's (`final_price`, cart `total`, order `total_amount`); the checkout request never contains prices.

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:e2e` | Playwright end-to-end tests against the real backend |

## End-to-end tests

The tests drive the real UI against the real API (no mocking, except one test that simulates a 500). They need the backend running and an admin account:

```bash
npx playwright install chromium        # once
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
```

Optional: `E2E_BASE_URL` (default `http://localhost:3000`), `E2E_API_URL` (default `http://localhost:3001`).

They register new `e2e.*@example.com` customers, create `E2E-*` products/categories/tags and delete those catalog records afterwards. Orders placed by the tests stay in the database (orders cannot be deleted), so prefer a development database. The backend's `/auth` rate limit (10 requests/min by default) is respected by logging in once per run.
