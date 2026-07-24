// Public (customer) order creation + quoting — runs in the BROWSER with the anon
// key. The browser sends ONLY { slug, qty } selections + customer details. It
// never sends prices, totals, cost, profit or margin.
//
// createValidatedPublicOrder -> create_validated_public_order (0005): the DATABASE
//   recomputes every price/total/cost/profit/margin from the authoritative
//   products table, stores trusted snapshots, and returns ONLY public receipt
//   fields. A tampered payload cannot lower the price or read private data.
// quotePublicOrder -> quote_public_order (0005): authoritative read-only quote
//   (public totals only) — handy for verifying manipulation resistance.

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  PublicOrderRequest,
  PublicOrderResult,
  PublicQuoteResult,
  PublicReceipt,
  PublicQuote,
  ClientReceiptLine,
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
function optStr(v: unknown): string | undefined {
  const s = v == null ? "" : String(v);
  return s === "" ? undefined : s;
}
function toLines(v: unknown): ClientReceiptLine[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    return {
      productId: str(l.productId),
      name: str(l.name),
      descriptionSq: str(l.descriptionSq),
      qty: num(l.qty),
      unitPrice: num(l.unitPrice),
    };
  });
}

/** Build the payload. Only selections + customer info — no money fields. */
function toPayload(req: PublicOrderRequest) {
  return {
    currency: req.currency,
    businessType: req.businessType,
    businessTypeLabel: req.businessTypeLabel,
    businessName: req.businessName,
    customerName: req.customerName ?? null,
    phone: req.phone ?? null,
    address: req.address ?? null,
    customerNotes: req.customerNotes ?? null,
    items: req.items.map((i) => ({ slug: i.slug, qty: i.qty })),
  };
}

export async function createValidatedPublicOrder(req: PublicOrderRequest): Promise<PublicOrderResult> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("create_validated_public_order", { payload: toPayload(req) });
    if (error) return { ok: false, error: error.message };
    const d = (data ?? {}) as Record<string, unknown>;
    if (!d.id || !d.number) return { ok: false, error: "Order creation returned no id/number." };

    const receipt: PublicReceipt = {
      id: str(d.id),
      number: str(d.number),
      createdAt: str(d.created_at),
      currency: str(d.currency) || req.currency,
      businessType: str(d.businessType),
      businessTypeLabel: str(d.businessTypeLabel),
      businessName: str(d.businessName),
      customerName: optStr(d.customerName),
      phone: optStr(d.phone),
      address: optStr(d.address),
      customerNotes: optStr(d.customerNotes),
      status: (str(d.status) || "new") as PublicReceipt["status"],
      lines: toLines(d.lines),
      separatePrice: num(d.separatePrice),
      bundleDiscountPct: num(d.bundleDiscountPct),
      finalPrice: num(d.finalPrice),
      saved: num(d.saved),
    };
    return { ok: true, receipt };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function quotePublicOrder(req: PublicOrderRequest): Promise<PublicQuoteResult> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("quote_public_order", { payload: toPayload(req) });
    if (error) return { ok: false, error: error.message };
    const d = (data ?? {}) as Record<string, unknown>;
    const quote: PublicQuote = {
      currency: str(d.currency) || req.currency,
      separatePrice: num(d.separatePrice),
      finalPrice: num(d.finalPrice),
      saved: num(d.saved),
      bundleDiscountPct: num(d.bundleDiscountPct),
      lines: toLines(d.lines),
    };
    return { ok: true, quote };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
