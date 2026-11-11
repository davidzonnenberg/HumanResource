// Physical logistics: Orders, auto-reorder, Routes, automatic delivery and manual-driving
// Commands (Requirements 10–13). Resources only move between places as Vehicle cargo.
import type { TickContext } from '../core/context';
import { gold, ledgerChange, secondsToTicks } from '../core/context';
import { nextId } from '../core/ids';
import { dist2d } from '../core/math';
import type { Command, Rejection } from '../commands/types';
import { advancePath, buildPath, pathPosition } from '../logistics/paths';
import { ringAdd } from '../metrics/ring';
import { requireGold, rewardOf } from '../money/gold';
import { addToStock, emptyStock, freeCapacity, takeFromStock } from '../storage/stock';
import type { Business, Lot, LotOrigin, Route, Vehicle } from '../state/types';
import { PLAYER } from '../state/types';
import { inUnloadingZone, isBusinessInUnlockedDistrict, parkingPoint, plotInfo } from '../world/geometry';
import { cargoTotal, nextDropoffIndex, pendingQuantity, storageCapacity, supplierFor } from '../world/queries';
import { sendToJob } from './humans';

const second = (ctx: TickContext): number => Math.floor(ctx.state.tick / ctx.tps);

function vehicleCapacity(ctx: TickContext, v: Vehicle): number {
  return ctx.reg.vehicles[v.defId]?.capacity ?? 0;
}

/** Lot origin by Definition fields, not by type string (phase2-guide A7). */
function originFor(ctx: TickContext, b: Business): LotOrigin {
  const def = ctx.reg.businesses[b.defId];
  if (def?.supplier) return 'supplier';
  if (def?.marketDepot) return 'market_depot';
  if (def && def.productionRules.length > 0) return 'brewery';
  return 'business';
}

function addCargo(ctx: TickContext, v: Vehicle, resourceId: string, lot: Lot): number {
  const stock = (v.cargo[resourceId] ??= emptyStock());
  const others = cargoTotal(v) - stock.amount;
  return addToStock(stock, lot, Math.max(0, vehicleCapacity(ctx, v) - others));
}

/** Loads at `b` for drop-off at `destId` (null = any destination, manual pickup). Returns qty loaded. */
function loadAt(ctx: TickContext, v: Vehicle, b: Business, destId: string | null, resources: readonly string[]): number {
  let loaded = 0;
  const isSupplier = ctx.reg.businesses[b.defId]?.supplier !== undefined;
  const dest = destId ? ctx.state.businesses[destId] : null;
  for (const res of resources) {
    const free = vehicleCapacity(ctx, v) - cargoTotal(v);
    if (free <= 0) break;
    let destFree = Infinity;
    if (dest) destFree = freeCapacity(dest.storage[res] ?? emptyStock(), storageCapacity(ctx.reg, dest, res)) - (v.cargo[res]?.amount ?? 0);
    let want = Math.max(0, Math.min(free, destFree));
    if (want <= 0) continue;
    if (isSupplier) {
      // Reserved Orders of this owner, oldest first (10.2, 10.6)
      const orders = Object.values(ctx.state.orders)
        .filter((o) => o.owner === v.owner && o.sourceId === b.id && o.resourceId === res && (destId === null || o.destinationId === destId))
        .sort((a, c) => a.placedTick - c.placedTick || (a.id < c.id ? -1 : 1));
      for (const o of orders) {
        if (want <= 0) break;
        const n = Math.min(want, o.remaining);
        addCargo(ctx, v, res, { qty: n, recipeId: null, arrivedTick: ctx.state.tick, origin: 'supplier' });
        o.remaining -= n;
        want -= n;
        loaded += n;
        if (o.remaining === 0) Reflect.deleteProperty(ctx.state.orders, o.id);
        ctx.events.push({ type: 'vehicleLoaded', vehicleId: v.id, owner: v.owner, businessId: b.id, resourceId: res, qty: n });
      }
    } else {
      if (b.owner !== v.owner) continue;
      const stock = b.storage[res];
      if (!stock) continue;
      const lots = takeFromStock(stock, want);
      const origin = originFor(ctx, b);
      let n = 0;
      for (const lot of lots) {
        const rem = addCargo(ctx, v, res, { ...lot, origin, arrivedTick: ctx.state.tick });
        if (rem > 0) addToStock(stock, { ...lot, qty: rem }, Infinity); // cannot happen, kept for safety
        n += lot.qty - rem;
      }
      if (n > 0) ctx.events.push({ type: 'vehicleLoaded', vehicleId: v.id, owner: v.owner, businessId: b.id, resourceId: res, qty: n });
      loaded += n;
    }
  }
  return loaded;
}

/** Unloads cargo into `b`; what does not fit stays on board (9.4, 12.8). Returns unloaded lots. */
interface UnloadedLot {
  resourceId: string;
  lot: Lot;
}

function unloadAt(ctx: TickContext, v: Vehicle, b: Business, resources: readonly string[]): UnloadedLot[] {
  const unloaded: UnloadedLot[] = [];
  if (b.owner !== v.owner) return unloaded;
  for (const res of resources) {
    const cargo = v.cargo[res];
    const cap = storageCapacity(ctx.reg, b, res);
    if (!cargo || cargo.amount === 0 || cap <= 0) continue;
    const stock = (b.storage[res] ??= emptyStock());
    const lots = takeFromStock(cargo, cargo.amount);
    let n = 0;
    for (const lot of lots) {
      const rem = addToStock(stock, { ...lot, arrivedTick: ctx.state.tick }, cap);
      const accepted = lot.qty - rem;
      if (accepted > 0) unloaded.push({ resourceId: res, lot: { ...lot, qty: accepted } });
      if (rem > 0) addToStock(cargo, { ...lot, qty: rem }, Infinity);
      n += accepted;
    }
    if (n > 0) {
      ctx.events.push({ type: 'vehicleUnloaded', vehicleId: v.id, owner: v.owner, businessId: b.id, resourceId: res, qty: n });
      const m = ctx.state.metrics.vehicles[v.id];
      if (m) ringAdd(m.delivered, second(ctx), n);
    }
  }
  if (unloaded.length > 0) {
    const m = ctx.state.metrics.vehicles[v.id];
    if (m) ringAdd(m.deliveries, second(ctx), 1);
  }
  return unloaded;
}

function stopResources(ctx: TickContext, v: Vehicle, r: Route['stops'][number]): string[] {
  const allowed = ctx.reg.vehicles[v.defId]?.allowedResources ?? [];
  return r.resources === 'all' ? [...allowed] : r.resources.filter((x) => allowed.includes(x));
}

function startDrivingToStop(ctx: TickContext, v: Vehicle, route: Route): void {
  const stop = route.stops[v.stopIndex];
  const b = stop ? ctx.state.businesses[stop.businessId] : undefined;
  if (!stop || !b) {
    v.phase = 'idle';
    return;
  }
  v.path = buildPath(ctx.paths(), { x: v.pose.x, z: v.pose.z }, plotInfo(ctx.reg, b.plotId).accessNode, parkingPoint(ctx.reg, b.plotId));
  v.phase = 'driving';
}

function nextStop(ctx: TickContext, v: Vehicle, route: Route): void {
  v.stopIndex = (v.stopIndex + 1) % route.stops.length;
  v.retriedLoad = false;
  startDrivingToStop(ctx, v, route);
}

function doStopAction(ctx: TickContext, v: Vehicle, route: Route): void {
  const stop = route.stops[v.stopIndex];
  const b = stop ? ctx.state.businesses[stop.businessId] : undefined;
  if (!stop || !b) return nextStop(ctx, v, route);
  const def = ctx.reg.businesses[b.defId];
  const rate = def?.loadRatePerSecond ?? 10;
  const resources = stopResources(ctx, v, stop);
  if (stop.action === 'pickup') {
    const di = nextDropoffIndex(route, (v.stopIndex + 1) % route.stops.length);
    const destId = di >= 0 ? (route.stops[di]?.businessId ?? null) : null;
    const qty = loadAt(ctx, v, b, destId, resources);
    if (qty > 0) {
      v.phase = 'loading';
      v.phaseUntil = ctx.state.tick + secondsToTicks(ctx, qty / rate);
      v.retriedLoad = false;
    } else if (!v.retriedLoad) {
      v.phase = 'waiting'; // wait, then retry once (12.7)
      v.phaseUntil = ctx.state.tick + secondsToTicks(ctx, route.waitSeconds);
      v.retriedLoad = true;
    } else nextStop(ctx, v, route);
  } else {
    const lots = unloadAt(ctx, v, b, resources);
    const qty = lots.reduce((s, l) => s + l.lot.qty, 0);
    if (qty > 0) {
      v.phase = 'unloading';
      v.phaseUntil = ctx.state.tick + secondsToTicks(ctx, qty / rate);
    } else nextStop(ctx, v, route);
  }
}

/** Automatic delivery for every Vehicle of every Owner (11, 12). */
export function logisticsSystem(ctx: TickContext): void {
  for (const v of Object.values(ctx.state.vehicles)) {
    if (v.control !== 'auto' || v.routeSuspended || !v.routeId) {
      if (v.control !== 'manual') v.pose.speed = 0;
      continue;
    }
    const route = ctx.state.routes[v.routeId];
    const def = ctx.reg.vehicles[v.defId];
    if (!route || !def) continue;
    // A Driver headcount counts as a Driver on board (49.4)
    const headcountDriver = def.driverRequirement ? v.jobSlots.some((s) => s.jobId === def.driverRequirement?.jobId && s.filledBy?.kind === 'headcount') : false;
    if (def.driverRequirement && !v.driverOnBoard && !headcountDriver) {
      v.pose.speed = 0; // stationary without a Driver (11.4)
      continue;
    }
    switch (v.phase) {
      case 'idle':
        startDrivingToStop(ctx, v, route);
        break;
      case 'driving': {
        if (!v.path) {
          startDrivingToStop(ctx, v, route);
          break;
        }
        // Heading of automatic Vehicles is derived by the renderer from movement (no atan2 here).
        const done = advancePath(v.path, def.speed * ctx.dt); // travel time = distance / speed (11.5)
        const pos = pathPosition(v.path);
        v.pose.x = pos.x;
        v.pose.z = pos.z;
        v.pose.speed = def.speed;
        if (done) {
          v.path = null;
          v.pose.speed = 0;
          doStopAction(ctx, v, route);
        }
        break;
      }
      case 'waiting':
        if (ctx.state.tick >= v.phaseUntil) doStopAction(ctx, v, route);
        break;
      case 'loading':
      case 'unloading':
        if (ctx.state.tick >= v.phaseUntil) nextStop(ctx, v, route);
        break;
    }
  }
}

// ---------------- Orders and auto-reorder (10) ----------------

function placeOrderInternal(ctx: TickContext, owner: string, supplier: Business, dest: Business, res: string, qty: number, unitPrice: number): string {
  const id = nextId(ctx.state, 'ord');
  ctx.state.orders[id] = { id, owner, sourceId: supplier.id, destinationId: dest.id, resourceId: res, remaining: qty, placedTick: ctx.state.tick };
  ledgerChange(ctx, res, qty, 'order_placed');
  gold(ctx, owner, -(unitPrice * qty), 'purchase', dest.id);
  ctx.events.push({ type: 'orderPlaced', orderId: id, owner, qty });
  return id;
}

export function handlePlaceOrder(ctx: TickContext, cmd: Extract<Command, { type: 'placeOrder' }>): Rejection | null {
  const supplier = ctx.state.businesses[cmd.supplierId];
  const dest = ctx.state.businesses[cmd.destinationId];
  if (!supplier || !dest) return { reason: 'unknown_entity' };
  const sale = ctx.reg.businesses[supplier.defId]?.supplier?.sells.find((s) => s.resourceId === cmd.resourceId);
  if (!sale) return { reason: 'unknown_entity', field: 'resourceId' };
  if (dest.owner !== PLAYER) return { reason: 'not_owner', field: 'destinationId' };
  if (!isBusinessInUnlockedDistrict(ctx.reg, ctx.state, supplier) || !isBusinessInUnlockedDistrict(ctx.reg, ctx.state, dest)) return { reason: 'district_locked' };
  if (!Number.isInteger(cmd.quantity) || cmd.quantity <= 0) return { reason: 'invalid_quantity', field: 'quantity' };
  if (storageCapacity(ctx.reg, dest, cmd.resourceId) <= 0) return { reason: 'invalid_quantity', field: 'resourceId' };
  const cost = sale.unitPrice * cmd.quantity;
  const check = requireGold(ctx.state, PLAYER, cost);
  if (!check.ok) return { reason: check.reason, missingGold: check.missingGold };
  placeOrderInternal(ctx, PLAYER, supplier, dest, cmd.resourceId, cmd.quantity, sale.unitPrice);
  return null;
}

export function handleSetAutoReorder(ctx: TickContext, cmd: Extract<Command, { type: 'setAutoReorder' }>): Rejection | null {
  const b = ctx.state.businesses[cmd.businessId];
  if (!b) return { reason: 'unknown_entity' };
  if (b.owner !== PLAYER) return { reason: 'not_owner' };
  const def = ctx.reg.businesses[b.defId];
  const cap = storageCapacity(ctx.reg, b, cmd.resourceId);
  if (!def?.automation.autoReorderAvailable || cap <= 0) return { reason: 'not_allowed' };
  if (!Number.isInteger(cmd.threshold) || cmd.threshold < 0 || cmd.threshold > cap) return { reason: 'invalid_threshold', field: 'threshold' };
  b.autoReorder[cmd.resourceId] = { enabled: cmd.enabled, threshold: cmd.threshold, failed: false };
  return null;
}

/** Auto-reorder (10.8–10.12): orders up to capacity minus stock minus Pending_Quantity. */
export function sourcingSystem(ctx: TickContext): void {
  for (const b of Object.values(ctx.state.businesses)) {
    for (const [res, ar] of Object.entries(b.autoReorder)) {
      if (!ar.enabled) {
        ar.failed = false;
        continue;
      }
      const cap = storageCapacity(ctx.reg, b, res);
      const amount = b.storage[res]?.amount ?? 0;
      const pending = pendingQuantity(ctx.state, b.id, res);
      if (amount + pending >= ar.threshold) {
        ar.failed = false;
        continue;
      }
      const offer = supplierFor(ctx.reg, ctx.state, res);
      const want = cap - amount - pending;
      if (!offer || want <= 0) continue;
      const affordable = b.owner === PLAYER ? Math.floor(Math.max(0, ctx.state.player.gold) / offer.unitPrice) : Infinity;
      const qty = Math.min(want, affordable);
      if (qty <= 0) {
        ar.failed = true; // retried every Tick (10.10)
        continue;
      }
      ar.failed = false;
      placeOrderInternal(ctx, b.owner, offer.supplier, b, res, qty, offer.unitPrice);
    }
  }
}

// ---------------- Routes ----------------

export function handleSetRoute(ctx: TickContext, cmd: Extract<Command, { type: 'setRoute' }>): Rejection | null {
  const v = ctx.state.vehicles[cmd.vehicleId];
  if (!v) return { reason: 'unknown_entity', field: 'vehicleId' };
  if (v.owner !== PLAYER) return { reason: 'not_owner' };
  const distinct = new Set(cmd.stops.map((s) => s.businessId));
  if (cmd.stops.length < 2 || distinct.size < 2) return { reason: 'invalid_route', field: 'stops' };
  for (const s of cmd.stops) {
    const b = ctx.state.businesses[s.businessId];
    if (!b) return { reason: 'invalid_route', field: 'stops' };
    if (b.owner !== PLAYER && b.owner !== 'npc') return { reason: 'not_owner', field: 'stops' };
    if (!isBusinessInUnlockedDistrict(ctx.reg, ctx.state, b)) return { reason: 'district_locked' };
  }
  const stops = cmd.stops.map((s) => ({ businessId: s.businessId, action: s.action, resources: s.resources ?? ('all' as const) }));
  const waitSeconds = cmd.waitSeconds ?? ctx.cfg.routeWaitSeconds;
  if (v.routeId && ctx.state.routes[v.routeId]) {
    const r = ctx.state.routes[v.routeId] as Route;
    r.stops = stops;
    r.waitSeconds = waitSeconds;
  } else {
    const id = nextId(ctx.state, 'rte');
    ctx.state.routes[id] = { id, vehicleId: v.id, owner: v.owner, stops, waitSeconds };
    v.routeId = id;
  }
  v.stopIndex = 0;
  v.path = null;
  v.retriedLoad = false;
  if (v.control === 'manual') v.routeSuspended = true;
  else {
    v.control = 'auto';
    v.routeSuspended = false;
    v.phase = 'idle';
  }
  return null;
}

// ---------------- Manual driving (13) ----------------

function manualVehicle(ctx: TickContext, vehicleId: string): Vehicle | Rejection {
  const v = ctx.state.vehicles[vehicleId];
  if (!v) return { reason: 'unknown_entity', field: 'vehicleId' };
  if (v.control !== 'manual' || ctx.state.ceo.drivingVehicleId !== v.id) return { reason: 'vehicle_not_manual' };
  return v;
}
const isRejection = (x: Vehicle | Rejection): x is Rejection => 'reason' in x;

export function handleStartManualDriving(ctx: TickContext, cmd: Extract<Command, { type: 'startManualDriving' }>): Rejection | null {
  const v = ctx.state.vehicles[cmd.vehicleId];
  const ceo = ctx.state.ceo;
  if (!v) return { reason: 'unknown_entity' };
  if (v.owner !== PLAYER) return { reason: 'not_owner' };
  if (ceo.drivingVehicleId || ceo.insideBusinessId) return { reason: 'not_allowed' };
  if (dist2d(ceo.x, ceo.z, v.pose.x, v.pose.z) > ctx.cfg.interactionRange + 2) return { reason: 'not_in_range' };
  if (v.driverOnBoard) {
    // The displaced Driver stays assigned and waits at the takeover position (13.10)
    for (const s of v.jobSlots) {
      if (s.filledBy?.kind !== 'human') continue;
      const h = ctx.state.humans[s.filledBy.humanId];
      if (h && h.location.kind === 'onVehicle') h.location = { kind: 'at', x: v.pose.x + 1.5, z: v.pose.z, insideBusinessId: null };
    }
    v.driverOnBoard = false;
  }
  if (v.control === 'auto' && v.routeId) v.routeSuspended = true;
  v.control = 'manual';
  v.path = null;
  v.phase = 'idle';
  ceo.drivingVehicleId = v.id;
  return null;
}

export function handleManualVehicleUpdate(ctx: TickContext, cmd: Extract<Command, { type: 'manualVehicleUpdate' }>): Rejection | null {
  const v = manualVehicle(ctx, cmd.vehicleId);
  if (isRejection(v)) return v;
  if (![cmd.x, cmd.z, cmd.heading, cmd.speed].every(Number.isFinite)) return { reason: 'not_allowed' };
  if (ctx.paths().drivable(cmd.x, cmd.z)) {
    v.pose.x = cmd.x;
    v.pose.z = cmd.z;
  }
  v.pose.heading = cmd.heading;
  v.pose.speed = Math.abs(cmd.speed);
  ctx.state.ceo.x = v.pose.x;
  ctx.state.ceo.z = v.pose.z;
  return null;
}

function zoneBusiness(ctx: TickContext, v: Vehicle, businessId: string): Business | Rejection {
  const b = ctx.state.businesses[businessId];
  if (!b) return { reason: 'unknown_entity', field: 'businessId' };
  if (v.pose.speed >= ctx.cfg.stoppedSpeed) return { reason: 'not_stopped' };
  if (!inUnloadingZone(ctx.reg, b.plotId, v.pose.x, v.pose.z)) return { reason: 'not_in_range' };
  return b;
}

export function handleManualLoad(ctx: TickContext, cmd: Extract<Command, { type: 'manualLoad' }>): Rejection | null {
  const v = manualVehicle(ctx, cmd.vehicleId);
  if (isRejection(v)) return v;
  const b = zoneBusiness(ctx, v, cmd.businessId);
  if ('reason' in b) return b;
  const resources = ctx.reg.vehicles[v.defId]?.allowedResources ?? [];
  const qty = loadAt(ctx, v, b, null, resources);
  return qty > 0 ? null : { reason: 'nothing_to_load' };
}

export function handleManualUnload(ctx: TickContext, cmd: Extract<Command, { type: 'manualUnload' }>): Rejection | null {
  const v = manualVehicle(ctx, cmd.vehicleId);
  if (isRejection(v)) return v;
  const b = zoneBusiness(ctx, v, cmd.businessId);
  if ('reason' in b) return b;
  if (b.owner !== PLAYER) return { reason: 'not_owner' };
  const lots = unloadAt(ctx, v, b, Object.keys(v.cargo));
  if (lots.length === 0) return { reason: 'nothing_to_unload' };
  // Manual_Delivery_Tip: only cargo from a Supplier/Market_Depot/Brewery counts (13.9)
  let value = 0;
  for (const { resourceId, lot } of lots) {
    if (lot.origin !== 'supplier' && lot.origin !== 'market_depot' && lot.origin !== 'brewery') continue;
    value += lot.qty * (supplierFor(ctx.reg, ctx.state, resourceId)?.unitPrice ?? 0);
  }
  const tip = rewardOf(value, ctx.cfg.manualTipFactor);
  if (tip > 0) {
    gold(ctx, PLAYER, tip, 'tip', v.id);
    ctx.events.push({ type: 'manualTip', vehicleId: v.id, owner: PLAYER, amount: tip });
  }
  return null;
}

export function handleEndManualDriving(ctx: TickContext, cmd: Extract<Command, { type: 'endManualDriving' }>): Rejection | null {
  const v = manualVehicle(ctx, cmd.vehicleId);
  if (isRejection(v)) return v;
  if (v.pose.speed >= ctx.cfg.stoppedSpeed) return { reason: 'not_stopped' };
  v.control = 'parked';
  v.pose.speed = 0;
  const ceo = ctx.state.ceo;
  ceo.drivingVehicleId = null;
  ceo.x = v.pose.x + 1.8;
  ceo.z = v.pose.z;
  if (!ctx.paths().walkable(ceo.x, ceo.z)) ceo.x = v.pose.x;
  return null;
}

export function handleResumeRoute(ctx: TickContext, cmd: Extract<Command, { type: 'resumeRoute' }>): Rejection | null {
  const v = ctx.state.vehicles[cmd.vehicleId];
  if (!v) return { reason: 'unknown_entity' };
  if (v.owner !== PLAYER) return { reason: 'not_owner' };
  if (v.control === 'manual') return { reason: 'not_allowed' };
  const route = v.routeId ? ctx.state.routes[v.routeId] : undefined;
  if (!route) return { reason: 'invalid_route' };
  const cache = ctx.paths();
  const rp = cache.nearestRoadPoint(v.pose.x, v.pose.z);
  if (rp) {
    v.pose.x = rp.x;
    v.pose.z = rp.z;
  }
  // Resume from the Route stop nearest by road distance (13.12)
  let best = v.stopIndex;
  let bestD = Infinity;
  route.stops.forEach((s, i) => {
    const b = ctx.state.businesses[s.businessId];
    if (!b || !rp) return;
    const access = plotInfo(ctx.reg, b.plotId).accessNode;
    const d = Math.min(cache.distance(rp.a, access), cache.distance(rp.b, access));
    if (d < bestD - 1e-9) {
      bestD = d;
      best = i;
    }
  });
  v.stopIndex = best;
  v.control = 'auto';
  v.routeSuspended = false;
  v.phase = 'idle';
  v.path = null;
  v.retriedLoad = false;
  for (const s of v.jobSlots) {
    if (s.filledBy?.kind !== 'human') continue;
    const h = ctx.state.humans[s.filledBy.humanId];
    if (h && h.location.kind !== 'onVehicle') sendToJob(ctx, h);
  }
  return null;
}

export function handleResetVehicle(ctx: TickContext, cmd: Extract<Command, { type: 'resetVehicle' }>): Rejection | null {
  const v = manualVehicle(ctx, cmd.vehicleId);
  if (isRejection(v)) return v;
  if (![cmd.x, cmd.z, cmd.heading].every(Number.isFinite)) return { reason: 'not_allowed' };
  v.pose = { x: cmd.x, z: cmd.z, heading: cmd.heading, speed: 0 }; // cargo untouched (13.14)
  ctx.state.ceo.x = cmd.x;
  ctx.state.ceo.z = cmd.z;
  return null;
}
