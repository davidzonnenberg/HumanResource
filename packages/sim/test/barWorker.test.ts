// Bar_Worker state machine (tasks 42.3, 42.5, 42.6; Requirement 55).
// Feature: human-resource-mvp, Property 61: Layout distance drives throughput
import { describe, expect, it } from 'vitest';
import { anchorDistance, layoutOf } from '../src/layout/anchors';
import type { Business, Customer, SimState, StaffTask } from '../src/state/types';
import { freshSim, registry } from './helpers';

const playerPub = (s: SimState): Business => {
  const b = Object.values(s.businesses).find((x) => x.owner === 'player' && x.pub);
  if (!b) throw new Error('no player pub');
  return b;
};

/** A Customer already waiting at `seat` with an order in the queue (taken or not). */
function addWaiting(s: SimState, pub: Business, seat: number, taken: boolean): string {
  const id = `cus_t${seat}`;
  const c: Customer = {
    id, pubId: pub.id, seat, state: 'waiting', stateUntil: s.tick, drinksConsumed: 0, servedAny: false, seatedTick: s.tick,
    currentLot: null, tab: 0, waitedLong: false,
  };
  s.customers[id] = c;
  if (!pub.pub) throw new Error('not a pub');
  pub.pub.seats[seat] = id;
  pub.pub.orderQueue.push({ customerId: id, placedTick: s.tick, poured: false, taken });
  return id;
}

/** Every task of every worker unit of the Pub (Humans and Headcount_Fill units). */
function tasks(s: SimState, pub: Business): StaffTask[] {
  const out: StaffTask[] = [];
  for (const slot of pub.jobSlots) {
    if (slot.filledBy?.kind === 'human') {
      const t = s.humans[slot.filledBy.humanId]?.task;
      if (t) out.push(t);
    }
    for (const t of slot.headcountTasks ?? []) if (t) out.push(t);
  }
  return out;
}

/** Stops random arrivals from adding Customers during a short scripted check. */
function quiet(s: SimState, pub: Business): void {
  if (pub.pub) pub.pub.arrivalAcc = 0;
  for (const c of Object.values(s.customers)) Reflect.deleteProperty(s.customers, c.id);
  if (pub.pub) pub.pub.seats.fill(null);
}

describe('Bar_Worker state machine (55)', () => {
  it('an idle worker cleans', () => {
    const sim = freshSim(4);
    const pub = playerPub(sim.state);
    quiet(sim.state, pub);
    sim.tick();
    expect(tasks(sim.state, pub).some((t) => t.kind === 'clean')).toBe(true);
  });

  it('two workers share the Taps: never more pours than Taps, and none without stock', () => {
    const sim = freshSim(5);
    const pub = playerPub(sim.state);
    quiet(sim.state, pub);
    const layout = layoutOf(registry(), pub.defId);
    if (!layout) throw new Error('layout');
    const free = pub.jobSlots.find((s) => s.filledBy === null);
    if (!free) throw new Error('setup');
    free.filledBy = { kind: 'headcount', count: 5, humanDefId: 'regular' };
    for (let i = 0; i < 6; i++) addWaiting(sim.state, pub, i, true);
    sim.tick();
    const pours = tasks(sim.state, pub).filter((t) => t.kind === 'pour');
    expect(pours.length).toBeGreaterThan(0);
    expect(pours.length).toBeLessThanOrEqual(layout.taps.length);
    expect(new Set(pours.map((t) => (t.kind === 'pour' ? t.tap : -1))).size).toBe(pours.length); // one worker per Tap
    // without Beer nothing is poured
    const sim2 = freshSim(5);
    const pub2 = playerPub(sim2.state);
    quiet(sim2.state, pub2);
    const beer = pub2.storage.beer;
    if (beer) { beer.amount = 0; beer.lots = []; }
    addWaiting(sim2.state, pub2, 0, true);
    sim2.tick();
    expect(tasks(sim2.state, pub2).filter((t) => t.kind === 'pour')).toEqual([]);
  });

  it('a Customer is served end to end: order taken, poured, carried, paid', () => {
    const sim = freshSim(6);
    const pub = playerPub(sim.state);
    quiet(sim.state, pub);
    if (pub.pub) pub.pub.open = false; // no other arrival may be the one who pays
    const id = addWaiting(sim.state, pub, 0, false);
    const kinds = new Set<string>();
    let paid = false;
    for (let t = 0; t < 600 && !paid; t++) {
      const out = sim.tick();
      for (const k of tasks(sim.state, pub)) if ('customerId' in k && k.customerId === id) kinds.add(k.kind);
      paid = out.events.some((e) => e.type === 'customerPaid' && e.pubId === pub.id);
    }
    expect([...kinds].sort()).toEqual(['carry', 'pour', 'takeOrder', 'takePayment']);
    expect(paid).toBe(true);
    expect(sim.state.customers[id]?.drinksConsumed ?? 1).toBeGreaterThan(0);
  });

  it('Property 61: a farther table takes longer to reach (step length follows anchor distance)', () => {
    const reg = registry();
    const sim = freshSim(8);
    const pub = playerPub(sim.state);
    quiet(sim.state, pub);
    const layout = layoutOf(reg, pub.defId);
    if (!layout) throw new Error('layout');
    const order = layout.seats.map((a, i) => ({ i, d: anchorDistance(layout.bar, a) })).sort((a, b) => a.d - b.d);
    const near = order[0];
    const far = order[order.length - 1];
    if (!near || !far) throw new Error('seats');
    expect(far.d).toBeGreaterThan(near.d);
    const nearId = addWaiting(sim.state, pub, near.i, false);
    const farId = addWaiting(sim.state, pub, far.i, false);
    const start = sim.state.tick + 1;
    sim.tick();
    const doneOf = (id: string): number => {
      const t = tasks(sim.state, pub).find((x) => x.kind === 'takeOrder' && x.customerId === id);
      if (t?.kind !== 'takeOrder') throw new Error(`no takeOrder for ${id}`);
      return t.doneTick - start;
    };
    expect(doneOf(farId)).toBeGreaterThan(doneOf(nearId));
  });
});
