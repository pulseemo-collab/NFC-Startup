// Owner analytics engine — PURE functions over the already-loaded order + product
// data (no I/O, no secrets leaving the server that weren't already here). The owner
// dashboard imports this; the public tree never does.
//
// Every monetary value is in BASE currency (EUR), exactly like OrderSnapshot and
// the DB. Formatting to the display currency happens at the render boundary via
// lib/currency.ts. These functions never fabricate data: with an empty order list
// they return zeros / empty arrays, which the UI renders as explicit empty states.

import type { OrderSnapshot } from "@/types";
import type { OwnerProduct } from "@/lib/data/catalog-types";

// ---------------------------------------------------------------------------
// Date helpers (local time — the owner reasons in their own day/week/month)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}
/** Monday-based week start (Albania uses Monday-first weeks). */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // 0 = Monday
  return addDays(s, -dow);
}
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export type PeriodKey =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "thisMonth"
  | "lastMonth"
  | "custom";

/** Half-open interval [start, end). */
export interface DateRange {
  start: Date;
  end: Date;
}

export const PERIOD_ORDER: PeriodKey[] = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "thisMonth",
  "lastMonth",
  "custom",
];

/** Resolve a period key to a concrete [start, end). `custom` needs a range. */
export function rangeFor(key: PeriodKey, now: Date = new Date(), custom?: DateRange): DateRange {
  const today = startOfDay(now);
  switch (key) {
    case "today":
      return { start: today, end: addDays(today, 1) };
    case "yesterday":
      return { start: addDays(today, -1), end: today };
    case "7d":
      return { start: addDays(today, -6), end: addDays(today, 1) };
    case "30d":
      return { start: addDays(today, -29), end: addDays(today, 1) };
    case "thisMonth":
      return { start: startOfMonth(now), end: startOfNextMonth(now) };
    case "lastMonth": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: s, end: startOfMonth(now) };
    }
    case "custom":
      return custom ?? { start: today, end: addDays(today, 1) };
  }
}

/** The equally-long window immediately before `r`, for period-over-period deltas. */
export function previousRange(r: DateRange): DateRange {
  const span = r.end.getTime() - r.start.getTime();
  return { start: new Date(r.start.getTime() - span), end: new Date(r.start.getTime()) };
}

function inRange(iso: string, r: DateRange): boolean {
  const t = new Date(iso).getTime();
  return t >= r.start.getTime() && t < r.end.getTime();
}

// ---------------------------------------------------------------------------
// Aggregation primitives
// ---------------------------------------------------------------------------

export interface Totals {
  orders: number;
  revenue: number; // sum final_price (EUR)
  cost: number; // sum total_cost (EUR)
  profit: number; // sum profit (EUR)
  saved: number; // sum customer savings (EUR)
}

function emptyTotals(): Totals {
  return { orders: 0, revenue: 0, cost: 0, profit: 0, saved: 0 };
}

export function totalsFor(orders: OrderSnapshot[], r?: DateRange): Totals {
  const acc = emptyTotals();
  for (const o of orders) {
    if (r && !inRange(o.createdAt, r)) continue;
    acc.orders += 1;
    acc.revenue += o.finalPrice;
    acc.cost += o.totalCost;
    acc.profit += o.profit;
    acc.saved += o.saved;
  }
  return acc;
}

/** Blended margin for a set of totals (profit / revenue), 0..1; 0 when no revenue. */
export function marginOf(tot: Totals): number {
  return tot.revenue > 0 ? tot.profit / tot.revenue : 0;
}
/** Average order value (revenue / orders), 0 when no orders. */
export function aovOf(tot: Totals): number {
  return tot.orders > 0 ? tot.revenue / tot.orders : 0;
}

/**
 * Percentage change from `prev` to `curr`.
 *  - null  → no baseline (prev is 0): the UI shows "new", not a misleading %.
 *  - value → fractional change (0.6 = +60%).
 */
export function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return (curr - prev) / Math.abs(prev);
}

// ---------------------------------------------------------------------------
// Product & business-type breakdowns (read the frozen line snapshots)
// ---------------------------------------------------------------------------

export interface ProductAgg {
  productId: string;
  name: string;
  units: number;
  revenue: number; // EUR
  cost: number; // EUR
  profit: number; // EUR
  orders: number; // distinct orders containing this product
}

export function productBreakdown(orders: OrderSnapshot[], r?: DateRange): ProductAgg[] {
  const map = new Map<string, ProductAgg>();
  for (const o of orders) {
    if (r && !inRange(o.createdAt, r)) continue;
    const seen = new Set<string>();
    for (const l of o.lines) {
      const key = l.productId || l.name;
      let agg = map.get(key);
      if (!agg) {
        agg = { productId: key, name: l.name, units: 0, revenue: 0, cost: 0, profit: 0, orders: 0 };
        map.set(key, agg);
      }
      agg.units += l.qty;
      agg.revenue += l.unitPrice * l.qty;
      agg.cost += l.unitCost * l.qty;
      agg.profit += (l.unitPrice - l.unitCost) * l.qty;
      if (!seen.has(key)) {
        agg.orders += 1;
        seen.add(key);
      }
    }
  }
  return [...map.values()];
}

export interface BusinessAgg {
  type: string;
  label: string;
  orders: number;
  revenue: number;
  profit: number;
  lastOrderAt: string | null;
}

export function businessBreakdown(orders: OrderSnapshot[], r?: DateRange): BusinessAgg[] {
  const map = new Map<string, BusinessAgg>();
  for (const o of orders) {
    if (r && !inRange(o.createdAt, r)) continue;
    const type = o.businessType || "custom";
    const label = o.businessTypeLabel || o.businessType || "—";
    let agg = map.get(type);
    if (!agg) {
      agg = { type, label, orders: 0, revenue: 0, profit: 0, lastOrderAt: null };
      map.set(type, agg);
    }
    agg.orders += 1;
    agg.revenue += o.finalPrice;
    agg.profit += o.profit;
    if (!agg.lastOrderAt || o.createdAt > agg.lastOrderAt) agg.lastOrderAt = o.createdAt;
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Time series (drives the charts in Part 2)
// ---------------------------------------------------------------------------

export type Granularity = "day" | "week" | "month";

export interface SeriesPoint {
  /** Stable bucket key (ISO date of the bucket start). */
  key: string;
  /** Short human label for the axis. */
  label: string;
  start: Date;
  revenue: number;
  profit: number;
  orders: number;
}

function bucketStart(d: Date, g: Granularity): Date {
  if (g === "day") return startOfDay(d);
  if (g === "week") return startOfWeek(d);
  return startOfMonth(d);
}
function nextBucket(d: Date, g: Granularity): Date {
  if (g === "day") return addDays(d, 1);
  if (g === "week") return addDays(d, 7);
  return startOfNextMonth(d);
}
function bucketLabel(d: Date, g: Granularity): string {
  if (g === "month") return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/**
 * Continuous series across [range], one point per bucket (gaps filled with zeros
 * so charts never lie about missing days). Buckets are inclusive of the range.
 */
export function timeSeries(orders: OrderSnapshot[], r: DateRange, g: Granularity): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const index = new Map<string, SeriesPoint>();
  let cursor = bucketStart(r.start, g);
  const guard = 1000; // hard cap so a bad range can't spin forever
  for (let i = 0; cursor.getTime() < r.end.getTime() && i < guard; i++) {
    const key = cursor.toISOString();
    const p: SeriesPoint = {
      key,
      label: bucketLabel(cursor, g),
      start: new Date(cursor),
      revenue: 0,
      profit: 0,
      orders: 0,
    };
    points.push(p);
    index.set(key, p);
    cursor = nextBucket(cursor, g);
  }
  for (const o of orders) {
    if (!inRange(o.createdAt, r)) continue;
    const key = bucketStart(new Date(o.createdAt), g).toISOString();
    const p = index.get(key);
    if (!p) continue;
    p.revenue += o.finalPrice;
    p.profit += o.profit;
    p.orders += 1;
  }
  return points;
}

// ---------------------------------------------------------------------------
// KPI cards (Part 1)
// ---------------------------------------------------------------------------

export type KpiKind = "money" | "count" | "percent" | "text";

export interface Kpi {
  key: string;
  label: string;
  kind: KpiKind;
  /** money = EUR base; count = integer; percent = 0..1; text uses `text`. */
  value: number;
  text?: string;
  /** Optional secondary line (share, category, "of N", …). */
  sub?: string;
  /** Fractional change vs the previous comparable period; null = no baseline. */
  delta?: number | null;
  /** For percent deltas, show change in points not %. */
  deltaKind?: "pct" | "points";
  /** Whether an increase is good (drives the green/red colouring). */
  positiveIsGood?: boolean;
}

/**
 * The full KPI set for the dashboard home. `products` supplies the "active
 * products" count; pass the owner catalog. `now` is injectable for testing.
 */
export function buildKpis(
  orders: OrderSnapshot[],
  products: OwnerProduct[],
  now: Date = new Date()
): Kpi[] {
  const today = totalsFor(orders, rangeFor("today", now));
  const yesterday = totalsFor(orders, rangeFor("yesterday", now));

  const thisWeek = totalsFor(orders, { start: startOfWeek(now), end: addDays(startOfWeek(now), 7) });
  const lastWeek = totalsFor(orders, {
    start: addDays(startOfWeek(now), -7),
    end: startOfWeek(now),
  });

  const thisMonth = totalsFor(orders, rangeFor("thisMonth", now));
  const lastMonth = totalsFor(orders, rangeFor("lastMonth", now));

  // Best product / business over a meaningful 30-day window.
  const win30 = rangeFor("30d", now);
  const prods30 = productBreakdown(orders, win30);
  const bestProduct = [...prods30].sort((a, b) => b.units - a.units)[0] ?? null;
  const totalUnits30 = prods30.reduce((s, p) => s + p.units, 0);

  const biz30 = businessBreakdown(orders, win30);
  const bestBiz = [...biz30].sort((a, b) => b.revenue - a.revenue)[0] ?? null;
  const revenue30 = biz30.reduce((s, b) => s + b.revenue, 0);

  const activeCount = products.filter((p) => p.isActive).length;

  return [
    {
      key: "revenueToday",
      label: "Të ardhurat sot",
      kind: "money",
      value: today.revenue,
      delta: deltaPct(today.revenue, yesterday.revenue),
      positiveIsGood: true,
    },
    {
      key: "profitToday",
      label: "Fitimi sot",
      kind: "money",
      value: today.profit,
      delta: deltaPct(today.profit, yesterday.profit),
      positiveIsGood: true,
    },
    {
      key: "ordersToday",
      label: "Porosi sot",
      kind: "count",
      value: today.orders,
      delta: deltaPct(today.orders, yesterday.orders),
      positiveIsGood: true,
    },
    {
      key: "ordersWeek",
      label: "Porosi këtë javë",
      kind: "count",
      value: thisWeek.orders,
      delta: deltaPct(thisWeek.orders, lastWeek.orders),
      positiveIsGood: true,
    },
    {
      key: "ordersMonth",
      label: "Porosi këtë muaj",
      kind: "count",
      value: thisMonth.orders,
      delta: deltaPct(thisMonth.orders, lastMonth.orders),
      positiveIsGood: true,
    },
    {
      key: "aov",
      label: "Vlera mesatare e porosisë",
      kind: "money",
      value: aovOf(thisMonth),
      sub: "këtë muaj",
      delta: deltaPct(aovOf(thisMonth), aovOf(lastMonth)),
      positiveIsGood: true,
    },
    {
      key: "margin",
      label: "Marzhi i fitimit",
      kind: "percent",
      value: marginOf(thisMonth),
      sub: "këtë muaj",
      delta: marginOf(thisMonth) - marginOf(lastMonth),
      deltaKind: "points",
      positiveIsGood: true,
    },
    {
      key: "bestProduct",
      label: "Produkti më i shitur",
      kind: "text",
      value: bestProduct?.units ?? 0,
      text: bestProduct?.name ?? "—",
      sub: bestProduct
        ? `${bestProduct.units} copë · ${Math.round(
            totalUnits30 > 0 ? (bestProduct.units / totalUnits30) * 100 : 0
          )}% (30 ditë)`
        : "30 ditë",
    },
    {
      key: "bestBusiness",
      label: "Biznesi më fitimprurës",
      kind: "text",
      value: bestBiz?.revenue ?? 0,
      text: bestBiz?.label ?? "—",
      sub: bestBiz
        ? `${Math.round(revenue30 > 0 ? (bestBiz.revenue / revenue30) * 100 : 0)}% e të ardhurave (30 ditë)`
        : "30 ditë",
    },
    {
      key: "activeProducts",
      label: "Produkte aktive",
      kind: "count",
      value: activeCount,
      sub: `nga ${products.length}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Smart insights (Part 3) — deterministic business logic, not AI
// ---------------------------------------------------------------------------

export type InsightKind = "good" | "warn" | "info";

export interface Insight {
  id: string;
  kind: InsightKind;
  text: string;
}

const pct = (x: number) => Math.round(Math.abs(x) * 100);

/**
 * Generate a prioritised, deterministic set of owner insights. Every insight is
 * derived from real orders/products and only surfaces when it clears a threshold
 * (so the panel never pads with noise). Text is Albanian; product names stay English.
 */
export function generateInsights(
  orders: OrderSnapshot[],
  products: OwnerProduct[],
  now: Date = new Date()
): Insight[] {
  const out: Insight[] = [];
  if (orders.length === 0) return out;

  const today = rangeFor("today", now);
  const todayTot = totalsFor(orders, today);
  const yTot = totalsFor(orders, rangeFor("yesterday", now));

  // 1) Which product drove today's profit.
  if (todayTot.profit > 0) {
    const prods = productBreakdown(orders, today).sort((a, b) => b.profit - a.profit);
    const top = prods[0];
    if (top && top.profit > 0) {
      const share = pct(top.profit / todayTot.profit);
      if (share >= 30) {
        out.push({
          id: "profit-driver",
          kind: "good",
          text: `${top.name} solli ${share}% të fitimit të sotëm.`,
        });
      }
    }
  }

  // 2) Today vs yesterday revenue swing.
  const revDelta = deltaPct(todayTot.revenue, yTot.revenue);
  if (revDelta !== null && Math.abs(revDelta) >= 0.15) {
    out.push({
      id: "day-swing",
      kind: revDelta > 0 ? "good" : "warn",
      text:
        revDelta > 0
          ? `Shite ${pct(revDelta)}% më shumë se dje.`
          : `Shite ${pct(revDelta)}% më pak se dje.`,
    });
  } else if (revDelta === null && todayTot.revenue > 0) {
    out.push({ id: "day-first", kind: "good", text: "Porosia e parë e ditës — dje nuk kishe shitje." });
  }

  // 3) Dormant business types (had sales historically, none recently).
  const biz = businessBreakdown(orders).sort((a, b) => b.revenue - a.revenue);
  for (const b of biz.slice(0, 6)) {
    if (!b.lastOrderAt || b.orders < 2) continue;
    const gap = daysBetween(new Date(b.lastOrderAt), now);
    if (gap >= 10) {
      out.push({
        id: `dormant-${b.type}`,
        kind: "warn",
        text: `Asnjë porosi "${b.label}" në ${gap} ditë.`,
      });
    }
  }

  // 4) Average order value trend (this month vs last month).
  const tm = totalsFor(orders, rangeFor("thisMonth", now));
  const lm = totalsFor(orders, rangeFor("lastMonth", now));
  const aovDelta = deltaPct(aovOf(tm), aovOf(lm));
  if (aovDelta !== null && Math.abs(aovDelta) >= 0.1 && tm.orders >= 2 && lm.orders >= 2) {
    out.push({
      id: "aov-trend",
      kind: aovDelta > 0 ? "good" : "info",
      text:
        aovDelta > 0
          ? `Vlera mesatare e porosisë u rrit me ${pct(aovDelta)}% këtë muaj.`
          : `Vlera mesatare e porosisë ra me ${pct(aovDelta)}% këtë muaj.`,
    });
  }

  // 5) Margin trend (points, month over month).
  const mDelta = marginOf(tm) - marginOf(lm);
  if (Math.abs(mDelta) >= 0.03 && tm.orders >= 2 && lm.orders >= 2) {
    out.push({
      id: "margin-trend",
      kind: mDelta >= 0 ? "good" : "warn",
      text:
        mDelta >= 0
          ? `Marzhi i fitimit u rrit me ${pct(mDelta)} pikë këtë muaj.`
          : `Marzhi i fitimit ra me ${pct(mDelta)} pikë këtë muaj.`,
    });
  }

  // 6) Low-margin products that are active (pricing attention).
  const lowMargin = products
    .filter((p) => p.isActive && p.supplierCostEur > 0)
    .map((p) => ({ p, m: (p.sellPriceEur - p.supplierCostEur) / p.sellPriceEur }))
    .filter((x) => Number.isFinite(x.m) && x.m < 0.5)
    .sort((a, b) => a.m - b.m);
  if (lowMargin[0]) {
    out.push({
      id: `low-margin-${lowMargin[0].p.slug}`,
      kind: "warn",
      text: `${lowMargin[0].p.name} ka marzh të ulët (${pct(lowMargin[0].m)}%) — rishiko çmimin.`,
    });
  }

  // Order: warnings first (need attention), then good news, then info.
  const rank: Record<InsightKind, number> = { warn: 0, good: 1, info: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 6);
}
