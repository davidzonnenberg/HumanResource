// Notification feed rules (ceo-phone Requirement 6). Pure; the session ring lives in phoneStore and
// is filled by phoneFeed.ts from Alerts and domain events. Never in SimState, never saved.

export interface PhoneNotification {
  id: number;
  text: string;
  /** Alert key or event id; the same source twice in a row is shown once. */
  source: string;
  app?: string;
  tab?: string;
  objectId?: string;
}

export const MAX_NOTIFICATIONS = 20;

/** Newest first, capped, and a repeat of the newest source is dropped. */
export function addNotification(items: readonly PhoneNotification[], n: PhoneNotification): PhoneNotification[] {
  if (items[0]?.source === n.source) return [...items];
  return [n, ...items].slice(0, MAX_NOTIFICATIONS);
}

/** Alerts whose key was not in the previous set. */
export function newAlerts<T extends { key: string }>(prevKeys: ReadonlySet<string>, alerts: readonly T[]): T[] {
  return alerts.filter((a) => !prevKeys.has(a.key));
}
