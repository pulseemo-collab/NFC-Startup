-- ===========================================================================
-- 0001_initial_schema.sql
-- NFC Reseller — orders schema, numbering, and the public order-creation RPC.
--
-- Run this FIRST, then 0002_rls_policies.sql.
-- Safe to run in the Supabase SQL Editor. Idempotent where practical.
--
-- Design notes:
--  * Only ORDERS live in the database. Product catalog, costs, price overrides
--    and owner settings remain application-side (data/products.ts + localStorage),
--    exactly as the current app works — no behavior change, no unnecessary tables.
--  * Every monetary value is stored in the app's BASE currency (EUR), matching
--    lib/currency.ts. `currency` is the display currency chosen at order time.
--  * Order line items are kept as a frozen JSONB snapshot (`lines`), mirroring the
--    app's immutable OrderSnapshot. They are never queried independently, so a
--    separate order_items table would add joins for zero current benefit.
--    (If per-product analytics are ever needed, normalise then — see SETUP doc.)
-- ===========================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- Order-number sequence: produces NFC-0001, NFC-0002, ...
create sequence if not exists public.orders_number_seq;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  -- Unguessable public handle (for a future "track my order" page). Never rely
  -- on a sequential id for access control.
  public_token        uuid not null default gen_random_uuid(),
  -- Human order number, e.g. 'NFC-0001'. Assigned by trigger when not supplied
  -- (supplied only during a full import/restore, to preserve original numbers).
  number              text not null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  currency            text not null default 'ALL',

  -- business / customer
  business_type       text,
  business_type_label text,
  business_name       text not null,
  customer_name       text,
  phone               text,
  address             text,
  customer_notes      text,        -- customer-facing (safe for the receipt)
  owner_notes         text,        -- PRIVATE — owner only, never returned to the public

  -- fulfilment workflow: maps to the Albanian labels in lib/i18n.ts
  --   new -> "Porosi e re", ready -> "Gati për dërgim", delivered -> "Dërguar"
  status              text not null default 'new'
                        check (status in ('new', 'ready', 'delivered')),

  -- payment tracking is retained for parity with OrderSnapshot (owner-only)
  payment_status      text not null default 'unpaid'
                        check (payment_status in ('unpaid', 'deposit', 'paid')),
  amount_paid         numeric not null default 0,

  -- frozen line snapshots: [{ productId, name, descriptionSq, qty, unitPrice, unitCost }]
  -- NOTE: unitCost inside each line is INTERNAL (owner-only).
  lines               jsonb not null default '[]'::jsonb,

  -- frozen financials (BASE currency = EUR)
  separate_price      numeric not null default 0,
  bundle_discount_pct numeric not null default 0,   -- 0..1
  final_price         numeric not null default 0,
  total_cost          numeric not null default 0,    -- PRIVATE
  profit              numeric not null default 0,     -- PRIVATE
  margin              numeric not null default 0,      -- 0..1, PRIVATE
  saved               numeric not null default 0,

  constraint orders_number_key unique (number),
  constraint orders_public_token_key unique (public_token)
);

-- ---------------------------------------------------------------------------
-- Indexes (list is sorted newest-first and filtered by status)
-- ---------------------------------------------------------------------------
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx     on public.orders (status);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Order-number assignment: fill `number` from the sequence when not provided.
-- Imports pass an existing number through untouched.
-- ---------------------------------------------------------------------------
create or replace function public.assign_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null or new.number = '' then
    new.number := 'NFC-' || lpad(nextval('public.orders_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists orders_assign_number on public.orders;
create trigger orders_assign_number
  before insert on public.orders
  for each row execute function public.assign_order_number();

-- After a bulk import that supplied its own numbers, advance the sequence past
-- the highest existing number so future orders never collide.
create or replace function public.sync_order_number_seq()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  max_n bigint;
begin
  select coalesce(max(nullif(regexp_replace(number, '\D', '', 'g'), '')::bigint), 0)
    into max_n
    from public.orders;
  perform setval('public.orders_number_seq', greatest(max_n, 1), max_n > 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- PUBLIC order creation (the ONLY thing the anon/public role may do).
--
-- SECURITY DEFINER so it can insert past RLS. It whitelists the payload: the
-- public site can set customer + financial fields, but NOT status, payment,
-- owner_notes, id or number. It returns ONLY the safe fields the receipt needs
-- — never cost / profit / margin.
-- ---------------------------------------------------------------------------
create or replace function public.create_public_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_row public.orders;
begin
  insert into public.orders (
    currency,
    business_type,
    business_type_label,
    business_name,
    customer_name,
    phone,
    address,
    customer_notes,
    lines,
    separate_price,
    bundle_discount_pct,
    final_price,
    total_cost,
    profit,
    margin,
    saved
  ) values (
    coalesce(nullif(payload->>'currency', ''), 'ALL'),
    payload->>'businessType',
    payload->>'businessTypeLabel',
    coalesce(nullif(trim(payload->>'businessName'), ''), 'Klient'),
    nullif(trim(payload->>'customerName'), ''),
    nullif(trim(payload->>'phone'), ''),
    nullif(trim(payload->>'address'), ''),
    nullif(trim(payload->>'customerNotes'), ''),
    coalesce(payload->'lines', '[]'::jsonb),
    coalesce((payload->>'separatePrice')::numeric, 0),
    coalesce((payload->>'bundleDiscountPct')::numeric, 0),
    coalesce((payload->>'finalPrice')::numeric, 0),
    coalesce((payload->>'totalCost')::numeric, 0),
    coalesce((payload->>'profit')::numeric, 0),
    coalesce((payload->>'margin')::numeric, 0),
    coalesce((payload->>'saved')::numeric, 0)
  )
  returning * into new_row;

  return jsonb_build_object(
    'id',           new_row.id,
    'number',       new_row.number,
    'public_token', new_row.public_token,
    'created_at',   new_row.created_at
  );
end;
$$;

-- Only the public function is exposed to anon; direct table access is denied by
-- RLS (see 0002). Lock the function grants down explicitly.
revoke all on function public.create_public_order(jsonb) from public;
grant execute on function public.create_public_order(jsonb) to anon, authenticated;

revoke all on function public.sync_order_number_seq() from public;
-- sync is an owner/maintenance op — not exposed to anon.
