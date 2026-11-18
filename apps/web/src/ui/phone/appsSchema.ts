// CEO Phone app registry schema (ceo-phone Requirement 3). UI-only data: the Simulation never sees it.
import { z } from 'zod';
import { phoneApps } from '@hr/content';

const tabSchema = z.object({ id: z.string().min(1), labelKey: z.string().min(1), icon: z.string().min(1) });

export const appSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .refine((id) => id !== 'rotate', { message: "'app.rotate' is an existing text key" }),
  nameKey: z.string().min(1),
  icon: z.string().min(1),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** A reveal FEATURE name (entry of a trigger's `reveals`), never a trigger id. null = always installed. */
  revealFeature: z.string().min(1).nullable(),
  tabs: z.array(tabSchema).max(4),
  /** Dock position, or null for the grid. */
  dock: z.number().int().nonnegative().nullable(),
  order: z.number().int(),
});

export const appsSchema = z.array(appSchema).superRefine((apps, ctx) => {
  const ids = new Set<string>();
  const docks = new Set<number>();
  apps.forEach((a, i) => {
    if (ids.has(a.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `duplicate app id "${a.id}"` });
    ids.add(a.id);
    if (a.dock !== null) {
      if (docks.has(a.dock)) ctx.addIssue({ code: 'custom', path: [i, 'dock'], message: `duplicate dock position ${a.dock} (${a.id})` });
      docks.add(a.dock);
    }
    const tabIds = new Set<string>();
    a.tabs.forEach((t, j) => {
      if (tabIds.has(t.id)) ctx.addIssue({ code: 'custom', path: [i, 'tabs', j, 'id'], message: `duplicate tab id "${t.id}" in app "${a.id}"` });
      tabIds.add(t.id);
    });
  });
});

export type PhoneApp = z.infer<typeof appSchema>;

/** Validated registry. Invalid data drops to the always-installed apps that do parse (Settings stays). */
function load(): PhoneApp[] {
  const res = appsSchema.safeParse(phoneApps);
  if (res.success) return res.data;
  console.warn('[phone] invalid ui/apps.json', res.error.issues);
  const raw: unknown[] = Array.isArray(phoneApps) ? phoneApps : [];
  return raw.flatMap((a) => {
    const one = appSchema.safeParse(a);
    return one.success ? [one.data] : [];
  });
}

export const PHONE_APPS: readonly PhoneApp[] = load();
