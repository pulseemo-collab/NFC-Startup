"use client";

import type { PriceResult, Product, Settings } from "@/types";
import { formatMoney } from "@/lib/pricing";
import { t } from "@/lib/i18n";

// Owner-only. Never rendered in client presentation mode.
const STATUS_LABEL: Record<PriceResult["status"], string> = {
  recommended: "E rekomanduar",
  raised: "Ngritur për të mbrojtur marzhin",
  "not-viable": "Jo e leverdishme",
};

const STATUS_CLASS: Record<PriceResult["status"], string> = {
  recommended: "text-profit bg-profit-soft",
  raised: "text-accent bg-accent-soft",
  "not-viable": "text-warn bg-warn-soft",
};

export default function PricingExplanation({
  result,
  product,
  settings,
  overridden,
}: {
  result: PriceResult;
  product: Product;
  settings: Settings;
  /** True when the owner set their own price — the engine output is guidance only. */
  overridden?: boolean;
}) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${
            overridden ? "bg-surface-2 text-muted" : STATUS_CLASS[result.status]
          }`}
        >
          {overridden ? t.customPrice : STATUS_LABEL[result.status]}
        </span>
        <span className="text-[0.7rem] font-semibold text-muted">
          {t.recommendedPrice}: <b className="tnum text-ink">{formatMoney(result.price, settings)}</b>
        </span>
        <span className="text-[0.68rem] text-faint">
          Tregu {formatMoney(product.market.min, settings)}–{formatMoney(product.market.max, settings)}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-snug text-muted">{result.reason}</p>
      <p className="mt-1 text-[0.68rem] leading-snug text-faint">{product.note}</p>
    </div>
  );
}
