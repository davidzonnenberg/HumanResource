// Alert -> app mapping, badges and deep-link targets (ceo-phone Requirement 7). Pure.
// The mapping lives in data (`alertTypes` / `fixTab` in ui/apps.json), not in component code.
import type { PhoneApp } from './appsSchema';

export interface AlertLike {
  key: string;
  type: string;
  objectId: string;
}

export interface OpenTarget {
  app: string;
  tab?: string;
  id?: string;
}

/** Alert types can carry an argument ("unstaffed:bartender"); the mapping uses the part before the colon. */
export const alertBase = (type: string): string => type.split(':')[0] ?? type;

/** The installed app that owns an Alert type (first match by registry order), or null. */
export function ownerApp(type: string, installed: readonly PhoneApp[]): PhoneApp | null {
  const base = alertBase(type);
  return installed.find((a) => a.alertTypes.includes(base)) ?? null;
}

/** Where an Alert's "Fix" button / notification card goes. null when no installed app owns it. */
export function alertTarget(alert: Pick<AlertLike, 'type' | 'objectId'>, installed: readonly PhoneApp[]): OpenTarget | null {
  const app = ownerApp(alert.type, installed);
  if (!app) return null;
  return { app: app.id, ...(app.fixTab !== undefined ? { tab: app.fixTab } : {}), id: alert.objectId };
}

/** Keys of the active Alerts mapped to this app. */
export function appAlertKeys(app: PhoneApp, alerts: readonly AlertLike[]): string[] {
  return alerts.filter((a) => app.alertTypes.includes(alertBase(a.type))).map((a) => a.key);
}

/** Badge number: mapped Alerts that arrived after the app was last opened (7.1, 7.3). */
export function badgeCount(app: PhoneApp, alerts: readonly AlertLike[], seen: Readonly<Record<string, readonly string[]>>): number {
  const was = new Set(seen[app.id] ?? []);
  return appAlertKeys(app, alerts).filter((k) => !was.has(k)).length;
}
