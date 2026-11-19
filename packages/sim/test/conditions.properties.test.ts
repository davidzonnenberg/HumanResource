// Properties 52-55 (tasks 36.4, 36.6, 36.7, 36.8): vocabulary validation, condition purity,
// the Condition round trip and the Gold bounds of Effects.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '../src/conditions/evaluate';
import { applyEffects } from '../src/conditions/effects';
import { parseCondition, printCondition } from '../src/conditions/text';
import type { DomainEvent } from '../src/core/events';
import { CONDITION_KINDS, DOMAIN_OPS, EFFECT_KINDS, STAT_IDS } from '../src/defs/vocabulary';
import { GOLD_LIMIT } from '../src/money/gold';
import { checkGoldLimit } from '../src/invariants/check';
import { arbCondition, arbEffect } from './arbitraries/conditions';
import { arbSimState } from './arbitraries/simState';
import { errorsOf, patchedContent, withServices } from './contentVariants';
import { ctxOf } from './ctx';
import { freshSim, registry } from './helpers';

const unknownName = (known: readonly string[]): fc.Arbitrary<string> => fc.stringMatching(/^[a-z][a-zA-Z]{2,12}$/).filter((s) => !known.includes(s));
const svc = (over: Record<string, unknown>): Record<string, unknown> => ({ id: 'svc_t', nameKey: 'svc.t', cost: 0, access: 'remote', conditions: [], effects: [], ...over });

describe('Property 52: unknown stat, condition, effect or domain op is rejected', () => {
  // Feature: human-resource-mvp, Property 52 (Validates: Requirements 50.3, 50.4, 52.3, 73.7)
  it('an unknown Condition kind in an Achievement names the Definition and the entry', () => {
    fc.assert(
      fc.property(unknownName(CONDITION_KINDS), (kind) => {
        const raw = patchedContent((r) => {
          (r.achievements as { condition: unknown }[])[0] = { ...(r.achievements as Record<string, unknown>[])[0], condition: { kind } } as { condition: unknown };
        });
        const first = (raw.achievements as { id: string }[])[0] as { id: string };
        expect(errorsOf(raw)).toContainEqual(expect.objectContaining({ definition: `achievements#${first.id}`, message: expect.stringContaining(`"${kind}"`) }));
      }),
      { numRuns: 25 },
    );
  });
  it('an unknown Condition kind nested in all / not is found too', () => {
    const raw = patchedContent((r) => {
      (r.revealTriggers as Record<string, unknown>[])[0]!.condition = { kind: 'all', of: [{ kind: 'never' }, { kind: 'not', of: { kind: 'bogusKind' } }] };
    });
    const id = ((raw.revealTriggers as { id: string }[])[0] as { id: string }).id;
    expect(errorsOf(raw)).toContainEqual(expect.objectContaining({ definition: `reveal-triggers#${id}`, field: 'condition.of.1.of', message: expect.stringContaining('"bogusKind"') }));
  });
  it('an unknown Effect kind, domain op or StatId in a Service is rejected with its path', () => {
    fc.assert(
      fc.property(unknownName(EFFECT_KINDS), unknownName(DOMAIN_OPS), unknownName(STAT_IDS), (kind, op, stat) => {
        const errs = errorsOf(
          withServices('pub_cosy_local', [
            svc({
              id: 'svc_a',
              effects: [{ kind }, { kind: 'domain', op }, { kind: 'addModifier', stat, op: 'addBp', value: 1 }],
              conditions: [{ condition: { kind: 'statAtLeast', stat, value: 1 } }],
            }),
          ]),
        );
        const msgs = errs.map((e) => `${e.definition} ${e.field} ${e.message}`);
        expect(msgs.some((m) => m.includes('svc_a') && m.includes(`Effect kind "${kind}"`))).toBe(true);
        expect(msgs.some((m) => m.includes('svc_a') && m.includes(`domain op "${op}"`))).toBe(true);
        expect(msgs.some((m) => m.includes('svc_a') && m.includes(`StatId "${stat}"`))).toBe(true);
      }),
      { numRuns: 25 },
    );
  });
  it('an unknown StatId in a Trait is rejected naming the Trait', () => {
    const raw = patchedContent((r) => {
      (r.traits as Record<string, unknown>[])[0]!.modifiers = [{ stat: 'consumptionSpeed', addPct: 5 }];
    });
    const id = ((raw.traits as { id: string }[])[0] as { id: string }).id;
    expect(errorsOf(raw)).toContainEqual(expect.objectContaining({ definition: `traits#${id}`, message: expect.stringContaining('"consumptionSpeed"') }));
  });
  it('accepts every registered domain op and the whole Condition vocabulary', () => {
    const effects = DOMAIN_OPS.map((op) => ({ kind: 'domain', op }));
    const errs = errorsOf(withServices('pub_cosy_local', [svc({ id: 'svc_ok', effects, conditions: [{ condition: { kind: 'not', of: { kind: 'never' } } }] })]));
    expect(errs).toEqual([]);
  });
});

describe('Property 53: Condition evaluation is pure', () => {
  // Feature: human-resource-mvp, Property 53 (Validates: Requirements 52.1, 52.5)
  const events: DomainEvent[] = [
    { type: 'news', item: { tick: 1, textKey: 'news.x', params: {} } },
    { type: 'customerArrived', pubId: 'biz_0001', owner: 'player' },
  ];
  it('returns a boolean, never throws, never touches the RNG and never changes the state', () => {
    const reg = registry();
    fc.assert(
      fc.property(arbSimState(reg), fc.array(arbCondition, { minLength: 1, maxLength: 12 }), fc.boolean(), (state, conds, withEvents) => {
        const before = JSON.stringify(state);
        const rng = [...state.rng];
        for (const c of conds) {
          const r = evaluateCondition(c, state, withEvents ? events : [], reg);
          expect(typeof r).toBe('boolean');
        }
        expect(state.rng).toEqual(rng);
        expect(JSON.stringify(state)).toBe(before);
      }),
      { numRuns: 25 },
    );
  });
});

describe('Property 54: Condition print and parse round trip', () => {
  // Feature: human-resource-mvp, Property 54 (Validates: Requirements 52.7)
  it('parse(print(c)) equals c and print is canonical', () => {
    fc.assert(
      fc.property(arbCondition, (c) => {
        const text = printCondition(c);
        const back = parseCondition(text);
        expect(back).toEqual(c);
        expect(printCondition(back)).toBe(text);
      }),
      { numRuns: 200 },
    );
  });
  it('key order of the input does not change the canonical text', () => {
    const a = printCondition({ kind: 'statAtLeast', stat: 'demand', value: 5, businessId: 'biz_0001' });
    const b = printCondition(JSON.parse('{"businessId":"biz_0001","value":5,"stat":"demand","kind":"statAtLeast"}'));
    expect(a).toBe(b);
    expect(a.startsWith('{"kind"')).toBe(true);
  });
  it('rejects text that is not a Condition', () => {
    expect(() => parseCondition('{"kind":"nope"}')).toThrow();
    expect(() => parseCondition('not json')).toThrow();
  });
});

describe('Property 55: Effects keep Gold within bounds', () => {
  // Feature: human-resource-mvp, Property 55 (Validates: Requirements 52.2, 52.4, 52.6, 79.2)
  it('every Gold value stays within GOLD_LIMIT after applyEffects, from any start', () => {
    fc.assert(
      fc.property(fc.integer({ min: -GOLD_LIMIT, max: GOLD_LIMIT }), fc.array(arbEffect, { maxLength: 8 }), fc.integer(), (startGold, effects, seed) => {
        const sim = freshSim(seed);
        sim.state.player.gold = startGold;
        const ctx = ctxOf(sim);
        applyEffects(ctx, effects, { source: 'test' });
        expect(Math.abs(sim.state.player.gold)).toBeLessThanOrEqual(GOLD_LIMIT);
        expect(checkGoldLimit(sim.state)).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });
  it('a gold Effect past the limit is rejected by the schema', () => {
    const errs = errorsOf(withServices('pub_cosy_local', [svc({ id: 'svc_big', effects: [{ kind: 'gold', amount: GOLD_LIMIT }] })]));
    expect(errs.some((e) => e.definition === 'businesses#pub_cosy_local' && e.field.startsWith('services.0.effects.0'))).toBe(true);
  });
  it('range amounts draw from the RNG in Effect order, plain amounts draw nothing', () => {
    const plain = freshSim(5);
    applyEffects(ctxOf(plain), [{ kind: 'gold', amount: 100 }], { source: 't' });
    expect(plain.state.rng).toEqual(freshSim(5).state.rng);
    const a = freshSim(5);
    const b = freshSim(5);
    applyEffects(ctxOf(a), [{ kind: 'gold', amount: { range: [1, 9] } }, { kind: 'gold', amount: { range: [1, 9] } }], { source: 't' });
    applyEffects(ctxOf(b), [{ kind: 'gold', amount: { range: [1, 9] } }, { kind: 'gold', amount: { range: [1, 9] } }], { source: 't' });
    expect(a.state).toEqual(b.state);
    expect(a.state.rng).not.toEqual(freshSim(5).state.rng);
  });
});
