// Pub customer loop and visible staff work (Requirements 4, 5, 6).
// Order: customerArrivals -> staff -> customerVisits (see core/pipeline.ts).
import type { TickContext } from '../core/context';
import { gold, ledgerChange, secondsToTicks } from '../core/context';
import { nextId } from '../core/ids';
import type { Command, Rejection } from '../commands/types';
import { demandPerMinute } from '../defs/formulas';
import type { PubParams } from '../defs/schemas';
import { ringAdd } from '../metrics/ring';
import { rngChance, rngNext } from '../rng/xoshiro128ss';
import { takeFromStock } from '../storage/stock';
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

function reputationOf(ctx: TickContext, owner: string): number {
  return owner === PLAYER ? ctx.state.player.reputation : ctx.cfg.reputationStart;
}

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
    const rate = demandPerMinute(p.def, p.pub.drinkPrice, reputationOf(ctx, p.b.owner));
    if (!(rngNext(ctx.state) < rate / ticksPerMinute)) continue;
    const m = ctx.state.metrics.pubs[p.b.id];
    if (m) ringAdd(m.arrivals, second(ctx), 1);
    ctx.events.push({ type: 'customerArrived', pubId: p.b.id, owner: p.b.owner });
    const seat = p.pub.seats.indexOf(null);
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
    };
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

/** Bartenders pour (FIFO lots), Servers carry drinks (5.1–5.5). */
export function staffSystem(ctx: TickContext): void {
  const tick = ctx.state.tick;
  for (const p of pubs(ctx)) {
    const stock = p.b.storage[p.def.drinkResource];
    // Bartenders
    for (const w of workers(ctx, p.b, 'bartender')) {
      const t = w.get();
      if (t?.kind === 'pour' && tick >= t.doneTick) {
        const order = p.pub.orderQueue.find((o) => o.customerId === t.customerId);
        if (order) p.pub.bar.push(barEntryFor(p.pub, t.customerId));
        w.set(null);
        ctx.events.push({ type: 'drinkPoured', pubId: p.b.id, owner: p.b.owner });
      }
      if (w.get() !== null || !stock || stock.amount < 1) continue;
      const order = p.pub.orderQueue.find((o) => !o.poured && ctx.state.customers[o.customerId]?.state === 'waiting');
      if (!order) continue;
      const [taken] = takeFromStock(stock, 1); // Beer removed FIFO when pouring starts (4.6, 34.3)
      ledgerChange(ctx, p.def.drinkResource, -1, 'consumed');
      order.poured = true;
      order.lot = { recipeId: taken?.recipeId ?? null, origin: taken?.origin ?? 'business' }; // lot threading (A7)
      w.set({ kind: 'pour', customerId: order.customerId, doneTick: tick + secondsToTicks(ctx, p.def.bartendingIntervalSeconds) });
    }
    // Servers
    const serverJob = ctx.reg.jobs.server;
    const carryTicks = secondsToTicks(ctx, p.def.serveDistance / (serverJob?.movementSpeed ?? 2.5));
    for (const w of workers(ctx, p.b, 'server')) {
      const t = w.get();
      if (t?.kind === 'carry' && tick >= t.doneTick) {
        deliverDrink(ctx, p, t.customerId);
        w.set(null);
      }
      if (w.get() !== null) continue;
      const drink = p.pub.bar.shift();
      if (!drink) continue;
      w.set({ kind: 'carry', customerId: drink.customerId, doneTick: tick + carryTicks });
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
          p.pub.orderQueue.push({ customerId: c.id, placedTick: tick, poured: false }); // 4.4
        }
        break;
      case 'waiting': {
        const order = p.pub.orderQueue.find((o) => o.customerId === c.id);
        const placed = order?.placedTick ?? tick;
        if (tick - placed > p.def.patienceSeconds * ctx.tps) {
          cancelOrder(p, c.id);
          if (c.drinksConsumed > 0) {
            c.state = 'paying';
            c.stateUntil = tick + secondsToTicks(ctx, p.def.paySeconds);
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
          c.currentLot = null;
          const chance = Math.min(p.def.repeatOrderChance, ctx.cfg.repeatChanceMax);
          if (c.drinksConsumed < p.def.maxDrinksPerVisit && rngChance(ctx.state, chance)) {
            c.state = 'waiting';
            p.pub.orderQueue.push({ customerId: c.id, placedTick: tick, poured: false });
          } else {
            c.state = 'paying';
            c.stateUntil = tick + secondsToTicks(ctx, p.def.paySeconds);
          }
        }
        break;
      case 'paying':
        if (tick >= c.stateUntil) {
          const amount = p.pub.drinkPrice * c.drinksConsumed; // price at the payment Tick (4.7)
          gold(ctx, p.b.owner, amount, 'sales', p.b.id);
          ctx.events.push({ type: 'customerPaid', pubId: p.b.id, owner: p.b.owner, amount });
          startLeaving(ctx, p, c);
        }
        break;
      case 'leaving':
        if (tick >= c.stateUntil) Reflect.deleteProperty(ctx.state.customers, c.id);
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
