-- ===========================================================================
-- 0004_products_and_settings.sql
-- Product catalog + owner settings move from application code / localStorage
-- into Supabase, so supplier costs and pricing rules live server-side only.
--
-- Run AFTER 0001–0003. Safe to run in the SQL Editor. Idempotent where practical.
-- RLS is added in 0006; the secure read/pricing functions are in 0005.
--
-- Money: stored as PostgreSQL `numeric` in the app's BASE currency (EUR), exactly
-- like the orders table (0001). No floating-point money. Display conversion to ALL
-- happens at the boundary (lib/currency.ts), unchanged.
--
-- PUBLIC vs PRIVATE columns (enforced by 0005 functions + 0006 RLS):
--   PUBLIC : slug, name, category, tag, description_sq, sell_price_eur, is_active
--   PRIVATE: supplier_cost_eur, min_margin, min_profit, market_*, ladder, note
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  -- Stable human id used by the app and bundle presets (e.g. 'stand').
  slug               text not null unique,

  -- PUBLIC fields (safe for anonymous customers)
  name               text not null,
  category           text not null default '',
  tag                text not null default 'green' check (tag in ('green', 'yellow')),
  description_sq     text not null default '',
  -- Authoritative selling price the customer pays, BASE currency (EUR). PUBLIC.
  sell_price_eur     numeric not null default 0 check (sell_price_eur >= 0),
  is_active          boolean not null default true,

  -- PRIVATE fields (owner-only; never returned to anonymous clients)
  supplier_cost_eur  numeric not null default 0 check (supplier_cost_eur >= 0),
  min_margin         numeric not null default 0.7 check (min_margin >= 0 and min_margin <= 1),
  min_profit         numeric not null default 0 check (min_profit >= 0),
  market_min         numeric not null default 0,
  market_recommended numeric not null default 0,
  market_premium     numeric not null default 0,
  market_max         numeric not null default 0,
  ladder             jsonb   not null default '[]'::jsonb,  -- psychological price points
  note               text    not null default '',            -- INTERNAL owner note

  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists products_active_idx on public.products (is_active);
create index if not exists products_sort_idx   on public.products (sort_order);

-- Reuse set_updated_at() from 0001.
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- app_settings  (single row — the owner's global configuration)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  -- Singleton guard: the primary key is a constant `true`, so only one row exists.
  id              boolean primary key default true,
  constraint app_settings_singleton check (id),

  -- Display currency for the owner dashboard (public site always shows ALL).
  currency        text not null default 'ALL' check (currency in ('ALL', 'EUR', 'USD')),

  -- PRIVATE pricing rules (owner-only)
  min_margin      numeric not null default 0.7 check (min_margin >= 0 and min_margin <= 1),
  min_profit      numeric not null default 3   check (min_profit >= 0),

  -- Bundle discount is customer-facing (shown as "you save"), so it is not secret.
  bundle_discount numeric not null default 0.1 check (bundle_discount >= 0 and bundle_discount <= 1),

  updated_at      timestamptz not null default now()
);

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Ensure the singleton row exists (values are seeded/overwritten by the seed file
-- and by the dashboard Settings panel). This insert is safe to re-run.
insert into public.app_settings (id) values (true)
on conflict (id) do nothing;
