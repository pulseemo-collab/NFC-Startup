// Types for the notification center (Part 5). Kept separate from the "use server"
// module so it exports only async Server Actions.

export type NotificationType =
  | "new_order"
  | "low_margin"
  | "price_recommendation"
  | "archived_product"
  | "settings_changed";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  dedupeKey: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

/** Input for creating a notification. `dedupeKey` makes the insert idempotent. */
export interface NewNotification {
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey?: string | null;
  meta?: Record<string, unknown>;
}

export type NotificationsResult = { ok: true; notifications: AppNotification[] } | { ok: false; error: string };
export type NotificationMutation = { ok: true } | { ok: false; error: string };
