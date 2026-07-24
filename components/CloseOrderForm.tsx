"use client";

import { useState } from "react";
import type { OrderFormInput } from "@/lib/orders";
import { t } from "@/lib/i18n";

export default function CloseOrderForm({
  open,
  defaultBusinessName,
  saving,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  defaultBusinessName: string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (form: OrderFormInput) => void;
}) {
  const [businessName, setBusinessName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  if (!open) return null;

  const addressValid = address.trim() !== "";

  const submit = () => {
    if (saving || !addressValid) return;
    onConfirm({
      businessName: businessName || defaultBusinessName,
      customerName,
      phone,
      address,
      customerNotes,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <h2 className="mb-4 text-lg font-bold">{t.closeOrder}</h2>

        <div className="flex flex-col gap-3">
          <Field label={t.businessName}>
            <Input value={businessName} onChange={setBusinessName} placeholder={defaultBusinessName} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={`${t.customerName} (${t.optional})`}>
              <Input value={customerName} onChange={setCustomerName} />
            </Field>
            <Field label={`${t.phone} (${t.optional})`}>
              <Input value={phone} onChange={setPhone} />
            </Field>
          </div>
          <Field label={`${t.deliveryAddress} *`}>
            <Input value={address} onChange={setAddress} invalid={!addressValid} />
            {!addressValid && (
              <span className="text-[0.68rem] text-warn">{t.deliveryAddress} {t.required}.</span>
            )}
          </Field>
          <Field label={`${t.notes} (${t.optional})`}>
            <textarea
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </Field>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {t.cancel}
          </button>
          {/* Fixed height + nowrap so the loading label can never reflow the modal. */}
          <button
            type="button"
            onClick={submit}
            disabled={saving || !addressValid}
            className="inline-flex h-9 flex-1 items-center justify-center overflow-hidden whitespace-nowrap rounded-lg bg-accent px-3 text-sm font-bold text-white hover:bg-accent-strong disabled:opacity-60"
          >
            {saving ? (
              <span className="inline-flex items-center gap-1.5 text-[0.72rem] leading-none">
                <Spinner />
                {t.sendingOrder}
              </span>
            ) : (
              t.confirm
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3 w-3 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent ${
        invalid ? "border-warn" : "border-border"
      }`}
    />
  );
}
