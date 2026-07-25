"use client";

// Notification center (Part 5). A header bell with an unread badge that opens a
// dropdown of notification history, with per-item deep-link + delete and a
// "mark all read" action. Data is stored in Supabase (owner-only) and passed in.

import { useEffect, useState } from "react";
import type { AppNotification, NotificationType } from "@/lib/data/notification-types";
import { formatAmount } from "@/lib/currency";
import { t } from "@/lib/i18n";

const META: Record<NotificationType, { icon: string; tone: string }> = {
  new_order: { icon: "🧾", tone: "text-accent" },
  low_margin: { icon: "⚠", tone: "text-warn" },
  price_recommendation: { icon: "💡", tone: "text-gold" },
  archived_product: { icon: "🗄", tone: "text-faint" },
  settings_changed: { icon: "⚙", tone: "text-muted" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "tani";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} orë`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ditë`;
  return new Date(iso).toLocaleDateString("en-GB");
}

export default function NotificationCenter({
  notifications,
  currency,
  onMarkAllRead,
  onOpen,
  onDelete,
}: {
  notifications: AppNotification[];
  currency: string;
  onMarkAllRead: () => void;
  onOpen: (n: AppNotification) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t.notifications}
        aria-label={t.notifications}
        className="relative rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:border-accent hover:text-accent"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-warn px-1 text-[0.62rem] font-bold text-bg">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="rise-in absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(22rem,90vw)] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="text-sm font-bold text-ink">{t.notifications}</h3>
              {unread > 0 && (
                <button type="button" onClick={onMarkAllRead} className="text-[0.72rem] font-medium text-accent hover:text-accent-strong">
                  {t.notifMarkAllRead}
                </button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-faint">{t.notifEmpty}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {notifications.map((n) => {
                    const m = META[n.type];
                    const price = n.type === "new_order" && n.meta?.finalPrice != null ? Number(n.meta.finalPrice) : null;
                    return (
                      <li key={n.id} className={`flex gap-2.5 px-3 py-2.5 ${n.read ? "" : "bg-accent-soft/40"}`}>
                        <span className={`mt-0.5 text-base ${m.tone}`} aria-hidden>
                          {m.icon}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onOpen(n);
                            setOpen(false);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="flex items-center gap-2">
                            {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
                            <span className="truncate text-sm font-semibold text-ink">{n.title}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-[0.75rem] text-muted">{n.body}</span>
                          <span className="mt-0.5 block text-[0.68rem] text-faint">
                            {relativeTime(n.createdAt)}
                            {price != null && ` · ${formatAmount(price, currency)}`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(n.id)}
                          aria-label={t.delete}
                          title={t.delete}
                          className="shrink-0 self-start text-faint hover:text-warn"
                        >
                          ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
