# Owner Authentication Setup — NFC Reseller

This guide covers the **owner login** that protects `/dashboard`. It builds on
[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) (orders persistence), which must be in
place first.

> **What changed:** the dashboard used to be reachable by anyone who knew the
> `/dashboard` URL, and it read/wrote the database with the all-powerful **service
> role key**. It is now behind Supabase Auth: only a signed-in, allowlisted
> **owner** can reach it, and every database operation runs as that user and is
> enforced by **Row Level Security**. The service role key is no longer required.

---

## 0. Security model (why route protection **and** RLS)

Two independent layers, on purpose:

| Layer | Where | Protects against |
| --- | --- | --- |
| **Route guard** | `middleware.ts` (server-side) | Anonymous visitors loading `/dashboard`. Redirects to `/login` before the page renders. |
| **Database RLS** | `supabase/migrations/0003_...sql` | Anyone reaching the data directly (stolen/forged request, a bug, a future API). Non-owners get **no rows**. |

The route guard alone is not enough — it only hides a page. RLS is what actually
protects the data. `is_owner()` is the single authorization predicate used by both
the database policies and the server data layer (`lib/data/orders.ts`).

The **public customer flow is untouched**: `/` needs no login, and anonymous order
creation still goes through the `create_public_order()` function (anon can create
an order but can never list or read orders).

---

## 1. Enable Email/Password auth in Supabase

1. Supabase Dashboard → **Authentication** → **Providers** → **Email**.
2. Enable **Email**. Turn **Confirm email** OFF (there is a single owner you create
   by hand; no email-confirmation round-trip is needed) — or leave it ON and
   confirm via the invite link, your choice.
3. **Disable public sign-ups** so nobody can self-register:
   Authentication → **Sign In / Providers** (or **Settings**) → turn
   **Allow new users to sign up** OFF.
   The app has no sign-up screen, but this closes the API-level path too.

---

## 2. Create the owner user (manually)

1. Authentication → **Users** → **Add user** → **Create new user**.
2. Enter the owner's **email** and a strong **password**.
3. Check **Auto Confirm User** so the account is immediately usable.
4. Click **Create user**.

> Do this once for the owner. Repeat only if you want a second authorized person.

---

## 3. Find the owner's UUID

Authentication → **Users** → click the user → copy the **User UID** (a UUID like
`3f9c…`). It is also shown in the users table's `id` column.

---

## 4. Run the auth migration and authorize the owner

### 4a. Run the migration

Supabase Dashboard → **SQL Editor** → **New query** → paste the full contents of
`supabase/migrations/0003_owner_auth_policies.sql` → **Run**.

**Exact migration order (all three, once per project):**

| Order | File | Status |
| --- | --- | --- |
| 1 | `0001_initial_schema.sql` | already applied |
| 2 | `0002_rls_policies.sql` | already applied |
| 3 | `0003_owner_auth_policies.sql` | **run now** |

`0003` creates the `app_owners` allowlist + `is_owner()`, and **replaces** the
permissive `authenticated` order policies from `0002` with owner-scoped ones.

### 4b. Authorize the owner UUID

In the SQL Editor, insert the UUID from step 3 into the allowlist:

```sql
insert into public.app_owners (user_id, note)
values ('PASTE-OWNER-UUID-HERE', 'primary owner')
on conflict (user_id) do nothing;
```

Verify:

```sql
select * from public.app_owners;      -- your owner row
select public.is_owner();              -- run while impersonating? see note below
```

> A signed-in user who is **not** in `app_owners` can log in but sees **no orders**
> and cannot create/update/delete — exactly the intended behavior. Being a Supabase
> user is not enough; the UUID must be allowlisted.

---

## 5. Environment variables (Vercel + local)

No **new** variables are needed. The auth flow uses the same public vars you
already have:

| Variable | Still needed? |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **No longer used by the app.** You may remove it from Vercel and `.env.local`, or keep it only for manual admin scripts. |

- Local: your existing `.env.local` already has the two public vars.
- Vercel: no change required. If you want to shrink the secret surface, delete
  `SUPABASE_SERVICE_ROLE_KEY` from **Settings → Environment Variables** and redeploy.

---

## 6. How login works (local and production)

- Visit `/dashboard` while logged out → the **middleware** redirects to `/login`.
- `/login` (email + password, Albanian UI) calls Supabase
  `signInWithPassword`. On success the session is stored in **cookies** (via
  `@supabase/ssr`) and you are sent to `/dashboard`.
- Refreshing `/dashboard` keeps you logged in — the middleware refreshes the
  session cookie on each request.
- An **expired / invalid** session on `/dashboard` → redirected back to `/login`.
- **Logout:** the **Dil** button in the dashboard header POSTs to
  `/auth/signout`, which clears the session server-side and redirects to `/login`.

Local and production behave identically; cookies are host-scoped, so nothing
special is required for the Vercel domain.

---

## 7. Test checklist

### Unauthenticated
- [ ] Open `/` → the customer catalog loads and works with **no login**.
- [ ] Build a bundle → **Mbyll porosinë** → submit → receipt appears (public flow
      still works, still creates a row).
- [ ] Open `/dashboard` while logged out → you are redirected to `/login`.

### Authenticated (owner)
- [ ] On `/login`, sign in with the owner email/password → land on `/dashboard`.
- [ ] **Porositë** lists orders; open one and advance status → persists on refresh.
- [ ] Duplicate / edit / delete an order → all work.
- [ ] Refresh `/dashboard` → still logged in.
- [ ] Click **Dil** → redirected to `/login`; opening `/dashboard` again redirects
      to `/login` (session cleared).

### Authorization (non-owner is powerless)
- [ ] Create a second Supabase user but **do not** add them to `app_owners`.
- [ ] Log in as them → the dashboard loads but shows **no orders**, and creating /
      updating fails with a clear error. (Add them to `app_owners` to grant access.)

### Invalid credentials
- [ ] Wrong password on `/login` → the Albanian "email ose fjalëkalim i pasaktë"
      error shows, no redirect.

---

## 8. Troubleshooting

- **Redirect loop between `/login` and `/dashboard`** — usually cookies not being
  set. Confirm `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` are present in the
  environment the app is running in, and that you are not blocking third-party /
  first-party cookies for the site.
- **Logged in but dashboard is empty** — the account is authenticated but not in
  `app_owners`. Run the insert in step 4b with the correct UUID.
- **"Not authorized" / "not authenticated" toast on every action** — the session
  cookie isn't reaching the server action. Make sure `middleware.ts` is deployed
  (it must sit at the project root) and that the matcher includes `/dashboard`.
- **Local changes to auth not taking effect** — restart `npm run dev`; middleware
  and env vars are read at server start.
- **`is_owner()` does not exist** — `0003` was not run (or ran against a different
  project). Re-run it in the SQL Editor.

---

## 9. Files involved

- `middleware.ts` + `lib/supabase/middleware.ts` — session refresh + `/dashboard` guard.
- `lib/supabase/server.ts` — request-scoped (cookie) server client used by server
  actions and server components.
- `lib/supabase/browser.ts` — cookie-writing browser client used by the login form.
- `app/login/page.tsx` + `app/login/LoginForm.tsx` — the login screen.
- `app/auth/signout/route.ts` — logout endpoint.
- `lib/data/orders.ts` — `requireOwner()` gate; now runs as the owner (RLS-enforced).
- `supabase/migrations/0003_owner_auth_policies.sql` — allowlist, `is_owner()`, policies.

---

## 10. Remaining risks / notes

- **Cost/profit/margin still ship in the client bundle** (unchanged by this work).
  Auth protects the *orders table*, but product costs and the pricing engine still
  live in the browser (`data/products.ts` + client-side pricing), so a visitor can
  read costs/margins in DevTools. Making costs private is a separate, larger change
  (move products + pricing server-side). See `SUPABASE_SETUP.md`.
- **Single-factor auth.** Email + password only. For a solo owner dashboard this is
  reasonable; add MFA in Supabase later if desired.
- **Owner management is manual** (SQL insert). That's intentional — there is no
  in-app user admin, which keeps the attack surface small.
