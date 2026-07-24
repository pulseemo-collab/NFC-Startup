"use client";

import type { Settings } from "@/types";
import {
  CURRENCIES,
  CURRENCY_LABEL,
  CURRENCY_SYMBOLS,
  stepFor,
  toBase,
  toDisplay,
} from "@/lib/currency";
import { t } from "@/lib/i18n";

export default function SettingsPanel({
  settings,
  onChange,
  open,
  onClose,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.settings}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t.settings}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="rounded-lg border border-border px-2 py-1 text-sm text-muted hover:border-accent hover:text-accent"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <Field label={t.currency}>
            <select
              value={settings.currency}
              onChange={(e) => set({ currency: e.target.value })}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t.minMargin}>
            <NumberInput
              value={Math.round(settings.minMargin * 100)}
              min={0}
              max={95}
              step={1}
              onChange={(v) => set({ minMargin: Math.min(0.95, Math.max(0, v / 100)) })}
            />
          </Field>

          {/* Stored in the base currency, edited in the selected one. */}
          <Field label={`${t.minProfit} (${CURRENCY_SYMBOLS[settings.currency] ?? ""})`}>
            <NumberInput
              value={toDisplay(settings.minProfit, settings.currency)}
              min={0}
              step={stepFor(settings.currency)}
              onChange={(v) => set({ minProfit: toBase(Math.max(0, v), settings.currency) })}
            />
          </Field>

          <Field label={t.bundleDiscountPct}>
            <NumberInput
              value={Math.round(settings.bundleDiscount * 100)}
              min={0}
              max={90}
              step={1}
              onChange={(v) => set({ bundleDiscount: Math.min(0.9, Math.max(0, v / 100)) })}
            />
          </Field>
        </div>

        <p className="mt-4 text-[0.72rem] leading-snug text-faint">{t.settingsSaved}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        onChange(Number.isNaN(v) ? 0 : v);
      }}
      className="tnum w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
    />
  );
}
