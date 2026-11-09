import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { demandPerMinute } from '../src/defs/formulas';
import { Simulation } from '../src/core/simulation';
import { newGame } from '../src/state/newGame';
import { GOLD_LIMIT } from '../src/money/gold';
import { checkGoldLimit } from '../src/invariants/check';
import { pendingQuantity, storageCapacity } from '../src/world/queries';
import { arbSchedule, registry, run } from './helpers';

describe('economy properties', () => {
  // Feature: human-resource-mvp, Property 9: Price monotonicity of arrivals
  it('Property 9: a higher drink price never increases the arrival rate', () => {
    const reg = registry();
    const pubs = Object.values(reg.businesses).filter((b) => b.pub);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 0, max: 100 }), fc.nat(pubs.length - 1), (p1, p2, rep, i) => {
        const def = pubs[i]?.pub;
        if (!def) return;
        const [lo, hi] = p1 <= p2 ? [p1, p2] : [p2, p1];
        expect(demandPerMinute(def, hi, rep)).toBeLessThanOrEqual(demandPerMinute(def, lo, rep));
      }),
    );
  });

  // Feature: human-resource-mvp, Property 16: Auto-reorder never overfills
  it('Property 16: stock + Pending_Quantity never exceeds capacity because of auto-reorder', () => {
    fc.assert(
      fc.property(fc.integer(), arbSchedule(1200), (seed, schedule) => {
        const reg = registry();
        const sim = new Simulation(reg, newGame(reg, seed));
        // Manual orders may legitimately overfill, so only auto-reorder choices are kept.
        const auto = schedule.filter((s) => s.choice.k !== 'order');
        run(sim, auto, 1200, {
          each: (s, out) => {
            const placed = out.events.some((e) => e.type === 'orderPlaced');
            if (!placed) return;
            for (const b of Object.values(s.state.businesses)) {
              for (const res of Object.keys(b.autoReorder)) {
                const total = (b.storage[res]?.amount ?? 0) + pendingQuantity(s.state, b.id, res);
                expect(total).toBeLessThanOrEqual(storageCapacity(reg, b, res));
              }
            }
          },
        });
      }),
      { numRuns: 100 },
    );
  });

  // Feature: human-resource-mvp, Property 47: Gold safe-integer limit
  it('Property 47: Gold values beyond ±2^50 hundredths are reported, values at the limit are not', () => {
    const reg = registry();
    const base = newGame(reg, 1);
    const at = (g: number) => checkGoldLimit({ ...base, player: { ...base.player, gold: g } });
    expect(at(GOLD_LIMIT)).toEqual([]);
    expect(at(-GOLD_LIMIT)).toEqual([]);
    expect(at(GOLD_LIMIT + 1)[0]?.code).toBe('gold_limit_exceeded');
    expect(at(-(GOLD_LIMIT + 1))[0]?.path).toBe('player.gold');
    fc.assert(
      fc.property(fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }), (g) => {
        const reported = at(g).length > 0;
        expect(reported).toBe(Math.abs(g) > GOLD_LIMIT);
      }),
    );
  });

  it('a default 10-minute run earns Gold, delivers Beer and keeps the pub serving', () => {
    const reg = registry();
    const sim = new Simulation(reg, newGame(reg, 7));
    let paid = 0;
    let unloaded = 0;
    for (let t = 0; t < 6000; t++) {
      const out = sim.tick();
      for (const e of out.events) {
        if (e.type === 'customerPaid' && e.owner === 'player') paid += e.amount;
        if (e.type === 'vehicleUnloaded' && e.owner === 'player') unloaded += e.qty;
      }
    }
    expect(paid).toBeGreaterThan(0);
    expect(unloaded).toBeGreaterThan(0);
  });
});
