-- ===========================================================================
-- 0006_product_rls_policies.sql
-- Row Level Security for products + app_settings.
--
-- Run AFTER 0004 and 0005. Safe to run in the SQL Editor. Idempotent.
--
-- Model (identical philosophy to the orders table, 0002/0003):
--   * anon (public site): NO policies -> full deny on direct table access. The
--     public site reads ONLY through the SECURITY DEFINER functions in 0005
--     (get_public_products / get_public_config), which expose public columns only,
--     and writes ONLY through create_validated_public_order. Anon can therefore
--     never read supplier_cost_eur, margins, market_*, note, or owner settings.
--   * authenticated OWNER (is_owner()): full read/write, so the dashboard manages
--     products + settings as the signed-in owner. No service role, no broad
--     `authenticated using (true)` policy.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.products force  row level security;

-- (No anon policies on purpose — anon is fully denied direct table access.)

drop policy if exists "owner read products"   on public.products;
drop policy if exists "owner insert products" on public.products;
drop policy if exists "owner update products" on public.products;
drop policy if exists "owner delete products" on public.products;

create policy "owner read products"
  on public.products for select
  to authenticated
  using (public.is_owner());

create policy "owner insert products"
  on public.products for insert
  to authenticated
  with check (public.is_owner());

create policy "owner update products"
  on public.products for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy "owner delete products"
  on public.products for delete
  to authenticated
  using (public.is_owner());

-- ---------------------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.app_settings force  row level security;

-- (No anon policies — the public bundle discount + currency are read via
--  get_public_config(), a definer function; anon has no direct table access.)

drop policy if exists "owner read settings"   on public.app_settings;
drop policy if exists "owner insert settings" on public.app_settings;
drop policy if exists "owner update settings" on public.app_settings;

create policy "owner read settings"
  on public.app_settings for select
  to authenticated
  using (public.is_owner());

create policy "owner insert settings"
  on public.app_settings for insert
  to authenticated
  with check (public.is_owner());

create policy "owner update settings"
  on public.app_settings for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());
