-- ===========================================================================
-- seed_products_and_settings.sql   (NOT a migration — run manually, once)
--
-- Seeds the products table + app_settings from the app's original static data
-- (data/products.ts, data/bundles.ts defaults, DEFAULT_SETTINGS).
--
-- sell_price_eur is set to each product's CURRENT effective price, which equals
-- its market "recommended" price (the engine keeps the recommendation at the
-- default cost because every product clears its margin/profit floors). This
-- preserves customer-visible prices exactly — nothing changes for the customer.
--
-- Idempotent: uses ON CONFLICT upserts. Safe to re-run. Run AFTER 0004–0006.
-- Verify the rows (see docs/PRODUCTS_PRICING_MIGRATION.md) BEFORE deleting any
-- old localStorage data.
-- ===========================================================================

-- Owner global settings (matches DEFAULT_SETTINGS in components/NfcApp.tsx).
insert into public.app_settings (id, currency, min_margin, min_profit, bundle_discount)
values (true, 'ALL', 0.70, 3, 0.10)
on conflict (id) do update set
  currency        = excluded.currency,
  min_margin      = excluded.min_margin,
  min_profit      = excluded.min_profit,
  bundle_discount = excluded.bundle_discount;

-- Products. Columns:
--   slug, name, category, tag, description_sq,
--   sell_price_eur (PUBLIC, = market recommended),
--   supplier_cost_eur, min_margin, min_profit,
--   market_min, market_recommended, market_premium, market_max,
--   ladder, note, sort_order
insert into public.products (
  slug, name, category, tag, description_sq,
  sell_price_eur, supplier_cost_eur, min_margin, min_profit,
  market_min, market_recommended, market_premium, market_max,
  ladder, note, sort_order, is_active
) values
  ('stand', 'Google Review Stand', 'Reviews', 'green',
   'Klienti afron telefonin dhe hap menjëherë faqen e vlerësimit në Google.',
   39, 6.0, 0.72, 5, 24, 39, 49, 59,
   '[24,29,34,39,44,49,54,59]'::jsonb,
   'High-ROI counter product — the easiest ''yes''. Priced as a business tool, not a toy.',
   10, true),

  ('reviewcard', 'Google Review Card', 'Reviews', 'green',
   'Kartë portative që stafi mund t’ia ofrojë klientit për të lënë një vlerësim.',
   19, 1.0, 0.75, 3, 9, 19, 24, 29,
   '[9,12,15,19,24,29]'::jsonb,
   'Impulse buy; owners add one per staff member without a second thought.',
   20, true),

  ('social', 'Social Media Card', 'Social', 'green',
   'Hap menjëherë profilin e Instagramit, TikTok-ut ose një rrjeti tjetër social.',
   19, 1.0, 0.75, 3, 9, 19, 24, 29,
   '[9,12,15,19,24,29]'::jsonb,
   'Same friction-free price as review cards; tacked on to grow followers.',
   30, true),

  ('menu', 'NFC Menu Tag', 'Menu', 'green',
   'Hap menunë digjitale të restorantit ose kafenesë me një prekje.',
   12, 0.8, 0.75, 2, 6, 12, 15, 19,
   '[6,8,10,12,15,19]'::jsonb,
   'Frictionless add-on for a venue already buying a stand; sells one per table.',
   40, true),

  ('wifi', 'NFC WiFi Tag', 'WiFi', 'green',
   'Lidh klientin me rrjetin Wi-Fi pa shkruar fjalëkalimin.',
   10, 0.6, 0.75, 2, 5, 10, 12, 15,
   '[5,7,9,10,12,15]'::jsonb,
   'Under-double-digits feel makes it a no-brainer add-on; guests love it.',
   50, true),

  ('sticker', 'NFC Sticker (printed)', 'Sticker', 'green',
   'Ngjitëse NFC që mund të hapë vlerësimet, menunë, Wi-Fi ose një link tjetër.',
   6, 0.3, 0.75, 1, 3, 6, 8, 10,
   '[3,4,5,6,8,10]'::jsonb,
   'Pocket-change price; sells in packs as the low-commitment DIY option.',
   60, true),

  ('bizcard', 'Digital Business Card', 'Business Card', 'yellow',
   'Ndan menjëherë kontaktet dhe informacionin profesional.',
   29, 1.2, 0.75, 5, 19, 29, 39, 49,
   '[19,24,29,34,39,49]'::jsonb,
   'Professionals expect to pay more for a personal card; a premium tier signals quality.',
   70, true),

  ('keychain', 'NFC Keychain', 'Keychain', 'yellow',
   'Varëse portative NFC që hap linkun e zgjedhur me një prekje.',
   15, 1.0, 0.75, 3, 9, 15, 19, 24,
   '[9,12,15,19,24]'::jsonb,
   'Easy-yes for a durable item that lives on the customer''s keys all day.',
   80, true),

  ('wristband', 'NFC Wristband', 'Wristband', 'yellow',
   'Byzylyk NFC për evente, palestra ose përdorim nga stafi.',
   12, 0.8, 0.75, 2, 7, 12, 15, 19,
   '[7,10,12,15,19]'::jsonb,
   'Priced for bulk event orders; a low per-unit price keeps the total painless.',
   90, true)
on conflict (slug) do update set
  name               = excluded.name,
  category           = excluded.category,
  tag                = excluded.tag,
  description_sq     = excluded.description_sq,
  sell_price_eur     = excluded.sell_price_eur,
  supplier_cost_eur  = excluded.supplier_cost_eur,
  min_margin         = excluded.min_margin,
  min_profit         = excluded.min_profit,
  market_min         = excluded.market_min,
  market_recommended = excluded.market_recommended,
  market_premium     = excluded.market_premium,
  market_max         = excluded.market_max,
  ladder             = excluded.ladder,
  note               = excluded.note,
  sort_order         = excluded.sort_order,
  is_active          = excluded.is_active;
