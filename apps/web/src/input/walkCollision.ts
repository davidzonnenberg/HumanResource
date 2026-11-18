// Walking collision against building hitboxes (render/footprints.ts). The sim moves the CEO by
// `dir * ceoWalkingSpeed * dt` (normalised); this predicts that step and drops the blocked axis
// before the ceoMove is submitted, so the CEO slides along walls instead of entering a building.
import type { Footprint } from '../render/footprints';

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function hits(rects: Iterable<Rect>, x: number, z: number, pad: number): boolean {
  for (const r of rects) if (x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad) return true;
  return false;
}

/**
 * Returns the move direction to submit. If the CEO already overlaps a hitbox (old save, model
 * grew) nothing is blocked, so they can always walk out.
 */
export function shapeMove(x: number, z: number, dx: number, dz: number, step: number, radius: number, rects: Iterable<Footprint | Rect>): { dx: number; dz: number } {
  const list = [...rects];
  if (hits(list, x, z, radius)) return { dx, dz };
  const len = Math.sqrt(dx * dx + dz * dz);
  const k = len > 1 ? 1 / len : 1;
  const sx = dx * k * step;
  const sz = dz * k * step;
  if (!hits(list, x + sx, z + sz, radius)) return { dx, dz };
  if (sx !== 0 && !hits(list, x + sx, z, radius)) return { dx: dx * k, dz: 0 };
  if (sz !== 0 && !hits(list, x, z + sz, radius)) return { dx: 0, dz: dz * k };
  return { dx: 0, dz: 0 };
}
