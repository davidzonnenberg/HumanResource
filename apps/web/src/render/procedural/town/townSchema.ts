// Validation for the procedural town data (render/bake only, the sim never reads it):
//   packages/content/data/maps/town-brief.json
//   packages/content/data/maps/town-overrides.json
//   packages/content/data/maps/generated/town-<id>.json
//   packages/content/data/maps/generated/town-<id>/index.json and chunk_<cx>_<cz>.json (T3)
// Same style as ../buildings/streetsSchema.ts. The types live in townTypes.ts; the `_assert*` functions at the
// bottom make the compiler fail if a schema and its type drift apart.
import { z } from 'zod';
import type { TownBrief, TownChunk, TownChunkIndex, TownData, TownOverrides } from './townTypes';

const num = z.number();
const pos = z.number().positive();
const vec2 = z.tuple([num, num]);
/** [min, max] range, min <= max. */
const range = z.tuple([num, num]).refine(([a, b]) => a <= b, { message: 'range must be [min, max] with min <= max' });
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colour must be #rrggbb');
const id = z.string().min(1);

export const BUILDING_KINDS = ['canal', 'terrace', 'herenhuis', 'flat', 'villa', 'office', 'warehouse', 'tower', 'landmark'] as const;
export const ROAD_KINDS = ['ring', 'radial', 'ramp', 'highway', 'singel', 'quay', 'gate', 'lane', 'branch'] as const;
export const SURFACES = ['asphalt', 'klinkers', 'concrete'] as const;
const buildingKind = z.enum(BUILDING_KINDS);
const roadKind = z.enum(ROAD_KINDS);
const surface = z.enum(SURFACES);

// ---------- brief ----------

export const buildingRuleSchema = z.object({
  kind: buildingKind,
  weight: z.number().min(0),
  width: range,
  depth: range,
  gap: range,
  setback: range,
  pad: z.number().min(0),
  perpendicularChance: z.number().min(0).max(1).optional(),
  palette: z.array(hex).min(1),
});

export const zoneRuleSchema = z.object({
  roadWidth: pos,
  surface,
  branchSpacing: range,
  branchLength: range,
  curveJitter: z.number().min(0),
  curveMax: z.number().min(0),
  bothSidesChance: z.number().min(0).max(1),
  culDeSacChance: z.number().min(0).max(1),
  treeChance: z.number().min(0).max(1),
  streetTrees: z.boolean(),
  buildings: z.array(buildingRuleSchema).min(1),
}).superRefine((z0, ctx) => {
  if (!z0.buildings.some((b) => b.weight > 0)) {
    ctx.addIssue({ code: 'custom', path: ['buildings'], message: 'a zone needs at least one building rule with weight > 0' });
  }
});

export const landmarkSchema = z.object({
  id,
  kind: buildingKind,
  recipe: id.optional(),
  anchor: z.enum(['centre', 'world']),
  at: vec2,
  width: pos,
  depth: pos,
  angleDeg: num,
  colour: hex.optional(),
});

const fraction = z.tuple([num, num]);

export const townBriefSchema = z.object({
  id,
  seed: id,
  size: z.tuple([pos, pos]),
  centre: z.object({ x: range, z: range }),
  singel: z.object({ halfWidth: range, halfDepth: range, waterWidth: pos, squareness: pos }),
  ring: z.object({ extraWidth: range, extraDepth: range, roadWidth: pos }),
  river: z.object({ widthInside: pos, widthOutside: pos, amplitude: range }),
  radials: z.object({ count: range, width: pos }),
  gates: z.array(z.enum(['N', 'S', 'E', 'W'])),
  highway: z.object({ width: pos, points: z.array(fraction).min(2) }),
  core: z.object({ laneWidth: pos, laneSpacing: range, crossLanes: z.number().int().min(0), riverBridges: z.number().int().min(0) }),
  parks: z.object({ count: z.number().int().min(0), radius: range, districts: z.array(id) }),
  sectors: z.array(z.object({ fromDeg: num, toDeg: num, district: id }).refine((s) => s.fromDeg < s.toDeg, { message: 'fromDeg must be < toDeg' })),
  defaultDistrict: id,
  zones: z.record(z.string(), zoneRuleSchema),
  landmarks: z.array(landmarkSchema),
}).superRefine((b, ctx) => {
  for (const name of requiredZones(b)) {
    if (!(name in b.zones)) ctx.addIssue({ code: 'custom', path: ['zones'], message: `missing required zone "${name}"` });
  }
  if (new Set(b.gates).size !== b.gates.length) ctx.addIssue({ code: 'custom', path: ['gates'], message: 'duplicate gate' });
  const seen = new Set<string>();
  b.landmarks.forEach((l, i) => {
    if (seen.has(l.id)) ctx.addIssue({ code: 'custom', path: ['landmarks', i, 'id'], message: `duplicate landmark id "${l.id}"` });
    seen.add(l.id);
  });
});

/** Zone keys the generator needs: "core" plus "<district>_inner" / "<district>_outer" for every district. */
export function requiredZones(b: { defaultDistrict: string; sectors: Array<{ district: string }> }): string[] {
  const districts = Array.from(new Set([b.defaultDistrict, ...b.sectors.map((s) => s.district)]));
  return ['core', ...districts.flatMap((d) => [`${d}_inner`, `${d}_outer`])];
}

// ---------- overrides ----------

export const townOverridesSchema = z.object({
  buildings: z.record(z.string(), z.strictObject({
    recipe: id.optional(),
    kind: buildingKind.optional(),
    colour: hex.optional(),
    seed: z.number().int().optional(),
    lock: z.boolean().optional(),
    remove: z.boolean().optional(),
    at: vec2.optional(),
    note: z.string().optional(),
  })),
  roads: z.record(z.string(), z.strictObject({
    name: z.string().min(1).optional(),
    surface: surface.optional(),
    width: pos.optional(),
    note: z.string().optional(),
  })),
});

// ---------- baked town ----------

const road = z.object({
  id,
  kind: roadKind,
  zone: z.string(),
  width: pos,
  surface,
  points: z.array(vec2).min(2),
  parent: id.optional(),
});

const building = z.object({
  id,
  roadId: id.nullable(),
  lockedRoadId: id.nullable().optional(),
  zone: z.string(),
  kind: buildingKind,
  x: num, z: num, angle: num,
  width: pos, depth: pos,
  colour: z.string().min(1),
  seed: z.number().int().min(0),
  recipe: id.optional(),
  locked: z.boolean().optional(),
});

const zoneGrid = z.object({ cell: pos, cols: z.number().int().positive(), rows: z.number().int().positive(), zones: z.array(z.string()), data: z.array(z.number().int().min(0)) });
const water = z.object({ id, kind: z.enum(['river', 'singel']), points: z.array(vec2).min(2), widths: z.array(pos) });
const junction = z.object({ id, at: vec2, roads: z.tuple([id, id]), type: z.enum(['tee', 'roundabout', 'ramp']) });
const bridge = z.object({ id, roadId: id, x: num, z: num, angle: num, length: pos, width: pos, over: z.enum(['river', 'singel', 'highway']) });
const sign = z.object({ id, kind: z.enum(['yield', 'speed30', 'highway', 'centre']), x: num, z: num });
const park = z.object({
  id,
  centre: vec2,
  outline: z.array(vec2).min(3),
  pond: z.object({ x: num, z: num, rx: num, rz: num, angle: num }),
});
const tree = z.tuple([num, num, num]);

export const townDataSchema = z.object({
  version: z.literal(1),
  briefId: id,
  seed: z.number().int().min(0),
  size: z.tuple([pos, pos]),
  centre: vec2,
  zoneGrid,
  water: z.array(water),
  highway: road,
  roads: z.array(road),
  junctions: z.array(junction),
  roundabouts: z.array(vec2),
  culDeSacs: z.array(vec2),
  plaza: vec2,
  bridges: z.array(bridge),
  signs: z.array(sign),
  parks: z.array(park),
  buildings: z.array(building),
  trees: z.array(tree),
  warnings: z.array(z.string()),
}).superRefine((t, ctx) => {
  const dup = (path: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const x of ids) {
      if (seen.has(x)) ctx.addIssue({ code: 'custom', path: [path], message: `duplicate id "${x}"` });
      seen.add(x);
    }
  };
  dup('roads', t.roads.map((r) => r.id));
  dup('buildings', t.buildings.map((b) => b.id));
  dup('bridges', t.bridges.map((b) => b.id));
  dup('junctions', t.junctions.map((j) => j.id));
  const roadIds = new Set([...t.roads.map((r) => r.id), t.highway.id]);
  t.junctions.forEach((j, i) => {
    for (const r of j.roads) if (!roadIds.has(r)) ctx.addIssue({ code: 'custom', path: ['junctions', i, 'roads'], message: `junction ${j.id} references unknown road "${r}"` });
  });
});

// ---------- chunked bake (generated/town-<id>/index.json and chunk_<cx>_<cz>.json) ----------

const roadPiece = road.extend({ piece: z.number().int().min(0), pieces: z.number().int().min(1) })
  .refine((p) => p.piece < p.pieces, { message: 'piece must be < pieces' });
const chunkInt = z.number().int();
const CHUNK_FILE = /^chunk_(-?\d+)_(-?\d+)\.json$/;

export const townChunkSchema = z.object({
  version: z.literal(1),
  briefId: id,
  cx: chunkInt,
  cz: chunkInt,
  roads: z.array(roadPiece),
  highway: z.array(roadPiece),
  buildings: z.array(building),
  trees: z.array(tree),
  signs: z.array(sign),
});

export const townChunkIndexSchema = z.object({
  version: z.literal(1),
  briefId: id,
  seed: z.number().int().min(0),
  size: z.tuple([pos, pos]),
  chunkSize: pos,
  chunks: z.array(z.object({
    cx: chunkInt,
    cz: chunkInt,
    file: z.string().regex(CHUNK_FILE, 'file must be chunk_<cx>_<cz>.json'),
    counts: z.object({
      roads: z.number().int().min(0), highway: z.number().int().min(0), buildings: z.number().int().min(0),
      trees: z.number().int().min(0), signs: z.number().int().min(0),
    }),
  })),
  totals: z.object({ roads: z.number().int().min(0), buildings: z.number().int().min(0), trees: z.number().int().min(0), signs: z.number().int().min(0) }),
  shared: z.object({
    centre: vec2,
    zoneGrid,
    water: z.array(water),
    junctions: z.array(junction),
    roundabouts: z.array(vec2),
    culDeSacs: z.array(vec2),
    plaza: vec2,
    bridges: z.array(bridge),
    parks: z.array(park),
    warnings: z.array(z.string()),
  }),
}).superRefine((ix, ctx) => {
  const seen = new Set<string>();
  ix.chunks.forEach((c, i) => {
    const m = CHUNK_FILE.exec(c.file);
    if (m && (Number(m[1]) !== c.cx || Number(m[2]) !== c.cz)) {
      ctx.addIssue({ code: 'custom', path: ['chunks', i, 'file'], message: `file ${c.file} does not match chunk ${c.cx},${c.cz}` });
    }
    if (seen.has(c.file)) ctx.addIssue({ code: 'custom', path: ['chunks', i, 'file'], message: `duplicate chunk ${c.file}` });
    seen.add(c.file);
  });
});

// ---------- parse helpers (throw one readable Error) ----------

function fail(what: string, issues: z.core.$ZodIssue[]): never {
  const lines = issues.slice(0, 20).map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
  const more = issues.length > 20 ? `\n  ... and ${issues.length - 20} more` : '';
  throw new Error(`${what} is invalid:\n${lines.join('\n')}${more}`);
}

export function parseTownBrief(data: unknown, what = 'town-brief.json'): TownBrief {
  const r = townBriefSchema.safeParse(data);
  if (!r.success) fail(what, r.error.issues);
  return r.data as TownBrief;
}

export function parseTownOverrides(data: unknown, what = 'town-overrides.json'): TownOverrides {
  const r = townOverridesSchema.safeParse(data);
  if (!r.success) fail(what, r.error.issues);
  return r.data as TownOverrides;
}

export function parseTownData(data: unknown, what = 'town data'): TownData {
  const r = townDataSchema.safeParse(data);
  if (!r.success) fail(what, r.error.issues);
  return r.data as TownData;
}

export function parseTownChunk(data: unknown, what = 'town chunk'): TownChunk {
  const r = townChunkSchema.safeParse(data);
  if (!r.success) fail(what, r.error.issues);
  return r.data as TownChunk;
}

export function parseTownChunkIndex(data: unknown, what = 'town chunk index'): TownChunkIndex {
  const r = townChunkIndexSchema.safeParse(data);
  if (!r.success) fail(what, r.error.issues);
  return r.data as TownChunkIndex;
}

// ---------- drift guards (compile-time only) ----------
export const _assertBrief = (b: TownBrief): z.input<typeof townBriefSchema> => b;
export const _assertOverrides = (o: TownOverrides): z.input<typeof townOverridesSchema> => o;
export const _assertData = (t: TownData): z.input<typeof townDataSchema> => t;
export const _assertChunk = (c: TownChunk): z.input<typeof townChunkSchema> => c;
export const _assertChunkIndex = (i: TownChunkIndex): z.input<typeof townChunkIndexSchema> => i;
