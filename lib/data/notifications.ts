"use server";

// Notification center data-access layer (Part 5) — Server Actions running as the
// SIGNED-IN OWNER (RLS-enforced via migration 0009). Never the service role. The
// public site never imports this module.

import type {
  AppNotification,
  NewNotification,
  NotificationsResult,
  NotificationMutation,
  NotificationType,
} from "@/lib/data/notification-types";
import { requireOwner } from "@/lib/data/owner-guard";

type Row = Record<string, unknown>;

const COLUMNS = "id, type, title, body, read, dedupe_key, meta, created_at";

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function fail(prefix: string, error: unknown): { ok: false; error: string } {
  const msg = error instanceof Error ? error.message : String(error);
  return { ok: false, error: `${prefix}: ${msg}` };
}

function rowToNotification(r: Row): AppNotification {
  return {
    id: str(r.id),
    type: str(r.type) as NotificationType,
    title: str(r.title),
    body: str(r.body),
    read: r.read === true,
    dedupeKey: r.dedupe_key == null ? null : str(r.dedupe_key),
    meta: (r.meta && typeof r.meta === "object" ? (r.meta as Record<string, unknown>) : {}),
    createdAt: str(r.created_at),
  };
}

/** Newest notifications first. Dashboard-only. */
export async function getNotifications(limit = 50): Promise<NotificationsResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Load notifications failed", gate.error);
    const { data, error } = await gate.supabase
      .from("notifications")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return fail("Load notifications failed", error);
    return { ok: true, notifications: (data ?? []).map((r) => rowToNotification(r as unknown as Row)) };
  } catch (e) {
    return fail("Load notifications failed", e);
  }
}

/**
 * Idempotently insert notifications. Rows with a `dedupeKey` that already exists
 * are skipped (ON CONFLICT DO NOTHING via upsert ignoreDuplicates), so advisory
 * notifications never pile up duplicates. Returns the fresh list.
 */
export async function createNotifications(items: NewNotification[]): Promise<NotificationsResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Create notification failed", gate.error);
    if (items.length === 0) return getNotifications();
    const rows = items.map((n) => ({
      type: n.type,
      title: n.title,
      body: n.body,
      dedupe_key: n.dedupeKey ?? null,
      meta: n.meta ?? {},
    }));
    const { error } = await gate.supabase
      .from("notifications")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (error) return fail("Create notification failed", error);
    return getNotifications();
  } catch (e) {
    return fail("Create notification failed", e);
  }
}

export async function markNotificationRead(id: string): Promise<NotificationMutation> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Update notification failed", gate.error);
    const { error } = await gate.supabase.from("notifications").update({ read: true }).eq("id", id);
    if (error) return fail("Update notification failed", error);
    return { ok: true };
  } catch (e) {
    return fail("Update notification failed", e);
  }
}

export async function markAllNotificationsRead(): Promise<NotificationMutation> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Update notifications failed", gate.error);
    const { error } = await gate.supabase.from("notifications").update({ read: true }).eq("read", false);
    if (error) return fail("Update notifications failed", error);
    return { ok: true };
  } catch (e) {
    return fail("Update notifications failed", e);
  }
}

export async function deleteNotification(id: string): Promise<NotificationMutation> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Delete notification failed", gate.error);
    const { error } = await gate.supabase.from("notifications").delete().eq("id", id);
    if (error) return fail("Delete notification failed", error);
    return { ok: true };
  } catch (e) {
    return fail("Delete notification failed", e);
  }
}
