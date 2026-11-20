// Split a baked town into 256 m chunks (T3). Pure: no file access, no randomness.
//
//   generated/town-<id>.json                   the monolithic bake (source of truth, never edited)
//   generated/town-<id>/index.json             manifest + everything that is not chunked (`shared`)
//   generated/town-<id>/chunk_<cx>_<cz>.json   roads, buildings, trees and signs of one 256 x 256 m cell
//
// Rules:
// - Chunk (cx, cz) covers x in [cx * size, (cx + 1) * size) and z in [cz * size, (cz + 1) * size). Indices can be
//   negative: the highway starts a few metres outside the town.
// - A building, tree or sign belongs to the chunk of its centre point. A footprint can overhang the border by up to
//   half its size; the renderer has to allow for that.
// - A road (and the highway) that crosses a border is cut at the border. Every part keeps the road id and carries
//   `piece` / `pieces`, so the original polyline can be put back together (mergeRoadPieces). New points on the border
//   are rounded to 0.01 m like every other coordinate in the bake.
import type {
  Building, Road, RoadPiece, Sign, TownChunk, TownChunkIndex, TownData, Vec2,
} from './townTypes';

export const CHUNK_SIZE = 256;

const round2 = (v: number): number => Math.round(v * 100) / 100;

export const chunkCoord = (v: number, size = CHUNK_SIZE): number => Math.floor(v / size);
export const chunkFile = (cx: number, cz: number): string => `chunk_${cx}_${cz}.json`;
/** Directory name of the chunk set that belongs to `generated/town-<id>.json`. */
export const chunkDirName = (briefId: string): string => `town-${briefId}`;

export interface PolylinePart { cx: number; cz: number; points: Vec2[] }

/**
 * Cut a polyline at the chunk borders. Returns the parts in travel order; consecutive parts share their end point.
 * A part is always at least 2 points. A road that leaves a chunk and comes back gives two parts in that chunk.
 */
export function clipPolyline(points: Vec2[], size = CHUNK_SIZE): PolylinePart[] {
  const parts: PolylinePart[] = [];
  let cur: PolylinePart | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    // Parameters where the segment crosses a vertical or horizontal border line (strictly inside the segment).
    const ts = [0, 1];
    for (const axis of [0, 1] as const) {
      const lo = Math.min(a[axis], b[axis]), hi = Math.max(a[axis], b[axis]);
      if (hi === lo) continue;
      for (let k = Math.floor(lo / size) + 1; k * size < hi; k++) ts.push((k * size - a[axis]) / (b[axis] - a[axis]));
    }
    ts.sort((p, q) => p - q);
    const at = (t: number): Vec2 => (t === 0 ? a : t === 1 ? b : [round2(a[0] + (b[0] - a[0]) * t), round2(a[1] + (b[1] - a[1]) * t)]);
    for (let j = 0; j < ts.length - 1; j++) {
      const t0 = ts[j]!, t1 = ts[j + 1]!;
      // Skip zero-length slivers (two crossings at the same point, e.g. a corner), but keep a whole zero-length segment.
      if (t1 - t0 < 1e-12 && ts.length > 2) continue;
      const tm = (t0 + t1) / 2;
      const cx = chunkCoord(a[0] + (b[0] - a[0]) * tm, size), cz = chunkCoord(a[1] + (b[1] - a[1]) * tm, size);
      const p1 = at(t1);
      if (cur && cur.cx === cx && cur.cz === cz) cur.points.push(p1);
      else {
        cur = { cx, cz, points: [at(t0), p1] };
        parts.push(cur);
      }
    }
  }
  return parts;
}

function piecesOf(road: Road, size: number): Array<{ cx: number; cz: number; piece: RoadPiece }> {
  const parts = clipPolyline(road.points, size);
  return parts.map((p, i) => ({ cx: p.cx, cz: p.cz, piece: { ...road, points: p.points, piece: i, pieces: parts.length } }));
}

export interface ChunkedTown {
  index: TownChunkIndex;
  /** File name -> chunk, in the same order as `index.chunks`. */
  chunks: Record<string, TownChunk>;
}

export function chunkTown(town: TownData, size = CHUNK_SIZE): ChunkedTown {
  const cells = new Map<string, TownChunk>();
  const cell = (cx: number, cz: number): TownChunk => {
    const key = `${cx},${cz}`;
    let c = cells.get(key);
    if (!c) {
      c = { version: 1, briefId: town.briefId, cx, cz, roads: [], highway: [], buildings: [], trees: [], signs: [] };
      cells.set(key, c);
    }
    return c;
  };
  for (const r of town.roads) for (const p of piecesOf(r, size)) cell(p.cx, p.cz).roads.push(p.piece);
  for (const p of piecesOf(town.highway, size)) cell(p.cx, p.cz).highway.push(p.piece);
  for (const b of town.buildings) cell(chunkCoord(b.x, size), chunkCoord(b.z, size)).buildings.push(b);
  for (const t of town.trees) cell(chunkCoord(t[0], size), chunkCoord(t[1], size)).trees.push(t);
  for (const s of town.signs) cell(chunkCoord(s.x, size), chunkCoord(s.z, size)).signs.push(s);

  const sorted = [...cells.values()].sort((p, q) => p.cz - q.cz || p.cx - q.cx);
  const chunks: Record<string, TownChunk> = {};
  const entries: TownChunkIndex['chunks'] = [];
  for (const c of sorted) {
    const file = chunkFile(c.cx, c.cz);
    chunks[file] = c;
    entries.push({
      cx: c.cx, cz: c.cz, file,
      counts: { roads: c.roads.length, highway: c.highway.length, buildings: c.buildings.length, trees: c.trees.length, signs: c.signs.length },
    });
  }
  const index: TownChunkIndex = {
    version: 1,
    briefId: town.briefId,
    seed: town.seed,
    size: town.size,
    chunkSize: size,
    chunks: entries,
    totals: { roads: town.roads.length, buildings: town.buildings.length, trees: town.trees.length, signs: town.signs.length },
    shared: {
      centre: town.centre,
      zoneGrid: town.zoneGrid,
      water: town.water,
      junctions: town.junctions,
      roundabouts: town.roundabouts,
      culDeSacs: town.culDeSacs,
      plaza: town.plaza,
      bridges: town.bridges,
      parks: town.parks,
      warnings: town.warnings,
    },
  };
  return { index, chunks };
}

/** Put the pieces of one road back together. Throws when a piece is missing, doubled or does not join up. */
export function mergeRoadPieces(pieces: RoadPiece[]): Road {
  if (pieces.length === 0) throw new Error('no road pieces');
  const sorted = [...pieces].sort((a, b) => a.piece - b.piece);
  const first = sorted[0]!;
  if (sorted.length !== first.pieces) throw new Error(`road ${first.id}: ${sorted.length} piece(s) found, expected ${first.pieces}`);
  const points: Vec2[] = [];
  sorted.forEach((p, i) => {
    if (p.piece !== i || p.id !== first.id) throw new Error(`road ${first.id}: piece ${i} is missing or doubled`);
    if (i === 0) points.push(...p.points);
    else {
      const last = points[points.length - 1]!;
      if (last[0] !== p.points[0]![0] || last[1] !== p.points[0]![1]) throw new Error(`road ${first.id}: piece ${i} does not join piece ${i - 1}`);
      points.push(...p.points.slice(1));
    }
  });
  const { piece: _piece, pieces: _pieces, ...road } = first;
  return { ...road, points };
}

export interface ChunkUnion { roads: Road[]; highway: Road | null; buildings: Building[]; trees: Array<[number, number, number]>; signs: Sign[] }

/** All chunks put back together (roads merged from their pieces). For tests and tools; the game loads chunk by chunk. */
export function unionChunks(chunks: TownChunk[]): ChunkUnion {
  const byRoad = new Map<string, RoadPiece[]>();
  const hw: RoadPiece[] = [];
  const out: ChunkUnion = { roads: [], highway: null, buildings: [], trees: [], signs: [] };
  for (const c of chunks) {
    for (const p of c.roads) {
      const l = byRoad.get(p.id);
      if (l) l.push(p); else byRoad.set(p.id, [p]);
    }
    hw.push(...c.highway);
    out.buildings.push(...c.buildings);
    out.trees.push(...c.trees);
    out.signs.push(...c.signs);
  }
  for (const l of byRoad.values()) out.roads.push(mergeRoadPieces(l));
  out.highway = hw.length ? mergeRoadPieces(hw) : null;
  return out;
}
