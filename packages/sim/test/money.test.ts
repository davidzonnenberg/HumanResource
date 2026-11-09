// Unit tests for the integer Gold helpers (task 3.9) and the Gold display rounding property
// (task 13.2, Requirement 8.8).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyGold,
  costOf,
  financeSummary,
  GOLD_LIMIT,
  goldFromWhole,
  goldToWholeFloor,
  mulDivCeil,
  mulDivFloor,
  requireGold,
  rewardOf,
} from '../src/money/gold';
import { newGame } from '../src/state/newGame';
import { PLAYER } from '../src/state/types';
import { registry } from './helpers';

const TICKS_PER_SECOND = 10; // 100 ms Ticks
const WINDOW_SECONDS = 300;

const freshState = () => newGame(registry(), 1);

describe('mulDivFloor and mulDivCeil', () => {
  it('round towards minus infinity and towards plus infinity respectively', () => {
    expect(mulDivFloor(7, 1, 2)).toBe(3);
    expect(mulDivFloor(-7, 1, 2)).toBe(-4);
    expect(mulDivCeil(7, 1, 2)).toBe(4);
    expect(mulDivCeil(8, 1, 2)).toBe(4);
  });

  it('bracket the exact quotient for integer inputs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 1, max: 1000 }), (a, n, d) => {
        const r = mulDivFloor(a, n, d);
        expect(r * d).toBeLessThanOrEqual(a * n);
        expect((r + 1) * d).toBeGreaterThan(a * n);
        const c = mulDivCeil(a, n, d);
        expect((c - 1) * d).toBeLessThan(a * n);
        expect(c * d).toBeGreaterThanOrEqual(a * n);
      }),
    );
  });
});

describe('costOf and rewardOf rounding', () => {
  it('costs round up and rewards round down', () => {
    expect(costOf(100, 0.333)).toBe(34);
    expect(rewardOf(100, 0.333)).toBe(33);
  });

  it('exact products are not pushed off by floating point error', () => {
    // 300 * 0.05 is 15.000000000000002 in floating point; both helpers must still return 15.
    expect(costOf(300, 0.05)).toBe(15);
    expect(rewardOf(300, 0.05)).toBe(15);
  });

  it('for percentage factors, costs never underpay and rewards never overpay', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 10_000 }), (base, bp) => {
        const factor = bp / 10_000;
        const cost = costOf(base, factor);
        const reward = rewardOf(base, factor);
        // Exact value is base * bp / 10000 hundredths; compare in integers scaled by 10000.
        expect(cost * 10_000).toBeGreaterThanOrEqual(base * bp);
        expect((cost - 1) * 10_000).toBeLessThan(base * bp);
        expect(reward * 10_000).toBeLessThanOrEqual(base * bp);
        expect((reward + 1) * 10_000).toBeGreaterThan(base * bp);
      }),
    );
  });
});

describe('Gold display rounding (Property 45)', () => {
  it('goldFromWhole and goldToWholeFloor round trip whole Gold', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), (whole) => {
        expect(goldToWholeFloor(goldFromWhole(whole))).toBe(whole);
      }),
    );
  });

  // Feature: human-resource-mvp, Property 45: Gold display rounding
  it('Property 45: the display value is the floor of hundredths, so it never shows more Gold than the Player has', () => {
    fc.assert(
      fc.property(fc.integer({ min: -GOLD_LIMIT, max: GOLD_LIMIT }), (g) => {
        const shown = goldToWholeFloor(g);
        expect(shown * 100).toBeLessThanOrEqual(g);
        expect(g).toBeLessThan(shown * 100 + 100);
      }),
    );
  });

  it('examples: 199 hundredths shows 1 Gold, -1 hundredth shows -1 Gold', () => {
    expect(goldToWholeFloor(199)).toBe(1);
    expect(goldToWholeFloor(200)).toBe(2);
    expect(goldToWholeFloor(-1)).toBe(-1);
    expect(goldToWholeFloor(0)).toBe(0);
  });
});

describe('requireGold', () => {
  it('reports the exact shortfall when the Player cannot pay', () => {
    const s = freshState();
    s.player.gold = 1000;
    expect(requireGold(s, PLAYER, 1500)).toEqual({ ok: false, reason: 'insufficient_gold', missingGold: 500 });
    expect(requireGold(s, PLAYER, 1000)).toEqual({ ok: true });
  });

  it('never blocks Competitor owners (Gold is not tracked for them, 8.9)', () => {
    const s = freshState();
    s.player.gold = 0;
    expect(requireGold(s, 'cmp_rival', 10_000_000)).toEqual({ ok: true });
  });
});

describe('applyGold and finance buckets', () => {
  it('changes Player Gold and records the change under category|source', () => {
    const s = freshState();
    const before = s.player.gold;
    applyGold(s, PLAYER, 250, 'sales', 'pub_1', TICKS_PER_SECOND, WINDOW_SECONDS);
    expect(s.player.gold).toBe(before + 250);
    const summary = financeSummary(s, TICKS_PER_SECOND, WINDOW_SECONDS);
    expect(summary.byCategory.sales).toBe(250);
  });

  it('is a no-op for Competitor owners and for zero deltas', () => {
    const s = freshState();
    const before = s.player.gold;
    const bucketsBefore = s.finance.buckets.length;
    applyGold(s, 'cmp_rival', 500, 'sales', 'pub_x', TICKS_PER_SECOND, WINDOW_SECONDS);
    applyGold(s, PLAYER, 0, 'sales', 'pub_1', TICKS_PER_SECOND, WINDOW_SECONDS);
    expect(s.player.gold).toBe(before);
    expect(s.finance.buckets.length).toBe(bucketsBefore);
  });

  it('drops buckets older than the window', () => {
    const s = freshState();
    s.tick = 0;
    applyGold(s, PLAYER, 100, 'sales', 'early', TICKS_PER_SECOND, WINDOW_SECONDS);
    s.tick = (WINDOW_SECONDS + 1) * TICKS_PER_SECOND;
    applyGold(s, PLAYER, 40, 'sales', 'late', TICKS_PER_SECOND, WINDOW_SECONDS);
    const summary = financeSummary(s, TICKS_PER_SECOND, WINDOW_SECONDS);
    expect(summary.byCategory.sales).toBe(40);
  });

  it('income minus expenses over the window equals the sum of all Gold changes', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: -5000, max: 5000 }).filter((d) => d !== 0), fc.constantFrom('sales', 'other')), { maxLength: 30 }), (ops) => {
        const s = freshState();
        const start = s.player.gold;
        let total = 0;
        let second = 0;
        for (const [gap, delta, category] of ops) {
          second += gap % 3; // stay well inside the 300 s window
          s.tick = second * TICKS_PER_SECOND;
          applyGold(s, PLAYER, delta, category, 'src', TICKS_PER_SECOND, WINDOW_SECONDS);
          total += delta;
        }
        const summary = financeSummary(s, TICKS_PER_SECOND, WINDOW_SECONDS);
        expect(summary.income - summary.expenses).toBe(total);
        expect(s.player.gold).toBe(start + total);
      }),
    );
  });
});
