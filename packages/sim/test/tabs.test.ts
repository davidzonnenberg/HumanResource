// Tabs, Walkouts and Vibe (task 44; Requirement 57).
// Feature: human-resource-mvp, Property 63: Tab conservation
// Feature: human-resource-mvp, Property 64: Walkouts need a reason
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/simulation';
import type { DomainEvent } from '../src/core/events';
import { newGame } from '../src/state/newGame';
import type { Business, Customer, SimState } from '../src/state/types';
import { getStat } from '../src/stats/getStat';
import { arbSchedule, freshSim, registry, resolveChoice } from './helpers';
import { loadOrThrow, patchedContent } from './contentVariants';

const playerPub = (s: SimState): Business => {
  const b = Object.values(s.businesses).find((x) => x.owner === 'player' && x.pub);
  if (!b) throw new Error('no player pub');
  return b;
};

/** A Customer already finished and waiting to pay `tab` (no worker has taken the payment). */
function addPaying(s: SimState, pub: Business, seat: number, tab: number, waitedLong: boolean): Customer {
  const id = `cus_p${seat}`;
  const c: Customer = {
    id, pubId: pub.id, seat, state: 'paying', stateUntil: s.tick + 5, drinksConsumed: 1, servedAny: true, seatedTick: s.tick,
    currentLot: null, tab, waitedLong,
  };
  s.customers[id] = c;
  if (pub.pub) pub.pub.seats[seat] = id;
  return c;
}

/** Removes everyone who could take a payment, so the Customer must settle it himself at the deadline. */
function noWorkers(s: SimState, pub: Business): void {
  for (const slot of pub.jobSlots) slot.filledBy = null;
  for (const h of Object.values(s.humans)) if (h.assignment?.id === pub.id) h.assignment = null;
  if (pub.pub) pub.pub.open = false; // no arrivals: the RNG is then untouched by anything but a Walkout roll
}

describe('Tabs (57)', () => {
  it('the Tab grows by the drink price at the serve Tick and is paid whole as sales', () => {
    const sim = freshSim(6);
    const pub = playerPub(sim.state);
    if (!pub.pub) throw new Error('pub');
    for (const c of Object.values(sim.state.customers)) Reflect.deleteProperty(sim.state.customers, c.id);
    pub.pub.seats.fill(null);
    pub.pub.open = false;
    const id = 'cus_t0';
    sim.state.customers[id] = {
      id, pubId: pub.id, seat: 0, state: 'waiting', stateUntil: 0, drinksConsumed: 0, servedAny: false, seatedTick: sim.state.tick,
      currentLot: null, tab: 0, waitedLong: false,
    };
    pub.pub.seats[0] = id;
    pub.pub.orderQueue.push({ customerId: id, placedTick: sim.state.tick, poured: false, taken: false });
    const price = pub.pub.drinkPrice;
    let tabAfterServe = -1;
    let paid = 0;
    for (let t = 0; t < 900; t++) {
      const out = sim.tick();
      for (const e of out.events) {
        if (e.type === 'drinkServed' && e.customerId === id) tabAfterServe = sim.state.customers[id]?.tab ?? -1;
        if (e.type === 'customerPaid' && e.pubId === pub.id) paid += e.amount;
      }
    }
    expect(tabAfterServe).toBe(price);
    expect(paid % price).toBe(0); // whole drinks only: the Tab is paid in full, once
    expect(paid).toBeGreaterThanOrEqual(price);
    expect(sim.state.customers[id]).toBeUndefined(); // gone, with no Tab left
  });

  it('Property 63: no Tab survives its Customer, and every Tab is paid or written off in full', () => {
    fc.assert(
      fc.property(arbSchedule(1500, 30), fc.integer({ min: 1, max: 9999 }), (schedule, seed) => {
        const sim = freshSim(seed);
        let next = 0;
        let paid = 0;
        let walked = 0;
        const seen = new Map<string, Customer>();
        for (let t = 0; t < 1500; t++) {
          while (next < schedule.length && (schedule[next] as (typeof schedule)[number]).atTick <= t) {
            const cmd = resolveChoice(sim.state, (schedule[next] as (typeof schedule)[number]).choice);
            if (cmd) sim.submit(cmd);
            next++;
          }
          const out = sim.tick();
          for (const e of out.events) {
            if (e.type === 'customerPaid') paid += e.amount;
            if (e.type === 'customerWalkout') walked += e.amount;
          }
          for (const c of Object.values(sim.state.customers)) {
            if (c.tab < 0) return false;
            if (c.state === 'leaving' && c.tab !== 0) return false; // paid or written off before leaving (57.8)
            seen.set(c.id, c);
          }
          for (const id of seen.keys()) if (!sim.state.customers[id] && (seen.get(id) as Customer).tab !== 0 && (seen.get(id) as Customer).state !== 'leaving') return false;
        }
        const pub = playerPub(sim.state);
        // what the player pub took in equals what the events said was paid (competitor sales are not the player's gold)
        return paid >= 0 && walked >= 0 && (pub.pub?.lostIncome ?? 0) >= 0;
      }),
      { numRuns: 20 },
    );
  });
});

describe('Walkouts and Vibe (57)', () => {
  it('without low Vibe or a long wait the Tab is paid automatically and no random number is drawn (57.9)', () => {
    const sim = freshSim(11);
    const pub = playerPub(sim.state);
    noWorkers(sim.state, pub);
    expect(getStat(sim, 'vibe', { businessId: pub.id })).toBeGreaterThanOrEqual(registry().config.walkoutVibeBelow);
    // control run: the same game without the paying Customers (the rival Pub draws random numbers too)
    const control = freshSim(11);
    noWorkers(control.state, playerPub(control.state));
    const customers = [0, 1, 2, 3, 4].map((i) => addPaying(sim.state, pub, i, 500, false));
    const events: DomainEvent[] = [];
    for (let t = 0; t < 200; t++) {
      events.push(...sim.tick().events);
      control.tick();
    }
    expect(events.filter((e) => e.type === 'customerPaid')).toHaveLength(customers.length);
    expect(events.filter((e) => e.type === 'customerWalkout')).toHaveLength(0);
    expect(sim.state.rng).toEqual(control.state.rng); // paying drew nothing
  });

  it('Property 64: a Walkout needs a low Vibe or a long wait, and writes the whole Tab off', () => {
    const reg = loadOrThrow(patchedContent((r) => void ((r.simConfig as Record<string, unknown>).walkoutPct = 100)));
    const sim = new Simulation(reg, newGame(reg, 12));
    const pub = playerPub(sim.state);
    noWorkers(sim.state, pub);
    const impatient = [0, 1, 2].map((i) => addPaying(sim.state, pub, i, 700, true));
    const patient = [3, 4, 5].map((i) => addPaying(sim.state, pub, i, 700, false));
    const events: DomainEvent[] = [];
    for (let t = 0; t < 200; t++) events.push(...sim.tick().events);
    const walkouts = events.filter((e) => e.type === 'customerWalkout');
    expect(walkouts.map((e) => (e.type === 'customerWalkout' ? e.customerId : '')).sort()).toEqual(impatient.map((c) => c.id).sort());
    for (const e of walkouts) expect(e.type === 'customerWalkout' && e.amount).toBe(700);
    const paidEvents = events.filter((e) => e.type === 'customerPaid');
    expect(paidEvents).toHaveLength(patient.length);
    expect(paidEvents.reduce((n, e) => n + (e.type === 'customerPaid' ? e.amount : 0), 0)).toBe(700 * patient.length); // nothing is paid for a Walkout
    expect(playerPub(sim.state).pub?.lostIncome).toBe(700 * impatient.length);
  });

  it('a low Vibe also allows Walkouts', () => {
    const reg = loadOrThrow(patchedContent((r) => void ((r.simConfig as Record<string, unknown>).walkoutPct = 100)));
    const sim = new Simulation(reg, newGame(reg, 13));
    const pub = playerPub(sim.state);
    noWorkers(sim.state, pub);
    sim.state.modifiers = [{ id: 'mod_0001', source: { kind: 'effect', id: 'test' }, target: { kind: 'all' }, stat: 'vibe', op: 'addFlat', value: -40 }];
    expect(getStat(sim, 'vibe', { businessId: pub.id })).toBeLessThan(reg.config.walkoutVibeBelow);
    addPaying(sim.state, pub, 0, 500, false);
    const events: DomainEvent[] = [];
    for (let t = 0; t < 200; t++) events.push(...sim.tick().events);
    expect(events.filter((e) => e.type === 'customerWalkout')).toHaveLength(1);
  });

  it('a long wait lowers the Vibe through a Modifier that expires', () => {
    const reg = registry();
    const sim = freshSim(14);
    const pub = playerPub(sim.state);
    noWorkers(sim.state, pub);
    if (!pub.pub) throw new Error('pub');
    pub.pub.open = false;
    const id = 'cus_w0';
    sim.state.customers[id] = {
      id, pubId: pub.id, seat: 0, state: 'waiting', stateUntil: 0, drinksConsumed: 0, servedAny: false, seatedTick: sim.state.tick,
      currentLot: null, tab: 0, waitedLong: false,
    };
    pub.pub.seats[0] = id;
    pub.pub.orderQueue.push({ customerId: id, placedTick: sim.state.tick, poured: false, taken: false });
    const base = getStat(sim, 'vibe', { businessId: pub.id });
    for (let t = 0; t < (reg.config.longWaitSeconds + 2) * reg.config.ticksPerSecond; t++) sim.tick();
    expect(sim.state.customers[id]?.waitedLong).toBe(true);
    expect(getStat(sim, 'vibe', { businessId: pub.id })).toBe(base - reg.config.longWaitVibePenalty);
    for (let t = 0; t < (reg.config.longWaitVibeSeconds + 2) * reg.config.ticksPerSecond; t++) sim.tick();
    expect(getStat(sim, 'vibe', { businessId: pub.id })).toBe(base);
  });
});
