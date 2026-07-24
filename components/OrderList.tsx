"use client";

import { useMemo, useRef, useState } from "react";
import type { OrderSnapshot, OrderStatus } from "@/types";
import { formatAmount } from "@/lib/pricing";
import { t, ORDER_STATUS_LABEL, ORDER_STATUSES } from "@/lib/i18n";

const STATUS_PILL: Record<OrderStatus, string> = {
  new: "bg-accent-soft text-accent",
  ready: "bg-warn-soft text-warn",
  delivered: "bg-profit-soft text-profit",
};

export default function OrderList({
  orders,
  onOpen,
  onExport,
  onImportFile,
}: {
  orders: OrderSnapshot[];
  onOpen: (id: string) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => (statusFilter === "all" ? true : o.status === statusFilter))
      .filter((o) =>
        q === ""
          ? true
          : o.number.toLowerCase().includes(q) ||
            o.businessName.toLowerCase().includes(q) ||
            (o.customerName ?? "").toLowerCase().includes(q)
      )
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [orders, query, statusFilter]);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">{t.orders}</h2>
        <div className="flex gap-2">
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
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-[14px] border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {t.noOrders}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-border bg-surface shadow-card">
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
              {filtered.map((o) => (
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
