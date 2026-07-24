"use client";

import type { OrderSnapshot } from "@/types";
import { formatAmount } from "@/lib/pricing";
import { t, CLIENT_ORDER_STATUS_LABEL } from "@/lib/i18n";

// CLIENT-SAFE. Renders ONLY from the saved snapshot and never shows
// cost, profit, margin, pricing rules, owner notes, or settings.
export default function ClientOrderView({
  order,
  onBack,
  backLabel,
  confirmation,
}: {
  order: OrderSnapshot;
  onBack: () => void;
  backLabel: string;
  /** True right after the customer submits — adds the contact and closing sections. */
  confirmation?: boolean;
}) {
  const cur = order.currency;

  return (
    <section className="mx-auto max-w-xl">
      <div className="overflow-hidden rounded-[16px] border border-border bg-surface shadow-card">
        <div className="bg-accent px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-[0.72rem] uppercase tracking-[0.1em] opacity-85">{t.orderNumber}</span>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
              {CLIENT_ORDER_STATUS_LABEL[order.status]}
            </span>
          </div>
          <div className="mt-0.5 text-xl font-bold">{order.number}</div>
          <div className="text-sm text-white/85">{order.businessName}</div>
          <div className="text-[0.72rem] text-white/70">{new Date(order.createdAt).toLocaleDateString()}</div>
        </div>

        <div className="p-5">
          <ul className="flex flex-col divide-y divide-border">
            {order.lines.map((l) => (
              <li key={l.productId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{l.name}</div>
                  <div className="text-[0.72rem] text-faint">{l.descriptionSq}</div>
                </div>
                <div className="tnum text-xs text-muted">
                  {l.qty} × {formatAmount(l.unitPrice, cur)}
                </div>
                <div className="tnum w-20 text-right text-sm font-semibold">
                  {formatAmount(l.unitPrice * l.qty, cur)}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-col gap-1.5">
            <Row k={t.ifSeparately} v={formatAmount(order.separatePrice, cur)} strike />
            <Row k={t.bundleDiscount} v={`−${Math.round(order.bundleDiscountPct * 100)}%`} muted />
            <div className="my-1 h-px bg-border" />
            <div className="flex items-baseline justify-between rounded-[11px] bg-accent-soft px-4 py-3">
              <span className="text-[0.82rem] font-bold uppercase tracking-[0.06em] text-accent">{t.bundlePrice}</span>
              <span className="tnum text-[1.4rem] font-extrabold text-accent">{formatAmount(order.finalPrice, cur)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted">{t.savedShort}</span>
              <b className="tnum text-profit">{formatAmount(order.saved, cur)}</b>
            </div>
          </div>

          {order.customerNotes && (
            <div className="mt-4 rounded-[11px] border border-border bg-bg p-3">
              <div className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-muted">{t.notes}</div>
              <p className="text-sm text-ink">{order.customerNotes}</p>
            </div>
          )}
        </div>
      </div>

      {confirmation && (
        <>
          <div className="mt-4 rounded-[16px] border border-border bg-surface p-4 text-center">
            <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">{t.contactTitle}</div>
            <div className="mt-2 flex flex-col items-center gap-1 text-sm text-ink sm:flex-row sm:justify-center sm:gap-5">
              <a href={`tel:${t.contactPhone.replace(/\s/g, "")}`} className="hover:text-accent">
                📞 {t.contactPhone}
              </a>
              <a href={`mailto:${t.contactEmail}`} className="hover:text-accent">
                ✉️ {t.contactEmail}
              </a>
            </div>
          </div>

          <p className="mt-4 text-center text-[0.8rem] leading-relaxed text-faint">
            {t.closingContact}
            <br />
            {t.closingThanks}
          </p>
        </>
      )}

      <button
        type="button"
        onClick={onBack}
        className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted hover:border-accent hover:text-accent"
      >
        ← {backLabel}
      </button>
    </section>
  );
}

function Row({ k, v, muted, strike }: { k: string; v: string; muted?: boolean; strike?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-[6px]">
      <span className="text-[0.86rem] text-muted">{k}</span>
      <span className={`tnum font-semibold ${strike ? "text-faint line-through" : muted ? "text-muted" : "text-ink"}`}>
        {v}
      </span>
    </div>
  );
}
