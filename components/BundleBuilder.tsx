"use client";

import { useMemo } from "react";
import type { BundleDef, Product, Settings } from "@/types";
import { priceBundle, formatMoney, type PriceOverrides } from "@/lib/pricing";
import { t } from "@/lib/i18n";

function sameKit(a: Record<string, number>, b: Record<string, number>): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    if ((a[id] ?? 0) !== (b[id] ?? 0)) return false;
  }
  return true;
}

export default function BundleBuilder({
  products,
  costs,
  prices,
  settings,
  selection,
  presets,
  activePreset,
  variant,
  onQty,
  onReset,
  onCloseOrder,
  editingNumber,
  onSaveChanges,
  onSaveAsNew,
  onCancelEdit,
  saving,
}: {
  products: Product[];
  costs: Record<string, number>;
  prices: PriceOverrides;
  settings: Settings;
  selection: Record<string, number>;
  presets: BundleDef[];
  activePreset: string | null;
  variant: "owner" | "client";
  onQty: (id: string, qty: number) => void;
  onReset: () => void;
  onCloseOrder?: () => void;
  editingNumber?: string | null;
  onSaveChanges?: () => void;
  onSaveAsNew?: () => void;
  onCancelEdit?: () => void;
  saving?: boolean;
}) {
  const result = useMemo(
    () => priceBundle(selection, products, costs, settings, prices),
    [selection, products, costs, settings, prices]
  );

  const preset = presets.find((p) => p.id === activePreset) ?? null;
  const customized = preset ? !sameKit(preset.kit, selection) : true;
  const empty = result.lines.length === 0;
  const marginPct = result.margin * 100;
  const isOwner = variant === "owner";

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-card">
      <div className="bg-accent px-[18px] py-3.5 text-white">
        <div className="text-[0.72rem] uppercase tracking-[0.1em] opacity-85">{t.quoteFor}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[1.08rem] font-bold">
          <span>{preset ? preset.name : t.customBundle}</span>
        </div>
      </div>

      <div className="p-[18px]">
        {empty ? (
          <p className="py-6 text-center text-sm text-muted">{t.emptyBundle}</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-border">
              {result.lines.map((line) => (
                <li key={line.product.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{line.product.name}</div>
                    <div className="tnum text-[0.7rem] text-faint">
                      {formatMoney(line.unitPrice, settings)} {t.eachSuffix}
                    </div>
                  </div>
                  <div className="flex items-center overflow-hidden rounded-[9px] border border-border bg-bg">
                    <button
                      type="button"
                      aria-label={`− ${line.product.name}`}
                      onClick={() => onQty(line.product.id, line.qty - 1)}
                      className="grid h-8 w-[30px] place-items-center text-lg text-ink hover:bg-surface-2 hover:text-accent"
                    >
                      −
                    </button>
                    <span className="tnum w-[34px] border-x border-border py-1 text-center text-sm font-semibold">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      aria-label={`+ ${line.product.name}`}
                      onClick={() => onQty(line.product.id, line.qty + 1)}
                      className="grid h-8 w-[30px] place-items-center text-lg text-ink hover:bg-surface-2 hover:text-accent"
                    >
                      +
                    </button>
                  </div>
                  <div
                    key={line.unitPrice * line.qty}
                    className="value-flash tnum w-16 text-right text-sm font-semibold text-profit"
                  >
                    {formatMoney(line.unitPrice * line.qty, settings)}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3.5 flex flex-col">
              {isOwner ? (
                <>
                  <Row k={t.totalUnits} v={String(result.units)} />
                  <Row k={t.yourCost} v={formatMoney(result.totalCost, settings)} muted />
                  <Row k={t.ifSeparately} v={formatMoney(result.separatePrice, settings)} strike />
                  <Row k={t.bundlePrice} v={formatMoney(result.price, settings)} bold />
                  <div className="my-2 h-px bg-border" />
                  <div className="rounded-[11px] bg-profit-soft px-[15px] py-[13px]">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[0.82rem] font-bold uppercase tracking-[0.06em] text-profit">
                        {t.yourProfit}
                      </span>
                      <span
                        key={result.profit}
                        className="value-flash tnum text-[1.55rem] font-extrabold leading-none tracking-tight text-profit"
                      >
                        {formatMoney(result.profit, settings)}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-[0.82rem] text-muted">
                      <span>{t.margin}</span>
                      <b key={marginPct.toFixed(1)} className="value-flash tnum text-profit">
                        {marginPct.toFixed(1)}%
                      </b>
                    </div>
                    <div className="mt-1.5 h-[7px] overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-profit transition-[width] duration-200"
                        style={{ width: `${Math.min(100, Math.max(0, marginPct))}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-sm">
                    <span className="text-muted">{t.customerSaves}</span>
                    <b key={result.saved} className="value-flash tnum text-profit">
                      {formatMoney(result.saved, settings)} ({Math.round(result.discountPct * 100)}%)
                    </b>
                  </div>
                  {result.capped && (
                    <p className="mt-2 text-[0.72rem] font-medium leading-snug text-warn">
                      ⚠ {t.discountCapped} ({Math.round(settings.minMargin * 100)}%).
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Row k={t.ifSeparately} v={formatMoney(result.separatePrice, settings)} strike />
                  <Row k={t.bundleDiscount} v={`−${Math.round(result.discountPct * 100)}%`} muted />
                  <div className="my-2 h-px bg-border" />
                  <div className="flex items-baseline justify-between rounded-[11px] bg-accent-soft px-[15px] py-[13px]">
                    <span className="text-[0.82rem] font-bold uppercase tracking-[0.06em] text-accent">
                      {t.bundlePrice}
                    </span>
                    <span
                      key={result.price}
                      className="value-flash tnum text-[1.55rem] font-extrabold leading-none tracking-tight text-accent"
                    >
                      {formatMoney(result.price, settings)}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-sm">
                    <span className="text-muted">{t.customerSaves}</span>
                    <b className="tnum text-profit">{formatMoney(result.saved, settings)}</b>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Client: finalize order */}
        {!isOwner && !empty && onCloseOrder && (
          <button
            type="button"
            onClick={onCloseOrder}
            className="mt-4 w-full rounded-[10px] bg-accent px-3 py-2.5 text-sm font-bold text-white transition hover:bg-accent-strong"
          >
            {t.closeOrder}
          </button>
        )}

        {/* Owner: editing an existing order */}
        {isOwner && editingNumber && (
          <div className="mt-4 flex flex-col gap-2 rounded-[11px] border border-accent bg-accent-soft p-3">
            <p className="text-[0.72rem] font-semibold text-accent">
              {t.editingOrder} {editingNumber}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onSaveChanges}
                className="w-full rounded-[9px] bg-accent px-3 py-2 text-sm font-bold text-white hover:bg-accent-strong disabled:opacity-60"
              >
                {t.saveChanges}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={onSaveAsNew}
                className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-sm font-medium text-ink hover:border-accent disabled:opacity-60"
              >
                {t.saveAsNew}
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="w-full rounded-[9px] px-3 py-1.5 text-xs font-medium text-muted hover:text-accent"
              >
                {t.cancelEdit}
              </button>
            </div>
          </div>
        )}

        {preset && customized && !editingNumber && (
          <button
            type="button"
            onClick={onReset}
            className="mt-3.5 w-full rounded-[9px] border border-border bg-surface-2 px-2 py-2 text-[0.8rem] font-medium text-muted hover:border-accent hover:text-accent"
          >
            ↺ {t.resetTo} {preset.name}
          </button>
        )}
        {!empty && isOwner && (
          <p className="mt-2.5 min-h-[1em] text-center text-[0.72rem] text-faint">
            {customized ? t.customised : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  muted,
  bold,
  strike,
}: {
  k: string;
  v: string;
  muted?: boolean;
  bold?: boolean;
  strike?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-[7px]">
      <span className="text-[0.86rem] text-muted">{k}</span>
      <span
        className={`tnum ${bold ? "text-[0.98rem] font-bold text-ink" : "font-semibold"} ${
          strike ? "text-faint line-through" : muted ? "text-muted" : "text-ink"
        }`}
      >
        {v}
      </span>
    </div>
  );
}
