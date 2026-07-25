-- ===========================================================================
-- 0010_enable_dashboard_realtime.sql
-- Enable Supabase Realtime for the owner dashboard (live orders + notifications).
--
-- Run AFTER 0001–0009. Safe to run in the Supabase SQL Editor. Idempotent.
--
-- What this does: adds public.orders and public.notifications to the
-- `supabase_realtime` publication so Postgres change events are streamed to
-- subscribed clients. It does NOT change RLS: Realtime enforces the SAME policies
-- as the REST path, so only an authenticated, allowlisted owner (is_owner() — see
-- 0003) receives these events. Anonymous sessions receive nothing. No new grants,
-- no service role, no change to the public order path or pricing.
--
-- Note on DELETE events: the default replica identity (primary key) is sufficient
-- here — the app only needs the deleted row's id to remove it from state, and the
-- owner RLS policies do not reference row columns, so delete events are delivered
-- correctly without REPLICA IDENTITY FULL.
-- ===========================================================================

-- Ensure the Realtime publication exists (Supabase creates it by default, but be safe).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- Add each table only if it is not already a member (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
