// T3: the chunked bake. The union of the chunks must equal the monolithic bake (nothing lost, only clipped road parts
// repeated), and the committed chunk files must be what `town:bake` would write from the committed bake.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import bakeJson from '../../../../packages/content/data/maps/generated/town-start_city.json';
import {
  CHUNK_SIZE, chunkDirName, chunkTown, clipPolyline, mergeRoadPieces, unionChunks,
} from '../../src/render/procedural/town/chunkTown';
import { parseTownChunk, parseTownChunkIndex, parseTownData } from '../../src/render/procedural/town/townSchema';
import type { Road, TownChunk, TownData, Vec2 } from '../../src/render/procedural/town/townTypes';
import { townFor } from './townHelpers';

const bake = parseTownData(bakeJson, 'town-start_city.json');
const SIZE = CHUNK_SIZE;
/** Border points are rounded to 0.01 m, so a cut road can differ from the original by up to ~0.007 m per new point. */
const PER_POINT = 0.01;

const len = (p: Vec2[]): number => p.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - p[i - 1]![0], q[1] - p[i - 1]![1]) : 0), 0);
const onBorder = (q: Vec2): boolean => q[0] % SIZE === 0 || q[1] % SIZE === 0;

/** `orig` must appear in `merged` as an ordered subsequence; every other point must lie on a chunk border. Returns the number of extras. */
function expectSameLine(orig: Vec2[], merged: Vec2[], id: string): number {
  let j = 0;
  const extra: Vec2[] = [];
  for (const q of merged) {
    const o = orig[j];
    if (o && o[0] === q[0] && o[1] === q[1]) j++;
    else extra.push(q);
  }
  expect(j, `${id}: all original points present, in order`).toBe(orig.length);
  for (const q of extra) expect(onBorder(q), `${id}: new point ${q} is on a chunk border`).toBe(true);
  expect(Math.abs(len(merged) - len(orig)), `${id}: same length`).toBeLessThanOrEqual(PER_POINT * extra.length + 1e-6);
  return extra.length;
}

/** Everything the chunk set must give back: nothing lost, nothing doubled, roads re-join. */
function unionProblems(town: TownData, chunks: TownChunk[]): string[] {
  const out: string[] = [];
  const u = unionChunks(chunks);
  const ids = (l: Array<{ id: string }>) => l.map((x) => x.id).sort();
  if (JSON.stringify(ids(u.buildings)) !== JSON.stringify(ids(town.buildings))) out.push('building ids differ');
  const full = new Map(town.buildings.map((b) => [b.id, JSON.stringify(b)]));
  for (const b of u.buildings) if (full.get(b.id) !== JSON.stringify(b)) out.push(`building ${b.id} changed`);
  if (JSON.stringify(ids(u.signs)) !== JSON.stringify(ids(town.signs))) out.push('sign ids differ');
  const key = (t: number[]) => t.join(',');
  if (JSON.stringify(u.trees.map(key).sort()) !== JSON.stringify(town.trees.map(key).sort())) out.push('trees differ');
  if (JSON.stringify(ids(u.roads)) !== JSON.stringify(ids(town.roads))) out.push('road ids differ');
  const orig = new Map<string, Road>([[town.highway.id, town.highway], ...town.roads.map((r) => [r.id, r] as [string, Road])]);
  for (const r of [...u.roads, ...(u.highway ? [u.highway] : [])]) {
    const o = orig.get(r.id);
    if (!o) { out.push(`unknown road ${r.id}`); continue; }
    const { points: _a, ...restMerged } = r;
    const { points: _b, ...restOrig } = o;
    if (JSON.stringify(restMerged) !== JSON.stringify(restOrig)) out.push(`road ${r.id} fields changed`);
  }
  if (u.highway?.id !== town.highway.id) out.push('highway missing');
  return out;
}

describe('clipPolyline', () => {
  it('leaves a polyline inside one chunk as one part', () => {
    expect(clipPolyline([[10, 10], [100, 50], [200, 200]])).toEqual([{ cx: 0, cz: 0, points: [[10, 10], [100, 50], [200, 200]] }]);
  });

  it('cuts at a vertical border and keeps both sides', () => {
    const parts = clipPolyline([[200, 100], [312, 100]]);
    expect(parts).toEqual([
      { cx: 0, cz: 0, points: [[200, 100], [256, 100]] },
      { cx: 1, cz: 0, points: [[256, 100], [312, 100]] },
    ]);
  });

  it('cuts a diagonal through a corner into the right chunks', () => {
    const parts = clipPolyline([[200, 200], [312, 312]]);
    expect(parts.map((p) => [p.cx, p.cz])).toEqual([[0, 0], [1, 1]]);
    expect(parts[0]!.points.at(-1)).toEqual([256, 256]);
  });

  it('gives negative chunk indices outside the top-left corner', () => {
    expect(clipPolyline([[-30, 20], [10, 20]]).map((p) => [p.cx, p.cz])).toEqual([[-1, 0], [0, 0]]);
  });

  it('handles vertices exactly on a border and repeated points', () => {
    const parts = clipPolyline([[256, 10], [300, 10], [300, 10], [100, 10]]);
    expect(parts.map((p) => [p.cx, p.cz])).toEqual([[1, 0], [0, 0]]);
  });

  // Feature: procedural-town, Property 2: clipping a polyline loses nothing
  it('Property 2: pieces of any polyline join up, stay in their chunk and add only border points', () => {
    const pt = fc.tuple(fc.integer({ min: -4000, max: 12000 }), fc.integer({ min: -4000, max: 12000 }))
      .map(([x, z]) => [x / 10, z / 10] as Vec2);
    fc.assert(
      fc.property(fc.array(pt, { minLength: 2, maxLength: 12 }), (points) => {
        const parts = clipPolyline(points);
        for (const p of parts) {
          expect(p.points.length).toBeGreaterThanOrEqual(2);
          for (const q of p.points) {
            expect(q[0]).toBeGreaterThanOrEqual(p.cx * SIZE - 1e-9);
            expect(q[0]).toBeLessThanOrEqual((p.cx + 1) * SIZE + 1e-9);
            expect(q[1]).toBeGreaterThanOrEqual(p.cz * SIZE - 1e-9);
            expect(q[1]).toBeLessThanOrEqual((p.cz + 1) * SIZE + 1e-9);
          }
        }
        const piece = parts.map((p, i) => ({ id: 'r', kind: 'lane' as const, zone: 'core', width: 3, surface: 'asphalt' as const, points: p.points, piece: i, pieces: parts.length }));
        expectSameLine(points, mergeRoadPieces(piece).points, 'r');
      }),
      { numRuns: 200 },
    );
  });
});

describe('chunkTown on the committed bake', () => {
  const { index, chunks } = chunkTown(bake);
  const list = Object.values(chunks);

  it('writes an index and chunks that pass their schemas', () => {
    parseTownChunkIndex(index);
    for (const [file, c] of Object.entries(chunks)) parseTownChunk(c, file);
    expect(index.chunks.map((c) => c.file)).toEqual(Object.keys(chunks));
    expect(index.chunkSize).toBe(256);
    expect(index.chunks.length).toBeGreaterThan(1);
  });

  it('the union of the chunks equals the monolithic bake', () => {
    expect(unionProblems(bake, list)).toEqual([]);
  });

  it('keeps the totals and everything that is not chunked in the index', () => {
    expect(index.totals).toEqual({ roads: bake.roads.length, buildings: bake.buildings.length, trees: bake.trees.length, signs: bake.signs.length });
    const { roads: _r, highway: _h, buildings: _b, trees: _t, signs: _s, version: _v, briefId: _i, seed: _e, size: _z, ...rest } = bake;
    expect(index.shared).toEqual(rest);
  });

  it('every building, tree and sign is in the chunk of its centre point', () => {
    for (const c of list) {
      const inside = (x: number, z: number) => Math.floor(x / SIZE) === c.cx && Math.floor(z / SIZE) === c.cz;
      for (const b of c.buildings) expect(inside(b.x, b.z), b.id).toBe(true);
      for (const t of c.trees) expect(inside(t[0], t[1])).toBe(true);
      for (const s of c.signs) expect(inside(s.x, s.z), s.id).toBe(true);
    }
  });

  it('cuts roads that cross a chunk border: the id stays, the pieces re-join, only border points are new', () => {
    const cut = new Map<string, number>();
    for (const c of list) for (const p of [...c.roads, ...c.highway]) cut.set(p.id, (cut.get(p.id) ?? 0) + 1);
    const crossing = [...cut].filter(([, n]) => n > 1);
    expect(crossing.length).toBeGreaterThan(0);
    const orig = new Map<string, Road>([[bake.highway.id, bake.highway], ...bake.roads.map((r) => [r.id, r] as [string, Road])]);
    for (const [rid] of crossing) {
      const pieces = list.flatMap((c) => [...c.roads, ...c.highway]).filter((p) => p.id === rid);
      expectSameLine(orig.get(rid)!.points, mergeRoadPieces(pieces).points, rid);
    }
    // A road that stays in one chunk is not touched.
    for (const [rid, n] of cut) if (n === 1) expect(list.flatMap((c) => [...c.roads, ...c.highway]).find((p) => p.id === rid)!.points).toEqual(orig.get(rid)!.points);
  });

  it('the highway is cut like any road', () => {
    expect(list.some((c) => c.highway.length > 0)).toBe(true);
    expect(list.flatMap((c) => c.highway).length).toBeGreaterThan(1);
  });
});

describe('chunkTown on generated towns (any seed)', () => {
  // Feature: procedural-town, Property 3: the union of the chunks equals the bake
  it('Property 3: the union of the chunks equals the bake for other seeds', () => {
    for (const seed of ['v2', 'chunk-a', 'chunk-b']) {
      const t = townFor(seed);
      expect(unionProblems(t, Object.values(chunkTown(t).chunks)), seed).toEqual([]);
    }
  }, 120_000);

  it('is deterministic', () => {
    expect(JSON.stringify(chunkTown(bake))).toBe(JSON.stringify(chunkTown(bake)));
  });
});

describe('committed chunk files generated/town-start_city/', () => {
  const findRoot = (d: string): string => (existsSync(join(d, 'scripts/town-bake.ts')) || dirname(d) === d ? d : findRoot(dirname(d)));
  const dir = resolve(findRoot(process.cwd()), 'packages/content/data/maps/generated', chunkDirName(bake.briefId));
  const { index, chunks } = chunkTown(bake);

  it('exist and are exactly what `town:bake -- start_city --chunks` writes from the committed bake', () => {
    expect(existsSync(dir), `${dir} missing: run npm.cmd run town:bake -- start_city --chunks`).toBe(true);
    const files = readdirSync(dir).sort();
    expect(files).toEqual(['index.json', ...Object.keys(chunks)].sort());
    expect(readFileSync(join(dir, 'index.json'), 'utf8')).toBe(JSON.stringify(index));
    for (const [file, c] of Object.entries(chunks)) expect(readFileSync(join(dir, file), 'utf8'), file).toBe(JSON.stringify(c));
  });

  it('the files on disk pass their schemas and their union equals the committed bake', () => {
    const idx = parseTownChunkIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
    const onDisk = idx.chunks.map((c) => parseTownChunk(JSON.parse(readFileSync(join(dir, c.file), 'utf8')), c.file));
    expect(unionProblems(bake, onDisk)).toEqual([]);
    expect(onDisk.reduce((n, c) => n + c.buildings.length, 0)).toBe(idx.totals.buildings);
  });
});
