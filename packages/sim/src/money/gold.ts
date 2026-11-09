// Integer Gold helpers (Requirement 8). Gold is stored in hundredths. Costs round up, rewards down.
import type { FinanceCategory, Gold, OwnerId, SimState } from '../state/types';
import { PLAYER } from '../state/types';

/** Safe-integer headroom limit for any Gold value (criterion 8.10). */
export const GOLD_LIMIT = 2 ** 50;

export const goldFromWhole = (whole: number): Gold => Math.round(whole * 100);
/** Whole Gold for display, floored (criterion 8.8). Negative values floor towards -infinity. */
export const goldToWholeFloor = (g: Gold): number => Math.floor(g / 100);

/** floor(a * num / den) with integer inputs. */
export const mulDivFloor = (a: number, num: number, den: number): number => Math.floor((a * num) / den);
export const mulDivCeil = (a: number, num: number, den: number): number => Math.ceil((a * num) / den);

/** Cost of a fractional factor, rounded up so the Player never pays less than defined. */
export const costOf = (base: Gold, factor: number): Gold => Math.ceil(base * factor - 1e-9);
/** Reward of a fractional factor, rounded down. */
export const rewardOf = (base: Gold, factor: number): Gold => Math.floor(base * factor + 1e-9);

export type GoldCheck = { ok: true } | { ok: false; reason: 'insufficient_gold'; missingGold: Gold };

/** Discretionary expenses must call this first (criterion 8.4). */
export function requireGold(state: SimState, owner: OwnerId, cost: Gold): GoldCheck {
  if (owner !== PLAYER) return { ok: true }; // Competitor Gold is not tracked (8.9)
  if (state.player.gold >= cost) return { ok: true };
  return { ok: false, reason: 'insufficient_gold', missingGold: cost - state.player.gold };
}

/**
 * The only way Gold changes. No-op for non-player owners. Records the change in the finance
 * bucket of the current game second under `${category}|${source}` (criterion 8.2).
 */
export function applyGold(
  state: SimState,
  owner: OwnerId,
  delta: Gold,
  category: FinanceCategory,
  source: string,
  ticksPerSecond: number,
  windowSeconds: number,
): void {
  if (owner !== PLAYER || delta === 0) return;
  state.player.gold += delta;
  const second = Math.floor(state.tick / ticksPerSecond);
  const buckets = state.finance.buckets;
  let last = buckets[buckets.length - 1];
  if (!last || last.second !== second) {
    last = { second, byKey: {} };
    buckets.push(last);
    while (buckets.length > 0 && (buckets[0] as { second: number }).second <= second - windowSeconds) buckets.shift();
  }
  const key = `${category}|${source}`;
  last.byKey[key] = (last.byKey[key] ?? 0) + delta;
}

export interface FinanceSummary {
  income: Gold;
  expenses: Gold;
  byCategory: Record<string, Gold>;
}

/** Sum of finance buckets over the last `seconds` game seconds (criterion 8.3). */
export function financeSummary(state: SimState, ticksPerSecond: number, seconds: number): FinanceSummary {
  const now = Math.floor(state.tick / ticksPerSecond);
  const out: FinanceSummary = { income: 0, expenses: 0, byCategory: {} };
  for (const b of state.finance.buckets) {
    if (b.second <= now - seconds) continue;
    for (const [key, v] of Object.entries(b.byKey)) {
      const cat = key.split('|')[0] as string;
      out.byCategory[cat] = (out.byCategory[cat] ?? 0) + v;
      if (v >= 0) out.income += v;
      else out.expenses -= v;
    }
  }
  return out;
}
