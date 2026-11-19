// Validation for ../../../../../packages/content/data/maps/filler-streets.json (render-only data, the sim never reads it).
import { z } from 'zod';
import { fillerStreets } from '@hr/content';
import { DISTRICTS } from './archetypes';
import type { FillerStreet } from './streets';

const point = z.tuple([z.number(), z.number()]);

export const fillerStreetSchema = z.object({
  id: z.string().min(1),
  district: z.string().min(1),
  style: z.string().refine((s) => s in DISTRICTS, { message: 'unknown district style' }),
  side: z.enum(['left', 'right']),
  line: z.array(point).min(2),
});

export const fillerStreetsSchema = z.array(fillerStreetSchema).superRefine((list, ctx) => {
  const seen = new Set<string>();
  list.forEach((s, i) => {
    if (seen.has(s.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `duplicate street id "${s.id}"` });
    seen.add(s.id);
  });
});

/** Validated streets. Invalid data is reported once and ignored, so a typo never breaks the game. */
function load(): FillerStreet[] {
  const res = fillerStreetsSchema.safeParse(fillerStreets);
  if (res.success) return res.data;
  console.warn('[buildings] invalid maps/filler-streets.json', res.error.issues);
  return [];
}

export const FILLER_STREETS: readonly FillerStreet[] = load();