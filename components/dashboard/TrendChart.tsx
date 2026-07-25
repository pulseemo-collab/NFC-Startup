"use client";

// Lightweight, dependency-free trend chart (polished). HTML/flex bars (crisp, no
// SVG distortion) with: entry animation, an interactive hover/focus tooltip with
// the exact date + value, an average reference line, active-bar highlighting, and
// graceful low-volume states. Keyboard + screen-reader accessible; honours
// prefers-reduced-motion (via the .chart-grow class).

import { useMemo, useState } from "react";
import type { SeriesPoint } from "@/lib/analytics";
import { formatAmount } from "@/lib/currency";

export type Metric = "revenue" | "profit" | "orders";

const METRIC_COLOR: Record<Metric, string> = {
  revenue: "var(--accent)",
  profit: "var(--profit)",
  orders: "var(--gold)",
};
const METRIC_LABEL: Record<Metric, string> = {
  revenue: "Të ardhurat",
  profit: "Fitimi",
  orders: "Porositë",
};

export default function TrendChart({
  points,
  metric,
  currency,
  height = 200,
}: {
  points: SeriesPoint[];
  metric: Metric;
  currency: string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);

  const values = useMemo(() => points.map((p) => p[metric]), [points, metric]);
  const max = useMemo(() => Math.max(1, ...values), [values]);
  const nonZero = values.filter((v) => v > 0);
  const avg = nonZero.length >= 2 ? values.reduce((s, v) => s + v, 0) / values.length : null;

  if (points.length === 0) {
    return (
      <div
        className="grid place-items-center rounded-lg border border-dashed border-border text-sm text-faint"
        style={{ height }}
        role="img"
        aria-label="Nuk ka të dhëna për këtë periudhë."
      >
        Nuk ka të dhëna për këtë periudhë.
      </div>
    );
  }

  const fmt = (v: number) => (metric === "orders" ? v.toLocaleString("en-US") : formatAmount(v, currency));
  const color = METRIC_COLOR[metric];
  const labelStep = Math.ceil(points.length / 14);
  // Few bars shouldn't stretch full-width: cap the bar width so 1–2 points read well.
  const maxBarPct = points.length <= 2 ? 22 : points.length <= 5 ? 40 : 100;

  const total = values.reduce((s, v) => s + v, 0);
  const summary = `${METRIC_LABEL[metric]}: gjithsej ${fmt(total)} në ${points.length} periudha.`;

  return (
    <div>
      <div className="relative" style={{ height }} role="group" aria-label={summary}>
        {/* gridlines */}
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <div
            key={g}
            className="pointer-events-none absolute inset-x-0 border-t border-border/60"
            style={{ bottom: `${g * 100}%` }}
            aria-hidden
          />
        ))}

        {/* average reference line */}
        {avg != null && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-muted/70"
            style={{ bottom: `${(avg / max) * 100}%` }}
            aria-hidden
          >
            <span className="absolute -top-4 right-0 rounded bg-surface px-1 text-[0.6rem] text-muted">
              mes. {fmt(avg)}
            </span>
          </div>
        )}

        {/* bars */}
        <div className="flex h-full items-end justify-center gap-[2px]" onMouseLeave={() => setActive(null)}>
          {points.map((p, i) => {
            const v = p[metric];
            const h = (v / max) * 100;
            const isActive = active === i;
            const full = p.start.toLocaleDateString("en-GB", {
              weekday: undefined,
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            return (
              <div
                key={p.key}
                className="relative flex h-full flex-1 items-end justify-center"
                style={{ maxWidth: `${maxBarPct}%` }}
                tabIndex={0}
                aria-label={`${full}: ${fmt(v)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
              >
                <div
                  className="chart-grow w-full rounded-t-[3px] transition-opacity"
                  style={{
                    height: `${Math.max(v > 0 ? 2 : 0, h)}%`,
                    // Solid colour as a fallback; the gradient adds the "area" fade
                    // where supported (an unsupported gradient is ignored, not blank).
                    backgroundColor: color,
                    backgroundImage: `linear-gradient(to top, ${color}, color-mix(in srgb, ${color} 60%, transparent))`,
                    opacity: active == null ? (v === 0 ? 0.18 : 0.9) : isActive ? 1 : 0.35,
                    animationDelay: `${Math.min(i, 24) * 12}ms`,
                  }}
                />
                {isActive && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-1 text-center shadow-2xl">
                    <span className="block text-[0.62rem] text-faint">{full}</span>
                    <span className="block text-xs font-bold tnum text-ink">{fmt(v)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex justify-between gap-1 text-[0.62rem] text-faint">
        {points.map((p, i) =>
          i % labelStep === 0 ? (
            <span key={p.key} className="tnum truncate">
              {p.label}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}
