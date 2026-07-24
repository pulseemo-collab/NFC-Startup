"use client";

import type { Product, Settings } from "@/types";
import { recommendPrice, formatMoney, symbolFor } from "@/lib/pricing";
import { stepFor, toBase, toDisplay } from "@/lib/currency";
import { t } from "@/lib/i18n";
import PricingExplanation from "./PricingExplanation";

export default function ProductCard({
  product,
  cost,
  priceOverride,
  settings,
  included,
  variant,
  onCostChange,
  onPriceChange,
  onToggle,
}: {
  product: Product;
  cost: number;
  /** Owner's own price, or null when the recommendation is being used. */
  priceOverride: number | null;
  settings: Settings;
  included: boolean;
  variant: "owner" | "client";
  onCostChange: (id: string, value: number) => void;
  onPriceChange: (id: string, value: number | null) => void;
  onToggle: (id: string) => void;
}) {
  const result = recommendPrice(product, cost, settings);
  const symbol = symbolFor(settings.currency);
  const isOwner = variant === "owner";

  // Everything below the price line is derived from the price actually charged.
  const price = priceOverride ?? result.price;
  const overridden = priceOverride !== null;
  const profit = price - cost;
  const margin = price > 0 ? profit / price : 0;
  const notViable = overridden ? margin < settings.minMargin : result.status === "not-viable";

  return (
    <div
      className={`flex flex-col rounded-[14px] border bg-surface p-4 shadow-card transition ${
        included ? "border-accent" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold leading-tight">{product.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-muted">
              {product.category}
            </span>
            {isOwner && (
              <span
                className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide ${
                  product.tag === "green" ? "bg-profit-soft text-profit" : "bg-warn-soft text-warn"
                }`}
              >
                {product.tag === "green" ? t.core : t.addon}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(product.id)}
          aria-pressed={included}
          className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
            included
              ? "border-accent bg-accent text-white"
              : "border-border bg-surface text-muted hover:border-accent hover:text-accent"
          }`}
        >
          {included ? `${t.included} ✓` : t.add}
        </button>
      </div>

      <p className="mt-2 text-xs leading-snug text-muted">{product.descriptionSq}</p>

      {isOwner ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-[0.74rem] font-semibold uppercase tracking-wide text-muted">
              {t.myCost}
              <span className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-bg px-2 py-1 focus-within:border-accent">
                <span className="text-sm text-muted">{symbol}</span>
                {/* Costs are stored in the base currency; the owner types in
                    whichever currency is selected, so convert both ways. */}
                <input
                  type="number"
                  min={0}
                  step={stepFor(settings.currency)}
                  value={toDisplay(Number.isFinite(cost) ? cost : 0, settings.currency)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    const safe = Number.isNaN(v) || v < 0 ? 0 : v;
                    onCostChange(product.id, toBase(safe, settings.currency));
                  }}
                  aria-label={`${t.myCost} — ${product.name}`}
                  className="tnum w-16 border-0 bg-transparent p-0 text-right text-sm font-semibold text-ink outline-none"
                />
              </span>
            </label>

            {/* Owner's own price — this is what every calculation uses. */}
            <label className="flex items-center gap-2 text-[0.74rem] font-bold uppercase tracking-wide text-accent">
              {t.myPrice}
              <span
                className={`inline-flex items-center gap-0.5 rounded-lg border bg-bg px-2 py-1 focus-within:border-accent ${
                  overridden ? "border-accent" : "border-border"
                }`}
              >
                <span className="text-sm text-muted">{symbol}</span>
                <input
                  type="number"
                  min={0}
                  step={stepFor(settings.currency)}
                  value={toDisplay(price, settings.currency)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isNaN(v) || v <= 0) onPriceChange(product.id, null);
                    else onPriceChange(product.id, toBase(v, settings.currency));
                  }}
                  aria-label={`${t.myPrice} — ${product.name}`}
                  className={`tnum w-16 border-0 bg-transparent p-0 text-right text-[0.98rem] font-bold outline-none ${
                    notViable ? "text-warn" : "text-accent"
                  }`}
                />
              </span>
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">
              {t.profit}{" "}
              <b className={`tnum ${notViable ? "text-warn" : "text-profit"}`}>{formatMoney(profit, settings)}</b>
            </span>
            <span
              className={`tnum rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${
                notViable ? "bg-warn-soft text-warn" : "bg-profit-soft text-profit"
              }`}
            >
              {Math.round(margin * 100)}% {t.margin.toLowerCase()}
            </span>
            {overridden && (
              <button
                type="button"
                onClick={() => onPriceChange(product.id, null)}
                className="rounded-full border border-border px-2 py-0.5 text-[0.68rem] font-medium text-muted hover:border-accent hover:text-accent"
              >
                ↺ {t.useRecommended}
              </button>
            )}
          </div>

          <PricingExplanation result={result} product={product} settings={settings} overridden={overridden} />
        </>
      ) : (
        // CLIENT — only the final selling price. Never the recommendation.
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[0.74rem] font-bold uppercase tracking-wide text-accent">{t.sellAt}</span>
          <span className="tnum text-[1.05rem] font-bold text-accent">{formatMoney(price, settings)}</span>
        </div>
      )}
    </div>
  );
}
