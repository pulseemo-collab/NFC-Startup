import type { Product, Settings, PriceResult, BundleResult, BundleLine } from "@/types";

// All engine math below runs in the BASE currency (see lib/currency.ts).
// Conversion + formatting live there and are re-exported for convenience, so
// the rules in this file never depend on the currency the user is viewing.
export { CURRENCY_SYMBOLS, symbolFor, formatAmount } from "@/lib/currency";
import { formatAmount as fmt } from "@/lib/currency";

export function formatMoney(value: number, settings: Settings): string {
  return fmt(value, settings.currency);
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Does this price clear both the profit and margin floors at the given cost? */
function meets(price: number, cost: number, minProfit: number, minMargin: number): boolean {
  if (price <= 0) return false;
  const profit = price - cost;
  const margin = profit / price;
  return profit >= minProfit && margin >= minMargin;
}

/**
 * Transparent, rule-based pricing engine (NOT AI, NOT a single multiplier).
 *
 * 1. Start from the product's recommended market price.
 * 2. If it still clears the profit + margin floors → keep it.
 * 3. Otherwise climb the psychological ladder toward the premium/max price
 *    until a point clears the floors.
 * 4. If nothing inside the realistic market range clears them → not viable
 *    (we return the market max and flag it as a warning).
 *
 * The effective floors are the STRICTER of the product's own floor and the
 * global default from Settings, so tightening Settings tightens every product.
 */
export function recommendPrice(product: Product, cost: number, settings: Settings): PriceResult {
  const c = Number.isFinite(cost) && cost > 0 ? cost : 0;
  const minMargin = Math.max(product.minMargin, settings.minMargin);
  const minProfit = Math.max(product.minProfit, settings.minProfit);
  const rec = product.market.recommended;

  const fmt = (v: number) => formatMoney(v, settings);

  if (meets(rec, c, minProfit, minMargin)) {
    const profit = rec - c;
    return {
      price: rec,
      profit,
      margin: profit / rec,
      status: "recommended",
      reason: `Recommended market price ${fmt(rec)} kept — it holds a healthy ${pct(profit / rec)} margin at this cost.`,
    };
  }

  const higher = product.ladder
    .filter((p) => p > rec && p <= product.market.max)
    .sort((a, b) => a - b);

  for (const p of higher) {
    if (meets(p, c, minProfit, minMargin)) {
      const profit = p - c;
      return {
        price: p,
        profit,
        margin: profit / p,
        status: "raised",
        reason: `Price raised from ${fmt(rec)} to ${fmt(p)} because at this cost ${fmt(rec)} would drop below your ${pct(minMargin)} margin / ${fmt(minProfit)} profit floor.`,
      };
    }
  }

  const cap = product.market.max;
  const profit = cap - c;
  return {
    price: cap,
    profit,
    margin: cap > 0 ? profit / cap : 0,
    status: "not-viable",
    reason: `Not commercially viable at this cost: even the top of the realistic market range (${fmt(cap)}) can't hold your ${pct(minMargin)} margin. Renegotiate supply or drop this product.`,
  };
}

/**
 * OWNER OVERRIDE LAYER — sits on top of the engine, never inside it.
 *
 * `recommendPrice` above always returns the rule-based recommendation. If the
 * owner has typed their own price for a product ("Çmimi im"), that value wins
 * for every downstream calculation: profit, margin, bundle totals and orders.
 * An absent / zero / invalid override means "use the recommendation".
 */
export type PriceOverrides = Record<string, number>;

export function overrideFor(overrides: PriceOverrides | undefined, productId: string): number | null {
  const v = overrides?.[productId];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** The price the customer actually pays: the owner's price, else the recommendation. */
export function effectivePrice(
  product: Product,
  cost: number,
  settings: Settings,
  overrides?: PriceOverrides
): number {
  return overrideFor(overrides, product.id) ?? recommendPrice(product, cost, settings).price;
}

/**
 * Prices a bundle from a { productId: qty } kit.
 * Applies the Settings discount, but never lets the discount push the bundle
 * margin below the global floor — if it would, the discount is capped.
 */
export function priceBundle(
  kit: Record<string, number>,
  products: Product[],
  costs: Record<string, number>,
  settings: Settings,
  overrides?: PriceOverrides
): BundleResult {
  const byId = new Map(products.map((p) => [p.id, p] as const));
  const lines: BundleLine[] = [];
  let separatePrice = 0;
  let totalCost = 0;
  let units = 0;

  for (const [id, qty] of Object.entries(kit)) {
    if (!qty || qty <= 0) continue;
    const product = byId.get(id);
    if (!product) continue;
    const cost = costs[id] ?? product.defaultCost;
    const unitPrice = effectivePrice(product, cost, settings, overrides);
    lines.push({ product, qty, unitPrice, cost });
    separatePrice += unitPrice * qty;
    totalCost += cost * qty;
    units += qty;
  }

  if (separatePrice <= 0) {
    return {
      lines,
      units,
      separatePrice: 0,
      totalCost,
      price: 0,
      profit: 0,
      margin: 0,
      saved: 0,
      discountPct: 0,
      capped: false,
    };
  }

  const discounted = separatePrice * (1 - settings.bundleDiscount);
  const marginFloorPrice = settings.minMargin < 1 ? totalCost / (1 - settings.minMargin) : separatePrice;

  // The discount cannot take us below the margin floor.
  let price = Math.max(discounted, marginFloorPrice);
  const capped = price > discounted + 0.001;

  // Clean, whole-number bundle price — then re-guard the floor and the ceiling.
  price = Math.round(price);
  if (price < Math.ceil(marginFloorPrice)) price = Math.ceil(marginFloorPrice);
  if (price > separatePrice) price = Math.round(separatePrice);

  const profit = price - totalCost;
  const margin = price > 0 ? profit / price : 0;
  const saved = Math.max(0, Math.round(separatePrice) - price);
  const discountPct = separatePrice > 0 ? saved / separatePrice : 0;

  return { lines, units, separatePrice, totalCost, price, profit, margin, saved, discountPct, capped };
}
