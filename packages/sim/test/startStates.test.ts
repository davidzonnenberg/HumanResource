// The start states and the Grand Opening checklist (task 49; Requirements 3.1, 61).
// Feature: human-resource-mvp, Property 69: Grand Opening gating
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { questComplete } from '../src/systems/quests';
import { newGame } from '../src/state/newGame';
import { checkInvariants } from '../src/invariants/check';
import { freshSim, registry } from './helpers';
import { Simulation } from '../src/core/simulation';

const TRIGGERS = ['license_granted', 'loan_taken', 'fit_out_done', 'supplier_deal', 'first_hire', 'first_kegs', 'pub_open'];
const gameSim = (seed = 1) => new Simulation(registry(), newGame(registry(), seed, { start: 'grand_opening' }));

describe('start states (3.1)', () => {
  it('the Grand Opening start has an empty closed pub, no licence, loan, deal, staff, stock or order', () => {
    const sim = gameSim();
    const s = sim.state;
    const pub = Object.values(s.businesses).find((b) => b.owner === 'player' && b.pub);
    expect(s.player.license).toBeNull();
    expect(s.player.supplyDeal).toBeNull();
    expect(s.loans).toEqual([]);
    expect(s.reveals.fired).toEqual([]);
    expect(pub?.pub).toMatchObject({ open: false, seatsBuilt: 0, tapsBuilt: 0 });
    expect(pub?.storage.beer?.amount).toBe(0);
    expect(Object.values(s.humans).filter((h) => h.owner === 'player')).toEqual([]);
    expect(Object.values(s.orders)).toEqual([]);
    expect(Object.values(s.businesses).filter((b) => ['municipality', 'bank', 'job_centre'].includes(b.defId))).toHaveLength(3);
    expect(checkInvariants(s, registry())).toEqual([]);
  });
  it('the dev start is the running pub with the whole checklist done and the quest completed (61.8)', () => {
    const sim = freshSim(1);
    const s = sim.state;
    for (const id of TRIGGERS) expect(s.reveals.fired).toContain(id);
    expect(questComplete(s, registry(), 'grand_opening')).toBe(true);
    expect(s.player.license).toBe('pub');
    expect(Object.values(s.humans).filter((h) => h.owner === 'player').length).toBeGreaterThan(0);
    // no quest reward was paid and no news was written for a quest the player never played
    for (let t = 0; t < 5; t++) sim.tick();
    expect(sim.state.news.some((n) => n.textKey === 'news.grandOpening')).toBe(false);
  });
  it('the default start of newGame is the dev start, so tests and old callers keep the running pub', () => {
    expect(newGame(registry(), 3).reveals.fired).toContain('pub_open');
  });
});

describe('Grand Opening gating (61)', () => {
  it('Property 69: in any order, a step needs the steps it requires, the last needs all, and nobody arrives before pub_open', () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(TRIGGERS, { minLength: 0, maxLength: TRIGGERS.length }), fc.integer({ min: 1, max: 999 }), (order, seed) => {
        const reg = registry();
        const sim = gameSim(seed);
        const steps = reg.phase3.quests.grand_opening?.steps ?? [];
        let opened = false;
        for (const trigger of [...order, null]) {
          if (trigger) {
            sim.state.reveals.fired.push(trigger);
            if (trigger === 'pub_open') opened = true;
          }
          let arrivals = 0;
          for (let t = 0; t < 400; t++) arrivals += sim.tick().events.filter((e) => e.type === 'customerArrived' && e.owner === 'player').length;
          if (!opened && arrivals > 0) return false; // 61.6
          const done = new Set(sim.state.quests?.grand_opening?.stepsDone ?? []);
          for (const s of steps) if (done.has(s.id) && !(s.requires ?? []).every((r) => done.has(r))) return false; // 61.4
        }
        // the quest is complete exactly when every entry was fired
        const complete = questComplete(sim.state, reg, 'grand_opening');
        const allFired = ['license_granted', 'loan_taken', 'fit_out_done', 'supplier_deal', 'first_hire', 'pub_open'].every((t) => order.includes(t));
        return complete === allFired;
      }),
      { numRuns: 15 },
    );
  });
});