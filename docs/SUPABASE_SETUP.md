# Supabase Setup — NFC Reseller

This app persists **orders** in Supabase. Everything else (product catalog,
costs, price overrides, owner settings, and the current builder selection) stays
in the app / browser `localStorage`, exactly as before — no change there.

> **Accounts:** GitHub + Vercel are one account; Supabase is a **different**
> account. That is intentional and completely fine. The app only ever talks to
> Supabase through environment variables — nothing needs the accounts linked.
> Do **not** try to merge or transfer ownership.

---

## 1. Environment variables

| Variable | Public? | Used by | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (browser) | public site + server | Your project's API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (browser) | public site | Anon key — gated by RLS; used only to call the `create_public_order` function |
| `SUPABASE_SERVICE_ROLE_KEY` | **NO — secret** | server only | Full DB access for the owner dashboard. **Never** expose to the browser |

**Where to find them:** Supabase Dashboard → your project → **Project Settings**
→ **API**:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **Project API keys → `anon` `public`** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Project API keys → `service_role`** → `SUPABASE_SERVICE_ROLE_KEY`
  (marked "secret" in the dashboard — treat it like a password)

### Local setup

```bash
cp .env.example .env.local
# then edit .env.local and paste the three real values
```

- `.env.local` is **gitignored** — it must never be committed. (Verify with
  `git check-ignore .env.local` → it should print `.env.local`.)
- `.env.example` holds **placeholders only** and *is* committed.
- **Never** prefix a secret with `NEXT_PUBLIC_`. Anything with that prefix is
  inlined into the browser bundle.

### When is the service role key required?

**No longer.** Owner authentication has been implemented (see
[`AUTH_SETUP.md`](./AUTH_SETUP.md)). The dashboard now runs as the signed-in owner
and access is enforced by RLS, so the app does not read the service role key at
all. You may leave `SUPABASE_SERVICE_ROLE_KEY` unset. The public site never used it.

---

## 2. Run the database migrations

Run these **in order**, once, per Supabase project (e.g. your production project;
repeat for a separate staging project if you make one).

| Order | File | What it does |
| --- | --- | --- |
| 1 | `supabase/migrations/0001_initial_schema.sql` | `orders` table, number sequence + triggers, and the `create_public_order` function |
| 2 | `supabase/migrations/0002_rls_policies.sql` | Enables Row Level Security and the base `authenticated` policies |
| 3 | `supabase/migrations/0003_owner_auth_policies.sql` | Owner allowlist + `is_owner()`; replaces the `0002` policies with owner-scoped ones. See [`AUTH_SETUP.md`](./AUTH_SETUP.md) |

### How to run each migration (SQL Editor)

1. Supabase Dashboard → **SQL Editor** → **New query**.
2. Open `0001_initial_schema.sql`, copy its entire contents, paste, click **Run**.
3. Confirm "Success. No rows returned".
4. Repeat for `0002_rls_policies.sql`.
5. Sanity check: **Table Editor** should now show a `public.orders` table with a
   green **RLS enabled** badge.

> Prefer the CLI? With the Supabase CLI linked to your project you can
> `supabase db push`, or `supabase migration up`. The SQL Editor path above needs
> no tooling and is the recommended one for this project.

---

## 3. Add the variables to Vercel

1. Vercel → your project → **Settings** → **Environment Variables**.
2. Add all three, for **Production** (and **Preview** if you use preview deploys):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`  ← leave "Expose to browser" **off**; never make it `NEXT_PUBLIC_`.
3. **Redeploy** so the new env vars take effect (Vercel does not apply env changes
   to existing deployments retroactively).

The Supabase project being under a different account than Vercel makes no
difference here — you are only pasting string values.

---

## 4. How the pieces fit (security model)

- **Public site `/` (customer):** uses the **anon key** and can do exactly one
  thing — call `create_public_order(...)`. It **cannot** list, read, update or
  delete orders. RLS denies the anon role all direct table access.
- **`create_public_order`** (`SECURITY DEFINER`) assigns the order number and id,
  stores the order, and returns only `{ id, number, public_token, created_at }`
  — never cost/profit/margin.
- **Owner dashboard `/dashboard`:** protected by Supabase Auth. Reads/writes go
  through server actions (`lib/data/orders.ts`) running as the **signed-in owner**,
  enforced by the owner RLS policies. See [`AUTH_SETUP.md`](./AUTH_SETUP.md).

---

## 5. Local test checklist

With `.env.local` filled and both migrations run:

```bash
npm install
npm run build
npm run start   # or: npm run dev
```

- [ ] Open `/`, build a bundle, **Mbyll porosinë**, submit. The receipt appears
      with an `NFC-####` number, and a new row is in Supabase → Table Editor.
- [ ] The receipt shows **no** cost/profit/margin (customer-safe).
- [ ] Open `/dashboard` → **Porositë**: the order you just created is listed.
- [ ] Open it → advance status (`Gati për dërgim →`, then `Dërguar →`). Refresh
      the page → the status persisted.
- [ ] Duplicate an order → a new `NFC-####` appears. Edit → **Ruaj ndryshimet**.
      Delete → it disappears and stays gone after refresh.
- [ ] **Eksporto** a backup, then **Importo** it → orders restored with their
      original numbers.
- [ ] Temporarily remove a var from `.env.local` and retry an order action →
      you get a clear error toast (not a silent success). Restore the var.

## 6. Production test checklist

After deploying to Vercel with env vars set and migrations run on the prod project:

- [ ] Public order on the live URL creates a row in the prod Supabase project.
- [ ] `/dashboard` lists and updates orders.
- [ ] View source / network on `/` and confirm the **service role key is not
      present** anywhere in the client bundle (only the anon key should appear).
- [ ] Anon cannot read orders: in the browser console on `/`, a direct
      `supabase.from('orders').select('*')` returns **no rows / permission error**.

---

## 7. Authentication phase (DONE)

The dashboard is now protected by Supabase Auth — see
[`AUTH_SETUP.md`](./AUTH_SETUP.md) for the full setup, owner creation and testing.
In short: `/dashboard` is guarded by `middleware.ts`, the data layer runs as the
signed-in owner (RLS-enforced via migration `0003`), login lives at `/login`, and
the `SUPABASE_SERVICE_ROLE_KEY` is no longer used by the app.

Nothing about the public order flow changed during the auth phase.

---

## 8. Rollback / recovery

- **A migration failed halfway:** migrations are small and mostly idempotent
  (`create ... if not exists`, `create or replace`, `drop ... if exists`). Fix the
  reported SQL error and re-run the whole file. If you must start clean:

  ```sql
  -- DANGER: deletes all orders and the schema objects. Only on an empty/dev project.
  drop table if exists public.orders cascade;
  drop function if exists public.create_public_order(jsonb);
  drop function if exists public.sync_order_number_seq();
  drop function if exists public.assign_order_number();
  drop function if exists public.set_updated_at();
  drop sequence if exists public.orders_number_seq;
  ```

  Then re-run `0001` and `0002`.

- **Bad data import:** the dashboard **Eksporto** button saves a full JSON backup
  before you experiment. **Importo** does a destructive full replace of orders, so
  export first. Keep the backup file safe.

- **App can't reach Supabase / wrong keys:** order actions show an error toast and
  the browser console logs the detail. Orders are never silently dropped. Fix the
  env vars and retry — nothing is lost because a failed create never showed a
  success receipt.

---

## Notes / decisions

- **Only orders are in the DB.** Products, costs, price overrides and settings stay
  app-side by design (the public catalog computes prices in the browser today; moving
  them would change behavior and add tables for no benefit). See the "remaining risk"
  about client-side cost data in the project handover notes.
- **Order line items** are stored as a JSONB snapshot on the order (immutable, never
  queried alone). Normalize into an `order_items` table only if per-product analytics
  are needed later.
- **Order statuses** are stored as `new` / `ready` / `delivered` and mapped to the
  Albanian labels in `lib/i18n.ts`.
