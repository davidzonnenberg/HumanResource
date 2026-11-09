// The single lookup for user-facing text (criterion 46.8). English only for now; every string
// lives in packages/content/data/text/en.json. Unknown literal keys fail type-checking.
import { text } from '@hr/content';

type Table = typeof text;
/** Keys whose value is a plain string (name tables are arrays and are not t() keys). */
export type TextKey = { [K in keyof Table]: Table[K] extends string ? K : never }[keyof Table];

const table = text as Record<string, unknown>;

export function t(key: TextKey, params?: Record<string, string | number>): string {
  return tDynamic(key, params);
}

/** For keys built at runtime (e.g. `alert.${type}`, Definition nameKeys). Missing keys render the key. */
export function tDynamic(key: string, params?: Record<string, string | number>): string {
  const raw = table[key];
  if (typeof raw !== 'string') {
    if (import.meta.env?.DEV) console.warn(`[t] missing text key "${key}"`);
    return key;
  }
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, p: string) => (p in params ? String(params[p]) : m));
}

export const hasText = (key: string): boolean => typeof table[key] === 'string';
