// Savings account (bank app): transfers are internal, conserve total money, and never touch the ledger.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../src/invariants/check';
import { freshSim, registry } from './helpers';

describe('transferSavings', () => {
  it('a new game starts with empty savings', () => {
    expect(freshSim(1).state.player.savings).toBe(0);
  });

  it('moves money to savings and back, and is not income or expense', () => {
    const sim = freshSim(2);
    sim.state.player.gold = 100_000;
    const buckets = JSON.stringify(sim.state.finance.buckets);
    sim.submit({ type: 'transferSavings', direction: 'toSavings', amount: 30_000 });
    expect(sim.tick().results[0]).toMatchObject({ ok: true });
    expect(sim.state.player.savings).toBe(30_000);
    expect(JSON.stringify(sim.state.finance.buckets)).toBe(buckets);
    const goldAfter = sim.state.player.gold;
    sim.submit({ type: 'transferSavings', direction: 'toBalance', amount: 10_000 });
    expect(sim.tick().results[0]).toMatchObject({ ok: true });
    expect(sim.state.player.savings).toBe(20_000);
    expect(sim.state.player.gold).toBeGreaterThanOrEqual(goldAfter + 10_000 - 1_000_000); // pub income may land in the same Tick
    expect(checkInvariants(sim.state, registry())).toEqual([]);
  });

  it('rejects with the exact shortfall and changes nothing', () => {
    const sim = freshSim(3);
    sim.state.player.gold = 5_000;
    sim.state.player.savings = 2_000;
    sim.submit({ type: 'transferSavings', direction: 'toSavings', amount: 7_500 });
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'insufficient_gold', missingGold: 2_500 });
    sim.submit({ type: 'transferSavings', direction: 'toBalance', amount: 2_600 });
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'insufficient_gold', missingGold: 600 });
    expect(sim.state.player.savings).toBe(2_000);
  });

  it('cannot move money out of a balance account that is in debt, and rejects bad amounts', () => {
    const sim = freshSim(4);
    sim.state.player.gold = -1_000;
    sim.submit({ type: 'transferSavings', direction: 'toSavings', amount: 500 });
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'insufficient_gold', missingGold: 500 });
    for (const amount of [0, -5, 1.5, Number.NaN]) {
      sim.submit({ type: 'transferSavings', direction: 'toSavings', amount });
      expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'invalid_quantity' });
    }
  });

  // Feature: ceo-phone, bank: savings follow a simple model and are never negative
  it('property: savings equal the model of accepted transfers (commands run before other systems in a Tick)', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ to: fc.boolean(), amount: fc.integer({ min: -10, max: 5_000 }) }), { maxLength: 30 }), (steps) => {
        const sim = freshSim(5);
        sim.state.player.gold = 20_000;
        let model = 0;
        for (const s of steps) {
          const goldBefore = sim.state.player.gold;
          const accepted = s.amount > 0 && (s.to ? goldBefore >= s.amount : model >= s.amount);
          if (accepted) model += s.to ? s.amount : -s.amount;
          sim.submit({ type: 'transferSavings', direction: s.to ? 'toSavings' : 'toBalance', amount: s.amount });
          const res = sim.tick().results[0];
          expect(res?.ok).toBe(accepted);
          expect(sim.state.player.savings).toBe(model);
        }
        expect(sim.state.player.savings).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });
});