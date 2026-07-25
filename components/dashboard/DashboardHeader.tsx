"use client";

// Premium owner-dashboard header (polish pass). Three clear zones:
//   left  = brand (logo + name + subtitle)
//   centre= primary navigation (desktop; mobile uses the bottom tab bar)
//   right = utility actions (search, notifications, settings) + account menu
// The public site keeps its own AppHeader — this is dashboard-only.

import { type ReactNode, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";

export type OwnerNav = "home" | "analytics" | "catalog" | "builder" | "orders";

const NAV: { key: OwnerNav; label: string }[] = [
  { key: "home", label: t.dashboardHome },
  { key: "analytics", label: t.analytics },
  { key: "catalog", label: t.products },
  { key: "builder", label: t.builder },
  { key: "orders", label: t.orders },
];

export default function DashboardHeader({
  brandName,
  logoUrl,
  subtitle,
  activeView,
  onNavigate,
  onOpenSearch,
  onOpenSettings,
  notificationSlot,
}: {
  brandName?: string;
  logoUrl?: string;
  subtitle?: string;
  activeView: string;
  onNavigate: (view: OwnerNav) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  notificationSlot: ReactNode;
}) {
  const name = brandName?.trim() || t.appName;
  const isActive = (k: OwnerNav) =>
    k === "orders" ? activeView === "orders" || activeView === "detail" : activeView === k;

  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      {/* Left — brand */}
      <div className="flex min-w-0 items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl border border-border object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
              <path d="M5 9a10 10 0 0 1 0 6M9 6.5a15 15 0 0 1 0 11M13 4a20 20 0 0 1 0 16" />
              <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
            </svg>
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[1.2rem] font-bold leading-tight tracking-tight">{name}</h1>
          {subtitle && <p className="truncate text-[0.8rem] text-muted">{subtitle}</p>}
        </div>
      </div>

      {/* Centre — primary navigation (desktop) */}
      <nav aria-label="Primary" className="hidden items-center gap-1 rounded-xl border border-border bg-surface p-1 lg:flex">
        {NAV.map((item) => {
          const active = isActive(item.key);
          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-surface-2 hover:text-accent"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Right — utility actions */}
      <div className="flex items-center gap-1.5">
        <IconAction label={`${t.search} (Ctrl+K)`} onClick={onOpenSearch}>
          🔎
        </IconAction>
        {notificationSlot}
        <IconAction label={t.settings} onClick={onOpenSettings}>
          ⚙
        </IconAction>
        <AccountMenu name={name} />
      </div>
    </header>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-sm text-muted transition hover:border-accent hover:text-accent"
    >
      {children}
    </button>
  );
}

function AccountMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = name.charAt(0).toUpperCase() || "N";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.account}
        title={t.account}
        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-2 text-sm font-bold text-accent transition hover:border-accent"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="rise-in absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-[0.68rem] uppercase tracking-wider text-faint">{t.account}</p>
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
          </div>
          {/* Logout: server-side POST clears the Supabase session cookies. */}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-warn"
            >
              <span aria-hidden>⎋</span> {t.logout}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
