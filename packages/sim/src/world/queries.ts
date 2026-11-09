// Read-only queries shared by systems, handlers and UI selectors.
import type { DefinitionRegistry } from '../defs/registry';
import type { Business, Human, Route, SimState, Vehicle } from '../state/types';
import { PLAYER } from '../state/types';
import { pathPosition, type Point } from '../logistics/paths';
import { isBusinessInUnlockedDistrict } from './geometry';

export function humanPosition(state: SimState, h: Human): Point {
  const loc = h.location;
  if (loc.kind === 'at') return { x: loc.x, z: loc.z };
  if (loc.kind === 'walking') return pathPosition(loc.path);
  const v = state.vehicles[loc.vehicleId];
  return v ? { x: v.pose.x, z: v.pose.z } : { x: 0, z: 0 };
}

/** Index of the next drop-off stop at or after `from` (cyclic), or -1. */
export function nextDropoffIndex(route: Route, from: number): number {
  const n = route.stops.length;
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    if (route.stops[i]?.action === 'dropoff') return i;
  }
  return -1;
}

/** The Business the Vehicle will drop off at next, or null. */
export function vehicleNextDropoff(state: SimState, v: Vehicle): string | null {
  if (!v.routeId) return null;
  const route = state.routes[v.routeId];
  if (!route) return null;
  const i = nextDropoffIndex(route, v.stopIndex);
  return i < 0 ? null : (route.stops[i]?.businessId ?? null);
}

export function cargoTotal(v: Vehicle): number {
  let t = 0;
  for (const s of Object.values(v.cargo)) t += s.amount;
  return t;
}

/**
 * Pending_Quantity: reserved open Orders for the destination plus cargo on the owner's Vehicles
 * whose next drop-off is the destination (glossary).
 */
export function pendingQuantity(state: SimState, destinationId: string, resourceId: string): number {
  let q = 0;
  for (const o of Object.values(state.orders)) if (o.destinationId === destinationId && o.resourceId === resourceId) q += o.remaining;
  const dest = state.businesses[destinationId];
  for (const v of Object.values(state.vehicles)) {
    if (!dest || v.owner !== dest.owner) continue;
    if (vehicleNextDropoff(state, v) === destinationId) q += v.cargo[resourceId]?.amount ?? 0;
  }
  return q;
}

export interface SupplierOffer {
  supplier: Business;
  unitPrice: number;
}

/** First Supplier in an unlocked District selling the Resource (deterministic id order). */
export function supplierFor(reg: DefinitionRegistry, state: SimState, resourceId: string): SupplierOffer | null {
  for (const b of Object.values(state.businesses)) {
    const def = reg.businesses[b.defId];
    const sale = def?.supplier?.sells.find((s) => s.resourceId === resourceId);
    if (sale && isBusinessInUnlockedDistrict(reg, state, b)) return { supplier: b, unitPrice: sale.unitPrice };
  }
  return null;
}

export function storageCapacity(reg: DefinitionRegistry, b: Business, resourceId: string): number {
  return reg.businesses[b.defId]?.storage[resourceId] ?? 0;
}

export function firstPlayerPub(reg: DefinitionRegistry, state: SimState): Business | null {
  for (const b of Object.values(state.businesses)) if (b.owner === PLAYER && reg.businesses[b.defId]?.pub) return b;
  return null;
}

export function isSupplier(reg: DefinitionRegistry, b: Business): boolean {
  return reg.businesses[b.defId]?.supplier !== undefined;
}
