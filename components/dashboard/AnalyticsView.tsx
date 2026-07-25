"use client";

// Advanced Analytics (Part 2). Revenue / profit / orders over time with a
// granularity toggle, a period filter with period-over-period comparison, summary
// stats, and the four breakdown tables. All computed from real orders + catalog.

import { useMemo, useState } from "react";
import type { OrderSnapshot } from "@/types";
import type { OwnerProduct } from "@/lib/data/catalog-types";
import {
  type PeriodKey,
  type DateRange,
  type Granularity,
  rangeFor,
  previousRange,
  timeSeries,
  totalsFor,
  aovOf,
  marginOf,
  deltaPct,
  productBreakdown,
  businessBreakdown,
} from "@/lib/analytics";
import { formatAmount } from "@/lib/currency";
import DateRangePicker from "@/components/dashboard/DateRangePicker";
import TrendChart, { type Metric } from "@/components/dashboard/TrendChart";

const METRICS: { key: Metric; label: string }[] = [
  { key: "revenue", label: "Të ardhurat" },
  { key: "profit", label: "Fitimi" },
  { key: "orders", label: "Porositë" },
];
const GRANS: { key: Granularity; label: string }[] = [
  { key: "day", label: "Ditore" },
  { key: "week", label: "Javore" },
  { key: "month", label: "Mujore" },
];

function Toggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-md px-2.5 py-1 text-[0.78rem] font-medium transition ${
            value === o.key ? "bg-accent text-white" : "text-muted hover:text-accent"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DeltaTag({ delta, positiveIsGood = true }: { delta: number | null; positiveIsGood?: boolean }) {
  if (delta === null) return <span className="text-[0.7rem] text-accent">e re</span>;
  if (Math.abs(delta) < 0.0001) return <span className="text-[0.7rem] text-faint">—</span>;
  const up = delta > 0;
  const good = positiveIsGood ? up : !up;
  return (
    <span className={`text-[0.7rem] font-semibold ${good ? "text-profit" : "text-warn"}`}>
      {up ? "▲" : "▼"} {Math.round(Math.abs(delta) * 100)}%
    </span>
  );
}

function StatCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">{label}</p>
        {delta !== undefined && <DeltaTag delta={delta} />}
      </div>
      <p className="mt-1.5 text-xl font-bold tnum text-ink">{value}</p>
    </div>
  );
}

/** Small ranked table with a leading bar for the primary metric. */
function RankTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { key: string; name: string; primary: string; secondary?: string; frac: number }[];
  empty: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-[0.8rem] text-faint">
          {empty}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-ink">{r.name}</span>
                <span className="shrink-0 text-right">
                  <span className="tnum font-semibold text-ink">{r.primary}</span>
                  {r.secondary && <span className="ml-1.5 text-[0.72rem] text-faint">{r.secondary}</span>}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(2, Math.min(100, r.frac * 100))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AnalyticsView({
  orders,
  products,
  currency,
}: {
  orders: OrderSnapshot[];
  products: OwnerProduct[];
  currency: string;
}) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("30d");
  const [range, setRange] = useState<DateRange>(() => rangeFor("30d"));
  const [metric, setMetric] = useState<Metric>("revenue");
  const [gran, setGran] = useState<Granularity>("day");

  const onRange = (key: PeriodKey, r: DateRange) => {
    setPeriodKey(key);
    setRange(r);
  };

  const series = useMemo(() => timeSeries(orders, range, gran), [orders, range, gran]);
  const tot = useMemo(() => totalsFor(orders, range), [orders, range]);
  const prev = useMemo(() => totalsFor(orders, previousRange(range)), [orders, range]);

  const prods = useMemo(() => productBreakdown(orders, range), [orders, range]);
  const biz = useMemo(() => businessBreakdown(orders, range), [orders, range]);

  const money = (v: number) => formatAmount(v, currency);

  const topProducts = [...prods].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const maxProdRev = Math.max(1, ...topProducts.map((p) => p.revenue));

  const mostProfitable = [...prods].sort((a, b) => b.profit - a.profit).slice(0, 5);
  const maxProdProfit = Math.max(1, ...mostProfitable.map((p) => p.profit));

  // Least sold spans the WHOLE active catalog (zero-sales products are the point).
  const unitsBySlug = new Map(prods.map((p) => [p.productId, p.units]));
  const leastSold = products
    .filter((p) => p.isActive)
    .map((p) => ({ slug: p.slug, name: p.name, units: unitsBySlug.get(p.slug) ?? 0 }))
    .sort((a, b) => a.units - b.units)
    .slice(0, 5);
  const maxUnits = Math.max(1, ...products.map((p) => unitsBySlug.get(p.slug) ?? 0));

  const topBiz = [...biz].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const maxBizRev = Math.max(1, ...topBiz.map((b) => b.revenue));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">Analizat</h2>
        <DateRangePicker value={periodKey} onChange={onRange} />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Të ardhurat" value={money(tot.revenue)} delta={deltaPct(tot.revenue, prev.revenue)} />
        <StatCard label="Fitimi" value={money(tot.profit)} delta={deltaPct(tot.profit, prev.profit)} />
        <StatCard label="Porosi" value={tot.orders.toLocaleString("en-US")} delta={deltaPct(tot.orders, prev.orders)} />
        <StatCard label="Vlera mes. e paketës" value={money(aovOf(tot))} delta={deltaPct(aovOf(tot), aovOf(prev))} />
        <StatCard
          label="Marzhi mesatar"
          value={`${(marginOf(tot) * 100).toFixed(1)}%`}
          delta={marginOf(tot) - marginOf(prev)}
        />
        <StatCard label="Kursimet e klientëve" value={money(tot.saved)} delta={deltaPct(tot.saved, prev.saved)} />
      </div>

      {/* Chart */}
      <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Toggle options={METRICS} value={metric} onChange={setMetric} />
          <Toggle options={GRANS} value={gran} onChange={setGran} />
        </div>
        <TrendChart points={series} metric={metric} currency={currency} />
      </section>

      {/* Breakdown tables */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RankTable
          title="Produktet kryesore (të ardhura)"
          empty="Nuk ka shitje në këtë periudhë."
          rows={topProducts.map((p) => ({
            key: p.productId,
            name: p.name,
            primary: money(p.revenue),
            secondary: `${p.units} copë`,
            frac: p.revenue / maxProdRev,
          }))}
        />
        <RankTable
          title="Kategoritë kryesore të biznesit"
          empty="Nuk ka shitje në këtë periudhë."
          rows={topBiz.map((b) => ({
            key: b.type,
            name: b.label,
            primary: money(b.revenue),
            secondary: `${b.orders} porosi`,
            frac: b.revenue / maxBizRev,
          }))}
        />
        <RankTable
          title="Më fitimprurësit"
          empty="Nuk ka shitje në këtë periudhë."
          rows={mostProfitable.map((p) => ({
            key: p.productId,
            name: p.name,
            primary: money(p.profit),
            secondary: `${p.units} copë`,
            frac: p.profit / maxProdProfit,
          }))}
        />
        <RankTable
          title="Më pak të shiturit"
          empty="Nuk ka produkte aktive."
          rows={leastSold.map((p) => ({
            key: p.slug,
            name: p.name,
            primary: `${p.units} copë`,
            frac: p.units / maxUnits,
          }))}
        />
      </div>
    </div>
  );
}
