"use client";

// Orders workspace — an operational workflow (UX only; no data/logic changes).
// Three status tabs (New / Ready / Delivered) with live counts, each showing only
// that status with its primary next-step action. Search spans ALL statuses; an
// "All" view stays available as a secondary option. Live status changes flow in
// from state, so an order moves between tabs without a refresh.

import { useEffect, useMemo, useRef, useState } from "react";
import type { OrderSnapshot, OrderStatus } from "@/types";
import { formatAmount } from "@/lib/pricing";
import { t, ORDER_STATUS_LABEL, NEXT_STATUS } from "@/lib/i18n";
import { rangeFor, type PeriodKey } from "@/lib/analytics";
import { exportOrdersCsv } from "@/lib/export";

const STATUS_PILL: Record<OrderStatus, string> = {
  new: "bg-accent-soft text-accent",
  ready: "bg-warn-soft text-warn",
  delivered: "bg-profit-soft text-profit",
};

type Tab = "new" | "ready" | "delivered" | "all";

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

/** The label of the button that advances an order to its next status. */
function nextActionLabel(s: OrderStatus): string | null {
  if (s === "new") return t.markReady;
  if (s === "ready") return t.markDelivered;
  return null;
}

export default function OrderList({
  orders,
  onOpen,
  onExport,
  onImportFile,
  onAdvance,
  initialQuery = "",
}: {
  orders: OrderSnapshot[];
  onOpen: (id: string) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onAdvance: (order: OrderSnapshot) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<Tab>("new");
  const [dateScope, setDateScope] = useState<DateScope>("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const searching = query.trim() !== "";

  // Date-scoped base set → counts (per status) and the tab/search result set.
  const base = useMemo(() => orders.filter((o) => inScope(o.createdAt, dateScope)), [orders, dateScope]);
  const counts = useMemo(
    () => ({
      new: base.filter((o) => o.status === "new").length,
      ready: base.filter((o) => o.status === "ready").length,
      delivered: base.filter((o) => o.status === "delivered").length,
    }),
    [base]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySearch = (o: OrderSnapshot) =>
      o.number.toLowerCase().includes(q) ||
      o.businessName.toLowerCase().includes(q) ||
      (o.customerName ?? "").toLowerCase().includes(q) ||
      (o.phone ?? "").toLowerCase().includes(q);
    const list = searching ? base.filter(bySearch) : tab === "all" ? base : base.filter((o) => o.status === tab);
    return list.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [base, searching, query, tab]);

  // Pagination — keeps the DOM small for large histories.
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [query, tab, dateScope]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const exportName = (searching ? "kerkim" : tab).toString();

  const emptyMessage = searching
    ? t.ordersSearchEmpty
    : tab === "new"
      ? t.emptyNew
      : tab === "ready"
        ? t.emptyReady
        : tab === "delivered"
          ? t.emptyDelivered
          : t.noOrders;

  // Selecting a tab clears an active search (returns to the workflow view).
  const selectTab = (next: Tab) => {
    setQuery("");
    setTab(next);
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">{t.orders}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exportOrdersCsv(filtered, exportName)}
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

      {/* Workflow tabs (horizontally scrollable on mobile). "All" is secondary. */}
      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label={t.orders}>
        <TabBtn active={!searching && tab === "new"} onClick={() => selectTab("new")} label={t.tabNew} count={counts.new} tone="new" />
        <TabBtn active={!searching && tab === "ready"} onClick={() => selectTab("ready")} label={ORDER_STATUS_LABEL.ready} count={counts.ready} tone="ready" />
        <TabBtn active={!searching && tab === "delivered"} onClick={() => selectTab("delivered")} label={ORDER_STATUS_LABEL.delivered} count={counts.delivered} tone="delivered" />
        <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
        <button
          type="button"
          onClick={() => selectTab("all")}
          className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[0.78rem] font-medium transition ${
            !searching && tab === "all" ? "text-accent underline underline-offset-4" : "text-faint hover:text-muted"
          }`}
        >
          {t.tabAll}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[180px] flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 pr-8 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t.clearSearch}
              title={t.clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-accent"
            >
              ✕
            </button>
          )}
        </div>
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

      {searching && filtered.length > 0 && (
        <p className="mb-2 text-[0.75rem] text-faint">{t.ordersSearchHint}</p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-[14px] border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-[14px] border border-border bg-surface shadow-card md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-surface-2 text-left text-[0.7rem] uppercase tracking-wide text-muted">
                  <Th>{t.orderNumber}</Th>
                  <Th>{t.businessName}</Th>
                  <Th>{t.date}</Th>
                  {(searching || tab === "all") && <Th>{t.status}</Th>}
                  <Th right>{t.customerTotal}</Th>
                  <Th right>{t.profit}</Th>
                  <Th right>{t.margin}</Th>
                  <Th right>{t.pmActions}</Th>
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
                    <Td className="text-muted">{new Date(o.createdAt).toLocaleDateString("en-GB")}</Td>
                    {(searching || tab === "all") && (
                      <Td>
                        <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${STATUS_PILL[o.status]}`}>
                          {ORDER_STATUS_LABEL[o.status]}
                        </span>
                      </Td>
                    )}
                    <Td right className="tnum font-semibold">{formatAmount(o.finalPrice, o.currency)}</Td>
                    <Td right className="tnum text-profit">{formatAmount(o.profit, o.currency)}</Td>
                    <Td right className="tnum text-profit">{Math.round(o.margin * 100)}%</Td>
                    <Td right>
                      {NEXT_STATUS[o.status] && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAdvance(o);
                          }}
                          className="whitespace-nowrap rounded-lg border border-accent px-2.5 py-1 text-[0.72rem] font-semibold text-accent transition hover:bg-accent hover:text-white"
                        >
                          {nextActionLabel(o.status)}
                        </button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile order cards */}
          <ul className="space-y-2 md:hidden">
            {paged.map((o) => (
              <li
                key={o.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(o.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(o.id))}
                className="block w-full cursor-pointer rounded-xl border border-border bg-surface p-3 text-left transition hover:border-accent/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-accent">{o.number}</span>
                    <span className="block truncate text-sm text-ink">{o.businessName}</span>
                    <span className="block text-[0.7rem] text-faint">{new Date(o.createdAt).toLocaleDateString("en-GB")}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block tnum font-semibold text-ink">{formatAmount(o.finalPrice, o.currency)}</span>
                    {(searching || tab === "all") && (
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[0.66rem] font-semibold ${STATUS_PILL[o.status]}`}>
                        {ORDER_STATUS_LABEL[o.status]}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[0.72rem]">
                  <span className="text-faint">{t.profit}</span>
                  <span className="tnum text-profit">
                    {formatAmount(o.profit, o.currency)}
                    <span className="text-faint"> · {Math.round(o.margin * 100)}%</span>
                  </span>
                </div>
                {NEXT_STATUS[o.status] && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdvance(o);
                    }}
                    className="mt-2 w-full rounded-lg border border-accent px-3 py-1.5 text-[0.78rem] font-semibold text-accent transition hover:bg-accent hover:text-white"
                  >
                    {nextActionLabel(o.status)}
                  </button>
                )}
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

function TabBtn({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: OrderStatus;
}) {
  const badge = active
    ? "bg-white/25 text-white"
    : tone === "new"
      ? "bg-accent-soft text-accent"
      : tone === "ready"
        ? "bg-warn-soft text-warn"
        : "bg-profit-soft text-profit";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "border-accent bg-accent text-white shadow-sm"
          : "border-border bg-surface text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {label}
      <span className={`tnum rounded-full px-1.5 py-0.5 text-[0.66rem] font-bold ${badge}`}>{count}</span>
    </button>
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
