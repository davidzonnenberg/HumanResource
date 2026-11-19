// Task 35.1: the baseline of the direct stat computations. Stored outputs for a grid of Traits,
// Brands, Recipes and Reputation values. This test must pass before AND after the stat reads were
// ported to getStat (task 35.3): it only uses the frozen reference in legacyStats.ts.
// To re-record on purpose (new Trait/Brand/Recipe content): UPDATE_BASELINE=1 npx vitest run.
import { existsSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { registry } from '../helpers';
import { BASELINE_FILE, baselineCases, caseKey, legacyStat, readBaseline, STATS_UNDER_BASELINE, type Baseline } from './legacyStats';

describe('stat baseline (task 35.1)', () => {
  it('matches the frozen direct computation for every stored case', () => {
    const reg = registry();
    const fresh: Baseline = {};
    for (const c of baselineCases(reg)) fresh[caseKey(c)] = STATS_UNDER_BASELINE.map((s) => legacyStat(reg, s, c));
    if (process.env.UPDATE_BASELINE || !existsSync(BASELINE_FILE)) {
      const lines = Object.entries(fresh).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
      writeFileSync(BASELINE_FILE, `{\n${lines.join(',\n')}\n}\n`);
    }
    expect(fresh).toEqual(readBaseline());
  });

  it('covers Brands, Traits and Recipes of the shipped content', () => {
    const keys = Object.keys(readBaseline());
    expect(keys.some((k) => k.includes('brand_penny_pint'))).toBe(true);
    expect(keys.some((k) => k.includes('friendly_regulars'))).toBe(true);
    expect(keys.some((k) => k.includes('badgers_bite'))).toBe(true);
    // The grid must hold values other than the neutral 10000, or equivalence would be vacuous.
    expect(Object.values(readBaseline()).some((v) => v[0] !== 10000 && v[1] !== 10000)).toBe(true);
  });
});
