// Pub interior anchors (Requirement 55.5). Layouts are data (`phase3/layouts.json`, plot-local metres);
// the sim reads distances between anchors, the Renderer draws figures at the same anchors.
import type { DefinitionRegistry } from '../defs/registry';
import type { LayoutDef } from '../defs/phase3Schemas';
import { frontSign } from '../world/geometry';

export type Anchor = { u: number; v: number };
export type AnchorName = 'door' | 'mat' | 'bar' | 'till' | 'cleanSpot' | 'storage' | 'exit';

/** The layout a Business Definition names with `layoutKey`, or undefined for Businesses without one. */
export function layoutOf(reg: DefinitionRegistry, defId: string): LayoutDef | undefined {
  const key = reg.businesses[defId]?.layoutKey;
  return key === undefined ? undefined : reg.phase3.layouts[key];
}

/** Straight-line distance in metres between two anchors (the sim uses `Math.sqrt`, no hypot). */
export function anchorDistance(a: Anchor, b: Anchor): number {
  const du = a.u - b.u;
  const dv = a.v - b.v;
  return Math.sqrt(du * du + dv * dv);
}

/** World position of an anchor on a Plot: `v` runs from the back wall to the street side. */
export function anchorWorld(reg: DefinitionRegistry, plotId: string, a: Anchor): { x: number; z: number } {
  const p = reg.world.plots[plotId]?.def;
  if (!p) throw new Error(`unknown plot ${plotId}`);
  const s = frontSign(reg, plotId);
  return { x: p.x + a.u, z: p.z - (s * p.d) / 2 + s * a.v };
}