// Shared helpers for the procedural town tests: the committed brief, a memoised generation, and the geometry checks.
import briefJson from '../../../../packages/content/data/maps/town-brief.json';
import { generateTown } from '../../src/render/procedural/town/generateTown';
import { parseTownBrief } from '../../src/render/procedural/town/townSchema';
import type { Building, Road, TownBrief, TownData, Vec2 } from '../../src/render/procedural/town/townTypes';

export const BRIEF: TownBrief = parseTownBrief(briefJson);

/** Strict tolerance for exact geometry (rounding to 0.01 m, floating point). */
export const EPS = 0.05;

/**
 * How far a footprint may poke into a neighbour, a road ribbon or water. The generator samples the footprint on a grid
 * that includes both edges (0.4 m inset, step <= 1 m) over a 1 m occupancy grid, so 0.5 m is the agreed limit.
 */
export const gridTol = (_b?: Pick<Building, 'width' | 'depth'>): number => 0.5;
export const pairTol = (_a?: Building, _b?: Building): number => 0.5;

const cache = new Map<string, TownData>();
/** Generate once per (seed) and share between tests; never mutate the result. */
export function townFor(seed: string, brief: TownBrief = BRIEF): TownData {
  const key = `${brief.id}:${seed}`;
  let t = cache.get(key);
  if (!t) {
    t = generateTown({ ...brief, seed });
    cache.set(key, t);
  }
  return t;
}

export function corners(b: Pick<Building, 'x' | 'z' | 'angle' | 'width' | 'depth'>): Vec2[] {
  // Same frame the generator uses: u along the facade (width), q across (depth).
  const ca = Math.cos(b.angle), sa = Math.sin(b.angle), hw = b.width / 2, hd = b.depth / 2;
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as Vec2[]).map(([u, q]) => [b.x + u * ca - q * sa, b.z + u * sa + q * ca] as Vec2);
}

/** Penetration depth of two oriented rectangles (SAT). <= 0 means separated or just touching. */
export function penetration(a: Building, b: Building): number {
  const ca = corners(a), cb = corners(b);
  const axes: Vec2[] = [[Math.cos(a.angle), Math.sin(a.angle)], [-Math.sin(a.angle), Math.cos(a.angle)],
    [Math.cos(b.angle), Math.sin(b.angle)], [-Math.sin(b.angle), Math.cos(b.angle)]];
  let min = Infinity;
  for (const [ax, az] of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of ca) { const p = x * ax + z * az; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
    for (const [x, z] of cb) { const p = x * ax + z * az; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    min = Math.min(min, Math.min(a1, b1) - Math.max(a0, b0));
    if (min <= 0) return min;
  }
  return min;
}

export interface Overlap { a: string; b: string; depth: number }

/** All pairs of building footprints that overlap by more than eps (metres). */
export function footprintOverlaps(buildings: Building[], tol: (a: Building, b: Building) => number = () => EPS): Overlap[] {
  const CELL = 50;
  const grid = new Map<string, number[]>();
  const key = (cx: number, cz: number) => `${cx},${cz}`;
  buildings.forEach((b, i) => {
    const k = key(Math.floor(b.x / CELL), Math.floor(b.z / CELL));
    const l = grid.get(k);
    if (l) l.push(i); else grid.set(k, [i]);
  });
  const out: Overlap[] = [];
  buildings.forEach((a, i) => {
    const cx = Math.floor(a.x / CELL), cz = Math.floor(a.z / CELL);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      for (const j of grid.get(key(cx + dx, cz + dz)) ?? []) {
        if (j <= i) continue;
        const b = buildings[j]!;
        const reach = Math.hypot(a.width, a.depth) / 2 + Math.hypot(b.width, b.depth) / 2;
        if (Math.hypot(a.x - b.x, a.z - b.z) > reach) continue;
        const depth = penetration(a, b);
        if (depth > tol(a, b)) out.push({ a: a.id, b: b.id, depth });
      }
    }
  });
  return out;
}

function distPointSeg(px: number, pz: number, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2));
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}

function segCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

function pointInRect(p: Vec2, rc: Vec2[]): boolean {
  let pos = 0, neg = 0;
  for (let i = 0; i < 4; i++) {
    const a = rc[i]!, b = rc[(i + 1) % 4]!;
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (c > 0) pos++; else if (c < 0) neg++;
  }
  return pos === 0 || neg === 0;
}

/** Shortest distance between a segment and a convex quadrilateral (0 when they touch or cross). */
export function distSegRect(a: Vec2, b: Vec2, rc: Vec2[]): number {
  if (pointInRect(a, rc) || pointInRect(b, rc)) return 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const c = rc[i]!, d = rc[(i + 1) % 4]!;
    if (segCross(a, b, c, d)) return 0;
    best = Math.min(best, distPointSeg(c[0], c[1], a, b), distPointSeg(a[0], a[1], c, d), distPointSeg(b[0], b[1], c, d));
  }
  return best;
}

export interface Ribbon { id: string; points: Vec2[]; half: (i: number) => number }

export function roadRibbons(t: TownData): Ribbon[] {
  return [t.highway, ...t.roads].map((r: Road) => ({ id: r.id, points: r.points, half: () => r.width / 2 }));
}

export function waterRibbons(t: TownData): Ribbon[] {
  return t.water.map((w) => ({
    id: w.id,
    points: w.points,
    half: (i: number) => Math.max(w.widths[i] ?? 0, w.widths[i + 1] ?? 0) / 2,
  }));
}

export interface Hit { building: string; ribbon: string; gap: number }

/** Buildings whose footprint comes closer to a ribbon's centre line than its half width (minus eps). */
export function ribbonHits(buildings: Building[], ribbons: Ribbon[], tol: (b: Building) => number = () => EPS): Hit[] {
  const CELL = 40;
  type Seg = { r: Ribbon; i: number };
  const grid = new Map<string, Seg[]>();
  const key = (cx: number, cz: number) => `${cx},${cz}`;
  for (const r of ribbons) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i]!, b = r.points[i + 1]!;
      const reach = r.half(i), seg: Seg = { r, i };
      const x0 = Math.floor((Math.min(a[0], b[0]) - reach) / CELL), x1 = Math.floor((Math.max(a[0], b[0]) + reach) / CELL);
      const z0 = Math.floor((Math.min(a[1], b[1]) - reach) / CELL), z1 = Math.floor((Math.max(a[1], b[1]) + reach) / CELL);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
        const k = key(gx, gz);
        const l = grid.get(k);
        if (l) l.push(seg); else grid.set(k, [seg]);
      }
    }
  }
  const out: Hit[] = [];
  for (const b of buildings) {
    const rc = corners(b);
    const xs = rc.map((p) => p[0]), zs = rc.map((p) => p[1]);
    const seen = new Set<Seg>();
    for (let gx = Math.floor(Math.min(...xs) / CELL); gx <= Math.floor(Math.max(...xs) / CELL); gx++) {
      for (let gz = Math.floor(Math.min(...zs) / CELL); gz <= Math.floor(Math.max(...zs) / CELL); gz++) {
        for (const s of grid.get(key(gx, gz)) ?? []) {
          if (seen.has(s)) continue;
          seen.add(s);
          const gap = distSegRect(s.r.points[s.i]!, s.r.points[s.i + 1]!, rc) - s.r.half(s.i);
          if (gap < -tol(b)) out.push({ building: b.id, ribbon: s.r.id, gap });
        }
      }
    }
  }
  return out;
}

// ---------- invariants (shared by the committed-bake test and the property test) ----------

export function duplicateIds(ids: string[]): string[] {
  const seen = new Set<string>(), dup = new Set<string>();
  for (const id of ids) { if (seen.has(id)) dup.add(id); seen.add(id); }
  return [...dup];
}

/** Roads with fewer than 2 points, and junctions that point at a road id that does not exist. */
export function roadProblems(t: TownData): string[] {
  const out: string[] = [];
  const ids = new Set([t.highway.id, ...t.roads.map((r) => r.id)]);
  for (const r of [t.highway, ...t.roads]) if (r.points.length < 2) out.push(`road ${r.id} has ${r.points.length} point(s)`);
  for (const j of t.junctions) for (const r of j.roads) if (!ids.has(r)) out.push(`junction ${j.id} references unknown road ${r}`);
  return out;
}

/** Each gate in the brief must have exactly one bridge, over the singel. */
export function gateProblems(t: TownData, brief: TownBrief): string[] {
  const out: string[] = [];
  for (const g of brief.gates) {
    const n = t.bridges.filter((b) => b.over === 'singel' && b.roadId === `gate_${g}`).length;
    if (n !== 1) out.push(`gate_${g} has ${n} singel bridges, expected 1`);
  }
  return out;
}

/**
 * Buildings against road ribbons and water. Landmarks are fixed by the brief: if one is too close the generator must
 * have said so in town.warnings ("move it in the brief"), otherwise it is a problem.
 */
export function ribbonProblems(t: TownData): string[] {
  const out: string[] = [];
  const byId = new Map(t.buildings.map((b) => [b.id, b]));
  for (const [what, ribbons] of [['road', roadRibbons(t)], ['water', waterRibbons(t)]] as const) {
    for (const h of ribbonHits(t.buildings, ribbons, gridTol)) {
      const b = byId.get(h.building)!;
      if (b.zone === 'landmark' && t.warnings.some((w) => w.includes(b.id))) continue;
      out.push(`${b.id} overlaps ${what} ${h.ribbon} by ${(-h.gap).toFixed(2)} m`);
    }
  }
  return out;
}

export function overlapProblems(t: TownData): string[] {
  return footprintOverlaps(t.buildings, pairTol).map((o) => `${o.a} overlaps ${o.b} by ${o.depth.toFixed(2)} m`);
}

/** Footprint / ribbon / water overlaps at the agreed 0.5 m tolerance. */
export function geometryProblems(t: TownData): string[] {
  return [...overlapProblems(t), ...ribbonProblems(t)];
}

/** Structural checks only (ids, roads, junctions, gates). */
export function invariantProblems(t: TownData, brief: TownBrief): string[] {
  return [
    ...duplicateIds(t.buildings.map((b) => b.id)).map((id) => `duplicate building id ${id}`),
    ...duplicateIds([t.highway.id, ...t.roads.map((r) => r.id)]).map((id) => `duplicate road id ${id}`),
    ...roadProblems(t), ...gateProblems(t, brief),
  ];
}
