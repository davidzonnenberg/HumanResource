// Pub interior layout anchors (entrance, seats, bar) derived from plot geometry. Customers and
// staff animate between these anchors (4.13, 5.7). Pure functions, shared by figures and labels.
import { entrance, frontSign, type DefinitionRegistry } from '@hr/sim';

export interface PubLayout {
  door: { x: number; z: number };
  bar: { x: number; z: number; w: number };
  seats: { x: number; z: number }[];
  barSpot(i: number): { x: number; z: number };
}

const cache = new Map<string, PubLayout>();

export function pubLayout(reg: DefinitionRegistry, plotId: string, seats: number): PubLayout {
  const key = `${plotId}:${seats}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = reg.world.plots[plotId]?.def;
  if (!p) throw new Error(`unknown plot ${plotId}`);
  const s = frontSign(reg, plotId); // +1: road at +z
  const back = p.z - (s * p.d) / 2;
  const barZ = back + s * 1.4;
  const cols = Math.ceil(Math.sqrt(seats * (p.w / p.d)));
  const rows = Math.ceil(seats / cols);
  const seatPts: { x: number; z: number }[] = [];
  const x0 = p.x - p.w / 2 + 1.6;
  const x1 = p.x + p.w / 2 - 1.6;
  const z0 = barZ + s * 2.4;
  const z1 = p.z + (s * p.d) / 2 - s * 1.6;
  for (let i = 0; i < seats; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    seatPts.push({ x: cols === 1 ? p.x : x0 + ((x1 - x0) * c) / (cols - 1), z: rows === 1 ? (z0 + z1) / 2 : z0 + ((z1 - z0) * r) / (rows - 1) });
  }
  const layout: PubLayout = {
    door: entrance(reg, plotId),
    bar: { x: p.x, z: barZ, w: p.w * 0.6 },
    seats: seatPts,
    barSpot: (i) => ({ x: p.x - p.w * 0.2 + (i % 3) * p.w * 0.2, z: back + s * 0.7 }),
  };
  cache.set(key, layout);
  return layout;
}
