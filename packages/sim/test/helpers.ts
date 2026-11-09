// Shared test harness and generators (task 3.8).
import fc from 'fast-check';
import { rawContent } from '@hr/content';
import { loadRegistry, type DefinitionRegistry } from '../src/defs/registry';
import { Simulation, cloneState } from '../src/core/simulation';
import { newGame } from '../src/state/newGame';
import type { Command } from '../src/commands/types';
import type { SimState } from '../src/state/types';
import type { TickOutput } from '../src/core/simulation';

let cached: DefinitionRegistry | null = null;
export function registry(): DefinitionRegistry {
  if (cached) return cached;
  const res = loadRegistry(rawContent);
  if (!res.ok) throw new Error('Base content invalid: ' + JSON.stringify(res.errors, null, 2));
  cached = res.value;
  return cached;
}

export function freshSim(seed = 1): Simulation {
  const reg = registry();
  return new Simulation(reg, newGame(reg, seed));
}

/** Abstract Command choices; resolved against the live state so ids are always plausible. */
export type CommandChoice =
  | { k: 'hire' }
  | { k: 'assign'; h: number; s: number }
  | { k: 'unassign'; h: number }
  | { k: 'fire'; h: number }
  | { k: 'price'; p: number }
  | { k: 'order'; q: number }
  | { k: 'autoReorder'; on: boolean; t: number }
  | { k: 'route'; swap: boolean }
  | { k: 'move'; dx: number; dz: number }
  | { k: 'drive' }
  | { k: 'manualPose'; dx: number; dz: number; speed: number }
  | { k: 'manualLoad' }
  | { k: 'manualUnload' }
  | { k: 'endDrive' }
  | { k: 'resume' }
  | { k: 'enter' }
  | { k: 'exit' }
  | { k: 'ui' }
  | { k: 'bogus' };

export const arbChoice: fc.Arbitrary<CommandChoice> = fc.oneof(
  fc.constant<CommandChoice>({ k: 'hire' }),
  fc.record({ k: fc.constant('assign' as const), h: fc.nat(20), s: fc.nat(20) }),
  fc.record({ k: fc.constant('unassign' as const), h: fc.nat(20) }),
  fc.record({ k: fc.constant('fire' as const), h: fc.nat(20) }),
  fc.record({ k: fc.constant('price' as const), p: fc.integer({ min: -200, max: 2000 }) }),
  fc.record({ k: fc.constant('order' as const), q: fc.integer({ min: -5, max: 200 }) }),
  fc.record({ k: fc.constant('autoReorder' as const), on: fc.boolean(), t: fc.integer({ min: -10, max: 200 }) }),
  fc.record({ k: fc.constant('route' as const), swap: fc.boolean() }),
  fc.record({ k: fc.constant('move' as const), dx: fc.double({ min: -1.5, max: 1.5, noNaN: true }), dz: fc.double({ min: -1.5, max: 1.5, noNaN: true }) }),
  fc.constant<CommandChoice>({ k: 'drive' }),
  fc.record({
    k: fc.constant('manualPose' as const),
    dx: fc.double({ min: -3, max: 3, noNaN: true }),
    dz: fc.double({ min: -3, max: 3, noNaN: true }),
    speed: fc.double({ min: 0, max: 10, noNaN: true }),
  }),
  fc.constant<CommandChoice>({ k: 'manualLoad' }),
  fc.constant<CommandChoice>({ k: 'manualUnload' }),
  fc.constant<CommandChoice>({ k: 'endDrive' }),
  fc.constant<CommandChoice>({ k: 'resume' }),
  fc.constant<CommandChoice>({ k: 'enter' }),
  fc.constant<CommandChoice>({ k: 'exit' }),
  fc.constant<CommandChoice>({ k: 'ui' }),
  fc.constant<CommandChoice>({ k: 'bogus' }),
);

export interface ScheduledChoice {
  atTick: number;
  choice: CommandChoice;
}

export const arbSchedule = (maxTick: number, maxLen = 40): fc.Arbitrary<ScheduledChoice[]> =>
  fc.array(fc.record({ atTick: fc.nat(maxTick), choice: arbChoice }), { maxLength: maxLen }).map((a) => [...a].sort((x, y) => x.atTick - y.atTick));

export function resolveChoice(state: SimState, c: CommandChoice): Command | null {
  const humans = Object.values(state.humans).filter((h) => h.owner === 'player');
  const playerBiz = Object.values(state.businesses).filter((b) => b.owner === 'player');
  const pub = playerBiz.find((b) => b.pub);
  const supplier = Object.values(state.businesses).find((b) => b.owner === 'npc');
  const van = Object.values(state.vehicles).find((v) => v.owner === 'player');
  const pick = <T>(xs: T[], i: number): T | undefined => (xs.length ? xs[i % xs.length] : undefined);
  switch (c.k) {
    case 'hire':
      return { type: 'hire' };
    case 'assign': {
      const h = pick(humans, c.h);
      const holders = [...playerBiz.map((b) => ({ kind: 'business' as const, id: b.id, slots: b.jobSlots })), ...(van ? [{ kind: 'vehicle' as const, id: van.id, slots: van.jobSlots }] : [])];
      const all = holders.flatMap((x) => x.slots.map((s) => ({ kind: x.kind, id: x.id, slotId: s.slotId })));
      const target = pick(all, c.s);
      return h && target ? { type: 'assign', humanId: h.id, target } : null;
    }
    case 'unassign': {
      const h = pick(humans, c.h);
      return h ? { type: 'unassign', humanId: h.id } : null;
    }
    case 'fire': {
      const h = pick(humans, c.h);
      return h ? { type: 'fire', humanId: h.id } : null;
    }
    case 'price':
      return pub ? { type: 'setDrinkPrice', businessId: pub.id, price: c.p } : null;
    case 'order':
      return pub && supplier ? { type: 'placeOrder', supplierId: supplier.id, destinationId: pub.id, resourceId: 'beer', quantity: c.q } : null;
    case 'autoReorder':
      return pub ? { type: 'setAutoReorder', businessId: pub.id, resourceId: 'beer', enabled: c.on, threshold: c.t } : null;
    case 'route':
      return van && pub && supplier
        ? {
            type: 'setRoute',
            vehicleId: van.id,
            stops: c.swap
              ? [
                  { businessId: pub.id, action: 'dropoff' },
                  { businessId: supplier.id, action: 'pickup' },
                ]
              : [
                  { businessId: supplier.id, action: 'pickup' },
                  { businessId: pub.id, action: 'dropoff' },
                ],
          }
        : null;
    case 'move':
      return { type: 'ceoMove', dx: c.dx, dz: c.dz };
    case 'drive':
      return van ? { type: 'startManualDriving', vehicleId: van.id } : null;
    case 'manualPose':
      return van ? { type: 'manualVehicleUpdate', vehicleId: van.id, x: van.pose.x + c.dx, z: van.pose.z + c.dz, heading: 0, speed: c.speed } : null;
    case 'manualLoad':
      return van && supplier ? { type: 'manualLoad', vehicleId: van.id, businessId: supplier.id } : null;
    case 'manualUnload':
      return van && pub ? { type: 'manualUnload', vehicleId: van.id, businessId: pub.id } : null;
    case 'endDrive':
      return van ? { type: 'endManualDriving', vehicleId: van.id } : null;
    case 'resume':
      return van ? { type: 'resumeRoute', vehicleId: van.id } : null;
    case 'enter':
      return pub ? { type: 'ceoEnter', businessId: pub.id } : null;
    case 'exit':
      return { type: 'ceoExit' };
    case 'ui':
      return { type: 'uiEvent', event: 'managementViewOpened' };
    case 'bogus':
      return { type: 'fire', humanId: 'hum_9999' };
  }
}

export interface RunRecord {
  outputs: TickOutput[];
  snapshots: SimState[];
}

/** Runs `ticks` Ticks, resolving and submitting scheduled choices before each Tick. */
export function run(
  sim: Simulation,
  schedule: ScheduledChoice[],
  ticks: number,
  opts: { snapshots?: boolean; snapshotEvery?: number; each?: (s: Simulation, out: TickOutput) => void } = {},
): RunRecord {
  const rec: RunRecord = { outputs: [], snapshots: [] };
  let i = 0;
  for (let t = 0; t < ticks; t++) {
    while (i < schedule.length && (schedule[i] as ScheduledChoice).atTick <= t) {
      const cmd = resolveChoice(sim.state, (schedule[i] as ScheduledChoice).choice);
      if (cmd) sim.submit(cmd);
      i++;
    }
    const out = sim.tick();
    rec.outputs.push(out);
    if (opts.snapshots && (t % (opts.snapshotEvery ?? 1) === 0 || t === ticks - 1)) rec.snapshots.push(cloneState(sim.state));
    opts.each?.(sim, out);
  }
  return rec;
}
