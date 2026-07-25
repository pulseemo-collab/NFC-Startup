-- ===========================================================================
-- 0009_notifications.sql
-- Notification center (Owner Experience 2.0, Part 5).
--
-- Run AFTER 0001–0008. Safe to run in the SQL Editor. Idempotent.
--
-- Owner-only, exactly like orders/products: RLS grants access only when
-- is_owner() is true (0003). Anon has NO access. A trigger on `orders` creates a
-- "new order" notification automatically on every insert — including public
-- orders created through create_validated_public_order (0005) — so the owner is
-- notified even when the dashboard is closed. Advisory notifications (low margin,
-- price recommendation, archived reminder, settings changed) are inserted by the
-- authenticated owner session and de-duplicated via `dedupe_key`.
-- ===========================================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null
                check (type in ('new_order', 'low_margin', 'price_recommendation', 'archived_product', 'settings_changed')),
  title       text not null default '',
  body        text not null default '',
  read        boolean not null default false,
  -- Stable key for idempotent inserts (e.g. 'order:NFC-0007', 'low_margin:stand').
  -- NULL means "always insert" (Postgres treats NULLs as distinct in a unique index).
  dedupe_key  text unique,
  -- Optional deep-link payload: { orderId, number, slug, ... }
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_created_idx on public.notifications (created_at desc);
create index if not exists notifications_unread_idx  on public.notifications (read) where read = false;

-- ---------------------------------------------------------------------------
-- RLS: owner-only (mirrors 0006). Anon has no access at all.
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists "owner read notifications"   on public.notifications;
drop policy if exists "owner insert notifications" on public.notifications;
drop policy if exists "owner update notifications" on public.notifications;
drop policy if exists "owner delete notifications" on public.notifications;

create policy "owner read notifications"   on public.notifications for select using (public.is_owner());
create policy "owner insert notifications" on public.notifications for insert with check (public.is_owner());
create policy "owner update notifications" on public.notifications for update using (public.is_owner()) with check (public.is_owner());
create policy "owner delete notifications" on public.notifications for delete using (public.is_owner());

-- ---------------------------------------------------------------------------
-- Auto "new order" notification. SECURITY DEFINER so it can insert regardless of
-- which role created the order (owner session OR the anon public-order function).
-- ---------------------------------------------------------------------------
create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (type, title, body, dedupe_key, meta)
  values (
    'new_order',
    'Porosi e re: ' || new.number,
    coalesce(nullif(new.business_name, ''), 'Klient'),
    'order:' || new.number,
    jsonb_build_object('orderId', new.id, 'number', new.number, 'finalPrice', new.final_price)
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists orders_notify_new on public.orders;
create trigger orders_notify_new
  after insert on public.orders
  for each row execute function public.notify_new_order();
