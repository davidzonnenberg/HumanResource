// FROZEN reference of the "earlier direct computation" of stats (tasks 35.1, 35.4; Requirement 50.6).
//
// Before the Modifier system, no system read Brand multipliers, Trait modifiers or Recipe Traits at
// all: the only direct computations were the Brand basis-point conversion done in the registry
// (`Math.round(mul * 10000)`), the Reputation demand formula (`piecewise` of the Pub's data points)
// and the repeat-order clamp. This file restates those computations, and the Trait `addPct` rule of
// the design, using only raw Definition data, with NO import from `stats/`. Do not "simplify" it to
// call getStat: its job is to stay independent. The outputs for a grid of Traits, Brands, Recipes and
// Reputation values are stored in `stat-baseline.json`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DefinitionRegistry } from '../../src/defs/registry';
import { piecewise } from '../../src/defs/formulas';
import type { StatId } from '../../src/defs/vocabulary';

export interface BaselineCase {
  pubDefId: string;
  brandId: string | null;
  traitIds: string[];
  recipeId: string | null;
  reputation: number;
}

export const caseKey = (c: BaselineCase): string =>
  [c.pubDefId, c.brandId ?? '-', c.traitIds.join('+') || '-', c.recipeId ?? '-', c.reputation].join('|');

const traitBp = (reg: DefinitionRegistry, traitId: string, stat: StatId): number => {
  const t = reg.traits[traitId];
  if (!t) return 0;
  let s = 0;
  for (const m of [...t.modifiers, ...(t.liability?.penalty ?? [])]) if (m.stat === stat) s += Math.round(m.addPct * 100);
  return s;
};

/** Value of `stat` for the case, as the direct (pre-getStat) computation gives it. */
export function legacyStat(reg: DefinitionRegistry, stat: StatId, c: BaselineCase): number {
  const pub = reg.businesses[c.pubDefId]?.pub;
  if (!pub) throw new Error(`not a Pub: ${c.pubDefId}`);
  const brand = c.brandId ? reg.brands[c.brandId]?.perVenue[pub.venueType] : undefined;
  const recipeTraits = c.recipeId ? (reg.recipes[c.recipeId]?.traits ?? []) : [];
  const traitSum = (): number => [...c.traitIds, ...recipeTraits].reduce((s, t) => s + traitBp(reg, t, stat), 0);
  const base = stat === 'repeatOrderChance' ? Math.round(pub.repeatOrderChance * 10000) : 10000;
  let delta = traitSum();
  if (stat === 'demand') {
    if (brand) delta += Math.round(brand.demandMul * 10000) - 10000;
    delta += Math.round(piecewise(pub.demand.reputation.points, c.reputation) * 10000) - 10000;
  }
  if (stat === 'premiumPrice' && brand) delta += Math.round(brand.priceMul * 10000) - 10000;
  return Math.max(0, base + Math.floor((base * delta) / 10000));
}

/** The grid stored in the baseline: every Pub Definition x Brand x Trait set x Recipe x Reputation. */
export function baselineCases(reg: DefinitionRegistry): BaselineCase[] {
  const pubs = Object.values(reg.businesses).filter((b) => b.pub).map((b) => b.id).sort();
  const brands: (string | null)[] = [null, ...Object.keys(reg.brands).sort()];
  const businessTraits = Object.values(reg.traits).filter((t) => t.target === 'business').map((t) => t.id).sort();
  const traitSets: string[][] = [[], ...businessTraits.map((t) => [t]), businessTraits];
  const recipes: (string | null)[] = [null, ...Object.keys(reg.recipes).sort()];
  const out: BaselineCase[] = [];
  for (const pubDefId of pubs)
    for (const brandId of brands)
      for (const traitIds of traitSets)
        for (const recipeId of recipes) for (const reputation of [0, 30, 50, 100]) out.push({ pubDefId, brandId, traitIds, recipeId, reputation });
  return out;
}

export const STATS_UNDER_BASELINE: readonly StatId[] = ['demand', 'premiumPrice', 'repeatOrderChance'];

export const BASELINE_FILE = fileURLToPath(new URL('./stat-baseline.json', import.meta.url));
/** key -> [demand, premiumPrice, repeatOrderChance] */
export type Baseline = Record<string, number[]>;
export function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Baseline;
}
