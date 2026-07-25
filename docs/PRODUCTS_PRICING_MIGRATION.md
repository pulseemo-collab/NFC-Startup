# Products, Costs & Pricing — Server-Side Migration

This documents moving the product catalog, supplier costs, pricing configuration
and owner settings out of the browser and into Supabase, and moving all
authoritative pricing to trusted server-side code. It builds on
[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) (orders) and
[`AUTH_SETUP.md`](./AUTH_SETUP.md) (owner auth), which must be in place first.

> **Why:** previously `data/products.ts` (supplier costs, margins, market bands,
> internal notes) and `lib/pricing.ts` (the pricing formulas) shipped in the
> **public** browser bundle, and the public order flow trusted prices/totals sent
> by the browser. A customer could read every cost/margin in DevTools and, in
> principle, forge a cheaper order. This change closes both holes.

---

## 1. Architecture overview

**Two separate client trees (route-level code splitting):**

- `/` → `components/public/PublicApp.tsx`. Its entire import graph excludes
  `lib/pricing.ts`, supplier costs and `lib/orders.ts`. It reads products/config
  from Supabase through **public functions that return public columns only**, shows
  a live price *estimate* from public prices, and at checkout sends **only
  `{ slug, qty }` + customer details**.
- `/dashboard` → `components/NfcApp.tsx` (owner, auth-gated). It loads the full
  catalog (incl. costs) as the signed-in owner and still runs the pricing engine
  client-side for the owner's editing UI. None of this ships to `/`.

**Authoritative pricing lives in the database.** `create_validated_public_order`
(SECURITY DEFINER) recomputes every price/total/cost/profit/margin from the
`products` table and stores trusted snapshots. The browser is never trusted for
money. No service-role key is used anywhere.

```
Customer ("/")                     Supabase (Postgres)                Owner ("/dashboard")
──────────────                     ───────────────────                ────────────────────
get_public_products()   ─────────► products (RLS: owner-only)  ◄────── getOwnerProducts()  [owner session]
get_public_config()     ─────────► app_settings (RLS: owner)   ◄────── get/updateOwnerSettings()
   │ only public columns              ▲     ▲                          updateProduct() (cost, sell price)
   ▼                                  │     │
{slug, qty} + customer  ─► create_validated_public_order() ─► orders   getOrders()/updateOrder()… [owner session]
                            (recomputes price/cost/profit server-side)
```

## 2. Public vs private fields

| PUBLIC (anon may read) | PRIVATE (owner only — never leaves the server for anon) |
| --- | --- |
| slug, name, category, tag | supplier_cost_eur |
| description_sq | min_margin, min_profit |
| **sell_price_eur** (the price the customer pays) | market_min / recommended / premium / max |
| is_active | ladder (psychological price points) |
| bundle_discount, display currency | note (internal), and all cost/profit/margin on orders |

Anon reads only through `get_public_products()` / `get_public_config()` (public
columns) and writes only through `create_validated_public_order()` (returns public
receipt fields). Direct table access for anon is denied by RLS.

## 3. Migration files & exact run order

Run these in the Supabase **SQL Editor**, in order. 0001–0003 are already applied.

| Order | File | Purpose |
| --- | --- | --- |
| 4 | `supabase/migrations/0004_products_and_settings.sql` | `products` + `app_settings` tables, triggers, indexes |
| 5 | `supabase/migrations/0005_secure_pricing_functions.sql` | server pricing + public read functions; **drops** the old `create_public_order` |
| 6 | `supabase/migrations/0006_product_rls_policies.sql` | RLS: owner-only tables, no anon direct access |
| 7 | `supabase/migrations/0007_product_status.sql` | adds product `status` (active/draft/archived) for the dashboard product manager |
| 8 | `supabase/migrations/0008_settings_business_identity.sql` | adds `business_name` + `logo_url` to owner settings (dashboard/receipt branding) |
| seed | `supabase/seed/seed_products_and_settings.sql` | **run once**, manually, to load the current catalog + settings |

> **Required for Owner Experience 2.0:** `0007` (product `status`) and `0008`
> (settings `business_name`/`logo_url`) must both be applied before the updated
> dashboard code is deployed — the owner catalog/settings queries select those
> columns, so loading fails without them. Both are additive, owner-only, and do
> not change the public path (products still expose `is_active`, kept in sync:
> active ⇒ visible; settings additions are branding only, not pricing).

Money is stored as PostgreSQL `numeric` in EUR (base currency), consistent with the
orders table. No floating-point money.

## 4. Supabase SQL Editor steps

1. SQL Editor → New query → paste `0004_products_and_settings.sql` → **Run**.
2. Same for `0005_secure_pricing_functions.sql`, then `0006_product_rls_policies.sql`.
3. Sanity: **Table Editor** shows `products` and `app_settings` with green **RLS
   enabled** badges.

## 5. Migrate existing product/settings data (seed)

The seed reproduces the app's original `data/products.ts` values and
`DEFAULT_SETTINGS`. **sell_price_eur is set to each product's current effective
price (= its market "recommended" value), so customer-visible prices do not
change.**

1. SQL Editor → New query → paste `supabase/seed/seed_products_and_settings.sql` → **Run**.
   It is idempotent (ON CONFLICT upserts); safe to re-run.
2. **Verify before trusting it:**
   ```sql
   select slug, sell_price_eur, supplier_cost_eur, is_active from public.products order by sort_order;
   select * from public.app_settings;
   ```
   - 9 product rows; `sell_price_eur` equals the prices customers saw before
     (39, 19, 19, 12, 10, 6, 29, 15, 12).
   - `app_settings`: currency `ALL`, min_margin `0.70`, min_profit `3`,
     bundle_discount `0.10`.
3. Load `/` and confirm the catalog + prices look exactly as before.
4. Only **after** verifying, remove obsolete localStorage data (see §12).

## 6. Local environment requirements

No new variables. The public reads + order creation use the existing public vars
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). `SUPABASE_SERVICE_ROLE_KEY`
remains unused by the app.

```bash
npm install
npm run build && npm run start   # or npm run dev
```

## 7. Vercel environment requirements

No change. Same two public vars already set. Redeploy after the DB migrations +
seed are applied so the live site reads the new tables.

## 8. Owner test workflow

Sign in at `/login`, then on `/dashboard`:

- **Builder** shows the catalog with **My cost** and **My price** per product, live
  profit/margin, and the bundle profit box — same UI as before.
- Edit a **cost** → profit/margin update; refresh → the new cost persisted (Supabase).
- Edit a **price** (My price) → persisted; "↺ use recommended" restores the
  engine price. Refresh → persisted.
- Open **Settings** → change bundle discount / min margin / currency → persisted;
  refresh → still applied.
- Orders (list, open, advance status, duplicate, edit, delete, export/import) work
  as before, all as the authenticated owner (RLS-enforced).

## 9. Public pricing-manipulation test (must all hold)

Open `/` in the browser and, in DevTools, try to cheat. The server recomputes
everything, so none of these can lower the price or expose private data:

| Attempt | Expected result |
| --- | --- |
| Normal order | Receipt shows server-computed price; a row appears in `orders`. |
| Change a quantity | Price scales correctly (server recomputes). |
| Send an invalid `slug` | Order rejected: "Product not available". |
| Send an inactive product | Rejected (get_public_products/`create` ignore inactive). |
| Inject `finalPrice`/`total`/`profit` into the RPC payload | Ignored — the function reads only `items` + customer fields and reprices from the DB. |
| Edit a product's `sellPriceEur` in JS before submit | Ignored — the browser never sends prices; the DB price is used. |
| Omit a required option / empty cart | Rejected: "No items in order". |

You can also compare against the authoritative quote:
`supabase.rpc('quote_public_order', { payload: { items:[{slug:'stand',qty:1}] } })`
returns public totals only (no cost/profit/margin).

## 10. DevTools privacy verification (no private data in the browser)

On `/` (public), confirm you **cannot** find any of: supplier cost, profit, margin,
market bands, ladder, product notes, or the pricing rules.

- **Sources**: search all `/_next/static/chunks` loaded by `/` for
  `supplier`, `commercially viable`, `recommendPrice`, `unitCost`, `High-ROI` →
  no matches. (Verified at build time; see the security audit in the PR summary.)
- **Network**: the `get_public_products` / `get_public_config` / `quote_public_order`
  / `create_validated_public_order` responses contain **only** public fields —
  never cost/profit/margin/unitCost.
- **React state / localStorage / rendered HTML**: only public prices (ALL) appear.

> Residual (documented): the pricing **algorithm** in `lib/pricing.ts` is bundled
> into the `/dashboard` client chunk (owner UI). That chunk is served from a static
> URL, so the *method* is technically fetchable — but it contains **no** cost, margin,
> band or note **data** (those are fetched at runtime, owner-session + RLS). Moving
> the engine fully server-side is possible future hardening; it is deliberately not
> done here to keep the owner's editing UI instant.

## 11. Currency

Unchanged behavior: internal/base currency is **EUR**; the public site displays
**ALL**. All money is stored as `numeric` EUR (products, settings, orders). Display
conversion happens at the boundary (`lib/currency.ts`), same as before. The EUR→ALL
rate is a non-secret constant (the customer sees the ALL price regardless); it is
not stored per-owner. If you later make the rate configurable, store it in
`app_settings` (owner-only) and apply it server-side — never send cost-conversion
details to the browser.

## 12. Removing obsolete localStorage (do this LAST, manually)

Products, costs, price overrides and settings now live in Supabase. The old
browser keys are ignored by the app but not auto-deleted. After you have verified
(§5, §8) that Supabase holds the correct data, clear them manually in DevTools →
Application → Local Storage:

```js
localStorage.removeItem('nfc.costs.v1');
localStorage.removeItem('nfc.prices.v1');
localStorage.removeItem('nfc.settings.v1');
// Keep 'nfc.selection.v1' (ephemeral builder selection) and note that
// 'nfc.orders.v1' is already obsolete (orders are in Supabase).
```

Nothing is deleted automatically. Export a backup first if you want a copy.

## 13. Rollback

- **Revert code**: the previous commit still reads localStorage; `git revert` the
  products/pricing commit to fall back (you would also stop using the new tables).
- **Migrations**: to remove the new objects on a dev project only:
  ```sql
  -- DANGER: drops the catalog + settings. Orders are unaffected.
  drop function if exists public.get_public_products();
  drop function if exists public.get_public_config();
  drop function if exists public.quote_public_order(jsonb);
  drop function if exists public.create_validated_public_order(jsonb);
  drop function if exists public.price_public_order_internal(jsonb);
  drop table if exists public.products cascade;
  drop table if exists public.app_settings cascade;
  ```
  Note this leaves the public order path without a function; restore `0001`'s
  `create_public_order` or re-run `0004–0006` + seed.
- **Data**: the seed is the source of truth for a clean re-load; re-run it to reset
  the catalog to defaults.
