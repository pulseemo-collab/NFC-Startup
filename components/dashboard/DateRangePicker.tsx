"use client";

// Date-range filter for the Analytics section (Part 2). Presets plus a custom
// range. Emits both the selected key and the resolved [start, end) so callers
// can label + compare periods without re-deriving ranges.

import { useState } from "react";
import { type PeriodKey, type DateRange, rangeFor, startOfDay, addDays } from "@/lib/analytics";

const PRESETS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Sot" },
  { key: "yesterday", label: "Dje" },
  { key: "7d", label: "7 ditë" },
  { key: "30d", label: "30 ditë" },
  { key: "thisMonth", label: "Këtë muaj" },
  { key: "lastMonth", label: "Muajin e kaluar" },
];

function toInputValue(d: Date): string {
  // Local YYYY-MM-DD for <input type="date"> (avoid UTC shift from toISOString).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DateRangePicker({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (key: PeriodKey, range: DateRange) => void;
}) {
  const today = startOfDay(new Date());
  const [from, setFrom] = useState(toInputValue(addDays(today, -6)));
  const [to, setTo] = useState(toInputValue(today));

  const selectPreset = (key: PeriodKey) => onChange(key, rangeFor(key));

  const applyCustom = (nextFrom: string, nextTo: string) => {
    const start = startOfDay(new Date(nextFrom));
    // end is exclusive → include the whole "to" day.
    const end = addDays(startOfDay(new Date(nextTo)), 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return;
    onChange("custom", { start, end });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => selectPreset(p.key)}
            className={`rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-medium transition ${
              value === p.key
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div
        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${
          value === "custom" ? "border-accent" : "border-border"
        }`}
      >
        <input
          type="date"
          value={from}
          max={to}
          onChange={(e) => {
            setFrom(e.target.value);
            applyCustom(e.target.value, to);
          }}
          className="bg-transparent text-[0.78rem] text-ink outline-none"
          aria-label="Nga data"
        />
        <span className="text-faint">→</span>
        <input
          type="date"
          value={to}
          min={from}
          onChange={(e) => {
            setTo(e.target.value);
            applyCustom(from, e.target.value);
          }}
          className="bg-transparent text-[0.78rem] text-ink outline-none"
          aria-label="Deri më"
        />
      </div>
    </div>
  );
}
