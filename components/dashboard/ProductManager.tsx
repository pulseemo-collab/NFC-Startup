"use client";

// Advanced product management (Part 4). Search / sort / filter, 3-state status
// (active / draft / archived), duplicate, archive & restore, bulk actions, a
// percentage bulk price update, and drag-and-drop manual ordering. The pricing
// engine is untouched — this only manages the catalog rows it reads from.

import { useMemo, useState } from "react";
import type { Settings } from "@/types";
import type { OwnerProduct, OwnerProductPatch, ProductStatus } from "@/lib/data/catalog-types";
import { formatAmount, toBase, symbolFor } from "@/lib/currency";
import { t } from "@/lib/i18n";
import ProductEditDrawer, { StatusBadge } from "@/components/dashboard/ProductEditDrawer";

type SortKey = "manual" | "name" | "priceDesc" | "profitDesc";

export type ProductManagerHandlers = {
  onCreate: (patch: OwnerProductPatch & { slug: string; name: string }) => Promise<boolean>;
  onUpdate: (slug: string, patch: OwnerProductPatch) => Promise<boolean>;
  onDuplicate: (slug: string) => Promise<boolean>;
  onDelete: (slug: string) => Promise<boolean>;
  onReorder: (slugs: string[]) => Promise<boolean>;
  onBulkUpdate: (slugs: string[], patch: OwnerProductPatch) => Promise<boolean>;
  onBulkDelete: (slugs: string[]) => Promise<boolean>;
};

export default function ProductManager({
  products,
  settings,
  handlers,
  initialQuery = "",
  initialEditSlug = null,
}: {
  products: OwnerProduct[];
  settings: Settings;
  handlers: ProductManagerHandlers;
  initialQuery?: string;
  initialEditSlug?: string | null;
}) {
  const cur = settings.currency;
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<ProductStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("manual");
  const [minPrice, setMinPrice] = useState("");
  const [minProfit, setMinProfit] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<{ open: boolean; product: OwnerProduct | null }>(() => {
    const p = initialEditSlug ? products.find((x) => x.slug === initialEditSlug) ?? null : null;
    return p ? { open: true, product: p } : { open: false, product: null };
  });
  const [pricePct, setPricePct] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragSlug, setDragSlug] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products]
  );

  const filtersActive = query.trim() !== "" || category !== "all" || status !== "all" || minPrice !== "" || minProfit !== "";
  const canDrag = sort === "manual" && !filtersActive;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const minP = minPrice ? toBase(Number(minPrice), cur) : null;
    const minPr = minProfit ? toBase(Number(minProfit), cur) : null;
    const list = products.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (category !== "all" && p.category !== category) return false;
      if (q && !(p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)))
        return false;
      if (minP !== null && p.sellPriceEur < minP) return false;
      if (minPr !== null && p.sellPriceEur - p.supplierCostEur < minPr) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "priceDesc") sorted.sort((a, b) => b.sellPriceEur - a.sellPriceEur);
    else if (sort === "profitDesc")
      sorted.sort((a, b) => b.sellPriceEur - b.supplierCostEur - (a.sellPriceEur - a.supplierCostEur));
    else sorted.sort((a, b) => a.sortOrder - b.sortOrder);
    return sorted;
  }, [products, query, category, status, sort, minPrice, minProfit, cur]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.slug));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.slug)));
  const toggle = (slug: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });
  const clearSel = () => setSelected(new Set());
  const selSlugs = [...selected];

  // ---- bulk actions ----
  const bulkStatus = async (st: ProductStatus) => {
    setBusy(true);
    await handlers.onBulkUpdate(selSlugs, { status: st });
    setBusy(false);
    clearSel();
  };
  const bulkDelete = async () => {
    if (!window.confirm(t.pmConfirmBulkDelete.replace("{n}", String(selSlugs.length)))) return;
    setBusy(true);
    await handlers.onBulkDelete(selSlugs);
    setBusy(false);
    clearSel();
  };
  const bulkPrice = async () => {
    const pct = Number(pricePct);
    if (!Number.isFinite(pct) || pct === 0) return;
    setBusy(true);
    // Percentage change differs per product, so apply per row (keeps money in EUR).
    for (const slug of selSlugs) {
      const p = products.find((x) => x.slug === slug);
      if (!p) continue;
      const next = Math.max(0, Math.round(p.sellPriceEur * (1 + pct / 100) * 100) / 100);
      await handlers.onUpdate(slug, { sellPriceEur: next });
    }
    setBusy(false);
    setPricePct("");
    clearSel();
  };

  // ---- row actions ----
  const duplicate = (slug: string) => handlers.onDuplicate(slug);
  const del = (slug: string) => {
    if (window.confirm(t.deleteConfirm)) handlers.onDelete(slug);
  };
  const setStatusOne = (slug: string, st: ProductStatus) => handlers.onUpdate(slug, { status: st });

  // ---- drag & drop (manual order only) ----
  const onDrop = async (target: string) => {
    if (!dragSlug || dragSlug === target) return setDragSlug(null);
    const order = rows.map((r) => r.slug);
    const from = order.indexOf(dragSlug);
    const to = order.indexOf(target);
    if (from < 0 || to < 0) return setDragSlug(null);
    order.splice(to, 0, order.splice(from, 1)[0]);
    setDragSlug(null);
    await handlers.onReorder(order);
  };

  const submitDrawer = async (
    slug: string | null,
    patch: OwnerProductPatch & { slug?: string; name?: string }
  ): Promise<boolean> => {
    if (slug === null) {
      const { slug: s, name, ...rest } = patch;
      return handlers.onCreate({ ...rest, slug: s ?? "", name: name ?? "" });
    }
    return handlers.onUpdate(slug, patch);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-ink">{t.pmTitle}</h2>
        <button
          type="button"
          onClick={() => setDrawer({ open: true, product: null })}
          className="rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          + {t.pmNew}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          className="min-w-[160px] flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProductStatus | "all")}
          className="rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="all">{t.pmStatusAll}</option>
          <option value="active">Aktiv</option>
          <option value="draft">Draft</option>
          <option value="archived">Arkivuar</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="all">{t.pmAllCategories}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="manual">{t.pmSortManual}</option>
          <option value="name">{t.pmSortName}</option>
          <option value="priceDesc">{t.pmSortPriceDesc}</option>
          <option value="profitDesc">{t.pmSortProfitDesc}</option>
        </select>
        <input
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          inputMode="decimal"
          placeholder={`${t.pmMinPrice} (${symbolFor(cur)})`}
          className="w-32 rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
        />
        <input
          value={minProfit}
          onChange={(e) => setMinProfit(e.target.value)}
          inputMode="decimal"
          placeholder={`${t.pmMinProfit} (${symbolFor(cur)})`}
          className="w-32 rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
        />
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2">
          <span className="text-sm font-semibold text-accent">
            {t.pmSelected.replace("{n}", String(selected.size))}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <BulkBtn onClick={() => bulkStatus("active")} disabled={busy}>{t.pmActivate}</BulkBtn>
            <BulkBtn onClick={() => bulkStatus("archived")} disabled={busy}>{t.pmArchive}</BulkBtn>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-bg px-1.5 py-1">
              <input
                value={pricePct}
                onChange={(e) => setPricePct(e.target.value)}
                inputMode="decimal"
                placeholder="%"
                className="w-14 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
              />
              <button
                type="button"
                onClick={bulkPrice}
                disabled={busy}
                className="text-xs font-semibold text-accent hover:text-accent-strong disabled:opacity-50"
              >
                {t.pmPriceUpdate}
              </button>
            </div>
            <BulkBtn onClick={bulkDelete} disabled={busy} danger>{t.delete}</BulkBtn>
            <button type="button" onClick={clearSel} className="text-xs text-muted hover:text-ink">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <p className="rounded-[14px] border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {t.pmEmpty}
        </p>
      ) : (
        <>
        <div className="hidden overflow-x-auto rounded-[14px] border border-border bg-surface shadow-card md:block">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-[0.7rem] uppercase tracking-wide text-muted">
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Zgjidh të gjitha" />
                </th>
                {canDrag && <th className="w-6 px-1" />}
                <th className="px-3 py-2.5 font-semibold">{t.pmName}</th>
                <th className="px-3 py-2.5 font-semibold">{t.status}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t.myPrice}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t.myCost}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t.profit}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t.pmActions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const profit = p.sellPriceEur - p.supplierCostEur;
                const margin = p.sellPriceEur > 0 ? profit / p.sellPriceEur : 0;
                return (
                  <tr
                    key={p.slug}
                    draggable={canDrag}
                    onDragStart={() => canDrag && setDragSlug(p.slug)}
                    onDragOver={(e) => canDrag && e.preventDefault()}
                    onDrop={() => canDrag && onDrop(p.slug)}
                    className={`border-t border-border hover:bg-surface-2 ${
                      dragSlug === p.slug ? "opacity-40" : ""
                    } ${p.status === "archived" ? "opacity-60" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(p.slug)}
                        onChange={() => toggle(p.slug)}
                        aria-label={p.name}
                      />
                    </td>
                    {canDrag && (
                      <td className="cursor-grab px-1 text-center text-faint" title={t.pmDrag}>
                        ⠿
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => setDrawer({ open: true, product: p })} className="text-left">
                        <span className="block font-semibold text-ink hover:text-accent">{p.name}</span>
                        <span className="block text-[0.72rem] text-faint">{p.category || "—"}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right tnum font-semibold text-ink">{formatAmount(p.sellPriceEur, cur)}</td>
                    <td className="px-3 py-2.5 text-right tnum text-muted">{formatAmount(p.supplierCostEur, cur)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="tnum text-profit">{formatAmount(profit, cur)}</span>
                      <span className="ml-1 text-[0.7rem] text-faint">{Math.round(margin * 100)}%</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <IconBtn title={t.pmEdit} onClick={() => setDrawer({ open: true, product: p })}>✎</IconBtn>
                        <IconBtn title={t.duplicate} onClick={() => duplicate(p.slug)}>⧉</IconBtn>
                        {p.status === "archived" ? (
                          <IconBtn title={t.pmRestore} onClick={() => setStatusOne(p.slug, "active")}>↺</IconBtn>
                        ) : (
                          <IconBtn title={t.pmArchive} onClick={() => setStatusOne(p.slug, "archived")}>🗄</IconBtn>
                        )}
                        <IconBtn title={t.delete} danger onClick={() => del(p.slug)}>🗑</IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile card list — preserves selection, status, financials + actions. */}
        <ul className="space-y-2 md:hidden">
          {rows.map((p) => {
            const profit = p.sellPriceEur - p.supplierCostEur;
            const margin = p.sellPriceEur > 0 ? profit / p.sellPriceEur : 0;
            return (
              <li
                key={p.slug}
                className={`rounded-xl border border-border bg-surface p-3 ${p.status === "archived" ? "opacity-70" : ""}`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(p.slug)}
                    onChange={() => toggle(p.slug)}
                    aria-label={p.name}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => setDrawer({ open: true, product: p })} className="min-w-0 text-left">
                        <span className="block truncate font-semibold text-ink">{p.name}</span>
                        <span className="block text-[0.72rem] text-faint">{p.category || "—"}</span>
                      </button>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-bg px-2 py-1.5 text-center text-xs">
                      <div>
                        <span className="block text-[0.6rem] uppercase tracking-wide text-faint">{t.myPrice}</span>
                        <span className="tnum font-semibold text-ink">{formatAmount(p.sellPriceEur, cur)}</span>
                      </div>
                      <div>
                        <span className="block text-[0.6rem] uppercase tracking-wide text-faint">{t.myCost}</span>
                        <span className="tnum text-muted">{formatAmount(p.supplierCostEur, cur)}</span>
                      </div>
                      <div>
                        <span className="block text-[0.6rem] uppercase tracking-wide text-faint">{t.profit}</span>
                        <span className="tnum text-profit">
                          {formatAmount(profit, cur)}
                          <span className="text-faint"> · {Math.round(margin * 100)}%</span>
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end gap-1.5">
                      <IconBtn title={t.pmEdit} onClick={() => setDrawer({ open: true, product: p })}>✎</IconBtn>
                      <IconBtn title={t.duplicate} onClick={() => duplicate(p.slug)}>⧉</IconBtn>
                      {p.status === "archived" ? (
                        <IconBtn title={t.pmRestore} onClick={() => setStatusOne(p.slug, "active")}>↺</IconBtn>
                      ) : (
                        <IconBtn title={t.pmArchive} onClick={() => setStatusOne(p.slug, "archived")}>🗄</IconBtn>
                      )}
                      <IconBtn title={t.delete} danger onClick={() => del(p.slug)}>🗑</IconBtn>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        </>
      )}

      {drawer.open && (
        <ProductEditDrawer
          product={drawer.product}
          settings={settings}
          onClose={() => setDrawer({ open: false, product: null })}
          onSubmit={submitDrawer}
        />
      )}
    </section>
  );
}

function BulkBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
        danger
          ? "border-warn text-warn hover:bg-warn-soft"
          : "border-border bg-surface text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`grid h-7 w-7 place-items-center rounded-md border border-border bg-surface text-xs transition hover:border-accent ${
        danger ? "hover:text-warn" : "hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}
