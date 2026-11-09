import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { drawHumanName, uniqueInWorkforce } from '../src/names/names';
import { newGame } from '../src/state/newGame';
import { Simulation } from '../src/core/simulation';
import { checkInvariants } from '../src/invariants/check';
import { slotCapacity } from '../src/staffing/capacity';
import { freshSim, registry } from './helpers';

describe('start state (Requirement 3)', () => {
  it('creates Jan, Julia and Thomas with the right jobs, 50% beer, 25% order and Reputation 50', () => {
    const reg = registry();
    const s = newGame(reg, 123);
    const player = Object.values(s.humans).filter((h) => h.owner === 'player');
    expect(player.map((h) => h.name)).toEqual(['Jan', 'Julia', 'Thomas']);
    const pub = Object.values(s.businesses).find((b) => b.owner === 'player');
    expect(pub?.storage.beer?.amount).toBe(60);
    const order = Object.values(s.orders)[0];
    expect(order?.remaining).toBe(30);
    expect(s.player.reputation).toBe(50);
    expect(s.seed).toBe(123);
    const thomas = player[2];
    expect(thomas?.location.kind).toBe('onVehicle');
    const van = Object.values(s.vehicles).find((v) => v.owner === 'player');
    expect(van?.driverOnBoard).toBe(true);
    expect(van?.routeId).not.toBeNull();
    expect(checkInvariants(s, reg)).toEqual([]);
  });

  it('starts automatic delivery with Thomas on the first Tick (3.7)', () => {
    const sim = freshSim(5);
    sim.tick();
    const van = Object.values(sim.state.vehicles).find((v) => v.owner === 'player');
    expect(van?.phase).toBe('driving');
  });
});

describe('Human allocation (Requirement 7)', () => {
  // Feature: human-resource-mvp, Property 15: Human_Name uniqueness and drawing
  it('Property 15: drawn names are unique in the Workforce, prefer unused pool names, suffix when exhausted', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(fc.string({ minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 5 }), fc.integer({ min: 1, max: 25 }), (seed, pool, hires) => {
        const reg = registry();
        const s = newGame(reg, seed);
        for (let i = 0; i < hires; i++) {
          const name = drawHumanName(s, pool, 'player');
          const id = `hum_t${i}`;
          s.humans[id] = { ...(Object.values(s.humans)[0] as (typeof s.humans)[string]), id, name, assignment: null, status: 'unassigned' };
        }
        const names = Object.values(s.humans).filter((h) => h.owner === 'player').map((h) => h.name);
        expect(new Set(names).size).toBe(names.length);
      }),
    );
    const reg = registry();
    const s = newGame(reg, 1);
    expect(uniqueInWorkforce(s, 'player', 'Jan')).toBe('Jan 2');
    expect(uniqueInWorkforce(s, 'player', 'Kees')).toBe('Kees');
  });

  it('hire costs 5% of an hour of salary and the new Human gets a pooled name', () => {
    const sim = freshSim(9);
    const before = sim.state.player.gold;
    sim.submit({ type: 'hire' });
    const out = sim.tick();
    expect(out.results[0]?.ok).toBe(true);
    const hired = Object.values(sim.state.humans).find((h) => h.status === 'unassigned');
    expect(hired && registry().namePool.includes(hired.name)).toBe(true);
    // 5% of 60 min x 500 = 1500 hundredths, plus salaries of the Tick
    expect(before - sim.state.player.gold).toBeGreaterThanOrEqual(1500);
  });

  it('rejects hiring without Gold and reports the shortfall', () => {
    const sim = freshSim(9);
    sim.state.player.gold = 100;
    sim.submit({ type: 'hire' });
    const r = sim.tick().results[0];
    expect(r).toMatchObject({ ok: false, reason: 'insufficient_gold', missingGold: 1400 });
  });

  it('assigning to an occupied slot swaps; reassigning a driver stops the van with cargo kept', () => {
    const reg = registry();
    const sim = new Simulation(reg, newGame(reg, 3));
    const [jan, , thomas] = Object.values(sim.state.humans).filter((h) => h.owner === 'player');
    const van = Object.values(sim.state.vehicles).find((v) => v.owner === 'player');
    if (!jan || !thomas || !van) throw new Error('setup');
    for (let i = 0; i < 30; i++) sim.tick();
    sim.submit({ type: 'assign', humanId: jan.id, target: { kind: 'vehicle', id: van.id, slotId: 'driver_1' } });
    sim.tick();
    expect(sim.state.humans[thomas.id]?.status).toBe('unassigned');
    expect(sim.state.vehicles[van.id]?.driverOnBoard).toBe(false);
    expect(sim.state.humans[jan.id]?.status).toBe('en_route');
    expect(checkInvariants(sim.state, reg)).toEqual([]);
  });

  it('a Headcount_Fill counts as working capacity (49.3)', () => {
    const sim = freshSim(1);
    const pub = Object.values(sim.state.businesses).find((b) => b.owner === 'player');
    const slot = pub?.jobSlots.find((s) => s.jobId === 'bartender' && s.filledBy === null);
    if (!slot) throw new Error('setup');
    slot.filledBy = { kind: 'headcount', count: 1, humanDefId: 'regular' };
    expect(slotCapacity(slot, sim.state)).toBe(1);
    sim.submit({ type: 'assign', humanId: Object.values(sim.state.humans)[0]?.id ?? '', target: { kind: 'business', id: pub?.id ?? '', slotId: slot.slotId } });
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'slot_occupied' });
  });
});
