// The CEO's outside jobs (task 51; Requirement 68): requests with deadlines, bank meetings, scouting,
// the Head of Errands and emergency supply runs.
import { describe, expect, it } from 'vitest';
import { schedule } from '../src/core/scheduler';
import type { DomainEvent } from '../src/core/events';
import type { Command } from '../src/commands/types';
import type { Business, SimState } from '../src/state/types';
import { entrance } from '../src/world/geometry';
import { freshSim, registry } from './helpers';
import type { Simulation } from '../src/core/simulation';

const biz = (s: SimState, defId: string): Business => {
  const b = Object.values(s.businesses).find((x) => x.defId === defId);
  if (!b) throw new Error(defId);
  return b;
};
function goTo(sim: Simulation, b: Business): void {
  const d = entrance(sim.reg, b.plotId);
  sim.state.ceo.x = d.x;
  sim.state.ceo.z = d.z;
  sim.state.ceo.insideBusinessId = null;
}
function use(sim: Simulation, defId: string, serviceId: string): { ok: boolean; reason?: string } {
  const b = biz(sim.state, defId);
  goTo(sim, b);
  sim.submit({ type: 'useService', businessId: b.id, serviceId });
  const r = sim.tick().results[0];
  return r?.ok ? { ok: true } : { ok: false, reason: r && !r.ok ? r.reason : 'none' };
}
const spawn = (sim: Simulation, defId: string): void => schedule(sim, 'spawnRequest', sim.state.tick + 1, { defId });
const farAway = (sim: Simulation): void => {
  sim.state.ceo.x = -50;
  sim.state.ceo.z = 25;
  sim.state.ceo.insideBusinessId = null;
};
function runWith(sim: Simulation, ticks: number): DomainEvent[] {
  const events: DomainEvent[] = [];
  for (let t = 0; t < ticks; t++) events.push(...sim.tick().events);
  return events;
}

describe('requests and Consequences (68.3, 68.4)', () => {
  it('a scheduled request opens at the office with its role and has a deadline', () => {
    const sim = freshSim(2);
    spawn(sim, 'noise_complaint');
    sim.tick();
    sim.tick();
    const req = Object.values(sim.state.requests ?? {})[0];
    expect(req?.defId).toBe('noise_complaint');
    expect(req?.businessId).toBe(biz(sim.state, 'municipality').id);
    expect(req?.expiresTick).toBe(sim.state.tick - 1 + registry().phase3.requests.noise_complaint!.deadlineSeconds * 10);
  });

  it('an ignored request applies its data Consequence at the deadline, once', () => {
    const sim = freshSim(2);
    const control = freshSim(2);
    spawn(sim, 'noise_complaint');
    farAway(sim);
    farAway(control);
    const events = runWith(sim, 2000);
    runWith(control, 2000);
    expect(sim.state.requests).toEqual({});
    expect(events.some((e) => e.type === 'news' && e.item.textKey === 'news.noiseFined')).toBe(true);
    expect(control.state.player.gold - sim.state.player.gold).toBe(5000); // the fine, and nothing else differs
  });

  it('answering in person before the deadline removes it, so no fine follows, and a follow-up is scheduled later', () => {
    const sim = freshSim(2);
    const control = freshSim(2);
    spawn(sim, 'noise_complaint');
    sim.tick();
    expect(use(sim, 'municipality', 'answer_noise_complaint')).toEqual({ ok: true });
    expect(sim.state.requests).toEqual({});
    const events = runWith(sim, 2500);
    expect(events.some((e) => e.type === 'news' && e.item.textKey === 'news.noiseFined')).toBe(false);
    expect(events.some((e) => e.type === 'news' && e.item.textKey === 'news.noiseFollowup')).toBe(true); // delayed Effects (51.1)
    expect(Math.abs(control.state.player.gold - sim.state.player.gold)).toBeLessThan(10000); // no fine
  });

  it('answering needs the CEO at the office and an open request', () => {
    const sim = freshSim(2);
    expect(use(sim, 'municipality', 'answer_noise_complaint')).toMatchObject({ ok: false, reason: 'conditions_not_met' });
    spawn(sim, 'noise_complaint');
    sim.tick();
    farAway(sim);
    const hall = biz(sim.state, 'municipality');
    sim.submit({ type: 'useService', businessId: hall.id, serviceId: 'answer_noise_complaint' });
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'not_present' });
  });

  it('a Loan schedules a bank meeting, whose Consequence is a late fee (68.5)', () => {
    const sim = freshSim(3);
    sim.state.player.license = 'pub';
    expect(use(sim, 'bank', 'take_loan_sensible')).toEqual({ ok: true });
    farAway(sim);
    const events = runWith(sim, 6000 + 2500); // 600 s to the meeting, 240 s to its deadline
    expect(events.some((e) => e.type === 'news' && e.item.textKey === 'request.repaymentQuestion')).toBe(true);
    expect(events.some((e) => e.type === 'news' && e.item.textKey === 'news.bankLateFee')).toBe(true);
  });
});

describe('Head of Errands (68.8)', () => {
  it('a working Head of Errands answers a delegable request without the CEO', () => {
    const sim = freshSim(4);
    const pub = Object.values(sim.state.businesses).find((b) => b.owner === 'player' && b.pub);
    if (!pub) throw new Error('pub');
    sim.state.player.gold = 1_000_000;
    expect(use(sim, 'job_centre', 'hire_cand_errands')).toEqual({ ok: true });
    const eveline = Object.values(sim.state.humans).find((h) => h.name === 'Eveline');
    const slot = pub.jobSlots.find((s) => s.jobId === 'head_of_errands');
    if (!eveline || !slot) throw new Error('setup');
    sim.submit({ type: 'assign', humanId: eveline.id, target: { kind: 'business', id: pub.id, slotId: slot.slotId } } satisfies Command);
    for (let t = 0; t < 300; t++) sim.tick();
    expect(sim.state.humans[eveline.id]?.status).toBe('working');
    farAway(sim);
    spawn(sim, 'noise_complaint');
    const events = runWith(sim, 60);
    expect(sim.state.requests).toEqual({}); // answered by Eveline, nobody went there
    expect(events.some((e) => e.type === 'news' && e.item.textKey === 'news.noiseFined')).toBe(false);
    expect(sim.state.servicesUsed?.answer_noise_complaint).toBe(1);
  });

  it('without a Head of Errands the same request stays open', () => {
    const sim = freshSim(4);
    farAway(sim);
    spawn(sim, 'noise_complaint');
    runWith(sim, 60);
    expect(Object.keys(sim.state.requests ?? {})).toHaveLength(1);
  });

  it('the Head of Errands slot never raises an unstaffed Alert', () => {
    const sim = freshSim(4);
    runWith(sim, 50);
    expect(Object.values(sim.state.alerts).some((a) => a.type.includes('head_of_errands'))).toBe(false);
  });
});

describe('scouting (68.6)', () => {
  it('the CEO can scout the rival pub in person, once, which reveals its details', () => {
    const sim = freshSim(5);
    const rival = Object.values(sim.state.businesses).find((b) => b.owner !== 'player' && b.pub);
    if (!rival) throw new Error('rival');
    goTo(sim, rival);
    sim.submit({ type: 'useService', businessId: rival.id, serviceId: 'scout_rival' });
    expect(sim.tick().results[0]).toMatchObject({ ok: true });
    expect(sim.state.reveals.fired).toContain('rival_scouted');
    sim.submit({ type: 'useService', businessId: rival.id, serviceId: 'scout_rival' });
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'already_done' });
  });
  it('a rival Business offers no other Service', () => {
    const sim = freshSim(5);
    const rival = Object.values(sim.state.businesses).find((b) => b.owner !== 'player' && b.pub);
    if (!rival) throw new Error('rival');
    goTo(sim, rival);
    sim.submit({ type: 'useService', businessId: rival.id, serviceId: 'fit_out' });
    expect(sim.tick().results[0]).toMatchObject({ ok: false });
  });
});

describe('side deliveries and emergency supply runs (68.1, 68.2, 68.7)', () => {
  it('a side delivery is a Quest step on the vehicleUnloaded event with a reward', () => {
    const q = registry().phase3.quests.side_delivery_hops;
    expect(q?.after).toBe('grand_opening');
    expect(q?.steps[0]?.done).toMatchObject({ kind: 'event', event: 'vehicleUnloaded' });
    expect(q?.steps[0]?.reward?.some((e) => e.kind === 'gold')).toBe(true);
  });

  it('an Order without a Driver waits for the CEO; assigning a Driver hands it to Automatic_Delivery', () => {
    const sim = freshSim(6);
    const pub = Object.values(sim.state.businesses).find((b) => b.owner === 'player' && b.pub);
    const sup = biz(sim.state, 'supplier_beer');
    const van = Object.values(sim.state.vehicles).find((v) => v.owner === 'player');
    const thomas = Object.values(sim.state.humans).find((h) => h.name === 'Thomas');
    if (!pub || !van || !thomas) throw new Error('setup');
    sim.submit({ type: 'unassign', humanId: thomas.id });
    sim.tick();
    const start = pub.storage.beer?.amount ?? 0;
    pub.autoReorder.beer = { enabled: false, threshold: 0, failed: false };
    sim.submit({ type: 'placeOrder', supplierId: sup.id, destinationId: pub.id, resourceId: 'beer', quantity: 30 });
    expect(sim.tick().results[0]).toMatchObject({ ok: true });
    const orderOpen = (): boolean => Object.values(sim.state.orders).some((o) => o.destinationId === pub.id);
    for (let t = 0; t < 1500; t++) sim.tick();
    expect(orderOpen()).toBe(true); // nobody drives: it is the CEO's job (emergency run)
    sim.submit({ type: 'assign', humanId: thomas.id, target: { kind: 'vehicle', id: van.id, slotId: 'driver_1' } });
    for (let t = 0; t < 4000 && orderOpen(); t++) sim.tick();
    expect(orderOpen()).toBe(false);
    expect((pub.storage.beer?.amount ?? 0) + 0).toBeGreaterThan(start - 200); // delivered and not just consumed
  });
});
