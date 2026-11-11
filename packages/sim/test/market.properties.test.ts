// Required property test (Requirement 44.2): Market price bounds (Requirements 30.2, 30.3, 30.6).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { MarketConfig } from '../src/defs/schemas';
import { seedRng } from '../src/rng/xoshiro128ss';
import { MARKET_HISTORY_LENGTH, walkMarket } from '../src/systems/phase2/market';
import type { MarketState } from '../src/state/types';

/**
 * Valid market data for one Resource, following the registry rules: min > 0, minSpread >= 1,
 * step >= 1 and min + minSpread <= base <= max.
 */
const arbResourceMarket = fc
  .record({
    min: fc.integer({ min: 1, max: 500 }),
    minSpread: fc.integer({ min: 1, max: 80 }),
    step: fc.integer({ min: 1, max: 80 }),
    aboveFloor: fc.integer({ min: 0, max: 400 }),
    headroom: fc.integer({ min: 0, max: 400 }),
  })
  .map(({ min, minSpread, step, aboveFloor, headroom }) => {
    const base = min + minSpread + aboveFloor;
    return { base, min, max: base + headroom, minSpread, step };
  });

const arbMarketConfig: fc.Arbitrary<MarketConfig> = fc
  .array(arbResourceMarket, { minLength: 1, maxLength: 3 })
  .map((rs) => ({ intervalSeconds: 30, resources: Object.fromEntries(rs.map((r, i) => [`res_${i}`, r])) }));

/** Start prices exactly as newGame sets them: buy = base, sell = base - minSpread, empty history. */
function startMarket(cfg: MarketConfig): MarketState {
  return {
    prices: Object.fromEntries(Object.entries(cfg.resources).map(([res, m]) => [res, { buy: m.base, sell: m.base - m.minSpread, history: [] }])),
    nextUpdateTick: 0,
  };
}

describe('Market price bounds', () => {
  // Feature: human-resource-mvp, Property 37: Market price bounds
  it('Property 37: buy > sell and both prices stay within [min, max] after any number of updates', () => {
    fc.assert(
      fc.property(arbMarketConfig, fc.integer(), fc.nat(400), (cfg, seed, updates) => {
        const market = startMarket(cfg);
        const holder = { rng: seedRng(seed) };
        for (let u = 0; u < updates; u++) {
          walkMarket(holder, market, cfg);
          for (const [res, m] of Object.entries(cfg.resources)) {
            const p = market.prices[res];
            if (!p) throw new Error(`missing price for ${res}`);
            expect(p.buy).toBeGreaterThan(p.sell);
            expect(p.sell).toBeGreaterThanOrEqual(m.min);
            expect(p.buy).toBeGreaterThanOrEqual(m.min);
            expect(p.sell).toBeLessThanOrEqual(m.max);
            expect(p.buy).toBeLessThanOrEqual(m.max);
          }
        }
        // Trend history keeps the last MARKET_HISTORY_LENGTH sell prices (30.6)
        for (const [res, m] of Object.entries(cfg.resources)) {
          const p = market.prices[res];
          if (!p) throw new Error(`missing price for ${res}`);
          expect(p.history).toHaveLength(Math.min(MARKET_HISTORY_LENGTH, updates));
          for (const h of p.history) expect(h).toBeGreaterThanOrEqual(m.min);
        }
      }),
      { numRuns: 100 },
    );
  });
});
