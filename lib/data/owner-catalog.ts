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
  ProductStatus,
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
  "ladder, note, status, is_active, sort_order";

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
    status: normStatus(r.status, r.is_active !== false),
    isActive: r.is_active !== false,
    sortOrder: num(r.sort_order),
  };
}

function normStatus(v: unknown, isActive: boolean): ProductStatus {
  if (v === "active" || v === "draft" || v === "archived") return v;
  // Column may be absent until 0007 is applied — fall back to is_active.
  return isActive ? "active" : "archived";
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
  if (patch.status !== undefined) {
    row.status = patch.status;
    // Keep the PUBLIC visibility flag in sync unless the caller set it explicitly.
    if (patch.isActive === undefined) row.is_active = patch.status === "active";
  }
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

/** Set the owner lifecycle status (also syncs public visibility via patchToRow). */
export async function setProductStatus(slug: string, status: ProductStatus): Promise<OwnerProductResult> {
  return updateProduct(slug, { status });
}

/** Archive (soft delete) — keeps the product for existing orders/analytics. */
export async function setProductActive(slug: string, active: boolean): Promise<OwnerProductResult> {
  return updateProduct(slug, { status: active ? "active" : "archived" });
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

/** Unique slug helper: `base`, then `base-2`, `base-3`, … avoiding `taken`. */
function uniqueSlug(base: string, taken: Set<string>): string {
  const clean = base.replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").toLowerCase() || "product";
  if (!taken.has(clean)) return clean;
  for (let i = 2; i < 1000; i++) {
    const c = `${clean}-${i}`;
    if (!taken.has(c)) return c;
  }
  return `${clean}-${Date.now()}`;
}

/**
 * Duplicate a product. The copy starts as a DRAFT (hidden from the public site)
 * so a half-configured clone never appears to customers. Returns the new product.
 */
export async function duplicateProduct(slug: string): Promise<OwnerProductResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Duplicate product failed", gate.error);

    const { data: all, error: listErr } = await gate.supabase.from("products").select("slug, sort_order");
    if (listErr) return fail("Duplicate product failed", listErr);
    const taken = new Set<string>((all ?? []).map((r) => str((r as Row).slug)));
    const maxSort = (all ?? []).reduce((m, r) => Math.max(m, num((r as Row).sort_order)), 0);

    const { data: src, error: getErr } = await gate.supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("slug", slug)
      .single();
    if (getErr) return fail("Duplicate product failed", getErr);

    const s = src as unknown as Row;
    const newSlug = uniqueSlug(`${slug}-kopje`, taken);
    const insertRow: Row = {
      slug: newSlug,
      name: `${str(s.name)} (kopje)`,
      category: str(s.category),
      tag: s.tag === "yellow" ? "yellow" : "green",
      description_sq: str(s.description_sq),
      sell_price_eur: num(s.sell_price_eur),
      supplier_cost_eur: num(s.supplier_cost_eur),
      min_margin: num(s.min_margin),
      min_profit: num(s.min_profit),
      market_min: num(s.market_min),
      market_recommended: num(s.market_recommended),
      market_premium: num(s.market_premium),
      market_max: num(s.market_max),
      ladder: Array.isArray(s.ladder) ? s.ladder : [],
      note: str(s.note),
      status: "draft",
      is_active: false,
      sort_order: maxSort + 1,
    };

    const { data, error } = await gate.supabase
      .from("products")
      .insert(insertRow)
      .select(PRODUCT_COLUMNS)
      .single();
    if (error) return fail("Duplicate product failed", error);
    return { ok: true, product: rowToProduct(data as unknown as Row) };
  } catch (e) {
    return fail("Duplicate product failed", e);
  }
}

/** Persist a new manual ordering: sort_order = index of each slug in the list. */
export async function reorderProducts(slugs: string[]): Promise<OwnerCatalogMutation> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Reorder failed", gate.error);
    for (let i = 0; i < slugs.length; i++) {
      const { error } = await gate.supabase.from("products").update({ sort_order: i }).eq("slug", slugs[i]);
      if (error) return fail("Reorder failed", error);
    }
    return { ok: true };
  } catch (e) {
    return fail("Reorder failed", e);
  }
}

/** Apply one patch to many products at once (bulk activate/archive/price update). */
export async function bulkUpdateProducts(
  slugs: string[],
  patch: OwnerProductPatch
): Promise<OwnerProductsResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Bulk update failed", gate.error);
    if (slugs.length === 0) return { ok: true, products: [] };
    const row = patchToRow(patch);
    if (Object.keys(row).length === 0) return fail("Bulk update failed", "Nothing to update");
    const { data, error } = await gate.supabase
      .from("products")
      .update(row)
      .in("slug", slugs)
      .select(PRODUCT_COLUMNS);
    if (error) return fail("Bulk update failed", error);
    return { ok: true, products: (data ?? []).map((r) => rowToProduct(r as unknown as Row)) };
  } catch (e) {
    return fail("Bulk update failed", e);
  }
}

/** Bulk hard delete. */
export async function bulkDeleteProducts(slugs: string[]): Promise<OwnerCatalogMutation> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Bulk delete failed", gate.error);
    if (slugs.length === 0) return { ok: true };
    const { error } = await gate.supabase.from("products").delete().in("slug", slugs);
    if (error) return fail("Bulk delete failed", error);
    return { ok: true };
  } catch (e) {
    return fail("Bulk delete failed", e);
  }
}

// ------------------------------- Settings ---------------------------------

const SETTINGS_COLUMNS = "currency, min_margin, min_profit, bundle_discount, business_name, logo_url";

function rowToSettings(r: Row): OwnerSettings {
  return {
    currency: str(r.currency) || "ALL",
    minMargin: num(r.min_margin),
    minProfit: num(r.min_profit),
    bundleDiscount: num(r.bundle_discount),
    businessName: str(r.business_name),
    logoUrl: str(r.logo_url),
  };
}

export async function getOwnerSettings(): Promise<OwnerSettingsResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Load settings failed", gate.error);
    const { data, error } = await gate.supabase
      .from("app_settings")
      .select(SETTINGS_COLUMNS)
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
    if (patch.businessName !== undefined) row.business_name = patch.businessName;
    if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
    if (Object.keys(row).length === 0) return fail("Save settings failed", "Nothing to update");
    const { data, error } = await gate.supabase
      .from("app_settings")
      .update(row)
      .eq("id", true)
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) return fail("Save settings failed", error);
    return { ok: true, settings: rowToSettings(data as unknown as Row) };
  } catch (e) {
    return fail("Save settings failed", e);
  }
}
