-- ===========================================================================
-- 0005_secure_pricing_functions.sql
-- Server-side authoritative pricing + public read access.
--
-- Run AFTER 0004. Safe to run in the SQL Editor. Uses create-or-replace.
--
-- SECURITY MODEL
--   * The browser is NEVER trusted for money. The public site sends only
--     { slug, qty } selections + customer details. All prices, costs, profit and
--     margins are computed HERE, from the authoritative products table.
--   * All anon access goes through SECURITY DEFINER functions that hand-pick
--     columns. Anon has NO direct table access (RLS in 0006). Private columns
--     (supplier_cost_eur, margins, market_*, note) are never returned to anon.
--   * _price_public_order() is INTERNAL (no grants). The public wrappers
--     quote_public_order() (read-only) and create_validated_public_order()
--     (inserts the order) call it and return PUBLIC fields only.
--
-- PRICING PARITY: the math below mirrors lib/pricing.ts priceBundle() exactly, so
-- customer-visible prices do not change. Unit price = products.sell_price_eur (the
-- authoritative price the owner set); the bundle discount + margin-floor guard come
-- from app_settings.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- INTERNAL: price a set of { slug, qty } items authoritatively.
-- Returns a jsonb bag containing BOTH public and private computed values, plus
-- linesFull (with unitCost, for storage) and linesPublic (without unitCost).
-- Not granted to anyone — only the wrappers below may call it.
-- ---------------------------------------------------------------------------
create or replace function public.price_public_order_internal(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s_min_margin numeric;
  s_discount   numeric;
  item         jsonb;
  slug_txt     text;
  qty_int      integer;
  prod         public.products;
  lines_full   jsonb := '[]'::jsonb;
  lines_public jsonb := '[]'::jsonb;
  separate_price numeric := 0;
  total_cost   numeric := 0;
  units        integer := 0;
  discounted   numeric;
  floor_price  numeric;
  price        numeric;
  capped       boolean;
  profit       numeric;
  margin       numeric;
  saved        numeric;
  discount_pct numeric;
begin
  select min_margin, bundle_discount into s_min_margin, s_discount
  from public.app_settings limit 1;
  if s_min_margin is null then
    raise exception 'app_settings not configured';
  end if;

  if payload->'items' is null or jsonb_typeof(payload->'items') <> 'array'
     or jsonb_array_length(payload->'items') = 0 then
    raise exception 'No items in order';
  end if;

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    slug_txt := item->>'slug';
    qty_int  := floor(coalesce((item->>'qty')::numeric, 0))::integer;
    if slug_txt is null or slug_txt = '' then
      raise exception 'Invalid item (missing slug)';
    end if;
    if qty_int < 1 then
      raise exception 'Invalid quantity for %', slug_txt;
    end if;

    select * into prod from public.products
      where slug = slug_txt and is_active = true;
    if not found then
      raise exception 'Product not available: %', slug_txt;
    end if;

    lines_full := lines_full || jsonb_build_object(
      'productId',     prod.slug,
      'name',          prod.name,
      'descriptionSq', prod.description_sq,
      'qty',           qty_int,
      'unitPrice',     prod.sell_price_eur,
      'unitCost',      prod.supplier_cost_eur      -- PRIVATE (stored, never returned)
    );
    lines_public := lines_public || jsonb_build_object(
      'productId',     prod.slug,
      'name',          prod.name,
      'descriptionSq', prod.description_sq,
      'qty',           qty_int,
      'unitPrice',     prod.sell_price_eur
    );

    separate_price := separate_price + prod.sell_price_eur * qty_int;
    total_cost     := total_cost + prod.supplier_cost_eur * qty_int;
    units          := units + qty_int;
  end loop;

  if separate_price <= 0 then
    raise exception 'Order total is zero';
  end if;

  -- Mirror of lib/pricing.ts priceBundle():
  discounted  := separate_price * (1 - s_discount);
  floor_price := case when s_min_margin < 1 then total_cost / (1 - s_min_margin) else separate_price end;
  price       := greatest(discounted, floor_price);
  capped      := price > discounted + 0.001;
  price       := round(price);
  if price < ceil(floor_price) then price := ceil(floor_price); end if;
  if price > separate_price then price := round(separate_price); end if;

  profit       := price - total_cost;
  margin       := case when price > 0 then profit / price else 0 end;
  saved        := greatest(0, round(separate_price) - price);
  discount_pct := case when separate_price > 0 then saved / separate_price else 0 end;

  return jsonb_build_object(
    'units',            units,
    'separatePrice',    separate_price,
    'totalCost',        total_cost,        -- PRIVATE
    'finalPrice',       price,
    'profit',           profit,            -- PRIVATE
    'margin',           margin,            -- PRIVATE
    'saved',            saved,
    'discountPct',      discount_pct,
    'capped',           capped,
    'linesFull',        lines_full,        -- contains unitCost (PRIVATE)
    'linesPublic',      lines_public
  );
end;
$$;

revoke all on function public.price_public_order_internal(jsonb) from public;
-- intentionally NOT granted to anon/authenticated: internal only.

-- ---------------------------------------------------------------------------
-- PUBLIC read-only quote. Returns ONLY public totals (no cost/profit/margin).
-- Useful for the app and for manipulation tests.
-- ---------------------------------------------------------------------------
create or replace function public.quote_public_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  r := public.price_public_order_internal(payload);
  return jsonb_build_object(
    'currency',         coalesce(nullif(payload->>'currency', ''), 'ALL'),
    'separatePrice',    r->'separatePrice',
    'finalPrice',       r->'finalPrice',
    'saved',            r->'saved',
    'bundleDiscountPct',r->'discountPct',
    'lines',            r->'linesPublic'
  );
end;
$$;

revoke all on function public.quote_public_order(jsonb) from public;
grant execute on function public.quote_public_order(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- PUBLIC order creation (hardened replacement for 0001's create_public_order).
-- Recomputes everything server-side, stores trusted price + cost snapshots, and
-- returns ONLY public receipt fields.
-- ---------------------------------------------------------------------------
create or replace function public.create_validated_public_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        jsonb;
  new_row  public.orders;
begin
  r := public.price_public_order_internal(payload);

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
    r->'linesFull',
    (r->>'separatePrice')::numeric,
    (r->>'discountPct')::numeric,
    (r->>'finalPrice')::numeric,
    (r->>'totalCost')::numeric,     -- PRIVATE (stored, not returned)
    (r->>'profit')::numeric,        -- PRIVATE
    (r->>'margin')::numeric,        -- PRIVATE
    (r->>'saved')::numeric
  )
  returning * into new_row;

  -- PUBLIC receipt only. No cost / profit / margin / unitCost.
  return jsonb_build_object(
    'id',                new_row.id,
    'number',            new_row.number,
    'public_token',      new_row.public_token,
    'created_at',        new_row.created_at,
    'currency',          new_row.currency,
    'businessType',      new_row.business_type,
    'businessTypeLabel', new_row.business_type_label,
    'businessName',      new_row.business_name,
    'customerName',      new_row.customer_name,
    'phone',             new_row.phone,
    'address',           new_row.address,
    'customerNotes',     new_row.customer_notes,
    'status',            new_row.status,
    'separatePrice',     new_row.separate_price,
    'bundleDiscountPct', new_row.bundle_discount_pct,
    'finalPrice',        new_row.final_price,
    'saved',             new_row.saved,
    'lines',             r->'linesPublic'
  );
end;
$$;

revoke all on function public.create_validated_public_order(jsonb) from public;
grant execute on function public.create_validated_public_order(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- PUBLIC catalog read. Active products, PUBLIC columns only.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_products()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'slug',         slug,
      'name',         name,
      'category',     category,
      'tag',          tag,
      'descriptionSq',description_sq,
      'sellPriceEur', sell_price_eur
    ) order by sort_order, name
  ), '[]'::jsonb)
  from public.products
  where is_active = true;
$$;

revoke all on function public.get_public_products() from public;
grant execute on function public.get_public_products() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- PUBLIC config read. Only the customer-facing bundle discount + display currency.
-- Never the margin/profit rules.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'currency',       currency,
    'bundleDiscount', bundle_discount
  )
  from public.app_settings
  limit 1;
$$;

revoke all on function public.get_public_config() from public;
grant execute on function public.get_public_config() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Remove the old client-trusting order function (0001). The public site now uses
-- create_validated_public_order, which never trusts client-sent totals.
-- ---------------------------------------------------------------------------
drop function if exists public.create_public_order(jsonb);
