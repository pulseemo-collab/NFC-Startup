"use client";

// PUBLIC bundle builder. Visually identical to the client variant of
// BundleBuilder, but prices come from estimatePublicBundle (public prices +
// customer-facing discount only). No cost / profit / margin anywhere.

import { useMemo } from "react";
import { formatAmount } from "@/lib/currency";
import { t } from "@/lib/i18n";
import type { BundleDef } from "@/types";
import type { PublicProduct } from "@/lib/data/catalog-types";
import { estimatePublicBundle } from "@/lib/public-pricing";

function sameKit(a: Record<string, number>, b: Record<string, number>): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    if ((a[id] ?? 0) !== (b[id] ?? 0)) return false;
  }
  return true;
}

export default function PublicBundleBuilder({
  products,
  selection,
  presets,
  activePreset,
  currency,
  bundleDiscount,
  onQty,
  onReset,
  onCloseOrder,
}: {
  products: PublicProduct[];
  selection: Record<string, number>;
  presets: BundleDef[];
  activePreset: string | null;
  currency: string;
  bundleDiscount: number;
  onQty: (slug: string, qty: number) => void;
  onReset: () => void;
  onCloseOrder: () => void;
}) {
  const result = useMemo(
    () => estimatePublicBundle(selection, products, bundleDiscount),
    [selection, products, bundleDiscount]
  );

  const preset = presets.find((p) => p.id === activePreset) ?? null;
  const customized = preset ? !sameKit(preset.kit, selection) : true;
  const empty = result.lines.length === 0;

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
                <li key={line.product.slug} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{line.product.name}</div>
                    <div className="tnum text-[0.7rem] text-faint">
                      {formatAmount(line.unitPrice, currency)} {t.eachSuffix}
                    </div>
                  </div>
                  <div className="flex items-center overflow-hidden rounded-[9px] border border-border bg-bg">
                    <button
                      type="button"
                      aria-label={`− ${line.product.name}`}
                      onClick={() => onQty(line.product.slug, line.qty - 1)}
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
                      onClick={() => onQty(line.product.slug, line.qty + 1)}
                      className="grid h-8 w-[30px] place-items-center text-lg text-ink hover:bg-surface-2 hover:text-accent"
                    >
                      +
                    </button>
                  </div>
                  <div className="tnum w-16 text-right text-sm font-semibold text-profit">
                    {formatAmount(line.unitPrice * line.qty, currency)}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3.5 flex flex-col">
              <Row k={t.ifSeparately} v={formatAmount(result.separatePrice, currency)} strike />
              <Row k={t.bundleDiscount} v={`−${Math.round(result.discountPct * 100)}%`} muted />
              <div className="my-2 h-px bg-border" />
              <div className="flex items-baseline justify-between rounded-[11px] bg-accent-soft px-[15px] py-[13px]">
                <span className="text-[0.82rem] font-bold uppercase tracking-[0.06em] text-accent">
                  {t.bundlePrice}
                </span>
                <span className="tnum text-[1.55rem] font-extrabold leading-none tracking-tight text-accent">
                  {formatAmount(result.finalPrice, currency)}
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-sm">
                <span className="text-muted">{t.customerSaves}</span>
                <b className="tnum text-profit">{formatAmount(result.saved, currency)}</b>
              </div>
            </div>
          </>
        )}

        {!empty && (
          <button
            type="button"
            onClick={onCloseOrder}
            className="mt-4 w-full rounded-[10px] bg-accent px-3 py-2.5 text-sm font-bold text-white transition hover:bg-accent-strong"
          >
            {t.closeOrder}
          </button>
        )}

        {preset && customized && (
          <button
            type="button"
            onClick={onReset}
            className="mt-3.5 w-full rounded-[9px] border border-border bg-surface-2 px-2 py-2 text-[0.8rem] font-medium text-muted hover:border-accent hover:text-accent"
          >
            ↺ {t.resetTo} {preset.name}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, muted, strike }: { k: string; v: string; muted?: boolean; strike?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-[7px]">
      <span className="text-[0.86rem] text-muted">{k}</span>
      <span
        className={`tnum font-semibold ${strike ? "text-faint line-through" : muted ? "text-muted" : "text-ink"}`}
      >
        {v}
      </span>
    </div>
  );
}
