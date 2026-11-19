// Properties 49-51 (tasks 35.4, 35.6, 35.7): getStat equivalence, confluence and expiry.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/simulation';
import { STAT_IDS, type StatId } from '../src/defs/vocabulary';
import { explainStat, getStat } from '../src/stats/getStat';
import { addModifier } from '../src/stats/modifiers';
import { newGame } from '../src/state/newGame';
import type { Modifier } from '../src/state/types';
import { firstPlayerPub } from '../src/world/queries';
import { baselineCases, caseKey, readBaseline, STATS_UNDER_BASELINE, type BaselineCase } from './baseline/legacyStats';
import { freshSim, registry } from './helpers';

/** A state whose first Player Pub is set up exactly as the baseline case describes. */
function stateFor(c: BaselineCase): { sim: Simulation; businessId: string } {
  const reg = registry();
  const sim = new Simulation(reg, newGame(reg, 1));
  const b = firstPlayerPub(reg, sim.state);
  if (!b) throw new Error('no Player Pub');
  b.defId = c.pubDefId;
  b.brandId = c.brandId;
  b.traits = c.traitIds.map((traitId) => ({ traitId, hidden: false }));
  sim.state.player.reputation = c.reputation;
  return { sim, businessId: b.id };
}

describe('Property 49: getStat equivalence with the earlier direct computation', () => {
  // Feature: human-resource-mvp, Property 49 (Validates: Requirements 50.2, 50.6)
  it('getStat returns the baseline value for every stored case', () => {
    const reg = registry();
    const baseline = readBaseline();
    const cases = baselineCases(reg);
    expect(cases.length).toBeGreaterThan(100);
    for (const c of cases) {
      const { sim, businessId } = stateFor(c);
      const expected = baseline[caseKey(c)] as number[];
      STATS_UNDER_BASELINE.forEach((stat, i) => {
        const got = getStat(sim, stat, { businessId, recipeId: c.recipeId });
        expect(got, `${caseKey(c)} ${stat}`).toBe(expected[i]);
      });
    }
  });
  it('holds for randomly drawn cases (property form)', () => {
    const reg = registry();
    const baseline = readBaseline();
    const cases = baselineCases(reg);
    fc.assert(
      fc.property(fc.constantFrom(...cases), (c) => {
        const { sim, businessId } = stateFor(c);
        const expected = baseline[caseKey(c)] as number[];
        return STATS_UNDER_BASELINE.every((stat, i) => getStat(sim, stat, { businessId, recipeId: c.recipeId }) === expected[i]);
      }),
      { numRuns: 100 },
    );
  });
});

const arbModifier = (businessId: string): fc.Arbitrary<Omit<Modifier, 'id'>> =>
  fc.record({
    source: fc.constant({ kind: 'effect' as const, id: 'test' }),
    target: fc.oneof(
      fc.constant({ kind: 'all' as const }),
      fc.constant({ kind: 'owner' as const, owner: 'player' }),
      fc.constant({ kind: 'business' as const, id: businessId }),
      fc.constant({ kind: 'recipe' as const, id: 'golden_ale' }),
    ),
    stat: fc.constantFrom<StatId>(...STAT_IDS),
    op: fc.constantFrom('addBp' as const, 'addFlat' as const),
    value: fc.integer({ min: -3000, max: 3000 }),
  });

describe('Property 50: getStat confluence', () => {
  // Feature: human-resource-mvp, Property 50 (Validates: Requirements 50.1, 50.2, 50.9)
  it('does not depend on the order in which Modifiers were added', () => {
    const base = freshSim(1);
    const pubId = (firstPlayerPub(base.reg, base.state) as { id: string }).id;
    fc.assert(
      fc.property(fc.array(arbModifier(pubId), { maxLength: 8 }), fc.integer(), (mods, seed) => {
        const a = freshSim(1);
        const b = freshSim(1);
        for (const m of mods) addModifier(a.state, m);
        // Same Modifiers stored in a scrambled order (a deterministic shuffle driven by `seed`).
        const order = mods.map((m, i) => ({ m, k: Math.imul(i + 1, seed | 1) >>> 0 })).sort((x, y) => x.k - y.k);
        for (const { m } of order) addModifier(b.state, m);
        b.state.modifiers = [...(b.state.modifiers ?? [])].reverse(); // even the stored array order must not matter
        for (const stat of STAT_IDS) {
          for (const recipeId of [null, 'golden_ale']) {
            expect(getStat(b, stat, { businessId: pubId, recipeId })).toBe(getStat(a, stat, { businessId: pubId, recipeId }));
          }
        }
      }),
      { numRuns: 60 },
    );
  });
  it('is base + flat + floor(base * bp / 10000), and explainStat lists every entry', () => {
    const sim = freshSim(1);
    const pubId = (firstPlayerPub(sim.reg, sim.state) as { id: string }).id;
    addModifier(sim.state, { source: { kind: 'effect', id: 'a' }, target: { kind: 'business', id: pubId }, stat: 'repeatOrderChance', op: 'addBp', value: 2500 });
    addModifier(sim.state, { source: { kind: 'effect', id: 'b' }, target: { kind: 'all' }, stat: 'repeatOrderChance', op: 'addFlat', value: 7 });
    const ex = explainStat(sim, 'repeatOrderChance', { businessId: pubId });
    expect(ex.base).toBe(4500);
    expect(ex.entries.map((e) => e.source.id)).toEqual(['a', 'b']);
    expect(ex.total).toBe(4500 + 7 + Math.floor((4500 * 2500) / 10000));
  });
});

describe('Property 51: Modifier expiry', () => {
  // Feature: human-resource-mvp, Property 51 (Validates: Requirements 50.5)
  it('a Modifier is gone in the Tick that reaches its untilTick and never read afterwards', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: -2000, max: 2000 }), (n, value) => {
        const sim = freshSim(3);
        const pubId = (firstPlayerPub(sim.reg, sim.state) as { id: string }).id;
        const before = getStat(sim, 'demand', { businessId: pubId });
        addModifier(sim.state, { source: { kind: 'effect', id: 't' }, target: { kind: 'business', id: pubId }, stat: 'demand', op: 'addBp', value, untilTick: sim.state.tick + n });
        for (let i = 0; i < n - 1; i++) sim.tick();
        expect(sim.state.modifiers?.length).toBe(1);
        sim.tick(); // tick === untilTick: removed before any system reads a stat
        expect(sim.state.modifiers ?? []).toHaveLength(0);
        // Reputation does not change here, so the stat is back to its unmodified value.
        expect(getStat(sim, 'demand', { businessId: pubId })).toBe(before);
      }),
      { numRuns: 30 },
    );
  });
});
