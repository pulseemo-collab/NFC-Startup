"use server";

// Owner catalog + settings data-access layer — Server Actions running as the
// SIGNED-IN OWNER (RLS-enforced via migration 0006). Never the service role.
// The public site never imports this module.
//
// Every function is gated by requireOwner() and returns a serializable
// { ok, ... } result rather than throwing across the server/client boundary.

import type {
  OwnerProduct,
  OwnerProductPatch,
  OwnerProductsResult,
  OwnerProductResult,
  OwnerSettings,
  OwnerSettingsResult,
  OwnerCatalogMutation,
} from "@/lib/data/catalog-types";
import { requireOwner } from "@/lib/data/owner-guard";

type Row = Record<string, unknown>;

const PRODUCT_COLUMNS =
  "slug, name, category, tag, description_sq, sell_price_eur, supplier_cost_eur, " +
  "min_margin, min_profit, market_min, market_recommended, market_premium, market_max, " +
  "ladder, note, is_active, sort_order";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function fail(prefix: string, error: unknown): { ok: false; error: string } {
  const msg = error instanceof Error ? error.message : String(error);
  return { ok: false, error: `${prefix}: ${msg}` };
}

function rowToProduct(r: Row): OwnerProduct {
  return {
    slug: str(r.slug),
    name: str(r.name),
    category: str(r.category),
    tag: r.tag === "yellow" ? "yellow" : "green",
    descriptionSq: str(r.description_sq),
    sellPriceEur: num(r.sell_price_eur),
    supplierCostEur: num(r.supplier_cost_eur),
    minMargin: num(r.min_margin),
    minProfit: num(r.min_profit),
    market: {
      min: num(r.market_min),
      recommended: num(r.market_recommended),
      premium: num(r.market_premium),
      max: num(r.market_max),
    },
    ladder: Array.isArray(r.ladder) ? (r.ladder as unknown[]).map(num) : [],
    note: str(r.note),
    isActive: r.is_active !== false,
    sortOrder: num(r.sort_order),
  };
}

/** camelCase patch -> snake_case DB columns (only provided keys). */
function patchToRow(patch: OwnerProductPatch): Row {
  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.tag !== undefined) row.tag = patch.tag;
  if (patch.descriptionSq !== undefined) row.description_sq = patch.descriptionSq;
  if (patch.sellPriceEur !== undefined) row.sell_price_eur = patch.sellPriceEur;
  if (patch.supplierCostEur !== undefined) row.supplier_cost_eur = patch.supplierCostEur;
  if (patch.minMargin !== undefined) row.min_margin = patch.minMargin;
  if (patch.minProfit !== undefined) row.min_profit = patch.minProfit;
  if (patch.market !== undefined) {
    row.market_min = patch.market.min;
    row.market_recommended = patch.market.recommended;
    row.market_premium = patch.market.premium;
    row.market_max = patch.market.max;
  }
  if (patch.ladder !== undefined) row.ladder = patch.ladder;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  return row;
}

// ------------------------------- Products ---------------------------------

/** All products (incl. archived), owner order. Dashboard-only (private fields). */
export async function getOwnerProducts(): Promise<OwnerProductsResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Load products failed", gate.error);
    const { data, error } = await gate.supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) return fail("Load products failed", error);
    return { ok: true, products: (data ?? []).map((r) => rowToProduct(r as unknown as Row)) };
  } catch (e) {
    return fail("Load products failed", e);
  }
}

/** Update one product by slug (e.g. edit cost + selling price). */
export async function updateProduct(slug: string, patch: OwnerProductPatch): Promise<OwnerProductResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Save product failed", gate.error);
    const row = patchToRow(patch);
    if (Object.keys(row).length === 0) return fail("Save product failed", "Nothing to update");
    const { data, error } = await gate.supabase
      .from("products")
      .update(row)
      .eq("slug", slug)
      .select(PRODUCT_COLUMNS)
      .single();
    if (error) return fail("Save product failed", error);
    return { ok: true, product: rowToProduct(data as unknown as Row) };
  } catch (e) {
    return fail("Save product failed", e);
  }
}

/** Create a product. Requires a unique slug + name. */
export async function createProduct(
  input: OwnerProductPatch & { slug: string; name: string }
): Promise<OwnerProductResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Create product failed", gate.error);
    const row = { ...patchToRow(input), slug: input.slug, name: input.name };
    const { data, error } = await gate.supabase
      .from("products")
      .insert(row)
      .select(PRODUCT_COLUMNS)
      .single();
    if (error) return fail("Create product failed", error);
    return { ok: true, product: rowToProduct(data as unknown as Row) };
  } catch (e) {
    return fail("Create product failed", e);
  }
}

/** Archive (soft delete) — keeps the product for existing orders/analytics. */
export async function setProductActive(slug: string, active: boolean): Promise<OwnerProductResult> {
  return updateProduct(slug, { isActive: active });
}

/** Hard delete a product by slug. */
export async function deleteProduct(slug: string): Promise<OwnerCatalogMutation> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Delete product failed", gate.error);
    const { error } = await gate.supabase.from("products").delete().eq("slug", slug);
    if (error) return fail("Delete product failed", error);
    return { ok: true };
  } catch (e) {
    return fail("Delete product failed", e);
  }
}

// ------------------------------- Settings ---------------------------------

function rowToSettings(r: Row): OwnerSettings {
  return {
    currency: str(r.currency) || "ALL",
    minMargin: num(r.min_margin),
    minProfit: num(r.min_profit),
    bundleDiscount: num(r.bundle_discount),
  };
}

export async function getOwnerSettings(): Promise<OwnerSettingsResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Load settings failed", gate.error);
    const { data, error } = await gate.supabase
      .from("app_settings")
      .select("currency, min_margin, min_profit, bundle_discount")
      .eq("id", true)
      .single();
    if (error) return fail("Load settings failed", error);
    return { ok: true, settings: rowToSettings(data as unknown as Row) };
  } catch (e) {
    return fail("Load settings failed", e);
  }
}

export async function updateOwnerSettings(patch: Partial<OwnerSettings>): Promise<OwnerSettingsResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Save settings failed", gate.error);
    const row: Row = {};
    if (patch.currency !== undefined) row.currency = patch.currency;
    if (patch.minMargin !== undefined) row.min_margin = patch.minMargin;
    if (patch.minProfit !== undefined) row.min_profit = patch.minProfit;
    if (patch.bundleDiscount !== undefined) row.bundle_discount = patch.bundleDiscount;
    if (Object.keys(row).length === 0) return fail("Save settings failed", "Nothing to update");
    const { data, error } = await gate.supabase
      .from("app_settings")
      .update(row)
      .eq("id", true)
      .select("currency, min_margin, min_profit, bundle_discount")
      .single();
    if (error) return fail("Save settings failed", error);
    return { ok: true, settings: rowToSettings(data as unknown as Row) };
  } catch (e) {
    return fail("Save settings failed", e);
  }
}
