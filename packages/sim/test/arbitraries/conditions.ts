// Generators for Conditions and Effects (tasks 36.6, 36.8). Only JSON-safe values: integers, no -0,
// no NaN, so a printed Condition parses back to an equal one.
import fc from 'fast-check';
import type { Condition, Effect } from '../../src/defs/schemas';
import { EFFECT_GOLD_MAX, STAT_IDS } from '../../src/defs/vocabulary';
import { GOLD_LIMIT } from '../../src/money/gold';

const word = fc.constantFrom('a', 'b', 'pub', 'news', 'revealFired', 'customerArrived', 'synergy', 'hiring', 'market');
const smallInt = fc.integer({ min: -50, max: 5000 });

export const arbLeafCondition: fc.Arbitrary<Condition> = fc.oneof(
  fc.record({ kind: fc.constant('event' as const), event: word }),
  fc.record({
    kind: fc.constant('event' as const),
    event: word,
    where: fc.dictionary(fc.constantFrom('owner', 'amount', 'flag'), fc.oneof(word, smallInt, fc.boolean()), { maxKeys: 2 }),
  }),
  fc.record({ kind: fc.constant('goldAtLeast' as const), amount: fc.integer({ min: -GOLD_LIMIT, max: GOLD_LIMIT }) }),
  fc.record({ kind: fc.constant('corporateResourceAtLeast' as const), resourceId: fc.constant('synergy'), amount: smallInt }),
  fc.record({ kind: fc.constant('ownedBusinessCountAtLeast' as const), businessType: fc.constantFrom('pub', 'supplier', 'brewery'), count: fc.integer({ min: 0, max: 5 }) }),
  fc.record({ kind: fc.constant('tickAtLeast' as const), tick: fc.nat(100_000) }),
  fc.constant<Condition>({ kind: 'never' }),
  fc.record({ kind: fc.constant('revealed' as const), feature: word }),
  fc.record({ kind: fc.constantFrom('statAtLeast' as const, 'statBelow' as const), stat: fc.constantFrom(...STAT_IDS), value: smallInt }),
  fc.record({ kind: fc.constantFrom('statAtLeast' as const, 'statBelow' as const), stat: fc.constantFrom(...STAT_IDS), value: smallInt, businessId: fc.constantFrom('biz_0001', 'biz_9999') }),
  fc.constant<Condition>({ kind: 'loanActive' }),
  fc.constant<Condition>({ kind: 'licensed' }),
  fc.record({ kind: fc.constant('licensed' as const), tier: word }),
  fc.constant<Condition>({ kind: 'pubOpen' }),
  fc.record({ kind: fc.constant('pubOpen' as const), businessId: fc.constantFrom('biz_0001', 'biz_9999') }),
  fc.record({ kind: fc.constant('humanCountAtLeast' as const), count: fc.integer({ min: 0, max: 6 }) }),
  fc.record({ kind: fc.constant('humanCountAtLeast' as const), count: fc.integer({ min: 0, max: 6 }), jobId: fc.constantFrom('bartender', 'server', 'driver') }),
  fc.record({ kind: fc.constant('serviceUsed' as const), serviceId: word }),
  fc.record({ kind: fc.constant('questStepDone' as const), questId: word, stepId: word }),
);

/** Conditions nested up to `depth` levels through all / any / not. */
export const arbCondition: fc.Arbitrary<Condition> = fc.letrec<{ cond: Condition }>((tie) => ({
  cond: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    arbLeafCondition,
    fc.record({ kind: fc.constantFrom('all' as const, 'any' as const), of: fc.array(tie('cond'), { maxLength: 3 }) }),
    fc.record({ kind: fc.constant('not' as const), of: tie('cond') }),
  ),
})).cond;

const arbAmount = (lo: number, hi: number): fc.Arbitrary<number | { range: [number, number] }> =>
  fc.oneof(
    fc.integer({ min: lo, max: hi }),
    fc.tuple(fc.integer({ min: lo, max: hi }), fc.integer({ min: lo, max: hi })).map(([a, b]) => ({ range: [Math.min(a, b), Math.max(a, b)] as [number, number] })),
  );

/**
 * Effects that `applyEffects` can run in a plain state: every kind except `domain` (whose ops are
 * stubs until Phase 3). Gold amounts reach the schema bound (+-EFFECT_GOLD_MAX) so the clamp is exercised.
 */
export const arbEffect: fc.Arbitrary<Effect> = fc.oneof(
  fc.record({ kind: fc.constant('gold' as const), amount: arbAmount(-EFFECT_GOLD_MAX, EFFECT_GOLD_MAX) }),
  fc.record({ kind: fc.constant('gold' as const), amount: arbAmount(-EFFECT_GOLD_MAX, EFFECT_GOLD_MAX), category: fc.constantFrom('sales' as const, 'fine' as const, 'other' as const) }),
  fc.record({
    kind: fc.constant('addModifier' as const),
    stat: fc.constantFrom(...STAT_IDS),
    op: fc.constantFrom('addBp' as const, 'addFlat' as const),
    value: fc.integer({ min: -3000, max: 3000 }),
    seconds: fc.integer({ min: 1, max: 120 }),
  }),
  fc.record({ kind: fc.constant('reveal' as const), triggerId: fc.constantFrom('expansion', 'second_pub', 'first_news') }),
  fc.record({ kind: fc.constant('schedule' as const), event: fc.constant('constructionDone' as const), delaySeconds: arbAmount(0, 600) }),
  fc.record({ kind: fc.constant('grantResource' as const), resourceId: fc.constant('synergy'), qty: arbAmount(0, 1000) }),
  fc.record({ kind: fc.constant('news' as const), textKey: fc.constant('news.reputation') }),
);
