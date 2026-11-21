// T6: the render quality setting, stored per device (IndexedDB `meta` store, key `renderQuality`), like the Pause_Menu
// Testing toggle and the phone settings. Never in SimState or the Save_Document; not synced between devices.
import { create } from 'zustand';
import { z } from 'zod';
import { getServices } from '../game/session';
import { resolveQuality, type Quality, type QualityChoice, type QualityPreset } from './quality';

export const qualitySettingsSchema = z.object({
  choice: z.enum(['auto', 'low', 'high']),
  /** Preset measured on this device; null = not measured yet. */
  detected: z.enum(['low', 'high']).nullable(),
});
export type QualitySettings = z.infer<typeof qualitySettingsSchema>;
export const DEFAULT_QUALITY_SETTINGS: QualitySettings = { choice: 'auto', detected: null };
export const QUALITY_KEY = 'renderQuality';

/** Merges stored data over the defaults field by field; invalid fields fall back. */
export function parseQualitySettings(raw: unknown): QualitySettings {
  const out: QualitySettings = { ...DEFAULT_QUALITY_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const c = qualitySettingsSchema.shape.choice.safeParse(r.choice);
  if (c.success) out.choice = c.data;
  const d = qualitySettingsSchema.shape.detected.safeParse(r.detected);
  if (d.success) out.detected = d.data;
  return out;
}

interface QualityStore extends QualitySettings {
  loaded: boolean;
  load(): Promise<void>;
  /** Picking Auto clears the measurement, so the probe measures again. */
  setChoice(choice: QualityChoice): void;
  setDetected(preset: QualityPreset): void;
}

function persist(s: QualitySettings): void {
  void getServices()?.repo.store.put('meta', QUALITY_KEY, { choice: s.choice, detected: s.detected }).catch(() => undefined);
}

export const useQualityStore = create<QualityStore>((set, get) => ({
  ...DEFAULT_QUALITY_SETTINGS,
  loaded: false,
  load: async () => {
    let raw: unknown;
    try {
      raw = await getServices()?.repo.store.get<unknown>('meta', QUALITY_KEY);
    } catch {
      raw = undefined;
    }
    set({ ...parseQualitySettings(raw), loaded: true });
  },
  setChoice: (choice) => {
    set(choice === 'auto' ? { choice, detected: null } : { choice });
    persist(get());
  },
  setDetected: (preset) => {
    set({ detected: preset });
    persist(get());
  },
}));

/** The quality the render code uses right now. Re-renders only when the resolved preset changes. */
export function useQuality(): Quality {
  return useQualityStore((s) => resolveQuality(s.choice, s.detected));
}
