// Required core property tests (Requirement 44.2).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Simulation, cloneState } from '../src/core/simulation';
import { newGame } from '../src/state/newGame';
import { checkInvariants, physicalTotals } from '../src/invariants/check';
import { arbSchedule, registry, run } from './helpers';

const TICKS = 900; // 90 game seconds per run

describe('core simulation properties', () => {
  // Feature: human-resource-mvp, Property 1: Determinism
  it('Property 1: identical state, seed and Commands give identical states after every Tick', () => {
    fc.assert(
      fc.property(fc.integer(), arbSchedule(TICKS), (seed, schedule) => {
        const reg = registry();
        const a = new Simulation(reg, newGame(reg, seed));
        const b = new Simulation(reg, newGame(reg, seed));
        // Full states every 25 Ticks plus the final Tick; results and events after every Tick.
        const ra = run(a, schedule, TICKS, { snapshots: true, snapshotEvery: 25 });
        const rb = run(b, schedule, TICKS, { snapshots: true, snapshotEvery: 25 });
        expect(rb.snapshots).toEqual(ra.snapshots);
        expect(rb.outputs.map((o) => o.results)).toEqual(ra.outputs.map((o) => o.results));
        expect(rb.outputs.map((o) => o.events)).toEqual(ra.outputs.map((o) => o.events));
      }),
      { numRuns: 100 },
    );
  });

  // Feature: human-resource-mvp, Property 2: Storage and cargo capacity invariant
  it('Property 2: Storage stays within [0, capacity] and cargo within Vehicle capacity', () => {
    fc.assert(
      fc.property(fc.integer(), arbSchedule(TICKS), (seed, schedule) => {
        const reg = registry();
        const sim = new Simulation(reg, newGame(reg, seed));
        run(sim, schedule, TICKS, {
          each: (s) => {
            const bad = checkInvariants(s.state, reg).filter((v) => v.code === 'storage_over_capacity' || v.code === 'storage_negative' || v.code === 'cargo_over_capacity' || v.code === 'stock_lots_mismatch');
            expect(bad).toEqual([]);
          },
        });
      }),
      { numRuns: 100 },
    );
  });

  // Feature: human-resource-mvp, Property 3: Resource conservation
  it('Property 3: Resource totals change only through ledgered creation/removal', () => {
    fc.assert(
      fc.property(fc.integer(), arbSchedule(TICKS), (seed, schedule) => {
        const reg = registry();
        const sim = new Simulation(reg, newGame(reg, seed));
        let prev = physicalTotals(sim.state);
        run(sim, schedule, TICKS, {
          each: (s, out) => {
            const now = physicalTotals(s.state);
            for (const r of Object.keys(reg.resources)) {
              const ledgered = Object.entries(out.ledger)
                .filter(([k]) => k.startsWith(`${r}|`))
                .reduce((sum, [, v]) => sum + v, 0);
              expect((now[r] ?? 0) - (prev[r] ?? 0)).toBe(ledgered);
            }
            if (s.state.tick % 10 === 0) expect(checkInvariants(s.state, reg).filter((v) => v.code === 'conservation')).toEqual([]);
            prev = now;
          },
        });
      }),
      { numRuns: 100 },
    );
  });

  it('all invariants hold over a long default run', () => {
    const reg = registry();
    const sim = new Simulation(reg, newGame(reg, 42));
    for (let t = 0; t < 6000; t++) {
      sim.tick();
      if (t % 100 === 0) expect(checkInvariants(sim.state, reg)).toEqual([]);
    }
    expect(checkInvariants(cloneState(sim.state), reg)).toEqual([]);
  });
});
