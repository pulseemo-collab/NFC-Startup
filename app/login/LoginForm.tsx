"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { t } from "@/lib/i18n";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        // Supabase returns "Invalid login credentials" for bad email/password.
        setError(/invalid/i.test(signInError.message) ? t.loginInvalid : t.loginGenericError);
        setLoading(false);
        return;
      }
      // Refresh so server components / middleware pick up the new session cookie,
      // then land on the dashboard.
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(t.loginGenericError);
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
      <div className="w-full">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
              <path d="M5 9a10 10 0 0 1 0 6M9 6.5a15 15 0 0 1 0 11M13 4a20 20 0 0 1 0 16" />
              <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <div>
            <h1 className="text-[1.35rem] font-bold leading-tight tracking-tight">{t.appName}</h1>
            <p className="mt-0.5 text-sm text-muted">{t.ownerMode}</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-border bg-surface p-6 shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
        >
          <h2 className="text-lg font-semibold">{t.loginTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.loginSubtitle}</p>

          <label className="mt-5 block text-sm font-medium" htmlFor="email">
            {t.emailLabel}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none transition focus:border-accent disabled:opacity-60"
          />

          <label className="mt-4 block text-sm font-medium" htmlFor="password">
            {t.passwordLabel}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none transition focus:border-accent disabled:opacity-60"
          />

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm text-warn">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong hover:border-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? t.loginLoading : t.loginButton}
          </button>
        </form>
      </div>
    </main>
  );
}
