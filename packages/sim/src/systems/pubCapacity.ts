// Seats, Taps and Hands of a Pub (Requirement 56). Pure selectors over state and Definitions; the Panel
// bars, the arrival rule and the worker state machine all read them from here.
import { demandPerMinute } from '../defs/formulas';
import { jobCapacity } from '../staffing/capacity';
import { getStat, type StatEnv } from '../stats/getStat';
import type { Business } from '../state/types';
import { PLAYER } from '../state/types';

export type CapacityKind = 'seats' | 'taps' | 'hands';
export interface PubCapacity {
  seats: number;
  taps: number;
  /** Drinks per minute all working Bar_Workers can handle together. */
  hands: number;
  /** What the current demand asks for, in the same units (concurrent Customers, concurrent pours, drinks per minute). */
  load: Record<CapacityKind, number>;
  /** capacity / load; 0 when the load is 0 (56.9). */
  ratio: Record<CapacityKind, number>;
  /** The lowest ratio among the numbers that have a load, or null when nothing is asked of the Pub. */
  bottleneck: CapacityKind | null;
}

/** Seats a Customer may take now: the Seats stat, capped by the License_Tier for the Player (62.6) and by the seat array. */
export function seatsOf(env: StatEnv, b: Business): number {
  if (!b.pub) return 0;
  let seats = getStat(env, 'seats', { businessId: b.id });
  if (b.owner === PLAYER) {
    const tier = env.state.player.license ? env.reg.phase3.licenseTiers[env.state.player.license] : undefined;
    seats = tier ? Math.min(seats, tier.maxSeats) : 0;
  }
  return Math.max(0, Math.min(seats, b.pub.seats.length));
}

/** Drinks that can pour at the same time (56.1, 56.6). */
export function tapsOf(env: StatEnv, b: Business): number {
  const max = env.reg.businesses[b.defId]?.pub?.maxTaps ?? 0;
  return Math.max(0, Math.min(getStat(env, 'taps', { businessId: b.id }), max));
}

export function pubCapacity(env: StatEnv, b: Business): PubCapacity | null {
  const def = env.reg.businesses[b.defId]?.pub;
  if (!def || !b.pub) return null;
  const { reg, state } = env;
  const seats = seatsOf(env, b);
  const taps = tapsOf(env, b);
  // Hands: every working unit of a service Job, at the speed the Pace and Modifiers give (56.8: base from pour time + default walk).
  const speedBp = getStat(env, 'workSpeed', { businessId: b.id });
  let hands = 0;
  for (const job of Object.values(reg.jobs)) {
    if (!job.service) continue;
    const units = jobCapacity(b, job.id, state);
    const cycleSeconds = def.bartendingIntervalSeconds + (2 * reg.config.defaultWalkDistance) / job.movementSpeed;
    hands += (units * 60 * speedBp) / (cycleSeconds * 10000);
  }
  const arrivals = demandPerMinute(def, b.pub.drinkPrice, getStat(env, 'demand', { businessId: b.id }));
  const drinks = arrivals * def.staffing.expectedDrinksPerVisit;
  const stay = def.enterSeconds + def.drinkSeconds * def.staffing.expectedDrinksPerVisit + def.paySeconds + def.leaveSeconds;
  const load: Record<CapacityKind, number> = { seats: (arrivals * stay) / 60, taps: (drinks * def.bartendingIntervalSeconds) / 60, hands: drinks };
  const cap: Record<CapacityKind, number> = { seats, taps, hands };
  const ratio = { seats: 0, taps: 0, hands: 0 } as Record<CapacityKind, number>;
  let bottleneck: CapacityKind | null = null;
  for (const k of ['seats', 'taps', 'hands'] as const) {
    if (load[k] <= 0) continue; // no division by zero, no bottleneck (56.9)
    ratio[k] = cap[k] / load[k];
    if (bottleneck === null || ratio[k] < ratio[bottleneck]) bottleneck = k;
  }
  return { seats, taps, hands, load, ratio, bottleneck };
}