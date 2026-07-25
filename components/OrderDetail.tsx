"use client";

import { useEffect, useState } from "react";
import type { OrderSnapshot, OrderStatus } from "@/types";
import { formatAmount } from "@/lib/pricing";
import { t, ORDER_STATUS_LABEL, ORDER_STATUSES, NEXT_STATUS } from "@/lib/i18n";

export default function OrderDetail({
  order,
  onBack,
  onUpdate,
  onDuplicate,
  onDelete,
  onOpenClientView,
  onEdit,
}: {
  order: OrderSnapshot;
  onBack: () => void;
  onUpdate: (next: OrderSnapshot) => void;
  onDuplicate: (order: OrderSnapshot) => void;
  onDelete: (order: OrderSnapshot) => void;
  onOpenClientView: (order: OrderSnapshot) => void;
  onEdit: (order: OrderSnapshot) => void;
}) {
  const [ownerNotes, setOwnerNotes] = useState(order.ownerNotes ?? "");
  const [customerNotes, setCustomerNotes] = useState(order.customerNotes ?? "");

  // Reset local editable fields only when a different order is opened.
  useEffect(() => {
    setOwnerNotes(order.ownerNotes ?? "");
    setCustomerNotes(order.customerNotes ?? "");
  }, [order.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<OrderSnapshot>) => onUpdate({ ...order, ...p, updatedAt: new Date().toISOString() });
  const cur = order.currency;
  const nextStatus = NEXT_STATUS[order.status];
  // At the last step this resolves to the label that was already showing, so the
  // button fades out with its own text instead of blanking first.
  const actionLabel = ORDER_STATUS_LABEL[nextStatus ?? order.status];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-accent">{order.number}</h2>
            <span className="text-sm text-muted">· {order.businessName}</span>
          </div>
          <p className="text-xs text-faint">{new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => onEdit(order)}>{t.editOrder}</Btn>
          <Btn onClick={() => onOpenClientView(order)} accent>
            {t.openClientView}
          </Btn>
          <Btn onClick={() => onDuplicate(order)}>{t.duplicate}</Btn>
          <Btn
            onClick={() => {
              if (window.confirm(t.deleteConfirm)) onDelete(order);
            }}
            danger
          >
            {t.delete}
          </Btn>
        </div>
      </div>

      <StatusTracker status={order.status} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Timeline order={order} />

      {/* customer summary */}
      <Card title={t.customerInfo}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Info k={t.businessName} v={order.businessName} />
          <Info k={t.customerName} v={order.customerName ?? "—"} />
          <Info k={t.phone} v={order.phone ?? "—"} />
          <Info k={t.address} v={order.address ?? "—"} />
        </dl>
      </Card>
      </div>

      {/* products */}
      <Card title={t.products}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2">{t.products}</th>
                <th className="py-1.5 px-2 text-center">{t.quantity}</th>
                <th className="py-1.5 px-2 text-right">{t.unitPrice}</th>
                <th className="py-1.5 px-2 text-right">{t.myCost}</th>
                <th className="py-1.5 px-2 text-right">{t.profit}</th>
                <th className="py-1.5 pl-2 text-right">{t.customerTotal}</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.productId} className="border-t border-border">
                  <td className="py-2 pr-2">{l.name}</td>
                  <td className="tnum py-2 px-2 text-center">{l.qty}</td>
                  <td className="tnum py-2 px-2 text-right">{formatAmount(l.unitPrice, cur)}</td>
                  <td className="tnum py-2 px-2 text-right text-muted">{formatAmount(l.unitCost, cur)}</td>
                  <td className="tnum py-2 px-2 text-right text-profit">
                    {formatAmount((l.unitPrice - l.unitCost) * l.qty, cur)}
                  </td>
                  <td className="tnum py-2 pl-2 text-right font-semibold">
                    {formatAmount(l.unitPrice * l.qty, cur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* internal financials */}
      <Card title={t.privateInfo} tone="private">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          <Info k={t.ifSeparately} v={formatAmount(order.separatePrice, cur)} />
          <Info k={t.bundleDiscount} v={`−${Math.round(order.bundleDiscountPct * 100)}%`} />
          <Info k={t.bundlePrice} v={formatAmount(order.finalPrice, cur)} strong />
          <Info k={t.internalCost} v={formatAmount(order.totalCost, cur)} />
          <Info k={t.profit} v={formatAmount(order.profit, cur)} profit />
          <Info k={t.margin} v={`${Math.round(order.margin * 100)}%`} profit />
          <Info k={t.customerSaves} v={formatAmount(order.saved, cur)} />
        </dl>
        <ProfitBar revenue={order.finalPrice} cost={order.totalCost} profit={order.profit} currency={cur} />
      </Card>

      {/* notes */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card title={t.customerNotesLabel}>
          <textarea
            value={customerNotes}
            onChange={(e) => setCustomerNotes(e.target.value)}
            onBlur={() => patch({ customerNotes: customerNotes.trim() || undefined })}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Card>
        <Card title={t.ownerNotes} tone="private">
          <textarea
            value={ownerNotes}
            onChange={(e) => setOwnerNotes(e.target.value)}
            onBlur={() => patch({ ownerNotes: ownerNotes.trim() || undefined })}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted hover:border-accent hover:text-accent"
        >
          ← {t.orders}
        </button>
        {/* Keeps its slot and fades out at the last step, so the footer never jumps. */}
        <button
          type="button"
          data-hidden={!nextStatus}
          aria-hidden={!nextStatus}
          disabled={!nextStatus}
          onClick={() => nextStatus && patch({ status: nextStatus })}
          className="status-fade rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-bold text-white hover:bg-accent-strong"
        >
          <span key={actionLabel} className="label-in inline-block">
            {actionLabel} →
          </span>
        </button>
      </div>
    </section>
  );
}

/** Horizontal three-step fulfilment tracker: done · current · upcoming. */
function StatusTracker({ status }: { status: OrderStatus }) {
  const current = ORDER_STATUSES.indexOf(status);
  const last = ORDER_STATUSES.length - 1;

  return (
    <div className="status-tracker rounded-[14px] border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 text-[0.72rem] font-bold uppercase tracking-wide text-accent">{t.status}</div>
      <ol className="flex items-start">
        {ORDER_STATUSES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const circle = done
            ? "border-profit bg-profit-soft text-profit"
            : active
              ? "border-accent bg-accent text-white"
              : "border-border bg-surface-2 text-faint";
          const label = done ? "text-profit" : active ? "font-bold text-accent" : "text-faint";
          return (
            <li key={s} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <Connector filled={i <= current} invisible={i === 0} />
                {/* step-pop is only present on the active step, so advancing replays it. */}
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[0.72rem] font-bold transition-colors duration-200 ease-out ${circle} ${
                    active ? "step-pop" : ""
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <Connector filled={i < current} invisible={i === last} />
              </div>
              <span
                className={`mt-1.5 px-1 text-center text-[0.68rem] leading-tight transition-colors duration-200 ease-out sm:text-[0.74rem] ${label}`}
              >
                {ORDER_STATUS_LABEL[s]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Connector({ filled, invisible }: { filled: boolean; invisible: boolean }) {
  return (
    <span aria-hidden className={`relative h-[2px] flex-1 rounded-full ${invisible ? "" : "bg-border"}`}>
      {/* Absolute so the width transition can never move anything around it. */}
      <span
        className={`absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-300 ease-out ${
          filled && !invisible ? "w-full" : "w-0"
        }`}
      />
    </span>
  );
}

/**
 * Vertical timeline (Part 8). Derived from the order's REAL data: `createdAt` for
 * creation and `updatedAt` for the step it currently sits on. Past/future steps
 * are shown without a fabricated timestamp — we don't invent history we don't store.
 */
function Timeline({ order }: { order: OrderSnapshot }) {
  const current = ORDER_STATUSES.indexOf(order.status);
  const steps = [
    { key: "new", label: t.tlCreated, at: order.createdAt },
    { key: "ready", label: ORDER_STATUS_LABEL.ready, at: current === 1 ? order.updatedAt : null },
    { key: "delivered", label: ORDER_STATUS_LABEL.delivered, at: current === 2 ? order.updatedAt : null },
  ];

  return (
    <Card title={t.timeline}>
      <ol className="relative ml-1">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const dot = done
            ? "border-profit bg-profit-soft text-profit"
            : active
              ? "border-accent bg-accent text-white"
              : "border-border bg-surface-2 text-faint";
          return (
            <li key={s.key} className="flex gap-3 pb-4 last:pb-0">
              <div className="flex flex-col items-center">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[0.68rem] font-bold ${dot}`}>
                  {done ? "✓" : i + 1}
                </span>
                {i < steps.length - 1 && (
                  <span className={`mt-1 w-[2px] flex-1 rounded-full ${i < current ? "bg-accent" : "bg-border"}`} />
                )}
              </div>
              <div className="pb-1">
                <p className={`text-sm font-semibold ${active ? "text-accent" : done ? "text-ink" : "text-faint"}`}>
                  {s.label}
                </p>
                <p className="text-[0.72rem] text-faint">
                  {s.at ? new Date(s.at).toLocaleString() : done ? t.tlDone : t.tlPending}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Revenue split into cost + profit, as a single stacked bar (Part 8). */
function ProfitBar({ revenue, cost, profit, currency }: { revenue: number; cost: number; profit: number; currency: string }) {
  const total = Math.max(revenue, cost + profit, 1);
  const costPct = Math.max(0, Math.min(100, (cost / total) * 100));
  const profitPct = Math.max(0, Math.min(100, (profit / total) * 100));
  return (
    <div className="mt-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-faint/50" style={{ width: `${costPct}%` }} title={t.internalCost} />
        <div className="h-full bg-profit" style={{ width: `${profitPct}%` }} title={t.profit} />
      </div>
      <div className="mt-1.5 flex justify-between text-[0.72rem]">
        <span className="text-muted">
          {t.internalCost}: <span className="tnum">{formatAmount(cost, currency)}</span>
        </span>
        <span className="text-profit">
          {t.profit}: <span className="tnum">{formatAmount(profit, currency)}</span>
        </span>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  accent,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  danger?: boolean;
}) {
  const cls = accent
    ? "border-accent bg-accent text-white hover:bg-accent-strong"
    : danger
      ? "border-warn text-warn hover:bg-warn-soft"
      : "border-border bg-surface text-muted hover:border-accent hover:text-accent";
  return (
    <button type="button" onClick={onClick} className={`rounded-lg border px-3 py-2 text-sm font-medium ${cls}`}>
      {children}
    </button>
  );
}

function Card({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "private";
}) {
  return (
    <div className="rounded-[14px] border border-border bg-surface p-4 shadow-card">
      <div
        className={`mb-3 text-[0.72rem] font-bold uppercase tracking-wide ${
          tone === "private" ? "text-warn" : "text-accent"
        }`}
      >
        {tone === "private" ? "🔒 " : ""}
        {title}
      </div>
      {children}
    </div>
  );
}

function Info({
  k,
  v,
  strong,
  profit,
}: {
  k: string;
  v: string;
  strong?: boolean;
  profit?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[0.7rem] uppercase tracking-wide text-faint">{k}</dt>
      <dd className={`tnum ${strong ? "font-bold" : "font-semibold"} ${profit ? "text-profit" : "text-ink"}`}>{v}</dd>
    </div>
  );
}
