-- ===========================================================================
-- 0002_rls_policies.sql
-- Row Level Security for public.orders.
--
-- Run this AFTER 0001_initial_schema.sql.
--
-- Security model:
--   * RLS is ENABLED with NO policies for the `anon` (public) role. That means
--     the public site canNOT select, insert, update or delete orders directly.
--     Its only write path is create_public_order() (SECURITY DEFINER, from 0001),
--     which runs as the definer and bypasses RLS. Result: the public can create
--     an order but can never list or read other customers' orders.
--
--   * The owner dashboard currently reads/writes via server-side code using the
--     SERVICE ROLE key, which bypasses RLS entirely. That is why the dashboard
--     works before any authentication exists.
--
--   * `authenticated`-role policies below are written NOW so that when Supabase
--     Auth is added for /dashboard, the dashboard can switch from the service
--     role to the signed-in user's context with NO further migration. Today they
--     match nobody (there are no authenticated users), so they are harmless.
--     See docs/SUPABASE_SETUP.md -> "Authentication phase".
-- ===========================================================================

alter table public.orders enable row level security;
-- Belt and suspenders: force RLS even for the table owner role.
alter table public.orders force row level security;

-- ---- anon (public site): intentionally NO policies -> full deny. ----
-- (Nothing to create. Do NOT add a permissive anon select/insert/update/delete.)

-- ---- authenticated (future dashboard auth): full access. ----
drop policy if exists "authenticated read orders"   on public.orders;
drop policy if exists "authenticated insert orders"  on public.orders;
drop policy if exists "authenticated update orders"  on public.orders;
drop policy if exists "authenticated delete orders"  on public.orders;

create policy "authenticated read orders"
  on public.orders for select
  to authenticated
  using (true);

create policy "authenticated insert orders"
  on public.orders for insert
  to authenticated
  with check (true);

create policy "authenticated update orders"
  on public.orders for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated delete orders"
  on public.orders for delete
  to authenticated
  using (true);
