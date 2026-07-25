"use client";

import { useEffect, useRef } from "react";
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
  onExport,
  onImportFile,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  open: boolean;
  onClose: () => void;
  onExport?: () => void;
  onImportFile?: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
        className="max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
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

        {/* Business identity */}
        <Section title={t.setSectionBusiness}>
          <Field label={t.businessName}>
            <TextInput
              value={settings.businessName ?? ""}
              placeholder="NFC Reseller"
              onChange={(v) => set({ businessName: v })}
            />
          </Field>
          <Field label={t.logoUrlLabel}>
            <TextInput
              value={settings.logoUrl ?? ""}
              placeholder="https://…"
              onChange={(v) => set({ logoUrl: v })}
            />
            <span className="text-[0.68rem] text-faint">{t.logoUrlHelp}</span>
          </Field>
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logoUrl}
              alt="logo"
              className="h-10 w-10 rounded-lg border border-border object-cover"
              onError={(e) => ((e.currentTarget.style.display = "none"))}
            />
          ) : null}
        </Section>

        {/* Pricing rules */}
        <Section title={t.setSectionPricing}>
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

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.minMargin}>
              <NumberInput
                value={Math.round(settings.minMargin * 100)}
                min={0}
                max={95}
                step={1}
                onChange={(v) => set({ minMargin: Math.min(0.95, Math.max(0, v / 100)) })}
              />
            </Field>
            <Field label={`${t.minProfit} (${CURRENCY_SYMBOLS[settings.currency] ?? ""})`}>
              <NumberInput
                value={toDisplay(settings.minProfit, settings.currency)}
                min={0}
                step={stepFor(settings.currency)}
                onChange={(v) => set({ minProfit: toBase(Math.max(0, v), settings.currency) })}
              />
            </Field>
          </div>

          <Field label={t.bundleDiscountPct}>
            <NumberInput
              value={Math.round(settings.bundleDiscount * 100)}
              min={0}
              max={90}
              step={1}
              onChange={(v) => set({ bundleDiscount: Math.min(0.9, Math.max(0, v / 100)) })}
            />
          </Field>
          <p className="text-[0.72rem] leading-snug text-faint">{t.settingsSaved}</p>
        </Section>

        {/* Backup / restore */}
        {(onExport || onImportFile) && (
          <Section title={t.setSectionBackup} last>
            <p className="text-[0.72rem] leading-snug text-faint">{t.backupHelp}</p>
            <div className="flex flex-wrap gap-2">
              {onExport && (
                <button
                  type="button"
                  onClick={onExport}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:border-accent hover:text-accent"
                >
                  {t.exportData}
                </button>
              )}
              {onImportFile && (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:border-accent hover:text-accent"
                  >
                    {t.importData}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onImportFile(f);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? "" : "mb-4 border-b border-border pb-4"}>
      <h3 className="mb-2.5 text-[0.72rem] font-bold uppercase tracking-wider text-accent">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
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

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
    />
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
