// Builds the start state from start-state data (Requirement 3). Entities are created in a fixed
// order (plots, businesses, vehicles, humans, orders) so ids and RNG use are identical per seed.
import type { DefinitionRegistry } from '../defs/registry';
import { nextId } from '../core/ids';
import { newRing } from '../metrics/ring';
import { drawHumanName } from '../names/names';
import { rngPick, seedRng } from '../rng/xoshiro128ss';
import { addToStock, emptyStock } from '../storage/stock';
import { entrance, parkingPoint, plotCenter } from '../world/geometry';
import type { Business, Human, JobSlot, PubMetrics, SimState, Vehicle } from './types';

export function emptyPubMetrics(windowSeconds: number): PubMetrics {
  return {
    arrivals: newRing(windowSeconds),
    lostNoSeat: newRing(windowSeconds),
    lostOutOfBeer: newRing(windowSeconds),
    lostPatience: newRing(windowSeconds),
    waitSum: newRing(windowSeconds),
    waitCount: newRing(windowSeconds),
    staff: newRing(windowSeconds),
  };
}

export function newGame(reg: DefinitionRegistry, seed: number): SimState {
  const start = reg.startState;
  const cfg = reg.config;
  const state: SimState = {
    tick: 0,
    seed: seed | 0,
    rng: seedRng(seed),
    idCounters: {},
    districts: Object.fromEntries(Object.entries(start.districts).map(([k, v]) => [k, { unlocked: v.unlocked }])),
    player: { gold: start.gold, reputation: start.reputation, corporateResources: {}, availableBrands: [], recipes: [] },
    competitors: Object.fromEntries(start.competitors.map((c) => [c.id, { id: c.id, nameKey: c.nameKey, colorToken: c.colorToken }])),
    plots: {},
    businesses: {},
    humans: {},
    customers: {},
    vehicles: {},
    routes: {},
    orders: {},
    ceo: { x: 0, z: 0, heading: 0, insideBusinessId: null, drivingVehicleId: null },
    scheduler: [],
    schedulerSeq: 0,
    metrics: { pubs: {}, vehicles: {}, routesBottleneck: {} },
    finance: { buckets: [] },
    resourceTotals: Object.fromEntries(Object.keys(reg.resources).map((r) => [r, 0])),
    alerts: {},
    reveals: { fired: [] },
    achievements: [],
    news: [],
  };

  // Plots
  for (const [plotId, info] of Object.entries(reg.world.plots)) {
    const init = info.def.initial;
    state.plots[plotId] = {
      id: plotId,
      districtId: info.districtId,
      status: init.kind === 'for_sale' ? 'for_sale' : 'empty',
      owner: null,
      businessId: null,
      price: init.kind === 'for_sale' ? init.price : null,
    };
  }

  // Businesses
  const bizByKey: Record<string, Business> = {};
  for (const b of start.businesses) {
    const def = reg.businesses[b.defId];
    if (!def) throw new Error(`unknown business def ${b.defId}`);
    const id = nextId(state, 'biz');
    const names = reg.text[def.nameTable];
    const name = Array.isArray(names) && names.length > 0 ? String(rngPick(state, names)) : def.id;
    const storage: Business['storage'] = {};
    for (const [res, cap] of Object.entries(def.storage)) {
      const stock = emptyStock();
      const qty = Math.floor((cap * (b.stockPct?.[res] ?? 0)) / 100);
      if (qty > 0) addToStock(stock, { qty, recipeId: null, arrivedTick: 0, origin: 'start' }, cap);
      storage[res] = stock;
      state.resourceTotals[res] = (state.resourceTotals[res] ?? 0) + stock.amount;
    }
    const jobSlots: JobSlot[] = [];
    for (const hr of def.humanRequirements)
      for (let i = 0; i < hr.slots; i++) jobSlots.push({ slotId: `${hr.jobId}_${i + 1}`, jobId: hr.jobId, filledBy: null });
    const autoReorder: Business['autoReorder'] = {};
    for (const [res, ar] of Object.entries(b.autoReorder ?? {}))
      autoReorder[res] = { enabled: ar.enabled, threshold: Math.floor(((def.storage[res] ?? 0) * ar.thresholdPct) / 100), failed: false };
    const biz: Business = {
      id,
      defId: def.id,
      owner: b.owner,
      plotId: b.plotId,
      name,
      storage,
      jobSlots,
      brandId: def.brand,
      traits: def.traits.map((t) => ({ traitId: t, hidden: false })),
      sourcing: Object.fromEntries(def.inputs.map((r) => [r, def.automation.defaultSourcing])),
      autoReorder,
    };
    if (def.pub) {
      biz.pub = { drinkPrice: def.pub.defaultDrinkPrice, seats: new Array<string | null>(def.pub.seats).fill(null), orderQueue: [], bar: [], arrivalAcc: 0 };
      state.metrics.pubs[id] = emptyPubMetrics(cfg.pubWindowSeconds);
    }
    state.businesses[id] = biz;
    const plot = state.plots[b.plotId];
    if (plot) {
      plot.status = 'occupied';
      plot.owner = b.owner;
      plot.businessId = id;
      plot.price = null;
    }
    bizByKey[b.key] = biz;
  }

  // Vehicles and Routes
  const vehByKey: Record<string, Vehicle> = {};
  for (const v of start.vehicles) {
    const def = reg.vehicles[v.defId];
    const parked = bizByKey[v.parkedAt];
    if (!def || !parked) throw new Error(`bad start vehicle ${v.key}`);
    const id = nextId(state, 'veh');
    const pos = parkingPoint(reg, parked.plotId);
    const veh: Vehicle = {
      id,
      defId: def.id,
      owner: v.owner,
      name: def.nameKey,
      cargo: Object.fromEntries(def.allowedResources.map((r) => [r, emptyStock()])),
      jobSlots: def.driverRequirement ? [{ slotId: 'driver_1', jobId: def.driverRequirement.jobId, filledBy: null }] : [],
      driverOnBoard: false,
      control: v.route ? 'auto' : 'parked',
      routeId: null,
      routeSuspended: false,
      pose: { x: pos.x, z: pos.z, heading: 0, speed: 0 },
      path: null,
      stopIndex: 0,
      phase: 'idle',
      phaseUntil: 0,
      retriedLoad: false,
    };
    if (v.route) {
      const rid = nextId(state, 'rte');
      state.routes[rid] = {
        id: rid,
        vehicleId: id,
        owner: v.owner,
        stops: v.route.map((s) => ({ businessId: (bizByKey[s.stop] as Business).id, action: s.action, resources: 'all' as const })),
        waitSeconds: cfg.routeWaitSeconds,
      };
      veh.routeId = rid;
    }
    state.vehicles[id] = veh;
    state.metrics.vehicles[id] = { deliveries: newRing(cfg.vehicleWindowSeconds), delivered: newRing(cfg.vehicleWindowSeconds) };
    vehByKey[v.key] = veh;
  }

  // Humans (Jan, Julia, Thomas and the Competitor staff)
  for (const h of start.humans) {
    const def = reg.humans[h.defId];
    if (!def) throw new Error(`unknown human def ${h.defId}`);
    const id = nextId(state, 'hum');
    const name = h.name ?? drawHumanName(state, reg.namePool, h.owner);
    const human: Human = {
      id,
      defId: def.id,
      name,
      owner: h.owner,
      qualifications: [...def.qualifications],
      assignment: null,
      status: 'working',
      location: { kind: 'at', x: 0, z: 0, insideBusinessId: null },
      task: null,
      salaryCarry: 0,
    };
    if ('business' in h.job) {
      const biz = bizByKey[h.job.business] as Business;
      const slot = biz.jobSlots.find((s) => s.jobId === h.job.jobId && s.filledBy === null);
      if (!slot) throw new Error(`no free ${h.job.jobId} slot for start human`);
      slot.filledBy = { kind: 'human', humanId: id };
      human.assignment = { kind: 'business', id: biz.id, slotId: slot.slotId };
      const c = plotCenter(reg, biz.plotId);
      human.location = { kind: 'at', x: c.x, z: c.z, insideBusinessId: biz.id };
    } else {
      const veh = vehByKey[h.job.vehicle] as Vehicle;
      const slot = veh.jobSlots.find((s) => s.jobId === h.job.jobId && s.filledBy === null);
      if (!slot) throw new Error(`no free ${h.job.jobId} slot for start human`);
      slot.filledBy = { kind: 'human', humanId: id };
      human.assignment = { kind: 'vehicle', id: veh.id, slotId: slot.slotId };
      if (h.onBoard) {
        human.location = { kind: 'onVehicle', vehicleId: veh.id };
        veh.driverOnBoard = true;
      } else human.location = { kind: 'at', x: veh.pose.x, z: veh.pose.z, insideBusinessId: null };
    }
    state.humans[id] = human;
  }

  // Orders (reserved at the Supplier, created in the world)
  for (const o of start.orders) {
    const dest = bizByKey[o.destination] as Business;
    const src = bizByKey[o.source] as Business;
    const cap = reg.businesses[dest.defId]?.storage[o.resourceId] ?? 0;
    const qty = Math.floor((cap * o.pctOfCapacity) / 100);
    if (qty <= 0) continue;
    const id = nextId(state, 'ord');
    state.orders[id] = { id, owner: o.owner, sourceId: src.id, destinationId: dest.id, resourceId: o.resourceId, remaining: qty, placedTick: 0 };
    state.resourceTotals[o.resourceId] = (state.resourceTotals[o.resourceId] ?? 0) + qty;
  }

  // CEO next to the Pub, on the street side (3.4)
  const near = bizByKey[start.ceo.nearBusiness] as Business;
  const door = entrance(reg, near.plotId);
  const park = parkingPoint(reg, near.plotId);
  state.ceo = { x: door.x + 3, z: (door.z + park.z) / 2, heading: 0, insideBusinessId: null, drivingVehicleId: null };
  return state;
}
