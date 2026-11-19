// Property 56 and the Service edge cases (tasks 37.4, 37.5; Requirement 51).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { handleUseService } from '../src/commands/useService';
import type { Command, ReasonCode, Rejection } from '../src/commands/types';
import type { ParamValue } from '../src/defs/schemas';
import { Simulation } from '../src/core/simulation';
import { newGame } from '../src/state/newGame';
import { entrance } from '../src/world/geometry';
import { ctxOf } from './ctx';
import { loadOrThrow, patchedContent } from './contentVariants';

const REMOTE = {
  id: 'svc_remote',
  nameKey: 'svc.remote',
  cost: 1000,
  access: 'remote',
  conditions: [],
  effects: [
    { kind: 'gold', amount: 5000 },
    { kind: 'addModifier', stat: 'demand', op: 'addBp', value: 500, seconds: 60 },
    { kind: 'grantResource', resourceId: 'synergy', qty: 2 },
  ],
};
const PRESENCE = {
  id: 'svc_presence',
  nameKey: 'svc.presence',
  cost: 0,
  access: 'presence',
  once: true,
  params: { pick: { type: 'string', oneOf: ['a', 'b'] }, items: { type: 'stringList', oneOf: ['x', 'y', 'z'], maxItems: 2 } },
  conditions: [{ condition: { kind: 'tickAtLeast', tick: 5 }, reason: 'not_available' }],
  effects: [{ kind: 'grantResource', resourceId: 'synergy', qty: 3 }],
};
const GATED = {
  id: 'svc_gated',
  nameKey: 'svc.gated',
  cost: 20000,
  access: 'remote',
  conditions: [{ condition: { kind: 'goldAtLeast', amount: 10_000_000 }, reason: 'insufficient_humans' }, { condition: { kind: 'never' } }],
  effects: [],
};

const raw = patchedContent((r) => {
  const pub = r.businesses.find((b) => b.id === 'pub_cosy_local') as Record<string, unknown>;
  const sup = r.businesses.find((b) => b.id === 'supplier_beer') as Record<string, unknown>;
  pub.services = [REMOTE, PRESENCE];
  sup.services = [GATED];
  for (const k of ['svc.remote', 'svc.presence', 'svc.gated']) r.text[k] = k;
});
const reg = loadOrThrow(raw);

function setup(seed = 1): { sim: Simulation; pubId: string; supId: string } {
  const sim = new Simulation(reg, newGame(reg, seed));
  const pub = Object.values(sim.state.businesses).find((b) => b.defId === 'pub_cosy_local' && b.owner === 'player');
  const sup = Object.values(sim.state.businesses).find((b) => b.defId === 'supplier_beer');
  if (!pub || !sup) throw new Error('start state lacks the Pub or Supplier');
  return { sim, pubId: pub.id, supId: sup.id };
}
const use = (businessId: string, serviceId: string, params?: Record<string, ParamValue>): Extract<Command, { type: 'useService' }> =>
  params === undefined ? { type: 'useService', businessId, serviceId } : { type: 'useService', businessId, serviceId, params };
const apply = (sim: Simulation, cmd: Extract<Command, { type: 'useService' }>): Rejection | null => handleUseService(ctxOf(sim), cmd);
const GOOD = { pick: 'a', items: ['x'] };

function putCeoAtDoor(sim: Simulation, businessId: string): void {
  const b = sim.state.businesses[businessId]!;
  const d = entrance(reg, b.plotId);
  sim.state.ceo.x = d.x;
  sim.state.ceo.z = d.z;
  sim.state.ceo.insideBusinessId = null;
}
function putCeoFar(sim: Simulation): void {
  sim.state.ceo.x = 500;
  sim.state.ceo.z = 500;
  sim.state.ceo.insideBusinessId = null;
}

describe('useService edge cases (task 37.5)', () => {
  it('applies cost and Effects, counts the use and emits an event', () => {
    const { sim, pubId } = setup();
    const gold0 = sim.state.player.gold;
    const ctx = ctxOf(sim);
    expect(handleUseService(ctx, use(pubId, 'svc_remote'))).toBeNull();
    expect(sim.state.player.gold).toBe(gold0 - 1000 + 5000);
    expect(sim.state.servicesUsed).toEqual({ svc_remote: 1 });
    expect(sim.state.player.corporateResources.synergy).toBe(2);
    expect(sim.state.modifiers).toHaveLength(1);
    expect(ctx.events).toContainEqual({ type: 'serviceUsed', businessId: pubId, serviceId: 'svc_remote' });
  });
  it('rejects in the documented order', () => {
    const { sim, pubId, supId } = setup();
    expect(apply(sim, use('biz_9999', 'svc_remote'))?.reason).toBe('unknown_entity');
    expect(apply(sim, use(pubId, 'nope'))?.reason).toBe('unknown_entity');
    expect(apply(sim, use(supId, 'svc_remote'))?.reason).toBe('unknown_entity'); // a Service of another Business
    sim.state.districts.old_town!.unlocked = false;
    expect(apply(sim, use(pubId, 'svc_presence', GOOD))?.reason).toBe('district_locked'); // before presence
    sim.state.districts.old_town!.unlocked = true;
    putCeoFar(sim);
    expect(apply(sim, use(pubId, 'svc_presence', { pick: 'zzz' }))?.reason).toBe('not_present'); // before params
    putCeoAtDoor(sim, pubId);
    expect(apply(sim, use(pubId, 'svc_presence', { pick: 'zzz' }))?.reason).toBe('conditions_not_met'); // params before Conditions
    expect(apply(sim, use(pubId, 'svc_presence', GOOD))).toEqual({ reason: 'not_available' }); // the Condition's own reason (tick < 5)
  });
  it('presence works at the door and inside, and `once` stops the second use', () => {
    const { sim, pubId } = setup();
    sim.state.tick = 10;
    putCeoAtDoor(sim, pubId);
    expect(apply(sim, use(pubId, 'svc_presence', GOOD))).toBeNull();
    expect(apply(sim, use(pubId, 'svc_presence', GOOD))?.reason).toBe('already_done');
    const other = setup(2);
    other.sim.state.tick = 10;
    putCeoFar(other.sim);
    other.sim.state.ceo.insideBusinessId = other.pubId;
    expect(apply(other.sim, use(other.pubId, 'svc_presence', GOOD))).toBeNull();
  });
  it('rejects bad or extra parameters with conditions_not_met and leaves the state unchanged', () => {
    const { sim, pubId } = setup();
    sim.state.tick = 10;
    putCeoAtDoor(sim, pubId);
    const before = JSON.stringify(sim.state);
    const bad: Record<string, ParamValue>[] = [
      {},
      { pick: 'a' },
      { pick: 'c', items: [] },
      { pick: 1 as unknown as string, items: [] },
      { pick: 'a', items: ['x', 'x'] },
      { pick: 'a', items: ['x', 'y', 'z'] },
      { pick: 'a', items: ['q'] },
      { pick: 'a', items: [], extra: 1 },
    ];
    for (const p of bad) expect(apply(sim, use(pubId, 'svc_presence', p))?.reason).toBe('conditions_not_met');
    expect(apply(sim, use(pubId, 'svc_remote', { surprise: true }))?.reason).toBe('conditions_not_met'); // a Service without params
    expect(JSON.stringify(sim.state)).toBe(before);
  });
  it('rejects insufficient Gold with the missing amount, after the Conditions', () => {
    const { sim, supId } = setup();
    sim.state.player.gold = 15_000_000;
    // The first Condition holds (gold >= 10M) but `never` fails: conditions_not_met.
    expect(apply(sim, use(supId, 'svc_gated'))?.reason).toBe('conditions_not_met');
    const { sim: s2, pubId } = setup();
    s2.state.player.gold = 400;
    expect(apply(s2, use(pubId, 'svc_remote'))).toEqual({ reason: 'insufficient_gold', missingGold: 600 });
  });
  it('is reachable through the Command queue and reported in the Tick result', () => {
    const { sim, pubId } = setup();
    sim.submit(use(pubId, 'svc_remote'));
    const out = sim.tick();
    expect(out.results[0]).toMatchObject({ type: 'useService', ok: true });
    sim.submit(use(pubId, 'svc_presence', GOOD));
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: expect.stringMatching(/not_present|not_available/) as unknown as ReasonCode });
  });
  it('settings tagged `presence` use the same access check', () => {
    const presenceReg = loadOrThrow(patchedContent((r) => {
      (r as unknown as { settings: { commandType: string; access: string }[] }).settings = [{ commandType: 'setDrinkPrice', access: 'presence' }];
    }));
    const sim = new Simulation(presenceReg, newGame(presenceReg, 1));
    const pub = Object.values(sim.state.businesses).find((b) => b.owner === 'player' && b.pub)!;
    const price = pub.pub!.drinkPrice;
    putCeoFar(sim);
    sim.submit({ type: 'setDrinkPrice', businessId: pub.id, price: price + 50 });
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'not_present' });
    expect(pub.pub!.drinkPrice).toBe(price);
    putCeoAtDoor(sim, pub.id);
    sim.submit({ type: 'setDrinkPrice', businessId: pub.id, price: price + 50 });
    expect(sim.tick().results[0]).toMatchObject({ ok: true });
  });
});

describe('Property 56: useService validation and atomic rejection', () => {
  // Feature: human-resource-mvp, Property 56 (Validates: Requirements 51.3, 51.4, 51.5, 51.6, 51.7, 51.8)
  const arbParams = fc.oneof(
    fc.constant(undefined),
    fc.constant({} as Record<string, ParamValue>),
    fc.constant({ ...GOOD } as Record<string, ParamValue>),
    fc.record({ pick: fc.constantFrom('a', 'b', 'c'), items: fc.subarray(['x', 'y', 'z', 'q'], { maxLength: 3 }) }) as fc.Arbitrary<Record<string, ParamValue>>,
    fc.constant({ other: 1 } as Record<string, ParamValue>),
  );
  /** Independent model of the validation order. */
  function expected(sim: Simulation, pubId: string, supId: string, c: Extract<Command, { type: 'useService' }>, locked: boolean, far: boolean): ReasonCode | null {
    const owners: Record<string, string> = { [pubId]: 'pub_cosy_local', [supId]: 'supplier_beer' };
    const defId = owners[c.businessId];
    if (!defId) return 'unknown_entity';
    const svcs: Record<string, string[]> = { pub_cosy_local: ['svc_remote', 'svc_presence'], supplier_beer: ['svc_gated'] };
    if (!svcs[defId]!.includes(c.serviceId)) return 'unknown_entity';
    if (locked) return 'district_locked';
    if (c.serviceId === 'svc_presence' && far) return 'not_present';
    const p = c.params;
    const paramsOk =
      c.serviceId === 'svc_presence'
        ? p !== undefined &&
          Object.keys(p).length === 2 &&
          (p.pick === 'a' || p.pick === 'b') &&
          Array.isArray(p.items) &&
          new Set(p.items).size === p.items.length &&
          p.items.length <= 2 &&
          p.items.every((x) => ['x', 'y', 'z'].includes(x))
        : p === undefined || Object.keys(p).length === 0;
    if (!paramsOk) return 'conditions_not_met';
    if (c.serviceId === 'svc_presence' && sim.state.tick < 5) return 'not_available';
    if (c.serviceId === 'svc_gated') return sim.state.player.gold >= 10_000_000 ? 'conditions_not_met' : 'insufficient_humans';
    if (c.serviceId === 'svc_presence' && (sim.state.servicesUsed?.svc_presence ?? 0) > 0) return 'already_done';
    const cost = c.serviceId === 'svc_remote' ? 1000 : 0;
    return sim.state.player.gold >= cost ? null : 'insufficient_gold';
  }
  it('rejects with the first failing reason and changes nothing; accepts and applies otherwise', () => {
    fc.assert(
      fc.property(
        fc.record({
          pickBiz: fc.constantFrom('pub', 'sup', 'bogus'),
          serviceId: fc.constantFrom('svc_remote', 'svc_presence', 'svc_gated', 'svc_nope'),
          params: arbParams,
          gold: fc.constantFrom(-500, 0, 400, 999, 1000, 5000, 20_000_000),
          tick: fc.constantFrom(0, 4, 5, 100),
          locked: fc.boolean(),
          far: fc.boolean(),
          usedBefore: fc.boolean(),
        }),
        (g) => {
          const { sim, pubId, supId } = setup();
          sim.state.player.gold = g.gold;
          sim.state.tick = g.tick;
          sim.state.districts.old_town!.unlocked = !g.locked;
          if (g.far) putCeoFar(sim);
          else putCeoAtDoor(sim, pubId);
          if (g.usedBefore) sim.state.servicesUsed = { svc_presence: 1 };
          const cmd = use(g.pickBiz === 'pub' ? pubId : g.pickBiz === 'sup' ? supId : 'biz_9999', g.serviceId, g.params);
          const want = expected(sim, pubId, supId, cmd, g.locked, g.far);
          const before = JSON.stringify(sim.state);
          const got = apply(sim, cmd);
          if (want !== null) {
            expect(got?.reason).toBe(want);
            if (want === 'insufficient_gold') expect(got?.missingGold).toBeGreaterThan(0);
            expect(JSON.stringify(sim.state)).toBe(before); // atomic rejection
          } else {
            expect(got).toBeNull();
            expect(sim.state.servicesUsed?.[cmd.serviceId]).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
