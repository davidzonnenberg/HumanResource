/**
 * Filling streets with generated houses (docs/buildings.md). Pure, render-side, no three.js.
 *
 * A street is a centreline (`line`, two or more points) and a side. Positions on it are distances
 * along the line, so straight and curved streets share one code path. Business plots, landmarks and
 * crossing roads cut the street into gaps; each gap is filled exactly by
 * generateStreet(hashSeed(gapId), gapLength, { district }). Gaps shorter than MIN_HOUSE_GAP become
 * alleys (no house). Seeds come from stable string ids only.
 *
 * Side convention on the top-down map (x to the right, z towards the camera): looking along the
 * line, 'left' is the side with normal (dz, -dx), 'right' is (-dz, dx). A line running +x has its
 * left side at -z (north on screen).
 */
import type { BuildingRecipe } from './buildingRecipe';
import { generateStreet, hashSeed } from './randomBuilding';

export type Pt = readonly [number, number];
export type Side = 'left' | 'right';

export interface FillerStreet {
  id: string;
  district: string;
  /** District style id used by the generator (a key of DISTRICTS). */
  style: string;
  side: Side;
  line: readonly Pt[];
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Gap {
  id: string;
  streetId: string;
  /** Distance along the line where the gap starts, in metres. */
  start: number;
  length: number;
  side: Side;
  kind: 'houses' | 'alley';
}

export interface PlacedHouse {
  id: string;
  gapId: string;
  recipe: BuildingRecipe;
  x: number;
  z: number;
  /** Rotation about Y so the facade (+Z in the building frame) faces the street. */
  heading: number;
}

export interface StreetConfig {
  /** Distance from the centreline to the house front (road half width + sidewalk + a hair). */
  frontOffset: number;
  /** Half width of road plus sidewalk, used for crossing-road blockers. */
  roadHalf: number;
  /** Deepest house the generator can make; the clearance band behind the front line. */
  bandDepth: number;
  /** Extra clearance around plots and landmarks. */
  margin: number;
}

export const MIN_HOUSE_GAP = 2.5;
export const SAMPLE_STEP = 0.25;

export function lineLength(line: readonly Pt[]): number {
  let n = 0;
  for (let i = 1; i < line.length; i++) n += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
  return n;
}

/** Point and unit direction at distance `d` along the line (clamped to its ends). */
export function pointAt(line: readonly Pt[], d: number): { x: number; z: number; dx: number; dz: number } {
  let left = Math.max(0, d);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) continue;
    if (left <= len || i === line.length - 1) {
      const t = Math.min(left, len) / len;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / len, dz: (b[1] - a[1]) / len };
    }
    left -= len;
  }
  throw new Error('street line needs two distinct points');
}

/** Unit normal pointing to `side` of a direction. */
export function sideNormal(dx: number, dz: number, side: Side): [number, number] {
  return side === 'left' ? [dz, -dx] : [-dz, dx];
}

/**
 * Where a house of `depth` sits when its centre is `distance` along the line and its front is
 * `offset` from the centreline on `side`. `heading` is the rotation about Y that turns the building
 * frame's +Z facade towards the street.
 */
export function placeAlongLine(line: readonly Pt[], side: Side, offset: number, distance: number, depth: number): { x: number; z: number; heading: number } {
  const p = pointAt(line, distance);
  const [nx, nz] = sideNormal(p.dx, p.dz, side);
  const r = offset + depth / 2;
  return { x: p.x + nx * r, z: p.z + nz * r, heading: Math.atan2(-nx, -nz) };
}

const overlaps = (a: Rect, b: Rect): boolean => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const grow = (r: Rect, m: number): Rect => ({ minX: r.minX - m, maxX: r.maxX + m, minZ: r.minZ - m, maxZ: r.maxZ + m });

/** Clearance band behind the front line for the slice [d0, d1] of the street, as a bounding box. */
function sliceBand(street: FillerStreet, d0: number, d1: number, cfg: StreetConfig): Rect {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const d of [d0, (d0 + d1) / 2, d1]) {
    const p = pointAt(street.line, d);
    const [nx, nz] = sideNormal(p.dx, p.dz, street.side);
    for (const r of [cfg.frontOffset, cfg.frontOffset + cfg.bandDepth]) {
      xs.push(p.x + nx * r);
      zs.push(p.z + nz * r);
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/**
 * Free stretches of a street: everything outside the blockers. A gap id is <streetId>@<start in decimetres>,
 * so it stays the same when a gap elsewhere on the street changes.
 */
export function streetGaps(street: FillerStreet, blockers: readonly Rect[], cfg: StreetConfig): Gap[] {
  const len = lineLength(street.line);
  const n = Math.ceil(len / SAMPLE_STEP - 1e-9);
  const gaps: Gap[] = [];
  let runStart = -1;
  const close = (endSlice: number) => {
    if (runStart < 0) return;
    const start = runStart * SAMPLE_STEP;
    const length = Math.min(endSlice * SAMPLE_STEP, len) - start;
    runStart = -1;
    if (length <= 1e-6) return;
    gaps.push({ id: `${street.id}@${Math.round(start * 10)}`, streetId: street.id, start, length, side: street.side, kind: length < MIN_HOUSE_GAP ? 'alley' : 'houses' });
  };
  for (let k = 0; k < n; k++) {
    const band = sliceBand(street, k * SAMPLE_STEP, Math.min((k + 1) * SAMPLE_STEP, len), cfg);
    const blocked = blockers.some((b) => overlaps(band, b));
    if (blocked) close(k);
    else if (runStart < 0) runStart = k;
  }
  close(n);
  return gaps;
}

/** Houses for one gap: the generator fills it exactly; each house is placed by distance along the line. */
export function fillGap(street: FillerStreet, gap: Gap, cfg: StreetConfig): PlacedHouse[] {
  if (gap.kind === 'alley') return [];
  const houses = generateStreet(hashSeed(gap.id), gap.length, { district: street.style });
  return houses.map((h, i) => {
    const at = placeAlongLine(street.line, street.side, cfg.frontOffset, gap.start + h.offset, h.recipe.depth);
    return { id: `${gap.id}#${i}`, gapId: gap.id, recipe: h.recipe, x: at.x, z: at.z, heading: at.heading };
  });
}

export function layoutStreet(street: FillerStreet, blockers: readonly Rect[], cfg: StreetConfig): PlacedHouse[] {
  return streetGaps(street, blockers, cfg).flatMap((g) => fillGap(street, g, cfg));
}

/** Axis-aligned footprint (for hitboxes) of a placed house, from recipe width x depth. */
export function houseFootprint(h: PlacedHouse): Rect & { height: number } {
  const w = h.recipe.width;
  const d = h.recipe.depth;
  const c = Math.abs(Math.cos(h.heading));
  const s = Math.abs(Math.sin(h.heading));
  const hx = (w * c + d * s) / 2;
  const hz = (w * s + d * c) / 2;
  const height = h.recipe.groundFloorHeight + h.recipe.floorHeights.reduce((a, b) => a + b, 0) + h.recipe.gable.height;
  return { minX: h.x - hx, maxX: h.x + hx, minZ: h.z - hz, maxZ: h.z + hz, height };
}

/** Rectangles that keep houses away: crossing roads (with sidewalks), plots + unloading zones, landmarks. */
export interface BlockerInput {
  roads: readonly { ax: number; az: number; bx: number; bz: number }[];
  /** Plots and their unloading zones. */
  plots: readonly { x: number; z: number; w: number; d: number }[];
  landmarks: readonly { x: number; z: number; w: number; d: number }[];
}

export function blockerRects(input: BlockerInput, cfg: StreetConfig): Rect[] {
  const out: Rect[] = [];
  for (const r of input.roads) {
    out.push({ minX: Math.min(r.ax, r.bx) - cfg.roadHalf, maxX: Math.max(r.ax, r.bx) + cfg.roadHalf, minZ: Math.min(r.az, r.bz) - cfg.roadHalf, maxZ: Math.max(r.az, r.bz) + cfg.roadHalf });
  }
  for (const b of [...input.plots, ...input.landmarks]) out.push(grow({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 }, cfg.margin));
  return out;
}
