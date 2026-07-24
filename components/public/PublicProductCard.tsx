"use client";

// PUBLIC product card. Visually identical to the client variant of ProductCard,
// but consumes ONLY PublicProduct (no cost/margin/rules) and imports nothing
// that carries private data.

import { formatAmount } from "@/lib/currency";
import { t } from "@/lib/i18n";
import type { PublicProduct } from "@/lib/data/catalog-types";

export default function PublicProductCard({
  product,
  currency,
  included,
  onToggle,
}: {
  product: PublicProduct;
  currency: string;
  included: boolean;
  onToggle: (slug: string) => void;
}) {
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
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(product.slug)}
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

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[0.74rem] font-bold uppercase tracking-wide text-accent">{t.sellAt}</span>
        <span className="tnum text-[1.05rem] font-bold text-accent">
          {formatAmount(product.sellPriceEur, currency)}
        </span>
      </div>
    </div>
  );
}
