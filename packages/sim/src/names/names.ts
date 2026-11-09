// Human_Name drawing (Requirement 7.17–7.22) and the single display-name function (46.7).
import { rngPick } from '../rng/xoshiro128ss';
import type { Human, OwnerId, SimState } from '../state/types';

const SUFFIX = / (\d+)$/;
export const baseName = (name: string): string => name.replace(SUFFIX, '');

function namesInWorkforce(state: SimState, owner: OwnerId): Set<string> {
  const out = new Set<string>();
  for (const h of Object.values(state.humans)) if (h.owner === owner) out.add(h.name);
  return out;
}

/** `base` if free in the Workforce, otherwise the lowest `base k` (k >= 2) that is free. */
export function uniqueInWorkforce(state: SimState, owner: OwnerId, base: string): string {
  const used = namesInWorkforce(state, owner);
  if (!used.has(base)) return base;
  for (let k = 2; ; k++) {
    const candidate = `${base} ${k}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Draws a name from the pool with the seeded RNG. Prefers names whose base is not used in the
 * owner's Workforce; when the pool is exhausted, appends the lowest free numeric suffix.
 */
export function drawHumanName(state: SimState, pool: readonly string[], owner: OwnerId): string {
  const usedBases = new Set<string>();
  for (const h of Object.values(state.humans)) if (h.owner === owner) usedBases.add(baseName(h.name));
  const unused = pool.filter((n) => !usedBases.has(n));
  const base = rngPick(state, unused.length > 0 ? unused : pool);
  return uniqueInWorkforce(state, owner, base);
}

/**
 * The ONLY function the UI uses to label a Human. A later "numbers" mode (automation/AI phases)
 * changes this function, not the call sites.
 */
export function displayName(human: Pick<Human, 'name'>): string {
  return human.name;
}
