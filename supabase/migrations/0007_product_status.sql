-- ===========================================================================
-- 0007_product_status.sql
-- Adds a 3-state owner workflow status to products (Owner Experience 2.0, Part 4).
--
-- Run AFTER 0004–0006. Safe to run in the SQL Editor. Idempotent.
--
-- Design: `status` is the OWNER-facing lifecycle. `is_active` stays the
-- PUBLIC-visibility flag that 0005's get_public_products() / create_validated_
-- public_order() already read — so the public site + RLS are UNCHANGED. The app
-- keeps the two in sync at write time:
--     status = 'active'   -> is_active = true   (customer can see + order it)
--     status = 'draft'    -> is_active = false  (work in progress, hidden)
--     status = 'archived' -> is_active = false  (retired, hidden, kept for history)
--
-- No new grants, no policy changes: `status` lives on the products table, which
-- is already owner-only (RLS forces owner-only access in 0006). Anon never reads
-- this table directly, and get_public_products() selects only public columns.
-- ===========================================================================

alter table public.products
  add column if not exists status text not null default 'active'
    check (status in ('active', 'draft', 'archived'));

-- Backfill existing rows from is_active (idempotent — only touches rows still at
-- the column default that disagree with is_active).
update public.products
   set status = case when is_active then 'active' else 'archived' end
 where (is_active and status <> 'active')
    or (not is_active and status = 'active');

create index if not exists products_status_idx on public.products (status);
