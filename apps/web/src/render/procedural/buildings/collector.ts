/**
 * Building blocks for the procedural builder: quality settings, soft clay
 * shape factories, the whole-building warp and the Collector that paints,
 * places, bakes AO, warps and groups every part.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ArchKind, BuildingRecipe, ColourToken, Detail, MeshGroup } from './buildingRecipe';
import type { Pt } from './gables';
import { mulberry32, type Rng } from './randomBuilding';
import { signCell } from './signAtlas';

export const MESH_GROUPS: MeshGroup[] = ['brick', 'plaster', 'roof', 'trim', 'gloss', 'glass', 'lit', 'sign'];

export type Paint = ColourToken | THREE.Color;

const WHITE = new THREE.Color('#ffffff');
const BLACK = new THREE.Color('#000000');

export function resolveBuildingColour(token: ColourToken, recipe: BuildingRecipe, ownerHex: string, depth = 0): THREE.Color {
  if (token.startsWith('#')) return new THREE.Color(token);
  const owner = new THREE.Color(ownerHex);
  if (token === 'owner') return owner;
  if (token === 'ownerDark') return owner.lerp(BLACK, 0.38);
  if (token === 'ownerLight') return owner.lerp(WHITE, 0.45);
  const ref = (recipe.colours as unknown as Record<string, string | undefined>)[token];
  if (ref !== undefined && depth < 3) return resolveBuildingColour(ref, recipe, ownerHex, depth + 1);
  throw new Error(`unknown colour token "${token}"`);
}

// ======================================================================
// Quality
// ======================================================================

export interface Quality {
  bevelSegments: number;
  cornerSegments: number;
  curveSegments: number;
  /** Longest edge before a part gets subdivided (so the warp can bend it). */
  maxEdge: number;
  sphere: [number, number];
  radial: number;
  tubeRadial: number;
  props: boolean;
  tiles: boolean;
}

export const QUALITY: Record<Detail, Quality> = {
  high: { bevelSegments: 2, cornerSegments: 4, curveSegments: 10, maxEdge: 0.4, sphere: [12, 9], radial: 18, tubeRadial: 10, props: true, tiles: true },
  low: { bevelSegments: 1, cornerSegments: 2, curveSegments: 5, maxEdge: 0.9, sphere: [7, 5], radial: 10, tubeRadial: 6, props: false, tiles: false },
};

// ======================================================================
// Shapes
// ======================================================================

export const v2 = (p: Pt) => new THREE.Vector2(p[0], p[1]);

/** Rounded rectangle with subdivided edges, centred on (0,0). */
export function rrectShape(w: number, h: number, r: number, q: Quality): THREE.Shape {
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.max(0, Math.min(r, hw - 1e-4, hh - 1e-4));
  const pts: THREE.Vector2[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-5) return;
    const n = Math.max(1, Math.ceil(len / q.maxEdge));
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n));
  };
  const corner = (cx: number, cy: number, a0: number) => {
    const n = q.cornerSegments;
    for (let i = 0; i < n; i++) {
      const a = a0 + (Math.PI / 2) * (i / n);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
    }
  };
  if (rr <= 1e-4) {
    edge(-hw, -hh, hw, -hh);
    edge(hw, -hh, hw, hh);
    edge(hw, hh, -hw, hh);
    edge(-hw, hh, -hw, -hh);
  } else {
    edge(-hw + rr, -hh, hw - rr, -hh);
    corner(hw - rr, -hh + rr, -Math.PI / 2);
    edge(hw, -hh + rr, hw, hh - rr);
    corner(hw - rr, hh - rr, 0);
    edge(hw - rr, hh, -hw + rr, hh);
    corner(-hw + rr, hh - rr, Math.PI / 2);
    edge(-hw, hh - rr, -hw, -hh + rr);
    corner(-hw + rr, -hh + rr, Math.PI);
  }
  return new THREE.Shape(pts);
}

/** A full round arch needs some height; otherwise fall back to a segment arch. */
export function effectiveArch(w: number, h: number, arch: ArchKind): ArchKind {
  if (arch === 'round') return h > w * 0.75 ? 'round' : 'segment';
  return arch;
}

/** Opening outline centred on (0,0) (use effectiveArch first). */
export function openingShape(w: number, h: number, arch: ArchKind): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  if (arch === 'round') {
    const cy = hh - hw;
    s.moveTo(-hw, -hh);
    s.lineTo(hw, -hh);
    s.lineTo(hw, cy);
    s.absarc(0, cy, hw, 0, Math.PI, false);
    s.lineTo(-hw, -hh);
    return s;
  }
  if (arch === 'segment') {
    const k = w * 0.16;
    s.moveTo(-hw, -hh);
    s.lineTo(hw, -hh);
    s.lineTo(hw, hh - k);
    s.quadraticCurveTo(0, hh + k, -hw, hh - k);
    s.lineTo(-hw, -hh);
    return s;
  }
  s.moveTo(-hw, -hh);
  s.lineTo(hw, -hh);
  s.lineTo(hw, hh);
  s.lineTo(-hw, hh);
  s.lineTo(-hw, -hh);
  return s;
}

/** Circle outline (for round windows). */
export function circleShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}

/** Top of the opening at horizontal offset x (for clipping glazing bars). */
export function openingTopAt(x: number, w: number, h: number, arch: ArchKind): number {
  const hw = w / 2;
  const hh = h / 2;
  if (arch === 'round') return hh - hw + Math.sqrt(Math.max(0, hw * hw - x * x));
  if (arch === 'segment') {
    const k = w * 0.16;
    const t = (x + hw) / w;
    return (1 - t) * (1 - t) * (hh - k) + 2 * (1 - t) * t * (hh + k) + t * t * (hh - k);
  }
  return hh;
}

// ======================================================================
// Geometry factories
// ======================================================================

export function smoothen(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('normal');
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4);
  g.dispose();
  m.computeVertexNormals();
  return m;
}

/** Extrude along Z, centred on z = 0, subdivided along Z. The bevel grows the shape outward by `b`. */
export function extrude(shape: THREE.Shape | THREE.Shape[], depth: number, b: number, q: Quality, smooth: boolean): THREE.BufferGeometry {
  const core = Math.max(0.002, depth - 2 * b);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: core,
    steps: Math.max(1, Math.ceil(core / q.maxEdge)),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: 0,
    bevelSegments: q.bevelSegments,
    curveSegments: q.curveSegments,
  });
  g.translate(0, 0, -core / 2);
  return smooth ? smoothen(g) : g;
}

export function slabGeo(w: number, h: number, d: number, r: number, b: number, q: Quality, smooth: boolean): THREE.BufferGeometry {
  const bb = Math.max(0, Math.min(b, w / 2 - 0.004, h / 2 - 0.004, d / 2 - 0.004));
  const shape = rrectShape(w - 2 * bb, h - 2 * bb, Math.min(r, (Math.min(w, h) - 2 * bb) / 2 - 0.002), q);
  return extrude(shape, d, bb, q, smooth);
}

export function roundCylGeo(r: number, h: number, rr: number, q: Quality): THREE.BufferGeometry {
  const e = Math.max(0.002, Math.min(rr, r * 0.5, h * 0.5));
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -h / 2)];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + ((a1 - a0) * i) / 4;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * e, cy + Math.sin(a) * e));
    }
  };
  arc(r - e, -h / 2 + e, -Math.PI / 2, 0);
  const mid = Math.max(0, Math.ceil((h - 2 * e) / q.maxEdge) - 1);
  for (let i = 1; i <= mid; i++) pts.push(new THREE.Vector2(r, -h / 2 + e + ((h - 2 * e) * i) / (mid + 1)));
  arc(r - e, h / 2 - e, 0, Math.PI / 2);
  pts.push(new THREE.Vector2(0, h / 2));
  return new THREE.LatheGeometry(pts, q.radial);
}

export function ballGeo(r: number, q: Quality): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, q.sphere[0], q.sphere[1]);
}

export function axisRotate(g: THREE.BufferGeometry, axis: 'x' | 'y' | 'z'): void {
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
}

// ======================================================================
// Warp: one smooth deformation for the whole building
// ======================================================================

export class Warp {
  private readonly leanX: number;
  private readonly leanZ: number;
  private readonly sag: number;
  private readonly amp: number;
  private readonly f: number[];
  private readonly p: number[];

  constructor(
    imp: number,
    seed: number,
    private readonly eave: number,
    private readonly depth: number,
    private readonly taper: number,
  ) {
    const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    this.leanX = (rng() - 0.5) * 0.05 * imp;
    this.leanZ = (0.2 + rng() * 0.8) * 0.022 * imp;
    this.sag = (0.06 + rng() * 0.12) * imp;
    this.amp = 0.05 * imp;
    // few, large bends
    this.f = Array.from({ length: 9 }, () => 0.16 + rng() * 0.26);
    this.p = Array.from({ length: 9 }, () => rng() * Math.PI * 2);
  }

  private n(k: number, x: number, y: number, z: number): number {
    const f = this.f;
    const p = this.p;
    return Math.sin(x * f[k]! + p[k]!) * Math.cos(y * f[k + 1]! + p[k + 1]!) + 0.5 * Math.sin(z * f[k + 2]! + y * 0.23 + p[k + 2]!);
  }

  displace(x: number, y: number, z: number): [number, number, number] {
    const E = this.eave;
    const hd = this.depth / 2;
    const ground = Math.min(1, Math.max(0, y / 0.45));
    const h = Math.min(1.6, Math.max(0, y / E));
    const tap = 1 + this.taper * Math.min(1, Math.max(0, y / E));
    const bend = y * (0.45 + 0.55 * h);
    let nx = x * tap + this.leanX * bend + this.amp * this.n(0, x, y, z) * ground;
    let nz = z + this.leanZ * bend + this.amp * this.n(3, z, y, x) * ground;
    let ny = y + this.amp * 0.4 * this.n(6, x, z, y) * ground;
    if (y > E) {
      const t = Math.min(1, (y - E) / 1.2);
      const st = t * t * (3 - 2 * t);
      const zf = Math.max(0, 1 - (z / hd) * (z / hd));
      ny -= this.sag * zf * st;
    }
    if (!Number.isFinite(nx)) nx = x;
    if (!Number.isFinite(nz)) nz = z;
    return [nx, ny, nz];
  }

  apply(pos: THREE.BufferAttribute): void {
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = this.displace(pos.getX(i), pos.getY(i), pos.getZ(i));
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  point(v: THREE.Vector3): THREE.Vector3 {
    const [x, y, z] = this.displace(v.x, v.y, v.z);
    return v.set(x, y, z);
  }
}

// ======================================================================
// Movers (animated parts) and anchors
// ======================================================================

/** swing: hangs and swings (signs), wave: flutters (flags), sway: laundry, flicker: glowing lamps/neon. */
export type MoverKind = 'swing' | 'wave' | 'sway' | 'flicker';
export type MoverTag = 'sign' | 'flag' | 'laundry' | 'lamp' | 'neon' | 'lights';

export interface MoverOut {
  kind: MoverKind;
  tag: MoverTag;
  /** Building space, after the warp. Geometry is relative to this point. */
  pivot: THREE.Vector3;
  /** Unit rotation axis in building space. */
  axis: THREE.Vector3;
  amp: number;
  freq: number;
  phase: number;
  geometries: Partial<Record<MeshGroup, THREE.BufferGeometry>>;
}

export interface AnchorOut {
  kind: 'smoke';
  position: THREE.Vector3;
  phase: number;
}

type Buckets = Record<MeshGroup, THREE.BufferGeometry[]>;
const emptyBuckets = (): Buckets => ({ brick: [], plaster: [], roof: [], trim: [], gloss: [], glass: [], lit: [], sign: [] });

export interface MoverDraft {
  kind: MoverKind;
  tag: MoverTag;
  pivot: THREE.Vector3;
  axis: THREE.Vector3;
  amp: number;
  freq: number;
  phase: number;
  parts: Buckets;
}

// ======================================================================
// Collector
// ======================================================================

export interface SlabOpts {
  r?: number;
  b?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  smooth?: boolean;
  /** Override the bevel segment count (large rounded bodies). */
  segments?: number;
}

export interface AddOpts {
  keepUv?: boolean;
  /** Darken where the part meets the wall (facade frame z ~ 0). Default true for facade parts. */
  contact?: boolean;
}

export class Collector {
  readonly parts: Buckets = emptyBuckets();
  readonly movers: MoverDraft[] = [];
  readonly anchors: AnchorOut[] = [];
  /** Current facade frame -> building space. Facade frame: u across, y up, +z out of the wall. */
  face = new THREE.Matrix4();
  readonly rng: Rng;
  readonly q: Quality;
  readonly wall: MeshGroup;
  readonly imp: number;
  readonly warp: Warp;
  private active: MoverDraft | null = null;

  constructor(
    readonly r: BuildingRecipe,
    readonly owner: string,
    detail: Detail,
    eave: number,
  ) {
    this.rng = mulberry32(r.seed);
    this.q = QUALITY[detail];
    this.wall = r.facade === 'plaster' ? 'plaster' : 'brick';
    this.imp = Math.max(0, Math.min(1, r.imperfection));
    this.warp = new Warp(this.imp, r.seed, eave, r.depth, r.taper);
  }

  /** Symmetric random in [-k, k], scaled by imperfection. */
  jit(k: number): number {
    return (this.rng() - 0.5) * 2 * k * this.imp;
  }

  chance(p: number): boolean {
    return this.rng() < p;
  }

  pick<T>(items: readonly T[]): T {
    const v = items[Math.floor(this.rng() * items.length)];
    if (v === undefined) throw new Error('pick from empty list');
    return v;
  }

  col(p: Paint): THREE.Color {
    return p instanceof THREE.Color ? p.clone() : resolveBuildingColour(p, this.r, this.owner);
  }

  shade(p: Paint, k: number): THREE.Color {
    const c = this.col(p);
    return k >= 0 ? c.lerp(WHITE, k) : c.lerp(BLACK, -k);
  }

  /** Mix two paints. */
  mix(a: Paint, b: Paint, t: number): THREE.Color {
    return this.col(a).lerp(this.col(b), t);
  }

  /** Run fn with the facade frame rotated by `angle` around (cx, cy) – crooked parts. */
  tilted(cx: number, cy: number, angle: number, fn: () => void): void {
    const saved = this.face;
    this.face = saved
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(cx, cy, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(angle))
      .multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, 0));
    try {
      fn();
    } finally {
      this.face = saved;
    }
  }

  /** Run fn in a different facade frame (for side walls, dormers). */
  inFrame(m: THREE.Matrix4, fn: () => void): void {
    const saved = this.face;
    this.face = m;
    try {
      fn();
    } finally {
      this.face = saved;
    }
  }

  /** Parts added inside fn become one animated mover. Pivot and axis in the facade frame. */
  mover(kind: MoverKind, tag: MoverTag, pivot: [number, number, number], axis: [number, number, number], amp: number, freq: number, fn: () => void): void {
    if (this.active) {
      fn();
      return;
    }
    const p = this.warp.point(new THREE.Vector3(pivot[0], pivot[1], pivot[2]).applyMatrix4(this.face));
    const ax = new THREE.Vector3(axis[0], axis[1], axis[2]).transformDirection(this.face);
    const draft: MoverDraft = { kind, tag, pivot: p, axis: ax, amp, freq, phase: this.rng() * Math.PI * 2, parts: emptyBuckets() };
    this.active = draft;
    try {
      fn();
    } finally {
      this.active = null;
    }
    this.movers.push(draft);
  }

  /** A point effect (chimney smoke). Coordinates in the facade frame unless useFace = false. */
  anchor(kind: 'smoke', x: number, y: number, z: number, useFace = true): void {
    const v = new THREE.Vector3(x, y, z);
    if (useFace) v.applyMatrix4(this.face);
    this.anchors.push({ kind, position: this.warp.point(v), phase: this.rng() });
  }

  add(group: MeshGroup, geo: THREE.BufferGeometry, paint: Paint, useFace = true, opts: AddOpts = {}): void {
    let g = geo;
    if (g.index) {
      g = geo.toNonIndexed();
      geo.dispose();
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const keepUv = opts.keepUv ?? group === 'sign';
    if (!keepUv && g.getAttribute('uv')) g.deleteAttribute('uv');
    const contact = useFace && (opts.contact ?? true);
    const c = this.col(paint);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nor = g.getAttribute('normal');
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      let ao = 0.74 + 0.26 * Math.min(1, Math.max(0, pos.getY(i) / 1.1));
      if (contact) ao *= 0.78 + 0.22 * Math.min(1, Math.max(0, pos.getZ(i) / 0.14));
      if (nor.getY(i) < -0.4) ao *= 0.86;
      arr[i * 3] = c.r * ao;
      arr[i * 3 + 1] = c.g * ao;
      arr[i * 3 + 2] = c.b * ao;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (useFace) g.applyMatrix4(this.face);
    this.warp.apply(g.getAttribute('position') as THREE.BufferAttribute);
    (this.active ? this.active.parts : this.parts)[group].push(g);
  }

  slab(group: MeshGroup, paint: Paint, w: number, h: number, d: number, x: number, y: number, z: number, o: SlabOpts = {}, add: AddOpts = {}): void {
    const b = o.b ?? Math.min(0.035, Math.min(w, h, d) * 0.3);
    const q = o.segments ? { ...this.q, bevelSegments: o.segments, cornerSegments: Math.max(this.q.cornerSegments, o.segments) } : this.q;
    const g = slabGeo(w, h, d, o.r ?? Math.min(0.05, Math.min(w, h) * 0.25), b, q, o.smooth ?? true);
    if (o.rx) g.rotateX(o.rx);
    if (o.ry) g.rotateY(o.ry);
    if (o.rz) g.rotateZ(o.rz);
    g.translate(x, y, z);
    this.add(group, g, paint, true, add);
  }

  /** A bar between two points in the facade plane. */
  bar(group: MeshGroup, paint: Paint, x0: number, y0: number, x1: number, y1: number, z: number, t: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    this.slab(group, paint, len + t, t, t, (x0 + x1) / 2, (y0 + y1) / 2, z, { rz: Math.atan2(y1 - y0, x1 - x0), r: t * 0.45, b: t * 0.3 });
  }

  ball(group: MeshGroup, paint: Paint, r: number, x: number, y: number, z: number, sy = 1, sz = 1): void {
    const g = ballGeo(r, this.q);
    if (sy !== 1 || sz !== 1) g.scale(1, sy, sz);
    g.translate(x, y, z);
    this.add(group, g, paint);
  }

  cyl(group: MeshGroup, paint: Paint, r: number, h: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, rr = 0.03): void {
    const g = roundCylGeo(r, h, rr, this.q);
    axisRotate(g, axis);
    g.translate(x, y, z);
    this.add(group, g, paint);
  }

  cone(group: MeshGroup, paint: Paint, r: number, h: number, x: number, y: number, z: number, rz = 0): void {
    const g = new THREE.ConeGeometry(r, h, this.q.radial);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    this.add(group, g, paint);
  }

  torus(group: MeshGroup, paint: Paint, R: number, tube: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, arc = Math.PI * 2, rz = 0): void {
    const g = new THREE.TorusGeometry(R, tube, 8, this.q.radial, arc);
    if (rz) g.rotateZ(rz);
    if (axis === 'y') g.rotateX(Math.PI / 2);
    if (axis === 'x') g.rotateY(Math.PI / 2);
    g.translate(x, y, z);
    this.add(group, g, paint);
  }

  /** Extruded flat shape in the facade plane (centre z given). */
  plate(group: MeshGroup, paint: Paint, shape: THREE.Shape | THREE.Shape[], depth: number, z: number, b: number, x = 0, y = 0, smooth = true, rz = 0): void {
    const g = extrude(shape, depth, b, this.q, smooth);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    this.add(group, g, paint);
  }

  /**
   * Painted letters from the sign atlas, fitted inside maxW x maxH (cells are 4:1),
   * facing +z of the facade frame (rotate with ry for side-facing signs).
   */
  signText(text: string, maxW: number, maxH: number, x: number, y: number, z: number, paint: Paint, ry = 0): void {
    const cell = signCell(text);
    if (!cell) return;
    const w = Math.min(maxW, maxH * 4);
    const h = w / 4;
    const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.ceil(w / this.q.maxEdge)), 1);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cell.u0 + uv.getX(i) * (cell.u1 - cell.u0), cell.v0 + uv.getY(i) * (cell.v1 - cell.v0));
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add('sign', g, paint, true, { keepUv: true, contact: false });
  }
}
