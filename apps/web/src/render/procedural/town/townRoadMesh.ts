// T4: roads, water, bridges, roundabouts and signs of the baked town as plain mesh data. Pure: no three, no DOM, no
// randomness, so it is testable in node. The R3F component (TownScene.tsx) turns a MeshData into a BufferGeometry.
//
// One MeshData per chunk (roads, pavements, markings) and one for everything that is not chunked (water, bridges,
// roundabouts, cul-de-sacs, plaza, parks). Surfaces are vertex colours, not textures and not geometry, so a whole chunk
// is a single draw call. Layers are stacked in height (LAYER) so overlapping roads at a junction never z-fight.
import type {
  Bridge, Road, RoadKind, Sign, Surface, TownChunk, TownChunkShared, Vec2, Water,
} from './townTypes';

export interface MeshData {
  positions: number[]; // x, y, z per vertex
  normals: number[];
  colors: number[];    // r, g, b (0..1, sRGB as written in the palette) per vertex
  indices: number[];
}

export const emptyMesh = (): MeshData => ({ positions: [], normals: [], colors: [], indices: [] });
export const vertexCount = (m: MeshData): number => m.positions.length / 3;
export const triangleCount = (m: MeshData): number => m.indices.length / 3;

/** Heights (m) of the stacked layers. Bigger gaps than strictly needed: far away the depth buffer gets coarse. */
export const LAYER = {
  bank: 0.05,
  water: 0.09,
  pavement: 0.14,
  road: 0.2,          // + ROAD_RANK step per rank
  rankStep: 0.03,
  marking: 0.36,
  deck: 0.5,
  parapet: 1.0,
  island: 0.4,
} as const;

/** Bigger roads are drawn above smaller ones, so a side street never cuts a notch into the road it joins. */
export const ROAD_RANK: Record<RoadKind, number> = {
  branch: 0, lane: 0, quay: 1, gate: 1, singel: 1, ring: 2, radial: 2, ramp: 3, highway: 4,
};

export const PALETTE = {
  asphalt: '#73777f',
  asphaltMain: '#5b5f6a',
  concrete: '#55595f',
  klinkers: '#b06a4f',
  klinkersLane: '#a8553a',
  quay: '#9c5a40',
  highway: '#4a4e57',
  pavementKlinkers: '#cdb99a',
  pavement: '#d8cdb9',
  marking: '#f1efe8',
  bank: '#8c7b6b',
  water: '#4aa3df',
  deckWater: '#d9c7a6',
  deckHighway: '#d6d2c8',
  parapet: '#6b5a48',
  grass: '#7cc25a',
  plaza: '#ddd0b6',
  plazaDark: '#6b5a4e',
  parkGrass: '#78c055',
  pond: '#4aa3df',
} as const;

// ---------- colour ----------
const hexCache = new Map<string, [number, number, number]>();
export function hexToRgb(hex: string): [number, number, number] {
  let c = hexCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    hexCache.set(hex, c);
  }
  return c;
}
export const shade = (c: [number, number, number], k: number): [number, number, number] => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

export function roadColour(r: Pick<Road, 'kind' | 'surface'>): string {
  if (r.kind === 'highway') return PALETTE.highway;
  if (r.kind === 'lane' || r.kind === 'gate') return PALETTE.klinkersLane;
  if (r.kind === 'quay') return PALETTE.quay;
  if (r.kind === 'singel') return PALETTE.asphaltMain;
  if (r.kind === 'ring' || r.kind === 'radial' || r.kind === 'ramp') return PALETTE.asphaltMain;
  return r.surface === 'klinkers' ? PALETTE.klinkers : r.surface === 'concrete' ? PALETTE.concrete : PALETTE.asphalt;
}
const pavementColour = (s: Surface): string => (s === 'klinkers' ? PALETTE.pavementKlinkers : PALETTE.pavement);

// ---------- builder ----------
export type V3 = [number, number, number];

export class Builder {
  readonly m = emptyMesh();

  vert(x: number, y: number, z: number, n: V3, c: V3): number {
    const i = this.m.positions.length / 3;
    this.m.positions.push(x, y, z);
    this.m.normals.push(n[0], n[1], n[2]);
    this.m.colors.push(c[0], c[1], c[2]);
    return i;
  }

  /** Triangle; the winding is flipped when needed so the face looks along `n`. */
  tri(a: V3, b: V3, c: V3, n: V3, col: V3): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    const [p, q] = dot >= 0 ? [b, c] : [c, b];
    const i = this.vert(a[0], a[1], a[2], n, col);
    const j = this.vert(p[0], p[1], p[2], n, col);
    const k = this.vert(q[0], q[1], q[2], n, col);
    this.m.indices.push(i, j, k);
  }

  quad(a: V3, b: V3, c: V3, d: V3, n: V3, col: V3): void { // a-b-c-d around the quad
    this.tri(a, b, c, n, col);
    this.tri(a, c, d, n, col);
  }

  /** Flat horizontal disc. */
  disc(cx: number, cz: number, r: number, y: number, col: V3, segs = 28): void {
    const up: V3 = [0, 1, 0];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      this.tri([cx, y, cz], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], up, col);
    }
  }

  /** Flat horizontal ellipse (parks' ponds). */
  ellipse(cx: number, cz: number, rx: number, rz: number, angle: number, y: number, col: V3, segs = 24): void {
    const up: V3 = [0, 1, 0];
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const at = (t: number): V3 => {
      const lx = Math.cos(t) * rx, lz = Math.sin(t) * rz;
      return [cx + lx * ca - lz * sa, y, cz + lx * sa + lz * ca];
    };
    for (let i = 0; i < segs; i++) this.tri([cx, y, cz], at((i / segs) * Math.PI * 2), at(((i + 1) / segs) * Math.PI * 2), up, col);
  }

  /** Flat horizontal polygon (convex or mildly concave: fan from the centroid). */
  polygon(points: Vec2[], y: number, col: V3): void {
    if (points.length < 3) return;
    let cx = 0, cz = 0;
    for (const p of points) { cx += p[0]; cz += p[1]; }
    cx /= points.length; cz /= points.length;
    const up: V3 = [0, 1, 0];
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!, b = points[(i + 1) % points.length]!;
      this.tri([cx, y, cz], [a[0], y, a[1]], [b[0], y, b[1]], up, col);
    }
  }

  /** Box seen from above and the sides (no bottom). `angle`: direction of the length axis (x -> z, like the bake). */
  box(cx: number, cz: number, angle: number, len: number, wid: number, y0: number, y1: number, col: V3): void {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const corner = (lx: number, lz: number, y: number): V3 => [cx + lx * ca - lz * sa, y, cz + lx * sa + lz * ca];
    const hl = len / 2, hw = wid / 2;
    this.quad(corner(-hl, -hw, y1), corner(hl, -hw, y1), corner(hl, hw, y1), corner(-hl, hw, y1), [0, 1, 0], col);
    const nl: V3 = [-sa, 0, ca]; // local +z axis in world
    const nx: V3 = [ca, 0, sa];  // local +x axis in world
    this.quad(corner(-hl, hw, y0), corner(hl, hw, y0), corner(hl, hw, y1), corner(-hl, hw, y1), nl, shade(col, 0.85));
    this.quad(corner(-hl, -hw, y0), corner(hl, -hw, y0), corner(hl, -hw, y1), corner(-hl, -hw, y1), [-nl[0], 0, -nl[2]], shade(col, 0.85));
    this.quad(corner(hl, -hw, y0), corner(hl, hw, y0), corner(hl, hw, y1), corner(hl, -hw, y1), nx, shade(col, 0.8));
    this.quad(corner(-hl, -hw, y0), corner(-hl, hw, y0), corner(-hl, hw, y1), corner(-hl, -hw, y1), [-nx[0], 0, -nx[2]], shade(col, 0.8));
  }

  /**
   * Flat ribbon along a polyline, with a half-width per point. Vertices are shared between neighbouring segments and
   * the sides are mitred (clamped), so a curve is one smooth strip. `offset` moves the strip sideways (left of travel).
   */
  ribbon(points: Vec2[], halfWidths: number[] | number, y: number, col: V3 | ((segment: number) => V3), offset = 0): void {
    const pts: Vec2[] = [];
    const hws: number[] = [];
    points.forEach((p, i) => {
      const last = pts[pts.length - 1];
      // Points closer than 10 cm (a clip at a chunk border next to a road point) would fold the mitre: keep one.
      // At the end of the line the last point wins, so neighbouring chunks still meet at the border.
      if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.1) {
        if (i === points.length - 1 && pts.length > 1) { pts[pts.length - 1] = p; hws[hws.length - 1] = typeof halfWidths === 'number' ? halfWidths : halfWidths[i]!; }
        return;
      }
      pts.push(p);
      hws.push(typeof halfWidths === 'number' ? halfWidths : halfWidths[i]!);
    });
    const n = pts.length;
    if (n < 2) return;
    // Unit directions of the segments.
    const dx: number[] = [], dz: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const ex = pts[i + 1]![0] - pts[i]![0], ez = pts[i + 1]![1] - pts[i]![1];
      const l = Math.hypot(ex, ez) || 1;
      dx.push(ex / l); dz.push(ez / l);
    }
    const up: V3 = [0, 1, 0];
    const rows: Array<[number, number]> = []; // [index of side A, index of side B] per point
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      const d0x = dx[Math.max(0, i - 1)]!, d0z = dz[Math.max(0, i - 1)]!;
      const d1x = dx[Math.min(n - 2, i)]!, d1z = dz[Math.min(n - 2, i)]!;
      let tx = d0x + d1x, tz = d0z + d1z;
      const tl = Math.hypot(tx, tz);
      if (tl < 1e-6) { tx = d1x; tz = d1z; } else { tx /= tl; tz /= tl; }
      const nx = -tz, nz = tx; // left of travel is +n when z points south; consistent for every vertex
      const cosHalf = Math.max(0.5, nx * -d1z + nz * d1x); // miter length factor, clamped (<= 2x)
      const hw = hws[i]! / cosHalf;
      const cx = p[0] + nx * offset, cz = p[1] + nz * offset;
      const c0 = typeof col === 'function' ? col(Math.min(i, n - 2)) : col;
      rows.push([
        this.vert(cx + nx * hw, y, cz + nz * hw, up, c0),
        this.vert(cx - nx * hw, y, cz - nz * hw, up, c0),
      ]);
    }
    for (let i = 0; i < n - 1; i++) {
      const [a, b] = rows[i]!, [a2, b2] = rows[i + 1]!;
      this.m.indices.push(a, a2, b, b, a2, b2);
    }
  }
}

/** Per-segment colour variation for klinkers (a hint of brick pattern, deterministic). */
function segmentTint(base: V3, seed: number, amount: number): (i: number) => V3 {
  return (i) => {
    const h = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    const f = h - Math.floor(h); // 0..1, same on every engine for the same inputs
    return shade(base, 1 - amount + f * amount * 2);
  };
}
const idSeed = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h;
};

// ---------- curves ----------
/** Insert Catmull-Rom points on long segments so a bend does not show as a corner. Keeps every original point. */
export function smoothPolyline(points: Vec2[], maxStep = 6): Vec2[] {
  if (points.length < 3) return points;
  const out: Vec2[] = [points[0]!];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!, p1 = points[i]!, p2 = points[i + 1]!, p3 = points[Math.min(points.length - 1, i + 2)]!;
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.min(8, Math.floor(len / maxStep));
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1), t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([Math.round(f(p0[0], p1[0], p2[0], p3[0]) * 100) / 100, Math.round(f(p0[1], p1[1], p2[1], p3[1]) * 100) / 100]);
    }
    out.push(p2);
  }
  return out;
}

// ---------- roads ----------
function addRoad(b: Builder, r: Road, rank = ROAD_RANK[r.kind]): void {
  const pts = smoothPolyline(r.points);
  const y = LAYER.road + rank * LAYER.rankStep;
  const hw = r.width / 2;
  // Pavement strip under the road (not for highways and ramps: they have a hard shoulder instead).
  if (r.kind !== 'highway' && r.kind !== 'ramp') b.ribbon(pts, hw + 1.2, LAYER.pavement + rank * 0.002, hexToRgb(pavementColour(r.surface)));
  const base = hexToRgb(roadColour(r));
  b.ribbon(pts, hw, y, r.surface === 'klinkers' ? segmentTint(base, idSeed(r.id), 0.06) : base);
  // Markings: centre line on the big roads, edge lines on the highway.
  const mark = hexToRgb(PALETTE.marking);
  if (r.kind === 'radial' || r.kind === 'ring' || r.kind === 'ramp') b.ribbon(pts, 0.15, y + 0.01, mark);
  if (r.kind === 'highway') {
    b.ribbon(pts, 0.15, y + 0.01, mark, hw - 0.9);
    b.ribbon(pts, 0.15, y + 0.01, mark, -(hw - 0.9));
    b.ribbon(pts, 0.1, y + 0.01, mark);
  }
}

/** Mesh of one chunk: its road pieces and highway pieces. */
export function buildChunkMesh(chunk: TownChunk): MeshData {
  const b = new Builder();
  // Small roads first, big ones last: with the layer heights the order does not matter, but it keeps output stable.
  const all: Road[] = [...chunk.roads, ...chunk.highway];
  all.sort((p, q) => ROAD_RANK[p.kind] - ROAD_RANK[q.kind] || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  for (const r of all) addRoad(b, r);
  return b.m;
}

// ---------- water ----------
/** Water ribbons: a bank edge and the water itself, width per point from the bake. */
function addWater(b: Builder, w: Water): void {
  const pts = w.points;
  const bank = w.widths.map((x) => x / 2 + 2);
  const half = w.widths.map((x) => x / 2);
  b.ribbon(pts, bank, LAYER.bank, hexToRgb(PALETTE.bank));
  b.ribbon(pts, half, LAYER.water, hexToRgb(PALETTE.water));
}

// ---------- bridges, roundabouts, extras ----------
function addBridge(b: Builder, br: Bridge): void {
  const col = hexToRgb(br.over === 'highway' ? PALETTE.deckHighway : PALETTE.deckWater);
  b.box(br.x, br.z, br.angle, br.length, br.width, LAYER.road, LAYER.deck, col);
  const par = hexToRgb(PALETTE.parapet);
  const ca = Math.cos(br.angle), sa = Math.sin(br.angle);
  for (const side of [-1, 1]) {
    const off = side * (br.width / 2 - 0.2);
    b.box(br.x - sa * off, br.z + ca * off, br.angle, br.length, 0.4, LAYER.deck, LAYER.parapet, par);
  }
  // The road surface on the deck, so the width of the road reads on the bridge as well.
  b.box(br.x, br.z, br.angle, br.length, Math.max(2, br.width - 1.6), LAYER.deck, LAYER.deck + 0.02, hexToRgb(PALETTE.asphaltMain));
}

function addRoundabout(b: Builder, c: Vec2): void {
  b.disc(c[0], c[1], 11.5, LAYER.pavement + 0.02, hexToRgb(PALETTE.pavement));
  b.disc(c[0], c[1], 10, LAYER.road + 0.1, hexToRgb(PALETTE.asphaltMain));
  b.disc(c[0], c[1], 4.9, LAYER.marking, hexToRgb(PALETTE.marking));
  b.disc(c[0], c[1], 4.5, LAYER.island, hexToRgb(PALETTE.grass));
}

/** Everything the bake keeps whole: water, bridges, roundabouts, cul-de-sacs, parks, plaza. */
export function buildSharedMesh(shared: TownChunkShared): MeshData {
  const b = new Builder();
  for (const p of shared.parks) {
    b.polygon(p.outline, LAYER.bank, hexToRgb(PALETTE.parkGrass));
    b.ellipse(p.pond.x, p.pond.z, p.pond.rx, p.pond.rz, p.pond.angle, LAYER.water, hexToRgb(PALETTE.pond));
  }
  for (const w of shared.water) addWater(b, w);
  for (const c of shared.culDeSacs) {
    b.disc(c[0], c[1], 7.5, LAYER.pavement + 0.02, hexToRgb(PALETTE.pavementKlinkers));
    b.disc(c[0], c[1], 6, LAYER.road + 0.08, hexToRgb(PALETTE.klinkers));
  }
  for (const c of shared.roundabouts) addRoundabout(b, c);
  const pl = shared.plaza;
  b.box(pl[0], pl[1], 0, 28, 24, 0, LAYER.pavement + 0.04, hexToRgb(PALETTE.plaza));
  for (const br of shared.bridges) addBridge(b, br);
  return b.m;
}

// ---------- signs ----------
export type SignKind = Sign['kind'];
export const SIGN_KINDS: readonly SignKind[] = ['yield', 'speed30', 'highway', 'centre'];
const SIGN_COLOUR: Record<SignKind, string> = { yield: '#e03131', speed30: '#f8f9fa', highway: '#1971c2', centre: '#f2c94c' };

/** One sign (pole and plate) around the origin, to be drawn with an InstancedMesh per kind. */
export function buildSignMesh(kind: SignKind): MeshData {
  const b = new Builder();
  b.box(0, 0, 0, 0.12, 0.12, 0, 2.2, hexToRgb('#555a62'));
  const plate = hexToRgb(SIGN_COLOUR[kind]);
  b.box(0, 0.08, 0, kind === 'highway' ? 1.4 : 0.8, 0.06, 1.5, 2.3, plate);
  if (kind === 'speed30') b.box(0, 0.13, 0, 0.5, 0.03, 1.7, 2.1, hexToRgb('#e03131'));
  return b.m;
}

export const signsByKind = (signs: readonly Sign[]): Record<SignKind, Sign[]> => {
  const out: Record<SignKind, Sign[]> = { yield: [], speed30: [], highway: [], centre: [] };
  for (const s of signs) out[s.kind].push(s);
  return out;
};

// ---------- budget ----------
export interface DrawBudget { drawCalls: number; triangles: number }

/**
 * Draw calls and triangles for a set of chunks: one mesh per non-empty chunk, one shared mesh, one ground plane and one
 * instanced mesh per sign kind that is present. Used by the dev scene readout and by the budget test.
 */
export function townDrawBudget(chunks: readonly TownChunk[], shared: TownChunkShared): DrawBudget {
  let calls = 1; // ground
  let tris = 2;
  const sharedMesh = buildSharedMesh(shared);
  if (triangleCount(sharedMesh) > 0) { calls += 1; tris += triangleCount(sharedMesh); }
  const kinds = new Set<SignKind>();
  for (const c of chunks) {
    const m = buildChunkMesh(c);
    if (triangleCount(m) > 0) { calls += 1; tris += triangleCount(m); }
    for (const s of c.signs) kinds.add(s.kind);
  }
  for (const k of kinds) {
    calls += 1;
    const n = chunks.reduce((s, c) => s + c.signs.filter((x) => x.kind === k).length, 0);
    tris += n * triangleCount(buildSignMesh(k));
  }
  return { drawCalls: calls, triangles: tris };
}
