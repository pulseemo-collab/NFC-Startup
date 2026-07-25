"use client";

import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

export default function AppHeader({
  onBack,
  subtitle,
  brandName,
  logoUrl,
  children,
}: {
  onBack?: () => void;
  subtitle?: string;
  brandName?: string;
  logoUrl?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t.back}
            title={t.back}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-lg text-muted transition hover:border-accent hover:text-accent"
          >
            ←
          </button>
        )}
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
        <div>
          <h1 className="text-[1.35rem] font-bold leading-tight tracking-tight">{brandName?.trim() || t.appName}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
