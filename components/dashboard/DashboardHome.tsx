"use client";

// Owner dashboard HOME (Part 1 + Part 3). A premium at-a-glance summary above the
// existing workflow: KPI cards, a month-at-a-glance band, smart insights, recent
// orders and quick actions. Everything is computed from the real, already-loaded
// owner data (orders + catalog) — no fabricated numbers, honest empty states.

import { useMemo } from "react";
import type { OrderSnapshot } from "@/types";
import type { OwnerProduct } from "@/lib/data/catalog-types";
import { buildKpis, generateInsights, totalsFor, rangeFor, marginOf } from "@/lib/analytics";
import { formatAmount } from "@/lib/currency";
import { ORDER_STATUS_LABEL } from "@/lib/i18n";
import KpiCard, { KpiCardSkeleton } from "@/components/dashboard/KpiCard";
import InsightsPanel from "@/components/dashboard/InsightsPanel";

// Today's operational metrics lead; every other KPI is supporting (compact tier).
const PRIMARY_KPIS = ["revenueToday", "profitToday", "ordersToday", "ordersMonth"];

export default function DashboardHome({
  orders,
  products,
  currency,
  loading = false,
  onNewOrder,
  onViewOrders,
  onOpenOrder,
  onViewAnalytics,
}: {
  orders: OrderSnapshot[];
  products: OwnerProduct[];
  currency: string;
  loading?: boolean;
  onNewOrder: () => void;
  onViewOrders: () => void;
  onOpenOrder: (id: string) => void;
  onViewAnalytics?: () => void;
}) {
  const kpis = useMemo(() => buildKpis(orders, products), [orders, products]);
  const insights = useMemo(() => generateInsights(orders, products), [orders, products]);
  const month = useMemo(() => totalsFor(orders, rangeFor("thisMonth")), [orders]);
  const recent = useMemo(() => orders.slice(0, 5), [orders]);
  const newCount = useMemo(() => orders.filter((o) => o.status === "new").length, [orders]);

  // Tier the KPIs: today's operational metrics lead; the rest are supporting.
  const primaryKpis = useMemo(() => kpis.filter((k) => PRIMARY_KPIS.includes(k.key)), [kpis]);
  const secondaryKpis = useMemo(() => kpis.filter((k) => !PRIMARY_KPIS.includes(k.key)), [kpis]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero — month at a glance (dominant) */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-surface via-surface to-surface-2 p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-accent">Këtë muaj</p>
            <p className="mt-1 text-3xl font-extrabold leading-none tnum text-ink sm:text-4xl">
              {formatAmount(month.revenue, currency)}
            </p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span>
                {month.orders.toLocaleString("en-US")} porosi
              </span>
              <span className="text-profit">{formatAmount(month.profit, currency)} fitim</span>
              <span>{(marginOf(month) * 100).toFixed(1)}% marzh</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onNewOrder}
              className="rounded-lg border border-accent bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            >
              + Porosi e re
            </button>
            {onViewAnalytics && (
              <button
                type="button"
                onClick={onViewAnalytics}
                className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
              >
                Analizat
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Primary — today's operational metrics */}
      <section>
        <h2 className="mb-2.5 text-[0.72rem] font-semibold uppercase tracking-widest text-muted">Sot &amp; ky muaj</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {primaryKpis.map((kpi, i) => (
            <KpiCard key={kpi.key} kpi={kpi} currency={currency} index={i} />
          ))}
        </div>
      </section>

      {/* Insights + recent orders (attention) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <InsightsPanel insights={insights} />

        <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">Porositë e fundit</h2>
              {newCount > 0 && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.66rem] font-semibold text-accent">
                  {newCount} të reja
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onViewOrders}
              className="text-[0.75rem] font-medium text-accent hover:text-accent-strong"
            >
              Shiko të gjitha →
            </button>
          </div>

          {recent.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-faint">
              Ende pa porosi. Krijo porosinë e parë nga ndërtuesi.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onOpenOrder(o.id)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:opacity-80"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{o.businessName}</span>
                      <span className="block text-[0.72rem] text-faint">
                        {o.number} · {new Date(o.createdAt).toLocaleDateString("en-GB")}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tnum text-ink">
                        {formatAmount(o.finalPrice, currency)}
                      </span>
                      <span className="block text-[0.7rem] text-faint">{ORDER_STATUS_LABEL[o.status]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Secondary — supporting metrics (lighter weight) */}
      <section>
        <h2 className="mb-2.5 text-[0.72rem] font-semibold uppercase tracking-widest text-muted">Të tjera</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {secondaryKpis.map((kpi, i) => (
            <KpiCard key={kpi.key} kpi={kpi} currency={currency} index={i} compact />
          ))}
        </div>
      </section>
    </div>
  );
}
