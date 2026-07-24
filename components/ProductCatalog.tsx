"use client";

import type { Product, Settings } from "@/types";
import { overrideFor, type PriceOverrides } from "@/lib/pricing";
import { t } from "@/lib/i18n";
import ProductCard from "./ProductCard";

export default function ProductCatalog({
  products,
  costs,
  prices,
  settings,
  selection,
  variant,
  onCostChange,
  onPriceChange,
  onToggle,
}: {
  products: Product[];
  costs: Record<string, number>;
  prices: PriceOverrides;
  settings: Settings;
  selection: Record<string, number>;
  variant: "owner" | "client";
  onCostChange: (id: string, value: number) => void;
  onPriceChange: (id: string, value: number | null) => void;
  onToggle: (id: string) => void;
}) {
  const isOwner = variant === "owner";
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight">
        {isOwner ? t.catalogTitle : t.catalogTitleClient}
      </h2>
      <p className="mb-4 mt-0.5 text-sm text-muted">
        {isOwner ? t.catalogSubtitleOwner : t.catalogSubtitleClient}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            cost={costs[p.id] ?? p.defaultCost}
            priceOverride={overrideFor(prices, p.id)}
            settings={settings}
            included={!!selection[p.id]}
            variant={variant}
            onCostChange={onCostChange}
            onPriceChange={onPriceChange}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}
