-- ===========================================================================
-- 0008_settings_business_identity.sql
-- Adds business identity to owner settings (Owner Experience 2.0, Part 11):
-- a business name and an optional logo, used for dashboard + receipt branding.
--
-- Run AFTER 0004–0007. Safe to run in the SQL Editor. Idempotent.
--
-- These live on app_settings, which is already owner-only under 0006 RLS. They do
-- NOT affect pricing or the public order path. (Delivery fee / tax / a configurable
-- exchange rate were deliberately NOT added: they would change customer-visible
-- order totals and the server-side pricing function, which is a separate,
-- explicit pricing decision — not bundled into a settings-UI change.)
-- ===========================================================================

alter table public.app_settings
  add column if not exists business_name text not null default '',
  add column if not exists logo_url      text not null default '';
