// PUBLIC bundle estimate — safe for the public ("/") browser bundle.
//
// This computes ONLY from public selling prices + the customer-facing bundle
// discount. It contains NO supplier cost, margin, profit, or private pricing
// rules, and imports nothing that does. It is a live display estimate; the
// authoritative price is always recomputed server-side at checkout
// (create_validated_public_order) and shown on the receipt.
//
// Parity note: this mirrors the non-cost part of lib/pricing.ts priceBundle().
// The only server-side step it cannot reproduce is the margin-floor guard (which
// needs supplier cost). That guard essentially never binds at these margins, so
// the estimate matches the server price; if an owner ever sets a near-cost price,
// the server value wins and is what the receipt shows.

import type { PublicProduct } from "@/lib/data/catalog-types";

export interface PublicBundleLine {
  product: PublicProduct;
  qty: number;
  unitPrice: number; // BASE currency (EUR)
}

export interface PublicBundleEstimate {
  lines: PublicBundleLine[];
  units: number;
  separatePrice: number;
  finalPrice: number;
  saved: number;
  discountPct: number;
}

export function estimatePublicBundle(
  selection: Record<string, number>,
  products: PublicProduct[],
  bundleDiscount: number
): PublicBundleEstimate {
  const byId = new Map(products.map((p) => [p.slug, p] as const));
  const lines: PublicBundleLine[] = [];
  let separatePrice = 0;
  let units = 0;

  for (const [slug, qty] of Object.entries(selection)) {
    if (!qty || qty <= 0) continue;
    const product = byId.get(slug);
    if (!product) continue; // archived/removed product — skip
    const unitPrice = product.sellPriceEur;
    lines.push({ product, qty, unitPrice });
    separatePrice += unitPrice * qty;
    units += qty;
  }

  if (separatePrice <= 0) {
    return { lines, units, separatePrice: 0, finalPrice: 0, saved: 0, discountPct: 0 };
  }

  const discounted = separatePrice * (1 - bundleDiscount);
  let price = Math.round(discounted);
  if (price > separatePrice) price = Math.round(separatePrice);
  const saved = Math.max(0, Math.round(separatePrice) - price);
  const discountPct = separatePrice > 0 ? saved / separatePrice : 0;

  return { lines, units, separatePrice, finalPrice: price, saved, discountPct };
}
