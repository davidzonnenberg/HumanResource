// Positions derived from map data: plot centre, entrance, parking/unloading point.
import type { DefinitionRegistry, PlotInfo } from '../defs/registry';
import type { Business, SimState } from '../state/types';

export interface Pt {
  x: number;
  z: number;
}

export function plotInfo(reg: DefinitionRegistry, plotId: string): PlotInfo {
  const p = reg.world.plots[plotId];
  if (!p) throw new Error(`unknown plot ${plotId}`);
  return p;
}

/** +1 when the road (access node) is at larger z than the plot centre, else -1. */
export function frontSign(reg: DefinitionRegistry, plotId: string): number {
  const p = plotInfo(reg, plotId);
  const n = reg.world.nodes[p.accessNode];
  return n && n.z < p.def.z ? -1 : 1;
}

export const plotCenter = (reg: DefinitionRegistry, plotId: string): Pt => {
  const p = plotInfo(reg, plotId).def;
  return { x: p.x, z: p.z };
};

/** Door point on the road-facing side of the plot. */
export function entrance(reg: DefinitionRegistry, plotId: string): Pt {
  const p = plotInfo(reg, plotId).def;
  return { x: p.x, z: p.z + (frontSign(reg, plotId) * p.d) / 2 };
}

export function parkingPoint(reg: DefinitionRegistry, plotId: string): Pt {
  const z = plotInfo(reg, plotId).def.unloadingZone;
  return { x: z.x, z: z.z };
}

export function inUnloadingZone(reg: DefinitionRegistry, plotId: string, x: number, zz: number): boolean {
  const u = plotInfo(reg, plotId).def.unloadingZone;
  return Math.abs(x - u.x) <= u.w / 2 && Math.abs(zz - u.z) <= u.d / 2;
}

export const businessPlot = (reg: DefinitionRegistry, b: Business): PlotInfo => plotInfo(reg, b.plotId);

export function businessDistrict(reg: DefinitionRegistry, b: Business): string {
  return plotInfo(reg, b.plotId).districtId;
}

export function isBusinessInUnlockedDistrict(reg: DefinitionRegistry, state: SimState, b: Business): boolean {
  return state.districts[businessDistrict(reg, b)]?.unlocked === true;
}
