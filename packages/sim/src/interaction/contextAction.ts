// Pure Context_Action selection (13.1, 13.2, 13.6, 14.2, 14.3, 14.5). Used by the HUD button.
import type { DefinitionRegistry } from '../defs/registry';
import { dist2d } from '../core/math';
import type { SimState } from '../state/types';
import { PLAYER } from '../state/types';
import { entrance, inUnloadingZone, isBusinessInUnlockedDistrict, plotInfo } from '../world/geometry';
import { cargoTotal } from '../world/queries';

export type ContextActionKind = 'enter' | 'exitBuilding' | 'inspect' | 'drive' | 'load' | 'unload' | 'exitVehicle';

export interface ContextAction {
  kind: ContextActionKind;
  targetKind: 'business' | 'vehicle' | 'plot';
  targetId: string;
}

/** The single primary action for the nearest interactable within Interaction_Range, or null. */
export function contextActionFor(state: SimState, reg: DefinitionRegistry): ContextAction | null {
  const ceo = state.ceo;
  const range = reg.config.interactionRange;
  if (ceo.drivingVehicleId) {
    const v = state.vehicles[ceo.drivingVehicleId];
    if (!v || v.pose.speed >= reg.config.stoppedSpeed) return null;
    for (const b of Object.values(state.businesses)) {
      if (!isBusinessInUnlockedDistrict(reg, state, b)) continue;
      if (!inUnloadingZone(reg, b.plotId, v.pose.x, v.pose.z)) continue;
      const accepts = b.owner === PLAYER && Object.entries(v.cargo).some(([r, s]) => s.amount > 0 && (reg.businesses[b.defId]?.storage[r] ?? 0) > (b.storage[r]?.amount ?? 0));
      if (accepts) return { kind: 'unload', targetKind: 'business', targetId: b.id };
      const isSupplier = reg.businesses[b.defId]?.supplier !== undefined;
      const hasOrders = isSupplier && Object.values(state.orders).some((o) => o.owner === PLAYER && o.sourceId === b.id);
      const ownStock = b.owner === PLAYER && Object.values(b.storage).some((s) => s.amount > 0);
      const free = (reg.vehicles[v.defId]?.capacity ?? 0) - cargoTotal(v);
      if (free > 0 && (hasOrders || ownStock)) return { kind: 'load', targetKind: 'business', targetId: b.id };
    }
    return { kind: 'exitVehicle', targetKind: 'vehicle', targetId: v.id };
  }
  if (ceo.insideBusinessId) return { kind: 'exitBuilding', targetKind: 'business', targetId: ceo.insideBusinessId };

  let best: { action: ContextAction; d: number } | null = null;
  const consider = (action: ContextAction, d: number): void => {
    if (d <= range && (!best || d < best.d - 1e-9)) best = { action, d };
  };
  for (const v of Object.values(state.vehicles)) {
    const d = dist2d(ceo.x, ceo.z, v.pose.x, v.pose.z);
    consider({ kind: v.owner === PLAYER ? 'drive' : 'inspect', targetKind: 'vehicle', targetId: v.id }, d);
  }
  for (const b of Object.values(state.businesses)) {
    if (!isBusinessInUnlockedDistrict(reg, state, b)) continue; // 48.9
    const door = entrance(reg, b.plotId);
    consider({ kind: b.owner === PLAYER ? 'enter' : 'inspect', targetKind: 'business', targetId: b.id }, dist2d(ceo.x, ceo.z, door.x, door.z));
  }
  for (const p of Object.values(state.plots)) {
    if (p.status !== 'for_sale' || !state.districts[p.districtId]?.unlocked) continue;
    const def = plotInfo(reg, p.id).def;
    const door = { x: def.x, z: def.unloadingZone.z };
    consider({ kind: 'inspect', targetKind: 'plot', targetId: p.id }, dist2d(ceo.x, ceo.z, door.x, door.z));
  }
  return (best as { action: ContextAction } | null)?.action ?? null;
}
