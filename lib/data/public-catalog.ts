// PUBLIC catalog + config reads — run in the BROWSER with the anon key.
//
// Both calls go through SECURITY DEFINER functions (migration 0005) that return
// ONLY public columns. The anon role has no direct table access (RLS, migration
// 0006), so supplier costs, margins, market bands and notes can never be read
// here. This module is safe to import into the public ("/") bundle.

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  PublicProduct,
  PublicConfig,
  PublicProductsResult,
  PublicConfigResult,
} from "@/lib/data/catalog-types";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function toPublicProduct(r: Record<string, unknown>): PublicProduct {
  return {
    slug: str(r.slug),
    name: str(r.name),
    category: str(r.category),
    tag: r.tag === "yellow" ? "yellow" : "green",
    descriptionSq: str(r.descriptionSq),
    sellPriceEur: num(r.sellPriceEur),
  };
}

export async function getPublicProducts(): Promise<PublicProductsResult> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("get_public_products");
    if (error) return { ok: false, error: error.message };
    const arr = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    return { ok: true, products: arr.map(toPublicProduct) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function getPublicConfig(): Promise<PublicConfigResult> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("get_public_config");
    if (error) return { ok: false, error: error.message };
    const d = (data ?? {}) as Record<string, unknown>;
    const config: PublicConfig = {
      currency: str(d.currency) || "ALL",
      bundleDiscount: num(d.bundleDiscount),
    };
    return { ok: true, config };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
