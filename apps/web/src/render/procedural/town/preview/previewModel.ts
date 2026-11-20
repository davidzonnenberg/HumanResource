// Model of the 2D town preview (T2): the same generator and the same override code as `town:bake`, no DOM.
// The page in docs/previews/town-map-preview.html is built from this folder by `npm.cmd run town:preview`.
import { applyOverrides } from '../applyOverrides';
import { generateTown } from '../generateTown';
import { formatTownCounts, townCounts, type TownCounts } from '../townCounts';
import type { Building, TownBrief, TownData, TownOverrides } from '../townTypes';

export interface PreviewResult {
  /** The generator output, exactly what `town:bake` writes (and what "Download baked JSON" saves). */
  raw: TownData;
  /** What the game shows: `raw` with the overrides applied (equal to `raw` when no overrides are given). */
  shown: TownData;
  orphans: string[];
  /** Counts of `raw`, the same numbers `town:bake` prints. */
  counts: TownCounts;
  countsLine: string;
  /** Distinct building footprints (kind + width + depth rounded to 1 m): what instancing could share. */
  uniqueFootprints: number;
  singelGates: number;
  overridesApplied: boolean;
}

/**
 * Generate the town of `brief` with the seed `seed` and apply `overrides` when given. Pure.
 * `locked` are the locked buildings of the previous bake: `town:bake --force` passes them to the generator, so the
 * preview needs them to give the same town as the committed bake.
 */
export function buildPreview(brief: TownBrief, seed: string, overrides: TownOverrides | null, locked: Building[] = []): PreviewResult {
  const raw = generateTown({ ...brief, seed }, { locked });
  const applied = overrides ? applyOverrides(raw, overrides) : null;
  const shown = applied ? applied.town : raw;
  const counts = townCounts(raw);
  return {
    raw,
    shown,
    orphans: applied ? applied.orphans : [],
    counts,
    countsLine: formatTownCounts(counts),
    uniqueFootprints: new Set(shown.buildings.map((h) => `${h.kind}|${Math.round(h.width)}|${Math.round(h.depth)}`)).size,
    singelGates: raw.bridges.filter((b) => b.roadId.startsWith('gate_')).length,
    overridesApplied: overrides !== null,
  };
}

/** The "New seed" button: no randomness, "v1" -> "v2", "start" -> "start2". Seeds stay plain, repeatable strings. */
export function nextSeed(seed: string): string {
  const m = /^(.*?)(\d+)$/.exec(seed.trim());
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${seed.trim()}2`;
}
