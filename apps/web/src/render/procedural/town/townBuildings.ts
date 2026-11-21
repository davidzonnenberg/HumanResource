// T5: how a baked town building becomes a house. Pure: no three, no DOM, no Math.random.
//   LOD0  the procedural recipe at detail `low`, fed with the building's seed, width, depth and kind
//   LOD1  a box and a roof with a window texture, drawn instanced (one draw call for all walls, one for all roofs)
//   LOD2  all buildings of a chunk merged into one vertex-coloured mesh
// All three come from the same recipe (heights) and the same footprint, so a building does not jump when its LOD changes.
import type { Quality } from '../../quality';
import { totalEaveHeight, type BuildingRecipe } from '../buildings/buildingRecipe';
import { mulberry32, randomDutchHouse } from '../buildings/randomBuilding';
import type { Building, BuildingKind, TownOverrides, Vec2 } from './townTypes';

export type Lod = 0 | 1 | 2;

/** Which house generator each baked kind uses. `archetype` is only set where the district has more than one. */
export interface KindStyle { district: string; archetype?: string; floors: [number, number] }
export const KIND_STYLE: Record<BuildingKind, KindStyle> = {
  canal: { district: 'centre', floors: [3, 4] },
  terrace: { district: 'old_town', floors: [2, 3] },
  herenhuis: { district: 'centre', archetype: 'grand', floors: [3, 4] },
  flat: { district: 'town_flats', floors: [3, 5] },
  villa: { district: 'town_villas', floors: [1, 2] },
  office: { district: 'town_offices', floors: [3, 8] },
  warehouse: { district: 'town_industry', floors: [0, 1] },
  tower: { district: 'town_towers', floors: [8, 12] },
  landmark: { district: 'town_towers', floors: [8, 12] }, // a landmark without a fixed recipe is a tower
};

/** Upper floors of a building: same building, same number. Independent of the recipe's own random stream. */
export function floorsFor(b: Pick<Building, 'seed' | 'kind'>): number {
  const [lo, hi] = KIND_STYLE[b.kind].floors;
  const rng = mulberry32((b.seed ^ 0x51ed270b) >>> 0);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export type FixedRecipes = ReadonlyMap<string, BuildingRecipe>;

/**
 * The LOD0 recipe. A fixed recipe (override or landmark) is used as it is; everything else is generated from the
 * building's own seed and the size the bake gave it, so it is the same on every device and after every reload.
 */
export function recipeForTownBuilding(b: Building, fixed?: FixedRecipes): BuildingRecipe {
  if (b.recipe) {
    const r = fixed?.get(b.recipe);
    if (r) return r;
  }
  const s = KIND_STYLE[b.kind];
  const r = randomDutchHouse(b.seed, {
    district: s.district,
    ...(s.archetype ? { archetype: s.archetype } : {}),
    width: b.width,
    depth: b.depth,
    floors: floorsFor(b),
  });
  // The bake decides the wall colour, so the same house has the same colour at every LOD.
  return /^#[0-9a-fA-F]{6}$/.test(b.colour) ? { ...r, colours: { ...r.colours, brick: b.colour } } : r;
}

// ---------- footprint, hitbox, placement ----------
export interface Hitbox { x: number; z: number; angle: number; width: number; depth: number }

/** Hitbox from width x depth (not from the visual bounds: props stick out), like every other building in the game. */
export const buildingHitbox = (b: Pick<Building, 'x' | 'z' | 'angle' | 'width' | 'depth'>): Hitbox => ({ x: b.x, z: b.z, angle: b.angle, width: b.width, depth: b.depth });

/** The four corners of the footprint in world coordinates (x, z). The facade runs along the first two. */
export function footprintCorners(h: Hitbox): [Vec2, Vec2, Vec2, Vec2] {
  const ca = Math.cos(h.angle), sa = Math.sin(h.angle);
  const at = (lx: number, lz: number): Vec2 => [h.x + lx * ca - lz * sa, h.z + lx * sa + lz * ca];
  const hw = h.width / 2, hd = h.depth / 2;
  return [at(-hw, -hd), at(hw, -hd), at(hw, hd), at(-hw, hd)];
}

/**
 * Rotation about the vertical axis (three's `rotation.y`) that puts a recipe (width along x, facade towards +z) on its
 * footprint. The bake's angle is the road direction, the same for both sides of the road; the facade must face the road,
 * which is the `-normal` side: side L (`/L<n>`) already does, side R turns round by half a turn.
 */
export function buildingYaw(b: Pick<Building, 'id' | 'angle'>): number {
  const sideR = /\/R\d+$/.test(b.id);
  return -b.angle + (sideR ? Math.PI : 0);
}

// ---------- shape for LOD1 / LOD2 ----------
export interface BuildingShape {
  eave: number;      // wall height (m)
  rise: number;      // roof height above the eave (m); 0 = flat roof
  /** Wall and roof colour for the plain (LOD2) mesh. */
  wall: string;
  roof: string;
  /** Ridge direction: along the depth (gable end towards the street) or along the width. */
  ridge: 'depth' | 'width';
}

const shapeCache = new WeakMap<Building, BuildingShape>();

export function shapeOf(b: Building, fixed?: FixedRecipes): BuildingShape {
  const hit = shapeCache.get(b);
  if (hit) return hit;
  const r = recipeForTownBuilding(b, fixed);
  const flat = r.gable.kind === 'flat' || r.gable.kind === 'cornice' || b.kind === 'office' || b.kind === 'tower' || b.kind === 'flat';
  const gabledToStreet = b.kind === 'canal' || b.kind === 'terrace' || b.kind === 'herenhuis';
  const span = gabledToStreet ? r.width : r.depth; // the roof spans across the ridge
  const rise = flat ? 0 : Math.max(1, Math.min(span * (b.kind === 'warehouse' ? 0.15 : 0.32), b.kind === 'warehouse' ? 4 : 3.4));
  const s: BuildingShape = {
    eave: Math.round(totalEaveHeight(r) * 100) / 100,
    rise: Math.round(rise * 100) / 100,
    wall: /^#[0-9a-fA-F]{6}$/.test(r.colours.brick) ? r.colours.brick : b.colour,
    roof: /^#[0-9a-fA-F]{6}$/.test(r.colours.roof) ? r.colours.roof : '#5d6170',
    ridge: gabledToStreet ? 'depth' : 'width',
  };
  shapeCache.set(b, s);
  return s;
}

// ---------- LOD choice ----------
/** Distance from a point to an axis-aligned chunk (0 inside). */
export function distanceToChunk(cx: number, cz: number, chunkSize: number, x: number, z: number): number {
  const dx = Math.max(cx * chunkSize - x, 0, x - (cx + 1) * chunkSize);
  const dz = Math.max(cz * chunkSize - z, 0, z - (cz + 1) * chunkSize);
  return Math.hypot(dx, dz);
}

/** Buildings can overhang a chunk border by up to half their size (see chunkTown.ts); the LOD2 test allows for it. */
export const CHUNK_OVERHANG = 30;

/** A chunk is drawn as one merged mesh (LOD2) when even its nearest point is beyond the LOD1 distance. */
export const chunkIsFar = (nearest: number, q: Pick<Quality, 'lod1Distance'>): boolean => nearest - CHUNK_OVERHANG > q.lod1Distance;

export function lodForDistance(d: number, q: Pick<Quality, 'lod0Distance' | 'lod1Distance'>): Lod {
  return d < q.lod0Distance ? 0 : d < q.lod1Distance ? 1 : 2;
}

/** Chunks to keep built: `radius` rings around the chunk that holds the focus point. */
export function chunksInRadius(fx: number, fz: number, radius: number, chunkSize: number): Array<[number, number]> {
  const cx = Math.floor(fx / chunkSize), cz = Math.floor(fz / chunkSize);
  const out: Array<[number, number]> = [];
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) out.push([cx + dx, cz + dz]);
  return out;
}

/**
 * Which buildings get LOD0: the nearest ones inside the LOD0 distance, at most `maxLod0Buildings`. Buildings that already
 * have LOD0 keep it (hysteresis of 10 %), so one hovering on the border does not flicker.
 */
export function pickLod0(
  candidates: ReadonlyArray<{ id: string; d: number }>,
  current: ReadonlySet<string>,
  q: Pick<Quality, 'lod0Distance' | 'maxLod0Buildings'>,
): string[] {
  const ok = candidates.filter((c) => c.d < (current.has(c.id) ? q.lod0Distance * 1.1 : q.lod0Distance));
  ok.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
  return ok.slice(0, q.maxLod0Buildings).map((c) => c.id);
}

/** Hand edits (town-overrides.json) on the buildings of one chunk: the same fields as pplyOverrides, chunk by chunk. */
export function applyChunkOverrides(buildings: readonly Building[], ov: Pick<TownOverrides, 'buildings'>): Building[] {
  const out: Building[] = [];
  for (const b of buildings) {
    const o = ov.buildings[b.id];
    if (!o) { out.push(b); continue; }
    if (o.remove) continue;
    out.push({
      ...b,
      ...(o.kind ? { kind: o.kind } : {}),
      ...(o.colour ? { colour: o.colour } : {}),
      ...(o.seed !== undefined ? { seed: o.seed } : {}),
      ...(o.recipe ? { recipe: o.recipe } : {}),
      ...(o.lock ? { locked: true } : {}),
    });
  }
  return out;
}
