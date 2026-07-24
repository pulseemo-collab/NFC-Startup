-- ===========================================================================
-- 0003_owner_auth_policies.sql
-- Owner authentication + authorization for the dashboard.
--
-- Run this AFTER 0001_initial_schema.sql and 0002_rls_policies.sql.
-- Safe to run in the Supabase SQL Editor. Idempotent where practical.
--
-- What this migration establishes:
--   * An OWNER ALLOWLIST (public.app_owners). Being a signed-in Supabase user is
--     NOT enough to touch orders — the user's id must be in this table.
--   * public.is_owner(): the single authorization predicate, used by RLS and by
--     the server data layer (lib/data/orders.ts -> requireOwner()).
--   * The permissive `authenticated ... using (true)` order policies from 0002
--     are REPLACED with owner-scoped ones. Every authenticated user no longer
--     gets access — only allowlisted owners do.
--
-- What is deliberately UNCHANGED:
--   * Anonymous order creation still works: create_public_order() (0001) is
--     SECURITY DEFINER and granted to anon; the anon role still has NO direct
--     table policies, so anon cannot list / read / update / delete orders.
--   * The public receipt flow (return-value from create_public_order) is intact.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Owner allowlist
-- ---------------------------------------------------------------------------
create table if not exists public.app_owners (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  note       text
);

-- Lock the table down. Only the owner may read their own membership row; nobody
-- can write to it through the API (you add owners via the SQL Editor — see
-- docs/AUTH_SETUP.md). Service-role / SQL Editor bypass RLS and can always manage it.
alter table public.app_owners enable row level security;

drop policy if exists "owner reads own membership" on public.app_owners;
create policy "owner reads own membership"
  on public.app_owners for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Authorization predicate
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so it can read app_owners regardless of the caller's own RLS.
-- STABLE: result is constant within a statement. Used by the order policies below
-- and by the server (supabase.rpc('is_owner')).
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_owners where user_id = auth.uid()
  );
$$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

-- ---------------------------------------------------------------------------
-- Replace the permissive order policies from 0002 with owner-scoped ones.
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated read orders"   on public.orders;
drop policy if exists "authenticated insert orders"  on public.orders;
drop policy if exists "authenticated update orders"  on public.orders;
drop policy if exists "authenticated delete orders"  on public.orders;

-- Idempotency: drop the owner policies too before recreating.
drop policy if exists "owner read orders"   on public.orders;
drop policy if exists "owner insert orders"  on public.orders;
drop policy if exists "owner update orders"  on public.orders;
drop policy if exists "owner delete orders"  on public.orders;

create policy "owner read orders"
  on public.orders for select
  to authenticated
  using (public.is_owner());

create policy "owner insert orders"
  on public.orders for insert
  to authenticated
  with check (public.is_owner());

create policy "owner update orders"
  on public.orders for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy "owner delete orders"
  on public.orders for delete
  to authenticated
  using (public.is_owner());

-- ---------------------------------------------------------------------------
-- Maintenance RPC used by the dashboard's Import (restore) flow.
-- The dashboard now runs as the owner (not the service role), so grant execute
-- to authenticated but guard the body so only an owner can actually run it.
-- ---------------------------------------------------------------------------
create or replace function public.sync_order_number_seq()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  max_n bigint;
begin
  if not public.is_owner() then
    raise exception 'not authorized';
  end if;
  select coalesce(max(nullif(regexp_replace(number, '\D', '', 'g'), '')::bigint), 0)
    into max_n
    from public.orders;
  perform setval('public.orders_number_seq', greatest(max_n, 1), max_n > 0);
end;
$$;

revoke all on function public.sync_order_number_seq() from public;
grant execute on function public.sync_order_number_seq() to authenticated;

-- ---------------------------------------------------------------------------
-- AFTER creating the owner user in Supabase Authentication, authorize them:
--
--   insert into public.app_owners (user_id, note)
--   values ('00000000-0000-0000-0000-000000000000', 'primary owner')
--   on conflict (user_id) do nothing;
--
-- Replace the UUID with the owner's id from Authentication -> Users.
-- Full walkthrough: docs/AUTH_SETUP.md.
-- ---------------------------------------------------------------------------
