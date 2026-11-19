// Pub customer loop and visible staff work (Requirements 4, 5, 6).
// Order: customerArrivals -> staff -> customerVisits (see core/pipeline.ts).
import type { TickContext } from '../core/context';
import { gold, ledgerChange, secondsToTicks } from '../core/context';
import { nextId } from '../core/ids';
import type { Command, Rejection } from '../commands/types';
import { demandPerMinute } from '../defs/formulas';
import { mulDivFloor } from '../money/gold';
import { getStat } from '../stats/getStat';
import type { PubParams } from '../defs/schemas';
import { newRing, ringAdd } from '../metrics/ring';
import { rngChance, rngInt, rngNext } from '../rng/xoshiro128ss';
import { takeFromStock } from '../storage/stock';
import { anchorDistance, layoutOf } from '../layout/anchors';
import { seatsOf, tapsOf } from './pubCapacity';
import { isRevealed } from '../conditions/revealed';
import { addModifier } from '../stats/modifiers';
import { barEntryFor, drinkLotFor } from './lots';
import type { Business, Customer, Human, JobSlot, LostReason, PubRuntime, StaffTask } from '../state/types';
import { PLAYER } from '../state/types';
import { isBusinessInUnlockedDistrict } from '../world/geometry';

interface PubCtx {
  b: Business;
  pub: PubRuntime;
  def: PubParams;
}

function* pubs(ctx: TickContext): Generator<PubCtx> {
  for (const b of Object.values(ctx.state.businesses)) {
    const def = ctx.reg.businesses[b.defId]?.pub;
    if (!def || !b.pub) continue;
    if (!isBusinessInUnlockedDistrict(ctx.reg, ctx.state, b)) continue;
    yield { b, pub: b.pub, def };
  }
}

const second = (ctx: TickContext): number => Math.floor(ctx.state.tick / ctx.tps);


function recordLost(ctx: TickContext, p: PubCtx, reason: LostReason): void {
  const m = ctx.state.metrics.pubs[p.b.id];
  if (m) {
    const ring = reason === 'no_seat' ? m.lostNoSeat : reason === 'out_of_beer' ? m.lostOutOfBeer : m.lostPatience;
    ringAdd(ring, second(ctx), 1);
  }
  ctx.events.push({ type: 'customerLost', pubId: p.b.id, owner: p.b.owner, reason });
}

/** Arrivals (4.1, 4.10) as a Bernoulli process per Tick with the data-driven demand rate. */
export function customerArrivalsSystem(ctx: TickContext): void {
  const ticksPerMinute = 60 * ctx.tps;
  for (const p of pubs(ctx)) {
    if (p.b.owner === PLAYER && !isRevealed(ctx.state, ctx.reg, 'pub_open')) continue; // no Customers before the Grand Opening (61.6)
    if (p.pub.open === false) continue; // a closed Pub gets no arrivals; Customers inside finish (56.1, 71.10)
    // Brand, Traits, Reputation and boosts all reach the arrival rate through the demand stat (50.2).
    const rate = demandPerMinute(p.def, p.pub.drinkPrice, getStat(ctx, 'demand', { businessId: p.b.id }));
    if (!(rngNext(ctx.state) < rate / ticksPerMinute)) continue;
    const m = ctx.state.metrics.pubs[p.b.id];
    if (m) ringAdd(m.arrivals, second(ctx), 1);
    ctx.events.push({ type: 'customerArrived', pubId: p.b.id, owner: p.b.owner });
    const seatLimit = seatsOf(ctx, p.b); // Seats stat, License_Tier cap, 0 without a license (56.4, 62.6)
    const seat = p.pub.seats.findIndex((occupant, i) => occupant === null && i < seatLimit);
    if (seat < 0) {
      recordLost(ctx, p, 'no_seat');
      continue;
    }
    const id = nextId(ctx.state, 'cus');
    p.pub.seats[seat] = id;
    ctx.state.customers[id] = {
      id,
      pubId: p.b.id,
      seat,
      state: 'entering',
      stateUntil: ctx.state.tick + secondsToTicks(ctx, p.def.enterSeconds),
      drinksConsumed: 0,
      servedAny: false,
      seatedTick: ctx.state.tick,
      currentLot: null,
      tab: 0,
      waitedLong: false,
    };
    const typeId = drawCustomerType(ctx, p.b);
    if (typeId !== null) (ctx.state.customers[id] as Customer).typeId = typeId;
  }
}

interface Worker {
  get(): StaffTask | null;
  set(t: StaffTask | null): void;
}

/** Working units of a Job at a Pub: individual Humans plus Headcount_Fill units (49.3). */
function workers(ctx: TickContext, b: Business, jobId: string): Worker[] {
  const out: Worker[] = [];
  for (const slot of b.jobSlots) {
    if (slot.jobId !== jobId || !slot.filledBy) continue;
    if (slot.filledBy.kind === 'human') {
      const h: Human | undefined = ctx.state.humans[slot.filledBy.humanId];
      if (h && h.status === 'working') out.push({ get: () => h.task, set: (t) => (h.task = t) });
    } else {
      const s: JobSlot = slot;
      const count = slot.filledBy.count;
      const tasks = (s.headcountTasks ??= []);
      while (tasks.length < count) tasks.push(null);
      tasks.length = count;
      for (let i = 0; i < count; i++) out.push({ get: () => tasks[i] ?? null, set: (t) => (tasks[i] = t) });
    }
  }
  return out;
}

/** Anything but a running step: an idle or cleaning worker takes new work (55.3). */
const isFree = (t: StaffTask | null): boolean => t === null || t.kind === 'clean';
/** Orders from before Phase 3 have no `taken` flag and count as taken. */
const isTaken = (o: { taken?: boolean | undefined }): boolean => o.taken !== false;

/**
 * The Bar_Worker state machine (Requirement 55): one task per working Bar_Worker or Headcount_Fill unit.
 * Steps: take the order at the table, pour at a free Tap, carry the drink to the seat, clean when idle.
 * Step length follows the distance between layout anchors and the `workSpeed` stat (55.4). Paying is
 * still automatic until tabs arrive (task 44.1).
 */
export function staffSystem(ctx: TickContext): void {
  const tick = ctx.state.tick;
  const serviceJobs = Object.values(ctx.reg.jobs).filter((j) => j.service);
  for (const p of pubs(ctx)) {
    const layout = layoutOf(ctx.reg, p.b.defId);
    if (!layout) continue;
    const stock = p.b.storage[p.def.drinkResource];
    const speedBp = getStat(ctx, 'workSpeed', { businessId: p.b.id });
    const tapLimit = tapsOf(ctx, p.b);
    const scale = (ticks: number): number => Math.max(1, Math.ceil((ticks * 10000) / speedBp));
    const units = serviceJobs.flatMap((j) => workers(ctx, p.b, j.id).map((w) => ({ w, speed: j.movementSpeed })));
    // 1. finish steps that are due
    for (const { w } of units) {
      const t = w.get();
      if (!t || t.kind === 'questionable' || tick < t.doneTick) continue;
      if (t.kind === 'pour') {
        const order = p.pub.orderQueue.find((o) => o.customerId === t.customerId);
        if (order) p.pub.bar.push(barEntryFor(p.pub, t.customerId));
        ctx.events.push({ type: 'drinkPoured', pubId: p.b.id, owner: p.b.owner });
        w.set(null);
      } else if (t.kind === 'carry') {
        deliverDrink(ctx, p, t.customerId);
        w.set(null);
      } else if (t.kind === 'takeOrder') {
        const order = p.pub.orderQueue.find((o) => o.customerId === t.customerId);
        if (order) order.taken = true;
        w.set(null);
      } else if (t.kind === 'takePayment') {
        const c = ctx.state.customers[t.customerId];
        if (c && c.state === 'paying') payTab(ctx, p, c);
        w.set(null);
      } else if (t.kind === 'clean') {
        removeOldestLongWait(ctx, p.b.id); // idle workers help the Vibe recover
        w.set(null);
      }
    }
    // 2. Taps in use and orders being taken right now are reserved before anyone picks new work
    const busyTaps = new Set<number>();
    const beingTaken = new Set<string>();
    const paying = new Set<string>();
    for (const { w } of units) {
      const t = w.get();
      if (t?.kind === 'pour' && t.tap !== undefined) busyTaps.add(t.tap);
      if (t?.kind === 'takeOrder') beingTaken.add(t.customerId);
      if (t?.kind === 'takePayment') paying.add(t.customerId);
    }
    const walk = (dist: number, speed: number): number => scale(secondsToTicks(ctx, dist / speed));
    const waiting = (customerId: string): boolean => ctx.state.customers[customerId]?.state === 'waiting';
    // 3. free workers pick a step in the data-defined priority order (55.3)
    for (const { w, speed } of units) {
      if (!isFree(w.get())) continue;
      let picked: StaffTask | null = null;
      for (const step of ctx.cfg.barWorkerPriority) {
        if (step === 'takePayment') {
          const c = Object.values(ctx.state.customers).find((x) => x.pubId === p.b.id && x.state === 'paying' && x.tab > 0 && !paying.has(x.id));
          if (!c) continue;
          paying.add(c.id);
          const seat = layout.seats[c.seat];
          picked = { kind: 'takePayment', customerId: c.id, doneTick: tick + (seat ? walk(anchorDistance(layout.till, seat), speed) : 0) + scale(secondsToTicks(ctx, p.def.paySeconds)) };
        } else if (step === 'deliver') {
          const drink = p.pub.bar.shift();
          if (!drink) continue;
          const seat = layout.seats[ctx.state.customers[drink.customerId]?.seat ?? 0];
          picked = { kind: 'carry', customerId: drink.customerId, doneTick: tick + (seat ? walk(anchorDistance(layout.bar, seat), speed) : 1) };
        } else if (step === 'pour') {
          const tap = layout.taps.findIndex((_, i) => i < tapLimit && !busyTaps.has(i)); // all Taps pouring: the worker waits (56.3)
          if (tap < 0 || !stock || stock.amount < 1) continue;
          const order = p.pub.orderQueue.find((o) => isTaken(o) && !o.poured && waiting(o.customerId));
          if (!order) continue;
          const [taken] = takeFromStock(stock, 1); // Beer removed FIFO when pouring starts (4.6, 34.3)
          ledgerChange(ctx, p.def.drinkResource, -1, 'consumed');
          order.poured = true;
          order.lot = { recipeId: taken?.recipeId ?? null, origin: taken?.origin ?? 'business' }; // lot threading (A7)
          busyTaps.add(tap);
          picked = { kind: 'pour', customerId: order.customerId, tap, doneTick: tick + scale(secondsToTicks(ctx, p.def.bartendingIntervalSeconds)) };
        } else {
          const order = p.pub.orderQueue.find((o) => !isTaken(o) && !beingTaken.has(o.customerId) && waiting(o.customerId));
          if (!order) continue;
          const seat = layout.seats[ctx.state.customers[order.customerId]?.seat ?? 0];
          beingTaken.add(order.customerId);
          picked = { kind: 'takeOrder', customerId: order.customerId, doneTick: tick + (seat ? walk(anchorDistance(layout.bar, seat), speed) : 1) };
        }
        if (picked) break;
      }
      // nothing due: tidy the bar; the step is replaced as soon as real work appears
      w.set(picked ?? (w.get() ? w.get() : { kind: 'clean', doneTick: tick + scale(secondsToTicks(ctx, ctx.cfg.cleanSeconds)) }));
    }
  }
}
function deliverDrink(ctx: TickContext, p: PubCtx, customerId: string): void {
  const c = ctx.state.customers[customerId];
  const qi = p.pub.orderQueue.findIndex((o) => o.customerId === customerId);
  if (!c || c.state !== 'waiting' || qi < 0) return; // customer left: drink is wasted
  const lot = drinkLotFor(p.pub, customerId);
  p.pub.orderQueue.splice(qi, 1);
  if (!c.servedAny) {
    const m = ctx.state.metrics.pubs[p.b.id];
    if (m) {
      ringAdd(m.waitSum, second(ctx), (ctx.state.tick - c.seatedTick) / ctx.tps);
      ringAdd(m.waitCount, second(ctx), 1);
    }
  }
  c.tab += p.pub.drinkPrice; // the Tab grows at the serve Tick (57.1)
  if (p.b.owner === PLAYER) {
    const counters = (ctx.state.counters ??= {});
    counters.drinksServed = (counters.drinksServed ?? 0) + 1;
  }
  c.servedAny = true;
  c.state = 'drinking';
  c.stateUntil = ctx.state.tick + secondsToTicks(ctx, p.def.drinkSeconds);
  c.currentLot = lot;
  ctx.events.push({ type: 'drinkServed', pubId: p.b.id, owner: p.b.owner, customerId });
}

function startLeaving(ctx: TickContext, p: PubCtx, c: Customer): void {
  c.state = 'leaving';
  c.stateUntil = ctx.state.tick + secondsToTicks(ctx, p.def.leaveSeconds);
  if (p.pub.seats[c.seat] === c.id) p.pub.seats[c.seat] = null;
}

function cancelOrder(p: PubCtx, customerId: string): void {
  p.pub.orderQueue = p.pub.orderQueue.filter((o) => o.customerId !== customerId);
  p.pub.bar = p.pub.bar.filter((d) => d.customerId !== customerId);
}

/** Seat -> order, drinking, reorder roll, paying and leaving (4.3–4.9). */
export function customerVisitsSystem(ctx: TickContext): void {
  const tick = ctx.state.tick;
  const byPub = new Map<string, PubCtx>();
  for (const p of pubs(ctx)) byPub.set(p.b.id, p);
  for (const c of Object.values(ctx.state.customers)) {
    const p = byPub.get(c.pubId);
    if (!p) continue;
    switch (c.state) {
      case 'entering':
        if (tick >= c.stateUntil) {
          c.state = 'waiting';
          p.pub.orderQueue.push({ customerId: c.id, placedTick: tick, poured: false, taken: false }); // 4.4
        }
        break;
      case 'waiting': {
        const order = p.pub.orderQueue.find((o) => o.customerId === c.id);
        const placed = order?.placedTick ?? tick;
        if (!c.waitedLong && tick - placed > ctx.cfg.longWaitSeconds * ctx.tps) {
          c.waitedLong = true; // once per Customer (57.6)
          addModifier(ctx.state, { source: { kind: 'effect', id: longWaitSource(p.b.id) }, target: { kind: 'business', id: p.b.id }, stat: 'vibe', op: 'addFlat', value: -ctx.cfg.longWaitVibePenalty, untilTick: tick + secondsToTicks(ctx, ctx.cfg.longWaitVibeSeconds) });
        }
        if (tick - placed > p.def.patienceSeconds * ctx.tps) {
          cancelOrder(p, c.id);
          if (c.drinksConsumed > 0) {
            c.state = 'paying';
            c.stateUntil = tick + secondsToTicks(ctx, ctx.cfg.payWaitSeconds); // deadline for a worker to take the payment (57.9)
          } else {
            const empty = (p.b.storage[p.def.drinkResource]?.amount ?? 0) === 0;
            recordLost(ctx, p, empty ? 'out_of_beer' : 'patience_expired');
            startLeaving(ctx, p, c);
          }
        }
        break;
      }
      case 'drinking':
        if (tick >= c.stateUntil) {
          c.drinksConsumed += 1;
          const recipeId = c.currentLot?.recipeId ?? null;
          c.currentLot = null;
          const premiumBp = getStat(ctx, 'premiumPrice', { businessId: p.b.id, recipeId });
          if (premiumBp !== 10000) c.tab += mulDivFloor(p.pub.drinkPrice, premiumBp - 10000, 10000); // Brand and Recipe price Modifiers
          const chance = Math.min(getStat(ctx, 'repeatOrderChance', { businessId: p.b.id, recipeId }) / 10000, ctx.cfg.repeatChanceMax);
          if (c.drinksConsumed < p.def.maxDrinksPerVisit && rngChance(ctx.state, chance)) {
            c.state = 'waiting';
            p.pub.orderQueue.push({ customerId: c.id, placedTick: tick, poured: false, taken: false });
          } else {
            c.state = 'paying';
            c.stateUntil = tick + secondsToTicks(ctx, ctx.cfg.payWaitSeconds); // deadline for a worker to take the payment (57.9)
          }
        }
        break;
      case 'paying':
        // A worker's takePayment step settles it; at the deadline the Customer settles it himself (57.4, 57.9).
        if (tick >= c.stateUntil && !beingPaid(ctx, p.b).has(c.id)) settleAtDeadline(ctx, p, c);
        break;
      case 'leaving':
        if (tick >= c.stateUntil) {
          if (c.tab > 0) writeOff(ctx, p, c); // safety: no Tab may outlive its Customer (57.8)
          Reflect.deleteProperty(ctx.state.customers, c.id);
        }
        break;
    }
  }
}

export function handleSetDrinkPrice(ctx: TickContext, cmd: Extract<Command, { type: 'setDrinkPrice' }>): Rejection | null {
  const b = ctx.state.businesses[cmd.businessId];
  const def = b ? ctx.reg.businesses[b.defId]?.pub : undefined;
  if (!b || !b.pub || !def) return { reason: 'unknown_entity', field: 'businessId' };
  if (b.owner !== PLAYER) return { reason: 'not_owner' };
  if (!Number.isInteger(cmd.price) || cmd.price <= 0 || cmd.price < def.minDrinkPrice || cmd.price > def.maxDrinkPrice)
    return { reason: 'invalid_price', field: 'price' };
  b.pub.drinkPrice = cmd.price;
  return null;
}

const PACE_SOURCE = (businessId: string): string => `pace:${businessId}`;
function ownedPub(ctx: TickContext, businessId: string): { b: Business; pub: PubRuntime } | Rejection {
  const b = ctx.state.businesses[businessId];
  if (!b || !b.pub) return { reason: 'unknown_entity', field: 'businessId' };
  if (b.owner !== PLAYER) return { reason: 'not_owner' };
  return { b, pub: b.pub };
}
/** Pace maps to a `workSpeed` Modifier from data, so Hustle and quirks share one path (55.3, 56.1). */
export function handleSetWorkerPace(ctx: TickContext, cmd: Extract<Command, { type: 'setWorkerPace' }>): Rejection | null {
  const r = ownedPub(ctx, cmd.businessId);
  if ('reason' in r) return r;
  const bp = Object.prototype.hasOwnProperty.call(ctx.cfg.paces, cmd.pace) ? ctx.cfg.paces[cmd.pace] : undefined;
  if (bp === undefined) return { reason: 'not_allowed', field: 'pace' };
  const source = PACE_SOURCE(r.b.id);
  ctx.state.modifiers = (ctx.state.modifiers ?? []).filter((m) => !(m.source.kind === 'policy' && m.source.id === source));
  if (bp !== 0) addModifier(ctx.state, { source: { kind: 'policy', id: source }, target: { kind: 'business', id: r.b.id }, stat: 'workSpeed', op: 'addBp', value: bp });
  r.pub.pace = cmd.pace;
  return null;
}
/** Closing stops arrivals; seated Customers finish their drinks (56.1). */
export function handleSetPubOpen(ctx: TickContext, cmd: Extract<Command, { type: 'setPubOpen' }>): Rejection | null {
  const r = ownedPub(ctx, cmd.businessId);
  if ('reason' in r) return r;
  r.pub.open = cmd.open;
  return null;
}

const longWaitSource = (businessId: string): string => `longWait:${businessId}`;
/** Removes the oldest `longWait` Modifier of a Pub early (an idle worker cleaned up). */
function removeOldestLongWait(ctx: TickContext, businessId: string): void {
  const list = ctx.state.modifiers ?? [];
  const i = list.findIndex((m) => m.source.kind === 'effect' && m.source.id === longWaitSource(businessId));
  if (i >= 0) list.splice(i, 1);
}
/** Customers of this Pub whose payment a worker is taking right now. */
function beingPaid(ctx: TickContext, b: Business): Set<string> {
  const out = new Set<string>();
  for (const j of Object.values(ctx.reg.jobs))
    if (j.service)
      for (const w of workers(ctx, b, j.id)) {
        const t = w.get();
        if (t?.kind === 'takePayment') out.add(t.customerId);
      }
  return out;
}
/** The whole Tab goes to the owner as sales and the Customer leaves (57.2). */
function payTab(ctx: TickContext, p: PubCtx, c: Customer): void {
  const amount = c.tab;
  c.tab = 0;
  gold(ctx, p.b.owner, amount, 'sales', p.b.id);
  ctx.events.push({ type: 'customerPaid', pubId: p.b.id, owner: p.b.owner, amount });
  startLeaving(ctx, p, c);
}
/** A Walkout: the Tab is written off as lost income and nothing is paid (57.5). */
function writeOff(ctx: TickContext, p: PubCtx, c: Customer): void {
  const amount = c.tab;
  c.tab = 0;
  p.pub.lostIncome += amount;
  const m = ctx.state.metrics.pubs[p.b.id];
  if (m) ringAdd((m.walkouts ??= newRing(m.arrivals.size)), second(ctx), 1);
  ctx.events.push({ type: 'customerWalkout', pubId: p.b.id, owner: p.b.owner, customerId: c.id, amount });
}
/**
 * No worker took the payment in time. A Walkout is possible only with a low Vibe or after a long wait, and then the
 * seeded RNG decides; in every other case the Tab is paid and no random number is drawn (57.4, 57.9).
 */
function settleAtDeadline(ctx: TickContext, p: PubCtx, c: Customer): void {
  const lowVibe = getStat(ctx, 'vibe', { businessId: p.b.id }) < ctx.cfg.walkoutVibeBelow;
  if ((lowVibe || c.waitedLong) && c.tab > 0 && rngInt(ctx.state, 0, 99) < ctx.cfg.walkoutPct) {
    writeOff(ctx, p, c);
    startLeaving(ctx, p, c);
  } else payTab(ctx, p, c);
}
/** Customer type by weight, drawn only when the License_Tier allows more than one type (57.1). */
function drawCustomerType(ctx: TickContext, b: Business): string | null {
  const tier = b.owner === PLAYER && ctx.state.player.license ? ctx.reg.phase3.licenseTiers[ctx.state.player.license] : undefined;
  const types = (tier?.customerTypes ?? []).flatMap((id) => (ctx.reg.phase3.customerTypes[id] ? [ctx.reg.phase3.customerTypes[id]] : []));
  if (types.length < 2) return null;
  let pick = rngInt(ctx.state, 0, types.reduce((n, t) => n + t.weight, 0) - 1);
  for (const t of types) {
    if (pick < t.weight) return t.id;
    pick -= t.weight;
  }
  return null;
}
