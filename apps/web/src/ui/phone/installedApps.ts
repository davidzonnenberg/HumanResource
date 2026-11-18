// Which phone apps are installed (ceo-phone Requirements 2.4–2.6, 3.4, 3.9). Pure.
import type { PhoneApp } from './appsSchema';

/** Apps with revealFeature null or a revealed feature (or all with revealAll), sorted by `order`. */
export function installedApps(features: readonly string[], registry: readonly PhoneApp[], revealAll = false): PhoneApp[] {
  const have = new Set(features);
  return registry.filter((a) => revealAll || a.revealFeature === null || have.has(a.revealFeature)).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

/** Dock = installed apps with a dock number, ordered by it (no empty slots). */
export function dockApps(installed: readonly PhoneApp[]): PhoneApp[] {
  return installed.filter((a) => a.dock !== null).sort((a, b) => (a.dock ?? 0) - (b.dock ?? 0));
}

/** Grid = installed apps without a dock number. */
export function gridApps(installed: readonly PhoneApp[]): PhoneApp[] {
  return installed.filter((a) => a.dock === null);
}
