// T4: roads, water and bridges from the bake as mesh data. Widths and surfaces come from the data, the geometry is
// well formed (faces look up, indices in range) and the whole town fits the Low draw-call and triangle budget.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { townDevRequested } from '../../src/dev/townDevFlag';
import { chunkDirName } from '../../src/render/procedural/town/chunkTown';
import {
  buildChunkMesh, buildSharedMesh, buildSignMesh, hexToRgb, LAYER, PALETTE, ROAD_RANK, roadColour, signsByKind,
  smoothPolyline, SIGN_KINDS, townDrawBudget, triangleCount, vertexCount, type MeshData,
} from '../../src/render/procedural/town/townRoadMesh';
import { parseTownChunk, parseTownChunkIndex } from '../../src/render/procedural/town/townSchema';
import type { Road, RoadPiece, TownChunk, TownChunkShared, Vec2 } from '../../src/render/procedural/town/townTypes';

const mapsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/content/data/maps/generated');
const dir = join(mapsDir, chunkDirName('start_city'));
const index = parseTownChunkIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
const chunks: TownChunk[] = index.chunks.map((c) => parseTownChunk(JSON.parse(readFileSync(join(dir, c.file), 'utf8'))));

const piece = (r: Partial<Road> & Pick<Road, 'points'>): RoadPiece => ({
  id: 'r', kind: 'branch', zone: 'core', width: 6, surface: 'asphalt', piece: 0, pieces: 1, ...r,
});
const chunkOf = (roads: RoadPiece[]): TownChunk => ({ version: 1, briefId: 't', cx: 0, cz: 0, roads, highway: [], buildings: [], trees: [], signs: [] });

/** z extent of all vertices at a given height. */
function zExtent(m: MeshData, y: number): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    if (Math.abs(m.positions[i + 1]! - y) > 1e-6) continue;
    lo = Math.min(lo, m.positions[i + 2]!); hi = Math.max(hi, m.positions[i + 2]!);
  }
  return [lo, hi];
}

function expectWellFormed(m: MeshData, what: string): void {
  const n = vertexCount(m);
  expect(m.normals.length, what).toBe(m.positions.length);
  expect(m.colors.length, what).toBe(m.positions.length);
  expect(m.positions.every(Number.isFinite), `${what}: finite positions`).toBe(true);
  expect(m.indices.length % 3, what).toBe(0);
  let bad = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    if (a >= n || b >= n || c >= n) throw new Error(`${what}: index out of range`);
    const p = (i: number): number[] => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!], v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
    const cr = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const dot = cr[0]! * m.normals[a * 3]! + cr[1]! * m.normals[a * 3 + 1]! + cr[2]! * m.normals[a * 3 + 2]!;
    if (dot < -1e-9) bad++; // degenerate (zero-area) triangles give 0; a face that looks the wrong way is negative
  }
  expect(bad, `${what}: triangles that face away from their normal`).toBe(0);
}

describe('T4 road mesh: widths and surfaces from the data', () => {
  it('a straight road ribbon is exactly as wide as the road, and the pavement is 1.2 m wider on each side', () => {
    for (const width of [3.2, 6, 10]) {
      const m = buildChunkMesh(chunkOf([piece({ width, points: [[0, 50], [40, 50], [80, 50]] })]));
      const [lo, hi] = zExtent(m, LAYER.road + ROAD_RANK.branch * LAYER.rankStep);
      expect(hi - lo).toBeCloseTo(width, 5);
      const [plo, phi] = zExtent(m, LAYER.pavement);
      expect(phi - plo).toBeCloseTo(width + 2.4, 5);
    }
  });

  it('keeps the width on a curve (mitred), within the clamp', () => {
    const arc: Vec2[] = [];
    for (let i = 0; i <= 30; i++) arc.push([100 + Math.cos(i / 10) * 100, 100 + Math.sin(i / 10) * 100]);
    const m = buildChunkMesh(chunkOf([piece({ width: 8, points: arc })]));
    const y = LAYER.road;
    // Every pair of vertices of the ribbon (side A, side B) is 8 m apart (mitre factor is ~1 on a gentle arc).
    const ribbon: number[] = [];
    for (let i = 0; i < m.positions.length; i += 3) if (Math.abs(m.positions[i + 1]! - y) < 1e-9) ribbon.push(i / 3);
    expect(ribbon.length).toBeGreaterThanOrEqual(2 * arc.length);
    for (let k = 0; k + 1 < 2 * arc.length; k += 2) {
      const a = ribbon[k]! * 3, b = ribbon[k + 1]! * 3;
      expect(Math.hypot(m.positions[a]! - m.positions[b]!, m.positions[a + 2]! - m.positions[b + 2]!)).toBeCloseTo(8, 1);
    }
  });

  it('draws bigger roads above smaller ones (no z-fighting at junctions)', () => {
    const m = buildChunkMesh(chunkOf([
      piece({ id: 'a', kind: 'branch', points: [[0, 0], [20, 0]] }),
      piece({ id: 'b', kind: 'radial', width: 8, points: [[10, -10], [10, 10]] }),
    ]));
    const ys = new Set<number>();
    for (let i = 1; i < m.positions.length; i += 3) ys.add(Math.round(m.positions[i]! * 1000) / 1000);
    expect(ys.has(LAYER.road)).toBe(true);
    expect(ys.has(Math.round((LAYER.road + ROAD_RANK.radial * LAYER.rankStep) * 1000) / 1000)).toBe(true);
    expect(ROAD_RANK.radial).toBeGreaterThan(ROAD_RANK.branch);
    expect(ROAD_RANK.highway).toBeGreaterThan(ROAD_RANK.radial);
  });

  it('surface decides the colour: asphalt, klinkers and concrete differ; lanes and quays are their own', () => {
    const cols = new Set([
      roadColour({ kind: 'branch', surface: 'asphalt' }), roadColour({ kind: 'branch', surface: 'klinkers' }),
      roadColour({ kind: 'branch', surface: 'concrete' }), roadColour({ kind: 'lane', surface: 'klinkers' }),
      roadColour({ kind: 'quay', surface: 'klinkers' }), roadColour({ kind: 'highway', surface: 'asphalt' }),
    ]);
    expect(cols.size).toBe(6);
    const asphalt = buildChunkMesh(chunkOf([piece({ surface: 'asphalt', points: [[0, 0], [10, 0]] })]));
    const concrete = buildChunkMesh(chunkOf([piece({ surface: 'concrete', points: [[0, 0], [10, 0]] })]));
    const first = (m: MeshData): number[] => {
      for (let i = 0; i < m.positions.length / 3; i++) if (Math.abs(m.positions[i * 3 + 1]! - LAYER.road) < 1e-9) return m.colors.slice(i * 3, i * 3 + 3);
      return [];
    };
    expect(first(asphalt)).toEqual(hexToRgb(PALETTE.asphalt));
    expect(first(concrete)).toEqual(hexToRgb(PALETTE.concrete));
  });

  it('smoothPolyline keeps every original point and only adds points on long segments', () => {
    const p: Vec2[] = [[0, 0], [20, 0], [40, 10], [41, 11]];
    const s = smoothPolyline(p);
    for (const q of p) expect(s.some((x) => x[0] === q[0] && x[1] === q[1])).toBe(true);
    expect(s.length).toBeGreaterThan(p.length);
    expect(smoothPolyline([[0, 0], [1, 0], [2, 0]]).length).toBe(3);
  });
});

describe('T4 committed town', () => {
  it('every chunk mesh and the shared mesh are well formed', () => {
    for (const c of chunks) expectWellFormed(buildChunkMesh(c), `chunk ${c.cx},${c.cz}`);
    expectWellFormed(buildSharedMesh(index.shared), 'shared');
    for (const k of SIGN_KINDS) expectWellFormed(buildSignMesh(k), `sign ${k}`);
  });

  it('draws every road piece: no chunk with roads gives an empty mesh', () => {
    for (const c of chunks) {
      if (c.roads.length + c.highway.length > 0) expect(triangleCount(buildChunkMesh(c)), `chunk ${c.cx},${c.cz}`).toBeGreaterThan(0);
    }
  });

  it('water ribbons follow the widths of the bake (river 24 m / 12 m, singel 12 m)', () => {
    const ws = index.shared.water.flatMap((w) => w.widths);
    expect(Math.max(...ws)).toBe(24);
    expect(Math.min(...ws)).toBe(12);
    // A straight stream along x whose width goes 24 -> 12: the ribbon is as wide as the data at each end.
    const none: TownChunkShared = { ...index.shared, parks: [], bridges: [], roundabouts: [], culDeSacs: [] };
    const m = buildSharedMesh({
      ...none,
      water: [{ id: 'w', kind: 'river', points: [[0, 500], [10, 500], [20, 500]], widths: [24, 24, 12] }],
    });
    const at = (x: number): [number, number] => {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < m.positions.length; i += 3) {
        if (Math.abs(m.positions[i + 1]! - LAYER.water) > 1e-9 || m.positions[i] !== x) continue;
        lo = Math.min(lo, m.positions[i + 2]!); hi = Math.max(hi, m.positions[i + 2]!);
      }
      return [lo, hi];
    };
    expect(at(0)[1] - at(0)[0]).toBeCloseTo(24, 5);
    expect(at(20)[1] - at(20)[0]).toBeCloseTo(12, 5);
  });

  it('has a deck for every bridge, a roundabout disc per roundabout and a cul-de-sac disc per cul-de-sac', () => {
    const none: TownChunkShared = { ...index.shared, parks: [], water: [], bridges: [], roundabouts: [], culDeSacs: [] };
    const base = triangleCount(buildSharedMesh(none));
    const withBridges = triangleCount(buildSharedMesh({ ...none, bridges: index.shared.bridges }));
    const withRound = triangleCount(buildSharedMesh({ ...none, roundabouts: index.shared.roundabouts }));
    const withCul = triangleCount(buildSharedMesh({ ...none, culDeSacs: index.shared.culDeSacs }));
    expect(withBridges).toBeGreaterThan(base);
    expect((withBridges - base) % index.shared.bridges.length).toBe(0);
    expect((withRound - base) % index.shared.roundabouts.length).toBe(0);
    expect((withCul - base) % index.shared.culDeSacs.length).toBe(0);
    expect(index.shared.bridges.length).toBe(19);
    expect(index.shared.roundabouts.length).toBe(7);
  });

  it('signs: one instanced mesh per kind, every sign of the bake is in a group', () => {
    const all = chunks.flatMap((c) => c.signs);
    const g = signsByKind(all);
    expect(SIGN_KINDS.reduce((s, k) => s + g[k].length, 0)).toBe(all.length);
    expect(all.length).toBe(index.totals.signs);
  });

  it('the whole town fits the Low budget: <= 150 draw calls and <= 400k triangles', () => {
    const b = townDrawBudget(chunks, index.shared);
    expect(b.drawCalls).toBeLessThanOrEqual(150);
    expect(b.triangles).toBeLessThanOrEqual(400_000);
    // One call per non-empty chunk + shared + ground + sign kinds.
    expect(b.drawCalls).toBeLessThanOrEqual(chunks.length + 1 + 1 + SIGN_KINDS.length);
  });
});

describe('T4 dev scene flag', () => {
  it('needs ?town=roads or ?town=full, and dev mode', () => {
    expect(townDevRequested('?dev=1&town=roads', false)).toBe('roads');
    expect(townDevRequested('?dev=1&town=full', false)).toBe('full');
    expect(townDevRequested('?town=roads', true)).toBe('roads');
    expect(townDevRequested('?town=roads', false)).toBeNull();
    expect(townDevRequested('?dev=1', false)).toBeNull();
    expect(townDevRequested('?dev=1&town=other', false)).toBeNull();
  });
});