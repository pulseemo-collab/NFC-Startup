"use client";

// A single KPI tile for the owner dashboard home (Part 1). Renders value,
// period-over-period comparison, a trend indicator, a subtle mount animation,
// a loading skeleton, and an explicit empty state — all from real values.

import { memo } from "react";
import type { Kpi } from "@/lib/analytics";
import { formatAmount } from "@/lib/currency";

function formatValue(kpi: Kpi, currency: string): string {
  switch (kpi.kind) {
    case "money":
      return formatAmount(kpi.value, currency);
    case "count":
      return kpi.value.toLocaleString("en-US");
    case "percent":
      return `${(kpi.value * 100).toFixed(1)}%`;
    case "text":
      return kpi.text ?? "—";
  }
}

function DeltaBadge({ kpi }: { kpi: Kpi }) {
  // No comparison defined for this KPI (e.g. best product, active products).
  if (kpi.delta === undefined) return null;

  // No baseline in the previous period.
  if (kpi.delta === null) {
    return <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.7rem] font-semibold text-accent">e re</span>;
  }

  const flat = Math.abs(kpi.delta) < (kpi.deltaKind === "points" ? 0.001 : 0.0001);
  if (flat) {
    return <span className="text-[0.72rem] font-medium text-faint">— pa ndryshim</span>;
  }

  const up = kpi.delta > 0;
  const good = kpi.positiveIsGood ? up : !up;
  const color = good ? "text-profit" : "text-warn";
  const arrow = up ? "▲" : "▼";
  const magnitude =
    kpi.deltaKind === "points"
      ? `${Math.abs(kpi.delta * 100).toFixed(1)} pikë`
      : `${Math.round(Math.abs(kpi.delta) * 100)}%`;

  return (
    <span className={`inline-flex items-center gap-1 text-[0.72rem] font-semibold ${color}`}>
      <span aria-hidden>{arrow}</span>
      {magnitude}
    </span>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton mt-3 h-7 w-28" />
      <div className="skeleton mt-3 h-3 w-16" />
    </div>
  );
}

function KpiCard({
  kpi,
  currency,
  index = 0,
  compact = false,
}: {
  kpi: Kpi;
  currency: string;
  index?: number;
  /** Secondary tier: lighter weight, smaller value, tighter padding. */
  compact?: boolean;
}) {
  const empty = kpi.kind === "text" ? (kpi.text ?? "—") === "—" : kpi.value === 0 && kpi.delta == null;

  return (
    <div
      className={`rise-in group rounded-xl border border-border transition hover:border-accent/60 ${
        compact ? "bg-surface/70 p-3" : "bg-surface p-4 shadow-card"
      }`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-semibold uppercase tracking-wider text-muted ${compact ? "text-[0.66rem]" : "text-[0.72rem]"}`}>
          {kpi.label}
        </p>
        <DeltaBadge kpi={kpi} />
      </div>

      <p
        className={`mt-2 truncate font-bold leading-tight ${compact ? "text-[1.15rem]" : "text-[1.55rem]"} ${
          kpi.kind === "text" ? "" : "tnum"
        } ${empty ? "text-faint" : "text-ink"}`}
        title={kpi.kind === "text" ? kpi.text : undefined}
      >
        {formatValue(kpi, currency)}
      </p>

      {kpi.sub && <p className="mt-1 text-[0.72rem] text-faint">{kpi.sub}</p>}
    </div>
  );
}

// Pure presentational card — memoized so KPI re-renders are skipped when props
// are unchanged (Part 12).
export default memo(KpiCard);
