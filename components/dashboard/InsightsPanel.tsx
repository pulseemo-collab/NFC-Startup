"use client";

// Smart Insights (Part 3). Renders the deterministic insights produced by
// lib/analytics.generateInsights — no AI, no fabricated data. When there is
// nothing noteworthy (e.g. no orders yet) it shows an honest empty state.

import type { Insight, InsightKind } from "@/lib/analytics";

const STYLES: Record<InsightKind, { dot: string; ring: string; icon: string }> = {
  good: { dot: "bg-profit", ring: "border-profit/30 bg-profit-soft/40", icon: "↑" },
  warn: { dot: "bg-warn", ring: "border-warn/30 bg-warn-soft/40", icon: "!" },
  info: { dot: "bg-accent", ring: "border-accent/30 bg-accent-soft/40", icon: "i" },
};

export default function InsightsPanel({
  insights,
  title = "Vëzhgime",
}: {
  insights: Insight[];
  title?: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <span className="text-[0.7rem] uppercase tracking-wider text-faint">auto</span>
      </div>

      {insights.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-faint">
          Ende pa vëzhgime. Sapo të vijnë porositë, këtu do të shfaqen sinjale për biznesin.
        </p>
      ) : (
        <ul className="space-y-2">
          {insights.map((ins, i) => {
            const s = STYLES[ins.kind];
            return (
              <li
                key={ins.id}
                className={`rise-in flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${s.ring}`}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold text-bg ${s.dot}`}
                  aria-hidden
                >
                  {s.icon}
                </span>
                <span className="text-ink/90">{ins.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
