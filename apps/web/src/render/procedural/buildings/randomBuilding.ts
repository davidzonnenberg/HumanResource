/**
 * Seeded random houses, built from archetypes and districts, and whole street fronts.
 * Web-side RNG (mulberry32), seeded from plot/street ids so every device draws
 * the same town. Never used by packages/sim.
 */
import { ARCHETYPES, DISTRICTS, type Archetype, type DistrictStyle, type Range, type Weighted } from './archetypes';
import { NO_PROPS, type BuildingRecipe, type PropFlags } from './buildingRecipe';
import { SCHEMES, schemesWithTags } from './palettes';

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash for string ids like "old_town:plot_3". */
export function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  const v = items[Math.floor(rng() * items.length)];
  if (v === undefined) throw new Error('pick from empty list');
  return v;
}

export function weighted<T>(rng: Rng, items: Weighted<T>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  const last = items[items.length - 1];
  if (!last) throw new Error('weighted pick from empty list');
  return last[0];
}

const inRange = (rng: Rng, [a, b]: Range) => a + rng() * (b - a);
const intIn = (rng: Rng, [a, b]: Range) => Math.floor(a + rng() * (b - a + 1));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

export function districtStyle(id: string): DistrictStyle {
  const d = DISTRICTS[id];
  if (!d) throw new Error(`unknown district "${id}"`);
  return d;
}

export function archetypeOf(id: string): Archetype {
  const a = ARCHETYPES[id];
  if (!a) throw new Error(`unknown archetype "${id}"`);
  return a;
}

export interface RandomHouseOptions {
  district?: string;
  archetype?: string;
  width?: number;
  /** Number of upper floors. */
  floors?: number;
  depth?: number;
}

export function randomDutchHouse(seed: number, opts: RandomHouseOptions = {}): BuildingRecipe {
  const rng = mulberry32(seed);
  const district = districtStyle(opts.district ?? 'old_town');
  const arch = archetypeOf(opts.archetype ?? weighted(rng, district.archetypes));
  const width = opts.width ?? r2(inRange(rng, district.widths) * inRange(rng, arch.widthMul));
  const bays = Math.max(1, Math.min(6, Math.round(width / 1.45)));
  const upper = opts.floors ?? intIn(rng, district.floors);
  const fh0 = inRange(rng, arch.floorHeight);
  const floorHeights: number[] = [];
  for (let i = 0; i < upper; i++) floorHeights.push(r2(fh0 - i * 0.08 + (rng() - 0.5) * 0.06));

  const kind = weighted(rng, arch.gables);
  const scheme = pick(rng, schemesWithTags(arch.schemes).length ? schemesWithTags(arch.schemes) : SCHEMES);
  const plaster = scheme.tags.includes('plaster');
  const ground = weighted(rng, arch.ground);
  const shopLike = ground !== 'door';
  const steps = shopLike ? 0 : weighted(rng, arch.steps);

  let focal = weighted(rng, arch.focals);
  if (upper === 0 && focal !== 'bigSign' && focal !== 'roundWindow') focal = 'none';

  const props: PropFlags = { ...NO_PROPS };
  for (const [k, chance] of Object.entries(arch.props) as [keyof PropFlags, number][]) props[k] = rng() < chance;
  if (focal !== 'balcony') props.mattress = false;
  if (upper === 0) props.laundry = false;
  if (props.flatTyreBike) props.bike = true;
  if (kind !== 'flat' && kind !== 'cornice') props.solarPanels = false;
  if (plaster) props.wallAnchors = false;

  const identity = arch.identity;
  const signText = arch.signTexts.length ? pick(rng, arch.signTexts) : null;
  const gableHeight = kind === 'cornice' || kind === 'flat' ? 0 : r2(width * inRange(rng, [0.6, 0.85]));

  return {
    style: 'dutch_row',
    archetype: arch.id,
    district: district.id,
    width,
    depth: opts.depth ?? r2(6 + rng() * 2),
    bays,
    groundFloorHeight: r2(inRange(rng, arch.groundHeight)),
    floorHeights,
    facade: plaster ? 'plaster' : 'brick',
    corners: weighted(rng, arch.corners),
    taper: r2(inRange(rng, arch.taper)),
    corniceOverhang: r2(inRange(rng, arch.corniceOverhang)),
    bodyRadius: r2(inRange(rng, arch.bodyRadius)),
    gable: {
      kind,
      height: gableHeight,
      rim: kind !== 'triangle' || rng() < 0.6,
      finials: kind === 'bell' || kind === 'neck' ? rng() < 0.8 : false,
      window: rng() < 0.8,
      hoistBeam: kind !== 'flat' && kind !== 'cornice' && rng() < arch.hoistBeam,
      ornaments: width > 4.4 && rng() < 0.5,
    },
    ground: {
      kind: ground,
      doorBay: Math.floor(rng() * bays),
      steps,
      doorArch: rng() < 0.3,
      awning: shopLike && rng() < arch.awning,
      sign: shopLike,
    },
    windows: {
      upperBays: bays === 1 ? 1 : rng() < 0.25 ? bays - 1 : bays,
      style: weighted(rng, arch.windowStyle),
      arch: weighted(rng, arch.arch),
      flowerBoxes: r2(inRange(rng, arch.flowerBoxes)),
      shutters: rng() < arch.shutters,
    },
    roof: { tiles: true, dormers: false },
    focal,
    identity,
    signText,
    props,
    windowLife: { share: r2(inRange(rng, arch.windowLife)), kinds: [...arch.lifeKinds] },
    boarded: r2(inRange(rng, arch.boarded)),
    weathering: r2(inRange(rng, arch.weathering)),
    sideWindows: false,
    chimney: rng() < arch.chimney,
    drainpipe: rng() < arch.drainpipe,
    apron: false,
    imperfection: r2(clamp01(inRange(rng, district.imperfection) + arch.imperfectionBias)),
    colours: {
      brick: scheme.wall,
      band: scheme.band,
      trim: scheme.trim,
      ledge: scheme.ledge,
      roof: scheme.roof,
      glass: '#33557e',
      lit: '#ffcf70',
      door: scheme.door,
      accent: scheme.accent,
    },
    litFraction: r2(inRange(rng, arch.litFraction)),
    seed: Math.floor(rng() * 1e9),
    extras: [],
  };
}

export interface StreetHouse {
  /** Centre offset along the street, from the street start. */
  offset: number;
  recipe: BuildingRecipe;
}

export interface StreetOptions {
  district?: string;
}

/**
 * Fills `length` metres of street front exactly. Houses in one street share
 * a base height (with a little jitter); neighbours never repeat the same
 * archetype or gable kind.
 */
export function generateStreet(seed: number, length: number, opts: StreetOptions = {}): StreetHouse[] {
  const rng = mulberry32(seed);
  const d = districtStyle(opts.district ?? 'old_town');
  const [minW, maxW] = d.widths;
  const widths: number[] = [];
  let left = length;
  while (left > 1e-6) {
    let w = minW + rng() * (maxW - minW);
    if (left - w < minW) w = left;
    if (w > maxW * 1.4 && widths.length > 0) w = left / 2;
    widths.push(w);
    left -= w;
  }
  const streetFloors = intIn(rng, d.floors);
  const out: StreetHouse[] = [];
  let x = 0;
  let prev: BuildingRecipe | null = null;
  for (const w of widths) {
    let floors = streetFloors;
    if (rng() < d.heightJitter) floors += rng() < 0.5 ? -1 : 1;
    floors = Math.max(d.floors[0] - 1, Math.min(d.floors[1] + 1, floors, 6));
    floors = Math.max(0, floors);
    let recipe = randomDutchHouse(Math.floor(rng() * 1e9), { district: d.id, width: w, floors });
    for (let tries = 0; prev && tries < 4 && (recipe.archetype === prev.archetype || recipe.gable.kind === prev.gable.kind); tries++) {
      recipe = randomDutchHouse(Math.floor(rng() * 1e9), { district: d.id, width: w, floors });
    }
    out.push({ offset: x + w / 2, recipe });
    prev = recipe;
    x += w;
  }
  return out;
}

export type RerollAspect = 'colours' | 'gable' | 'windows' | 'props' | 'focal' | 'proportions' | 'archetype' | 'seed';

/** Designer mode: keep a house, regenerate one aspect from a new seed. */
export function rerollAspect(recipe: BuildingRecipe, aspect: RerollAspect, seed: number): BuildingRecipe {
  const keep = { district: recipe.district, width: recipe.width, floors: recipe.floorHeights.length, depth: recipe.depth };
  const known = recipe.archetype in ARCHETYPES && recipe.district in DISTRICTS;
  if (!known) return { ...recipe, seed: seed % 1e9 };
  if (aspect === 'archetype') return { ...randomDutchHouse(seed, keep), extras: recipe.extras };
  const f = randomDutchHouse(seed, { ...keep, archetype: recipe.archetype });
  switch (aspect) {
    case 'colours':
      return { ...recipe, colours: { ...f.colours, accent: recipe.colours.accent === 'owner' ? 'owner' : f.colours.accent }, facade: f.facade };
    case 'gable':
      return { ...recipe, gable: f.gable, corners: f.corners };
    case 'windows':
      return { ...recipe, windows: f.windows, windowLife: f.windowLife, boarded: f.boarded };
    case 'props':
      return { ...recipe, props: f.props, chimney: f.chimney, drainpipe: f.drainpipe };
    case 'focal':
      return { ...recipe, focal: f.focal, props: { ...recipe.props, mattress: f.focal === 'balcony' && recipe.props.mattress } };
    case 'proportions':
      return { ...recipe, taper: f.taper, corniceOverhang: f.corniceOverhang, bodyRadius: f.bodyRadius, floorHeights: f.floorHeights, groundFloorHeight: f.groundFloorHeight, imperfection: f.imperfection };
    case 'seed':
      return { ...recipe, seed: f.seed };
  }
  return recipe;
}
