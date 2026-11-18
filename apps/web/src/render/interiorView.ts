// Interior view (14.3): while the CEO is inside a Business only things inside that plot are drawn.
import type { DefinitionRegistry, SimState } from '@hr/sim';

/** Plot rectangle of the Business the CEO is inside, or null when outside. */
export function interiorRect(reg: DefinitionRegistry, s: SimState): { x: number; z: number; w: number; d: number } | null {
  const id = s.ceo.insideBusinessId;
  const b = id ? s.businesses[id] : undefined;
  const p = b ? reg.world.plots[b.plotId]?.def : undefined;
  return p ? { x: p.x, z: p.z, w: p.w, d: p.d } : null;
}
