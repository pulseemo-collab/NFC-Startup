"use client";

// PUBLIC catalog. Mirrors the client variant of ProductCatalog.

import { t } from "@/lib/i18n";
import type { PublicProduct } from "@/lib/data/catalog-types";
import PublicProductCard from "./PublicProductCard";

export default function PublicProductCatalog({
  products,
  currency,
  selection,
  onToggle,
}: {
  products: PublicProduct[];
  currency: string;
  selection: Record<string, number>;
  onToggle: (slug: string) => void;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight">{t.catalogTitleClient}</h2>
      <p className="mb-4 mt-0.5 text-sm text-muted">{t.catalogSubtitleClient}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {products.map((p) => (
          <PublicProductCard
            key={p.slug}
            product={p}
            currency={currency}
            included={!!selection[p.slug]}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}
