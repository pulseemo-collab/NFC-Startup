"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OrderSnapshot, OrderStatus } from "@/types";
import { formatAmount } from "@/lib/pricing";
import { t, ORDER_STATUS_LABEL, ORDER_STATUSES } from "@/lib/i18n";
import { rangeFor, type PeriodKey } from "@/lib/analytics";
import { exportOrdersCsv } from "@/lib/export";

const STATUS_PILL: Record<OrderStatus, string> = {
  new: "bg-accent-soft text-accent",
  ready: "bg-warn-soft text-warn",
  delivered: "bg-profit-soft text-profit",
};

type DateScope = "all" | "today" | "7d" | "30d" | "thisMonth";
const DATE_SCOPES: { key: DateScope; label: string }[] = [
  { key: "all", label: "Të gjitha datat" },
  { key: "today", label: "Sot" },
  { key: "7d", label: "7 ditë" },
  { key: "30d", label: "30 ditë" },
  { key: "thisMonth", label: "Këtë muaj" },
];

function inScope(iso: string, scope: DateScope): boolean {
  if (scope === "all") return true;
  const r = rangeFor(scope as PeriodKey);
  const ts = new Date(iso).getTime();
  return ts >= r.start.getTime() && ts < r.end.getTime();
}

export default function OrderList({
  orders,
  onOpen,
  onExport,
  onImportFile,
  initialQuery = "",
}: {
  orders: OrderSnapshot[];
  onOpen: (id: string) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [dateScope, setDateScope] = useState<DateScope>("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => (statusFilter === "all" ? true : o.status === statusFilter))
      .filter((o) => inScope(o.createdAt, dateScope))
      .filter((o) =>
        q === ""
          ? true
          : o.number.toLowerCase().includes(q) ||
            o.businessName.toLowerCase().includes(q) ||
            (o.customerName ?? "").toLowerCase().includes(q) ||
            (o.phone ?? "").toLowerCase().includes(q)
      )
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [orders, query, statusFilter, dateScope]);

  const scopeLabel = DATE_SCOPES.find((s) => s.key === dateScope)?.label ?? "porosite";

  // Pagination (Part 12) — keeps the DOM small for large order histories.
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [query, statusFilter, dateScope]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">{t.orders}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exportOrdersCsv(filtered, scopeLabel.replace(/\s+/g, "-").toLowerCase())}
            disabled={filtered.length === 0}
            title={`${t.exportCsv} (${filtered.length})`}
            className="rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t.exportCsv}
          </button>
          <button
            type="button"
            onClick={onExport}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:border-accent hover:text-accent"
          >
            {t.exportData}
          </button>
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
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          className="min-w-[180px] flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "all")}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="all">{t.filterStatus}: {t.all}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={dateScope}
          onChange={(e) => setDateScope(e.target.value as DateScope)}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          {DATE_SCOPES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-[14px] border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {t.noOrders}
        </p>
      ) : (
        <>
        <div className="hidden overflow-x-auto rounded-[14px] border border-border bg-surface shadow-card md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-[0.7rem] uppercase tracking-wide text-muted">
                <Th>{t.orderNumber}</Th>
                <Th>{t.businessName}</Th>
                <Th>{t.date}</Th>
                <Th>{t.status}</Th>
                <Th right>{t.customerTotal}</Th>
                <Th right>{t.internalCost}</Th>
                <Th right>{t.profit}</Th>
                <Th right>{t.margin}</Th>
              </tr>
            </thead>
            <tbody>
              {paged.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => onOpen(o.id)}
                  className="cursor-pointer border-t border-border hover:bg-surface-2"
                >
                  <Td className="font-semibold text-accent">{o.number}</Td>
                  <Td>{o.businessName}</Td>
                  <Td className="text-muted">{new Date(o.createdAt).toLocaleDateString()}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${STATUS_PILL[o.status]}`}>
                      {ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </Td>
                  <Td right className="tnum font-semibold">{formatAmount(o.finalPrice, o.currency)}</Td>
                  <Td right className="tnum text-muted">{formatAmount(o.totalCost, o.currency)}</Td>
                  <Td right className="tnum text-profit">{formatAmount(o.profit, o.currency)}</Td>
                  <Td right className="tnum text-profit">{Math.round(o.margin * 100)}%</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile order cards */}
        <ul className="space-y-2 md:hidden">
          {paged.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onOpen(o.id)}
                className="w-full rounded-xl border border-border bg-surface p-3 text-left transition hover:border-accent/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-accent">{o.number}</span>
                    <span className="block truncate text-sm text-ink">{o.businessName}</span>
                    <span className="block text-[0.7rem] text-faint">{new Date(o.createdAt).toLocaleDateString("en-GB")}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block tnum font-semibold text-ink">{formatAmount(o.finalPrice, o.currency)}</span>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[0.66rem] font-semibold ${STATUS_PILL[o.status]}`}>
                      {ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[0.72rem]">
                  <span className="text-faint">{t.profit}</span>
                  <span className="tnum text-profit">
                    {formatAmount(o.profit, o.currency)}
                    <span className="text-faint"> · {Math.round(o.margin * 100)}%</span>
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
        </>
      )}

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-faint">
            {safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} / {filtered.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 font-medium text-muted hover:border-accent hover:text-accent disabled:opacity-40"
            >
              ←
            </button>
            <span className="tnum px-1 py-1.5 text-muted">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 font-medium text-muted hover:border-accent hover:text-accent disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2.5 font-semibold ${right ? "text-right" : ""}`}>{children}</th>;
}
function Td({
  children,
  right,
  className = "",
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return <td className={`px-3 py-2.5 ${right ? "text-right" : ""} ${className}`}>{children}</td>;
}
