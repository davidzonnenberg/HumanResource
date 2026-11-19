// The one place a stat is computed (Requirement 50). A stat is the base value plus the sum of the
// active Modifiers for the target, in integer basis-point math:
//   total = base + sum(addFlat) + mulDiv(base, sum(addBp), 10000)
// Every current StatId is expressed in basis points (10000 = x1.0). Static Modifiers (Brand, Trait,
// Recipe Trait, Reputation) are derived from Definitions and state on every call and are never
// stored; stored Modifiers (Effects, boosts) live in `state.modifiers`.
import type { DefinitionRegistry } from '../defs/registry';
import { reputationDemandBp } from '../defs/formulas';
import type { StatId } from '../defs/vocabulary';
import { mulDivCeil, mulDivFloor } from '../money/gold';
import type { Business, Id, Modifier, SimState, SourceRef } from '../state/types';
import { PLAYER } from '../state/types';

export interface StatEnv {
  state: SimState;
  reg: DefinitionRegistry;
}
/** What the stat is read for. `recipeId` is the Recipe of the unit being poured or sold. */
export interface StatTarget {
  businessId?: Id;
  recipeId?: string | null;
}
export interface StatEntry {
  source: SourceRef;
  op: 'addBp' | 'addFlat';
  value: number;
}
export interface StatExplanation {
  stat: StatId;
  base: number;
  /** Every Modifier that applies, in the order they are listed in the "why this number" breakdown. */
  entries: StatEntry[];
  flat: number;
  bp: number;
  total: number;
}
interface StatDef {
  /** Rounding of the basis-point part (floor for rewards and chances, ceil for costs). */
  rounding: 'floor' | 'ceil';
  /** Lower bound of the result. */
  min: number;
}
export const STAT_DEFS: Record<StatId, StatDef> = {
  demand: { rounding: 'floor', min: 0 },
  premiumPrice: { rounding: 'floor', min: 0 },
  repeatOrderChance: { rounding: 'floor', min: 0 },
};
/** Boost stat -> StatId. `serviceSpeed` becomes `workSpeed` when a system reads it (task 43.1). */
export const BOOST_STAT: Readonly<Record<string, StatId | undefined>> = { serviceSpeed: undefined };

/** Ids are `<prefix>_<n>` with a zero-padded counter; compare by length first so `mod_10000` sorts after `mod_9999`. */
export function compareIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

function baseOf(env: StatEnv, stat: StatId, b: Business | undefined): number {
  const pub = b ? env.reg.businesses[b.defId]?.pub : undefined;
  switch (stat) {
    case 'demand':
    case 'premiumPrice':
      return 10000;
    case 'repeatOrderChance':
      return pub ? Math.round(pub.repeatOrderChance * 10000) : 0;
  }
}

function matches(m: Modifier, b: Business | undefined, businessId: string | undefined, recipeId: string | null | undefined): boolean {
  switch (m.target.kind) {
    case 'all':
      return true;
    case 'owner':
      return b !== undefined && b.owner === m.target.owner;
    case 'business':
      return businessId !== undefined && businessId === m.target.id;
    case 'recipe':
      return recipeId !== undefined && recipeId !== null && recipeId === m.target.id;
  }
}

/** Active `state.boosts` as Modifiers of source kind `boost` (only for stats a system reads). */
export function boostModifiers(state: SimState): Modifier[] {
  const out: Modifier[] = [];
  for (const [i, bo] of (state.boosts ?? []).entries()) {
    const stat = BOOST_STAT[bo.stat];
    if (!stat || bo.untilTick <= state.tick) continue;
    out.push({
      id: `boost_${String(i).padStart(4, '0')}`,
      source: { kind: 'boost', id: bo.businessId },
      target: { kind: 'business', id: bo.businessId },
      stat,
      op: 'addBp',
      value: bo.pct * 100,
      untilTick: bo.untilTick,
    });
  }
  return out;
}

function collect(env: StatEnv, stat: StatId, target: StatTarget): StatEntry[] {
  const { state, reg } = env;
  const b = target.businessId ? state.businesses[target.businessId] : undefined;
  const def = b ? reg.businesses[b.defId] : undefined;
  const entries: StatEntry[] = [];
  const venue = def?.pub?.venueType;
  // Brand (derived from the Definition)
  const brand = b?.brandId && venue ? reg.brandBp[b.brandId]?.[venue] : undefined;
  if (b?.brandId && brand) {
    const bp = stat === 'demand' ? brand.demandBp : stat === 'premiumPrice' ? brand.priceBp : 10000;
    if (bp !== 10000) entries.push({ source: { kind: 'brand', id: b.brandId }, op: 'addBp', value: bp - 10000 });
  }
  // Reputation demand modifier (derived from the Pub's data formula and the owner's Reputation)
  if (stat === 'demand' && b && def?.pub) {
    const rep = b.owner === PLAYER ? state.player.reputation : reg.config.reputationStart;
    const bp = reputationDemandBp(def.pub, rep);
    if (bp !== 10000) entries.push({ source: { kind: 'reputation', id: b.owner }, op: 'addBp', value: bp - 10000 });
  }
  // Traits of the Business, then of the Recipe
  const addTrait = (traitId: string): void => {
    const t = reg.traitBp[traitId];
    if (!t) return;
    for (const m of [...t.modifiers, ...t.penalty]) if (m.stat === stat) entries.push({ source: { kind: 'trait', id: traitId }, op: 'addBp', value: m.addBp });
  };
  for (const tr of b?.traits ?? []) addTrait(tr.traitId);
  const recipe = target.recipeId ? reg.recipes[target.recipeId] : undefined;
  for (const traitId of recipe?.traits ?? []) addTrait(traitId);
  // Boosts and stored Modifiers (sorted by id, so the list never depends on insertion order)
  for (const m of [...boostModifiers(state), ...(state.modifiers ?? [])]) {
    if (m.stat !== stat || (m.untilTick !== undefined && m.untilTick <= state.tick)) continue;
    if (!matches(m, b, target.businessId, target.recipeId)) continue;
    entries.push({ source: m.source, op: m.op, value: m.value });
  }
  return entries;
}

export function explainStat(env: StatEnv, stat: StatId, target: StatTarget = {}): StatExplanation {
  const b = target.businessId ? env.state.businesses[target.businessId] : undefined;
  const base = baseOf(env, stat, b);
  const entries = collect(env, stat, target);
  let flat = 0;
  let bp = 0;
  for (const e of entries) {
    if (e.op === 'addFlat') flat += e.value;
    else bp += e.value;
  }
  const d = STAT_DEFS[stat];
  const scaled = d.rounding === 'floor' ? mulDivFloor(base, bp, 10000) : mulDivCeil(base, bp, 10000);
  return { stat, base, entries, flat, bp, total: Math.max(d.min, base + flat + scaled) };
}

/** The value of `stat` for `target`. Pure: reads state and Definitions only, never the RNG. */
export function getStat(env: StatEnv, stat: StatId, target: StatTarget = {}): number {
  return explainStat(env, stat, target).total;
}
