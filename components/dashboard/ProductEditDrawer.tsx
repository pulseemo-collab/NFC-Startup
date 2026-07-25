"use client";

// Product create/edit drawer (Part 4). A calmer, single-surface editing
// experience with a live customer preview and the pricing-engine recommendation
// shown as guidance. Money fields are edited in the owner's display currency and
// converted to BASE (EUR) on save. The pricing engine itself is unchanged.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Settings, Product } from "@/types";
import type { OwnerProduct, OwnerProductPatch, ProductStatus } from "@/lib/data/catalog-types";
import { recommendPrice } from "@/lib/pricing";
import { formatAmount, toBase, toDisplay, symbolFor } from "@/lib/currency";
import { t } from "@/lib/i18n";

type Draft = {
  name: string;
  slug: string;
  category: string;
  tag: "green" | "yellow";
  status: ProductStatus;
  descriptionSq: string;
  note: string;
  cost: string;
  sell: string;
  minMarginPct: string;
  minProfit: string;
  marketMin: string;
  marketRec: string;
  marketPrem: string;
  marketMax: string;
  ladder: string;
};

const STATUS_OPTS: { key: ProductStatus; label: string }[] = [
  { key: "active", label: "Aktiv" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Arkivuar" },
];

const numOr0 = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const dispStr = (base: number, cur: string) => (base ? String(toDisplay(base, cur)) : "");

function fromProduct(p: OwnerProduct | null, cur: string): Draft {
  return {
    name: p?.name ?? "",
    slug: p?.slug ?? "",
    category: p?.category ?? "",
    tag: p?.tag ?? "green",
    status: p?.status ?? "draft",
    descriptionSq: p?.descriptionSq ?? "",
    note: p?.note ?? "",
    cost: dispStr(p?.supplierCostEur ?? 0, cur),
    sell: dispStr(p?.sellPriceEur ?? 0, cur),
    minMarginPct: p ? String(Math.round(p.minMargin * 100)) : "70",
    minProfit: dispStr(p?.minProfit ?? 0, cur),
    marketMin: dispStr(p?.market.min ?? 0, cur),
    marketRec: dispStr(p?.market.recommended ?? 0, cur),
    marketPrem: dispStr(p?.market.premium ?? 0, cur),
    marketMax: dispStr(p?.market.max ?? 0, cur),
    ladder: (p?.ladder ?? []).map((v) => toDisplay(v, cur)).join(", "),
  };
}

export default function ProductEditDrawer({
  product,
  settings,
  onClose,
  onSubmit,
}: {
  product: OwnerProduct | null; // null = create
  settings: Settings;
  onClose: () => void;
  onSubmit: (slug: string | null, patch: OwnerProductPatch & { slug?: string; name?: string }) => Promise<boolean>;
}) {
  const cur = settings.currency;
  const isEdit = product !== null;
  const [d, setD] = useState<Draft>(() => fromProduct(product, cur));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  // Unsaved-change tracking + guarded close.
  const initialRef = useRef(JSON.stringify(fromProduct(product, cur)));
  const dirty = JSON.stringify(d) !== initialRef.current;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const requestClose = useCallback(() => {
    if (dirtyRef.current && !window.confirm(t.pmDiscard)) return;
    onClose();
  }, [onClose]);

  // Escape closes (guarded); focus the first field on open.
  const firstFieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  // Base-currency numbers derived from the display-currency inputs.
  const base = useMemo(() => {
    const ladder = d.ladder
      .split(",")
      .map((x) => toBase(numOr0(x.trim()), cur))
      .filter((x) => x > 0)
      .sort((a, b) => a - b);
    return {
      cost: toBase(numOr0(d.cost), cur),
      sell: toBase(numOr0(d.sell), cur),
      minMargin: Math.max(0, Math.min(1, numOr0(d.minMarginPct) / 100)),
      minProfit: toBase(numOr0(d.minProfit), cur),
      market: {
        min: toBase(numOr0(d.marketMin), cur),
        recommended: toBase(numOr0(d.marketRec), cur),
        premium: toBase(numOr0(d.marketPrem), cur),
        max: toBase(numOr0(d.marketMax), cur),
      },
      ladder,
    };
  }, [d, cur]);

  // Live engine recommendation (guidance only — never auto-applied).
  const recommendation = useMemo(() => {
    const p: Product = {
      id: d.slug || "draft",
      name: d.name,
      category: d.category,
      tag: d.tag,
      defaultCost: base.cost,
      market: base.market,
      ladder: base.ladder,
      minMargin: base.minMargin,
      minProfit: base.minProfit,
      note: d.note,
      descriptionSq: d.descriptionSq,
    };
    return recommendPrice(p, base.cost, settings);
  }, [d, base, settings]);

  const profit = base.sell - base.cost;
  const margin = base.sell > 0 ? profit / base.sell : 0;

  const submit = async () => {
    setError("");
    if (!d.name.trim()) return setError(t.pmNameRequired);
    if (!isEdit && !d.slug.trim()) return setError(t.pmSlugRequired);

    const patch: OwnerProductPatch & { slug?: string; name?: string } = {
      name: d.name.trim(),
      category: d.category.trim(),
      tag: d.tag,
      status: d.status,
      descriptionSq: d.descriptionSq.trim(),
      note: d.note.trim(),
      supplierCostEur: base.cost,
      sellPriceEur: base.sell,
      minMargin: base.minMargin,
      minProfit: base.minProfit,
      market: base.market,
      ladder: base.ladder,
    };
    if (!isEdit) patch.slug = d.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");

    setSaving(true);
    const ok = await onSubmit(isEdit ? product!.slug : null, patch);
    setSaving(false);
    if (ok) onClose();
    else setError(t.saveError);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={isEdit ? t.pmEditTitle : t.pmNewTitle}>
      <div className="absolute inset-0 bg-black/50" onClick={requestClose} aria-hidden />
      <div className="rise-in relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-ink">{isEdit ? t.pmEditTitle : t.pmNewTitle}</h2>
            {dirty && <p className="text-[0.68rem] font-medium text-warn">● {t.pmUnsaved}</p>}
          </div>
          <button type="button" onClick={requestClose} aria-label={t.close} className="shrink-0 text-muted hover:text-accent">
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* Live preview */}
          <div className="rounded-xl border border-border bg-bg p-3">
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-faint">{t.pmPreview}</p>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <span className={`h-2 w-2 rounded-full ${d.tag === "green" ? "bg-profit" : "bg-warn"}`} />
                  <span className="truncate">{d.name || "—"}</span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{d.descriptionSq || "…"}</p>
              </div>
              <span className="shrink-0 text-right">
                <span className="block text-lg font-bold tnum text-accent">{formatAmount(base.sell, cur)}</span>
                <StatusBadge status={d.status} />
              </span>
            </div>
          </div>

          <Field label={t.pmName}>
            <Input value={d.name} onChange={(v) => set("name", v)} inputRef={firstFieldRef} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.pmSlug}>
              <Input value={d.slug} onChange={(v) => set("slug", v)} disabled={isEdit} placeholder="p.sh. stand" />
            </Field>
            <Field label={t.pmCategory}>
              <Input value={d.category} onChange={(v) => set("category", v)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.pmTag}>
              <Select
                value={d.tag}
                onChange={(v) => set("tag", v as "green" | "yellow")}
                options={[
                  { key: "green", label: "🟢 Green" },
                  { key: "yellow", label: "🟡 Yellow" },
                ]}
              />
            </Field>
            <Field label={t.status}>
              <Select value={d.status} onChange={(v) => set("status", v as ProductStatus)} options={STATUS_OPTS} />
            </Field>
          </div>

          <Field label={t.pmDescription}>
            <textarea
              value={d.descriptionSq}
              onChange={(e) => set("descriptionSq", e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </Field>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${t.myCost} (${symbolFor(cur)})`}>
              <Input value={d.cost} onChange={(v) => set("cost", v)} numeric />
            </Field>
            <Field label={`${t.myPrice} (${symbolFor(cur)})`}>
              <Input value={d.sell} onChange={(v) => set("sell", v)} numeric />
            </Field>
          </div>

          <div className="rounded-lg border border-border bg-bg px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted">
                {t.recommendedPrice}: <span className="tnum text-ink">{formatAmount(recommendation.price, cur)}</span>
              </span>
              <button
                type="button"
                onClick={() => set("sell", dispStr(recommendation.price, cur))}
                className="font-medium text-accent hover:text-accent-strong"
              >
                {t.useRecommended}
              </button>
            </div>
            <p className="mt-1 text-faint">
              {t.profit}: <span className="tnum">{formatAmount(profit, cur)}</span> · {t.margin}:{" "}
              <span className={`tnum ${margin < base.minMargin ? "text-warn" : "text-profit"}`}>
                {Math.round(margin * 100)}%
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.minMargin}>
              <Input value={d.minMarginPct} onChange={(v) => set("minMarginPct", v)} numeric />
            </Field>
            <Field label={`${t.minProfit} (${symbolFor(cur)})`}>
              <Input value={d.minProfit} onChange={(v) => set("minProfit", v)} numeric />
            </Field>
          </div>

          {/* Advanced: market bands + ladder (drive the engine) */}
          <details className="rounded-lg border border-border bg-bg px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-muted">{t.pmAdvanced}</summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Market min">
                  <Input value={d.marketMin} onChange={(v) => set("marketMin", v)} numeric />
                </Field>
                <Field label="Recommended">
                  <Input value={d.marketRec} onChange={(v) => set("marketRec", v)} numeric />
                </Field>
                <Field label="Premium">
                  <Input value={d.marketPrem} onChange={(v) => set("marketPrem", v)} numeric />
                </Field>
                <Field label="Max">
                  <Input value={d.marketMax} onChange={(v) => set("marketMax", v)} numeric />
                </Field>
              </div>
              <Field label={`${t.pmLadder} (${symbolFor(cur)})`}>
                <Input value={d.ladder} onChange={(v) => set("ladder", v)} placeholder="9, 19, 29" />
              </Field>
              <Field label={t.ownerNotes}>
                <textarea
                  value={d.note}
                  onChange={(e) => set("note", e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                />
              </Field>
            </div>
          </details>

          {error && <p className="rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm text-warn">{error}</p>}
        </div>

        <footer className="flex gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={requestClose}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted hover:border-accent hover:text-accent"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex-1 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-bold text-white hover:bg-accent-strong disabled:opacity-50"
          >
            {saving ? "…" : t.pmSave}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: ProductStatus }) {
  const map: Record<ProductStatus, string> = {
    active: "bg-profit-soft text-profit",
    draft: "bg-accent-soft text-accent",
    archived: "bg-surface-2 text-faint",
  };
  const label: Record<ProductStatus, string> = { active: "Aktiv", draft: "Draft", archived: "Arkivuar" };
  return <span className={`rounded-full px-2 py-0.5 text-[0.66rem] font-semibold ${map[status]}`}>{label[status]}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-wide text-faint">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  disabled,
  numeric,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  numeric?: boolean;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode={numeric ? "decimal" : undefined}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
    />
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
