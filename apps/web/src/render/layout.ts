// Pub interior anchors (entrance, seats, bar) read from the layout data (`phase3/layouts.json`) via the
// sim's anchor helpers, so the Renderer and the Simulation use the same points (4.13, 5.7, 55.5).
// Pure functions, shared by figures and labels.
import { anchorWorld, entrance, layoutOf, type DefinitionRegistry } from '@hr/sim';
export interface PubLayout {
  door: { x: number; z: number };
  bar: { x: number; z: number; w: number };
  seats: { x: number; z: number }[];
  barSpot(i: number): { x: number; z: number };
  /** Tap anchors (where a worker stands to pour), the idle cleaning spot and the till. */
  taps: { x: number; z: number }[];
  cleanSpot: { x: number; z: number };
  till: { x: number; z: number };
}
const cache = new WeakMap<DefinitionRegistry, Map<string, PubLayout>>();
export function pubLayout(reg: DefinitionRegistry, plotId: string, defId: string): PubLayout {
  let byKey = cache.get(reg);
  if (!byKey) cache.set(reg, (byKey = new Map()));
  const key = `${plotId}:${defId}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const p = reg.world.plots[plotId]?.def;
  const data = layoutOf(reg, defId);
  if (!p || !data) throw new Error(`no layout for plot ${plotId} / ${defId}`);
  const at = (a: { u: number; v: number }) => anchorWorld(reg, plotId, a);
  const layout: PubLayout = {
    door: entrance(reg, plotId),
    bar: { ...at(data.bar), w: p.w * 0.6 },
    seats: data.seats.map(at),
    // Bartenders stand behind the bar at the taps; a worker beyond the last tap shares a spot.
    taps: data.taps.map(at),
    cleanSpot: at(data.cleanSpot),
    till: at(data.till),
    barSpot: (i) => at(data.taps[i % data.taps.length] ?? data.bar),
  };
  byKey.set(key, layout);
  return layout;
}