// CEO Phone settings (ceo-phone Requirement 12, decision D7): stored per device in IndexedDB (`meta`
// store, key phoneSettings:<profileId>), like the Pause_Menu Testing toggle. Never in SimState or
// the Save_Document. Syncing them with the profile is on the wishlist.
import { create } from 'zustand';
import { z } from 'zod';
import { getServices } from '../../game/session';

export const phoneSettingsSchema = z.object({
  darkMode: z.enum(['system', 'light', 'dark']),
  textSize: z.enum(['s', 'm', 'l']),
  reducedMotion: z.enum(['system', 'on', 'off']),
  dnd: z.boolean(),
  questPings: z.boolean(),
  haptics: z.boolean(),
  devRevealAllApps: z.boolean(),
});
export type PhoneSettings = z.infer<typeof phoneSettingsSchema>;

export const DEFAULT_PHONE_SETTINGS: PhoneSettings = { darkMode: 'system', textSize: 'm', reducedMotion: 'system', dnd: false, questPings: true, haptics: true, devRevealAllApps: false };

/** Merges stored data over the defaults field by field; invalid fields fall back (12.7). */
export function parsePhoneSettings(raw: unknown): PhoneSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PHONE_SETTINGS };
  const out: Record<string, unknown> = { ...DEFAULT_PHONE_SETTINGS };
  const shape = phoneSettingsSchema.shape;
  for (const k of Object.keys(shape) as (keyof PhoneSettings)[]) {
    const v = (raw as Record<string, unknown>)[k];
    if (shape[k].safeParse(v).success) out[k] = v;
  }
  return out as PhoneSettings;
}

export const phoneSettingsKey = (profileId: string): string => `phoneSettings:${profileId}`;

interface SettingsStore {
  profileId: string | null;
  settings: PhoneSettings;
  load(profileId: string): Promise<void>;
  update(patch: Partial<PhoneSettings>): void;
}

export const usePhoneSettings = create<SettingsStore>((set, get) => ({
  profileId: null,
  settings: { ...DEFAULT_PHONE_SETTINGS },
  load: async (profileId) => {
    let raw: unknown;
    try {
      raw = await getServices()?.repo.store.get<unknown>('meta', phoneSettingsKey(profileId));
    } catch {
      raw = undefined;
    }
    set({ profileId, settings: parsePhoneSettings(raw) });
  },
  update: (patch) => {
    const settings = parsePhoneSettings({ ...get().settings, ...patch });
    set({ settings });
    const id = get().profileId;
    if (id) void getServices()?.repo.store.put('meta', phoneSettingsKey(id), settings).catch(() => undefined);
  },
}));

/** Resolved theme / motion for the DOM (system choices read the media queries). */
export function resolvedDark(s: PhoneSettings): boolean {
  if (s.darkMode !== 'system') return s.darkMode === 'dark';
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}
export function resolvedReducedMotion(s: PhoneSettings): boolean {
  if (s.reducedMotion !== 'system') return s.reducedMotion === 'on';
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
