// Seats, Taps and Hands (task 43; Requirement 56, 62.6) and the pub settings.
// Feature: human-resource-mvp, Property 62: Capacity limits hold
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Business, SimState, StaffTask } from '../src/state/types';
import { pubCapacity, seatsOf, tapsOf } from '../src/systems/pubCapacity';
import { entrance } from '../src/world/geometry';
import { arbSchedule, freshSim, registry, resolveChoice } from './helpers';

const playerPub = (s: SimState): Business => {
  const b = Object.values(s.businesses).find((x) => x.owner === 'player' && x.pub);
  if (!b) throw new Error('no player pub');
  return b;
};
const pourTasks = (s: SimState, pub: Business): StaffTask[] => {
  const out: StaffTask[] = [];
  for (const slot of pub.jobSlots) {
    if (slot.filledBy?.kind === 'human') {
      const t = s.humans[slot.filledBy.humanId]?.task;
      if (t?.kind === 'pour') out.push(t);
    }
    for (const t of slot.headcountTasks ?? []) if (t?.kind === 'pour') out.push(t);
  }
  return out;
};

describe('capacity limits (56, 62.6)', () => {
  it('Property 62: Seats and Taps never exceed their limits at any Tick of a random play', () => {
    fc.assert(
      fc.property(arbSchedule(1200, 30), fc.integer({ min: 1, max: 9999 }), (schedule, seed) => {
        const reg = registry();
        const sim = freshSim(seed);
        let next = 0;
        for (let t = 0; t < 1200; t++) {
          while (next < schedule.length && (schedule[next] as (typeof schedule)[number]).atTick <= t) {
            const cmd = resolveChoice(sim.state, (schedule[next] as (typeof schedule)[number]).choice);
            if (cmd) sim.submit(cmd);
            next++;
          }
          sim.tick();
          if (t % 20 !== 0) continue;
          const pub = playerPub(sim.state);
          const tier = reg.phase3.licenseTiers[sim.state.player.license ?? ''];
          const occupied = pub.pub?.seats.filter((x) => x !== null).length ?? 0;
          if (occupied > seatsOf({ state: sim.state, reg }, pub)) return false;
          if (tier && occupied > tier.maxSeats) return false;
          const pours = pourTasks(sim.state, pub);
          if (pours.length > tapsOf({ state: sim.state, reg }, pub)) return false;
          if (new Set(pours.map((p) => (p.kind === 'pour' ? p.tap : -1))).size !== pours.length) return false;
        }
        return true;
      }),
      { numRuns: 25 },
    );
  });

  it('without a license the Pub has 0 Seats and every arrival is lost for lack of a seat (62.6)', () => {
    const sim = freshSim(3);
    sim.state.player.license = null;
    const pub = playerPub(sim.state);
    expect(seatsOf({ state: sim.state, reg: registry() }, pub)).toBe(0);
    let seated = 0;
    for (let t = 0; t < 1500; t++) {
      sim.tick();
      seated += pub.pub?.seats.filter((x) => x !== null).length ?? 0;
    }
    expect(seated).toBe(0);
  });

  it('the License_Tier caps the Seats', () => {
    const sim = freshSim(3);
    sim.state.player.license = 'cafe';
    const pub = playerPub(sim.state);
    expect(seatsOf({ state: sim.state, reg: registry() }, pub)).toBe(6);
  });

  it('a ratio is 0 and there is no bottleneck when nothing is demanded (56.9)', () => {
    const reg = registry();
    const sim = freshSim(3);
    const pub = playerPub(sim.state);
    const def = reg.businesses[pub.defId]?.pub;
    if (!def || !pub.pub) throw new Error('pub');
    // Beyond the data price curve the demand multiplier is 0 at the highest price; force a zero base through a Modifier.
    sim.state.modifiers = [{ id: 'mod_0001', source: { kind: 'effect', id: 't' }, target: { kind: 'all' }, stat: 'demand', op: 'addBp', value: -10000 }];
    const cap = pubCapacity({ state: sim.state, reg }, pub);
    expect(cap?.load).toEqual({ seats: 0, taps: 0, hands: 0 });
    expect(cap?.ratio).toEqual({ seats: 0, taps: 0, hands: 0 });
    expect(cap?.bottleneck).toBeNull();
  });

  it('the lowest ratio is the bottleneck, and Hands grow with workers', () => {
    const reg = registry();
    const sim = freshSim(3);
    const pub = playerPub(sim.state);
    const a = pubCapacity({ state: sim.state, reg }, pub);
    if (!a || !a.bottleneck) throw new Error('capacity');
    for (const k of ['seats', 'taps', 'hands'] as const) expect(a.ratio[a.bottleneck]).toBeLessThanOrEqual(a.ratio[k]);
    const free = pub.jobSlots.find((s) => s.filledBy === null);
    if (!free) throw new Error('setup');
    free.filledBy = { kind: 'headcount', count: 2, humanDefId: 'regular' };
    const b = pubCapacity({ state: sim.state, reg }, pub);
    expect(b?.hands ?? 0).toBeGreaterThan(a.hands);
  });
});

describe('pub settings and taps', () => {
  it('setPubOpen(false) stops arrivals; setPubOpen(true) resumes them', () => {
    const sim = freshSim(9);
    const pub = playerPub(sim.state);
    sim.submit({ type: 'setPubOpen', businessId: pub.id, open: false });
    let arrived = 0;
    for (let t = 0; t < 2000; t++) arrived += sim.tick().events.filter((e) => e.type === 'customerArrived' && e.owner === 'player').length;
    expect(arrived).toBe(0);
    sim.submit({ type: 'setPubOpen', businessId: pub.id, open: true });
    for (let t = 0; t < 2000; t++) arrived += sim.tick().events.filter((e) => e.type === 'customerArrived' && e.owner === 'player').length;
    expect(arrived).toBeGreaterThan(0);
  });

  it('setWorkerPace stores one workSpeed Modifier from data and replaces it on the next change', () => {
    const reg = registry();
    const sim = freshSim(2);
    const pub = playerPub(sim.state);
    const speed = (): number => pubCapacity({ state: sim.state, reg }, pub)?.hands ?? 0;
    const normal = speed();
    sim.submit({ type: 'setWorkerPace', businessId: pub.id, pace: 'hustle' });
    expect(sim.tick().results[0]).toMatchObject({ ok: true });
    expect(speed()).toBeGreaterThan(normal);
    sim.submit({ type: 'setWorkerPace', businessId: pub.id, pace: 'relaxed' });
    sim.tick();
    expect(speed()).toBeLessThan(normal);
    expect((sim.state.modifiers ?? []).filter((m) => m.source.kind === 'policy')).toHaveLength(1);
    sim.submit({ type: 'setWorkerPace', businessId: pub.id, pace: 'normal' });
    sim.tick();
    expect(speed()).toBe(normal);
    expect((sim.state.modifiers ?? []).filter((m) => m.source.kind === 'policy')).toHaveLength(0);
    sim.submit({ type: 'setWorkerPace', businessId: pub.id, pace: 'warp' });
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'not_allowed' });
  });

  it('buy_tap raises the Tap count at the Supplier and rejects at the maximum with limit_reached (56.5, 56.6)', () => {
    const reg = registry();
    const sim = freshSim(4);
    const pub = playerPub(sim.state);
    const sup = Object.values(sim.state.businesses).find((b) => b.defId === 'supplier_beer');
    if (!sup || !pub.pub) throw new Error('setup');
    const door = entrance(reg, sup.plotId);
    sim.state.ceo.x = door.x;
    sim.state.ceo.z = door.z;
    pub.pub.tapsBuilt = 2;
    const gold0 = sim.state.player.gold;
    sim.submit({ type: 'useService', businessId: sup.id, serviceId: 'buy_tap' });
    expect(sim.tick().results[0]).toMatchObject({ ok: true });
    expect(pub.pub.tapsBuilt).toBe(3);
    expect(gold0 - sim.state.player.gold).toBeGreaterThanOrEqual(8000);
    sim.submit({ type: 'useService', businessId: sup.id, serviceId: 'buy_tap' });
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'limit_reached' });
    expect(pub.pub.tapsBuilt).toBe(3);
  });
});
