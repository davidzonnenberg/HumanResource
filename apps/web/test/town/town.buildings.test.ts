// T5: buildings of the baked town at three LODs. The recipe is fed with the bake's seed, width, depth and kind; the far
// LODs share footprint and heights with it; the hitbox is width x depth; the Low preset keeps the draw calls in budget.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { QUALITY, LOW_BUDGET } from '../../src/render/quality';
import { ARCHETYPES, DISTRICTS } from '../../src/render/procedural/buildings/archetypes';
import { buildingRecipeSchema } from '../../src/render/procedural/buildings/buildingRecipe.schema';
import { totalEaveHeight } from '../../src/render/procedural/buildings/buildingRecipe';
import { getBuildingMeshes } from '../../src/render/procedural/buildings/buildingGeometry';
import { chunkDirName } from '../../src/render/procedural/town/chunkTown';
import { buildChunkLod2, lod1Box, lod1Roof, treeDiscMesh, treeMesh } from '../../src/render/procedural/town/townBuildingMesh';
import {
  applyChunkOverrides, buildingHitbox, buildingYaw, chunkIsFar, chunksInRadius, distanceToChunk, floorsFor, footprintCorners,
  KIND_STYLE, lodForDistance, pickLod0, recipeForTownBuilding, shapeOf,
} from '../../src/render/procedural/town/townBuildings';
import { buildChunkMesh, buildSharedMesh, triangleCount, type MeshData } from '../../src/render/procedural/town/townRoadMesh';
import { parseTownChunk, parseTownChunkIndex, parseTownOverrides } from '../../src/render/procedural/town/townSchema';
import type { Building, BuildingKind, TownChunk } from '../../src/render/procedural/town/townTypes';
import overridesJson from '../../../../packages/content/data/maps/town-overrides.json';

const dir = join(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/content/data/maps/generated'), chunkDirName('start_city'));
const index = parseTownChunkIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
const chunks: TownChunk[] = index.chunks.map((c) => parseTownChunk(JSON.parse(readFileSync(join(dir, c.file), 'utf8'))));
const all: Building[] = chunks.flatMap((c) => c.buildings);
const KINDS = Object.keys(KIND_STYLE) as BuildingKind[];

function expectFacesLookAlongNormals(m: MeshData, what: string): void {
  let bad = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    const p = (i: number): number[] => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!], v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
    const cr = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    if (cr[0]! * m.normals[a * 3]! + cr[1]! * m.normals[a * 3 + 1]! + cr[2]! * m.normals[a * 3 + 2]! < -1e-9) bad++;
  }
  expect(bad, `${what}: faces turned away from their normal`).toBe(0);
  expect(m.positions.every(Number.isFinite), `${what}: finite`).toBe(true);
}

describe('T5 archetypes and recipes for the town kinds', () => {
  it('every town district only names known archetypes, and every kind has a district', () => {
    for (const k of KINDS) {
      const d = DISTRICTS[KIND_STYLE[k].district];
      expect(d, k).toBeDefined();
      for (const [id] of d!.archetypes) expect(ARCHETYPES[id], `${k}:${id}`).toBeDefined();
      const a = KIND_STYLE[k].archetype;
      if (a) expect(ARCHETYPES[a], `${k}:${a}`).toBeDefined();
    }
    for (const id of ['flat_block', 'office_block', 'tower_block', 'warehouse_shed', 'villa_house']) expect(ARCHETYPES[id], id).toBeDefined();
  });

  it('every building of the bake gets a valid recipe with the size, kind-appropriate floors and the bake colour', () => {
    for (const b of all) {
      const r = recipeForTownBuilding(b);
      const parsed = buildingRecipeSchema.safeParse(r);
      expect(parsed.success, `${b.id} (${b.kind}): ${parsed.success ? '' : JSON.stringify(parsed.error.issues[0])}`).toBe(true);
      expect(r.width, b.id).toBe(b.width);
      expect(r.depth, b.id).toBe(b.depth);
      expect(r.floorHeights.length, b.id).toBe(floorsFor(b));
      const [lo, hi] = KIND_STYLE[b.kind].floors;
      expect(r.floorHeights.length).toBeGreaterThanOrEqual(lo);
      expect(r.floorHeights.length).toBeLessThanOrEqual(hi);
      if (/^#/.test(b.colour)) expect(r.colours.brick).toBe(b.colour);
    }
  });

  it('is deterministic: same building, same recipe; another seed, another house', () => {
    const b = all.find((x) => x.kind === 'canal')!;
    expect(recipeForTownBuilding(b)).toEqual(recipeForTownBuilding({ ...b }));
    expect(recipeForTownBuilding({ ...b, seed: b.seed + 1 })).not.toEqual(recipeForTownBuilding(b));
  });

  it('the new kinds are really taller or wider than a canal house', () => {
    const eave = (k: BuildingKind): number => {
      const b = all.find((x) => x.kind === k);
      return b ? totalEaveHeight(recipeForTownBuilding(b)) : NaN;
    };
    expect(eave('tower')).toBeGreaterThan(eave('office'));
    expect(eave('office')).toBeGreaterThan(eave('villa'));
    expect(eave('tower')).toBeGreaterThan(25);
    expect(eave('warehouse')).toBeLessThan(14);
  });

  it('a fixed recipe from the overrides replaces the generated one', () => {
    const fixed = recipeForTownBuilding(all[0]!);
    const b: Building = { ...all[0]!, recipe: 'pub_cosy_local' };
    expect(recipeForTownBuilding(b, new Map([['pub_cosy_local', { ...fixed, signText: null }]]))).toEqual({ ...fixed, signText: null });
    expect(recipeForTownBuilding(b, new Map())).toEqual(recipeForTownBuilding(all[0]!)); // unknown fixed recipe: falls back to generated
  });

  it('applyChunkOverrides: remove, seed, colour, kind and recipe like applyOverrides', () => {
    const ov = parseTownOverrides(overridesJson);
    const [a, b] = [all[0]!, all[1]!];
    const out = applyChunkOverrides([a, b], { buildings: { [a.id]: { remove: true }, [b.id]: { seed: 7, colour: '#112233', kind: 'villa', recipe: 'x' } } });
    expect(out.map((x) => x.id)).toEqual([b.id]);
    expect(out[0]).toMatchObject({ seed: 7, colour: '#112233', kind: 'villa', recipe: 'x' });
    expect(applyChunkOverrides(all, ov).length).toBeLessThanOrEqual(all.length);
  });
});

describe('T5 hitbox and placement', () => {
  it('the hitbox is width x depth at the bake position', () => {
    for (const b of all) {
      const h = buildingHitbox(b);
      expect(h).toEqual({ x: b.x, z: b.z, angle: b.angle, width: b.width, depth: b.depth });
      const [p0, p1, p2] = footprintCorners(h);
      expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])).toBeCloseTo(b.width, 6);
      expect(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])).toBeCloseTo(b.depth, 6);
    }
  });

  it('the facade faces the road: yaw turns side R round, and the LOD0 facade direction points at the road', () => {
    expect(buildingYaw({ id: 'lane_0/L2', angle: 0.5 })).toBeCloseTo(-0.5, 9);
    expect(buildingYaw({ id: 'lane_0/R2', angle: 0.5 })).toBeCloseTo(-0.5 + Math.PI, 9);
    const roads = chunks.flatMap((c) => c.roads);
    let checked = 0, facing = 0;
    for (const b of all) {
      if (!b.roadId || b.kind === 'flat') continue; // flats can be turned 90 degrees to the road
      const road = roads.filter((r) => r.id === b.roadId);
      let best: [number, number] | null = null, bestD = Infinity;
      for (const r of road) for (const p of r.points) {
        const d = Math.hypot(p[0] - b.x, p[1] - b.z);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (!best) continue;
      const yaw = buildingYaw(b);
      const fx = Math.sin(yaw), fz = Math.cos(yaw); // local +z (the facade) under rotation.y = yaw
      const dot = (best[0] - b.x) * fx + (best[1] - b.z) * fz;
      checked++;
      if (dot > 0) facing++;
    }
    expect(checked).toBeGreaterThan(500);
    expect(facing / checked).toBeGreaterThan(0.97);
  });
});

describe('T5 LOD rules', () => {
  const low = QUALITY.low, high = QUALITY.high;
  it('lodForDistance follows the preset distances', () => {
    expect(lodForDistance(10, low)).toBe(0);
    expect(lodForDistance(low.lod0Distance, low)).toBe(1);
    expect(lodForDistance(low.lod1Distance - 1, low)).toBe(1);
    expect(lodForDistance(low.lod1Distance, low)).toBe(2);
    expect(lodForDistance(60, low)).toBe(1);
    expect(lodForDistance(60, high)).toBe(0);
  });

  it('pickLod0 keeps the nearest ones inside the cap, with 10 % hysteresis for ones that already have LOD0', () => {
    const cands = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, d: 5 + i }));
    const picked = pickLod0(cands, new Set(), low);
    expect(picked.length).toBe(low.maxLod0Buildings);
    expect(picked).toEqual(cands.slice(0, low.maxLod0Buildings).map((c) => c.id));
    const edge = [{ id: 'e', d: low.lod0Distance + 2 }];
    expect(pickLod0(edge, new Set(), low)).toEqual([]);
    expect(pickLod0(edge, new Set(['e']), low)).toEqual(['e']);
  });

  it('chunk rings and distances', () => {
    expect(chunksInRadius(300, 300, low.chunkRadius, 256).length).toBe(9);
    expect(chunksInRadius(300, 300, high.chunkRadius, 256).length).toBe(25);
    expect(distanceToChunk(1, 1, 256, 300, 300)).toBe(0);
    expect(distanceToChunk(0, 0, 256, 300, 300)).toBeCloseTo(Math.hypot(44, 44), 9);
    expect(chunkIsFar(distanceToChunk(0, 0, 256, 2000, 0), low)).toBe(true);
    expect(chunkIsFar(20, low)).toBe(false);
  });
});

describe('T5 meshes', () => {
  it('LOD2 chunk meshes are well formed and as tall as the recipe says', () => {
    for (const c of chunks) {
      const m = buildChunkLod2(c.buildings);
      expectFacesLookAlongNormals(m, `lod2 ${c.cx},${c.cz}`);
      if (c.buildings.length) expect(triangleCount(m)).toBeGreaterThan(0);
    }
    const t = all.find((b) => b.kind === 'tower')!;
    const m = buildChunkLod2([t]);
    let top = 0;
    for (let i = 1; i < m.positions.length; i += 3) top = Math.max(top, m.positions[i]!);
    const s = shapeOf(t);
    expect(top).toBeCloseTo(s.eave + 0.25, 6); // flat roof cap
    expect(s.rise).toBe(0);
  });

  it('LOD2 stays inside the footprint (plus the roof) for a rotated building', () => {
    const b = all.find((x) => x.kind === 'canal' && Math.abs(x.angle) > 0.3)!;
    const m = buildChunkLod2([b]);
    const h = buildingHitbox(b);
    const r = Math.hypot(h.width, h.depth) / 2 + 1e-6;
    for (let i = 0; i < m.positions.length; i += 3) expect(Math.hypot(m.positions[i]! - b.x, m.positions[i + 2]! - b.z)).toBeLessThanOrEqual(r);
  });

  it('LOD1 unit shapes: wall faces carry an axis and 0..1 uvs, the roof is plain', () => {
    const box = lod1Box(), roof = lod1Roof();
    expect(new Set(box.axes)).toEqual(new Set([0, 1, 2]));
    expect(new Set(roof.axes)).toEqual(new Set([2]));
    for (const s of [box, roof]) {
      expect(s.uvs.length / 2).toBe(s.positions.length / 3);
      expect(s.axes.length).toBe(s.positions.length / 3);
    }
    for (let i = 0; i < box.axes.length; i++) {
      const u = box.uvs[i * 2]!, v = box.uvs[i * 2 + 1]!;
      if (box.axes[i] !== 2) { expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
    expect(Math.max(...box.positions.filter((_, i) => i % 3 === 1))).toBe(1);
  });

  it('tree meshes are well formed and the disc is flat', () => {
    expectFacesLookAlongNormals(treeMesh(), 'tree');
    const d = treeDiscMesh();
    expectFacesLookAlongNormals(d, 'tree disc');
    expect(new Set(d.positions.filter((_, i) => i % 3 === 1)).size).toBe(1);
  });
});

describe('T5 Low budget', () => {
  /** Draw calls and triangles the dev scene would issue with the focus on (x, z), like TownBuildings/TownWorld decide it. */
  function frame(fx: number, fz: number, preset: 'low' | 'high'): { calls: number; tris: number } {
    const q = QUALITY[preset];
    const rings = chunksInRadius(fx, fz, q.chunkRadius, index.chunkSize);
    const built = chunks.filter((c) => rings.some(([cx, cz]) => c.cx === cx && c.cz === cz));
    let calls = 1 + 1 + 4 + 2 + 2; // ground, shared, sign kinds, trees (near + far), walls + roofs
    let tris = 2 + triangleCount(buildSharedMesh(index.shared)) + 40 * 10;
    for (const c of built) {
      calls += 1; tris += triangleCount(buildChunkMesh(c));
      if (chunkIsFar(distanceToChunk(c.cx, c.cz, index.chunkSize, fx, fz), q)) { calls += 1; tris += triangleCount(buildChunkLod2(c.buildings)); }
      else tris += c.buildings.length * 20;
    }
    const near = built
      .filter((c) => !chunkIsFar(distanceToChunk(c.cx, c.cz, index.chunkSize, fx, fz), q))
      .flatMap((c) => c.buildings)
      .map((b) => ({ b, d: Math.hypot(b.x - fx, b.z - fz) }))
      .filter((x) => x.d < q.lod0Distance)
      .sort((a, b) => a.d - b.d)
      .slice(0, q.maxLod0Buildings);
    for (const { b } of near) {
      const m = getBuildingMeshes(recipeForTownBuilding(b), b.colour, 'low');
      calls += Object.keys(m.geometries).length + m.movers.reduce((s, mv) => s + Object.keys(mv.geometries).length, 0);
      for (const g of Object.values(m.geometries)) tris += (g?.index?.count ?? g?.attributes.position?.count ?? 0) / 3;
      for (const mv of m.movers) for (const g of Object.values(mv.geometries)) tris += (g?.index?.count ?? g?.attributes.position?.count ?? 0) / 3;
    }
    return { calls, tris };
  }

  it('Low: at the busiest spots the scene stays within 150 draw calls and 400k triangles', () => {
    // Focus on the densest places: the middle of the centre and the 20 chunk cells with most buildings.
    const spots: Array<[number, number]> = [[index.shared.centre[0], index.shared.centre[1]]];
    const dense = [...chunks].sort((a, b) => b.buildings.length - a.buildings.length).slice(0, 6);
    for (const c of dense) {
      const mid = c.buildings[Math.floor(c.buildings.length / 2)]!;
      spots.push([mid.x, mid.z], [(c.cx + 0.5) * index.chunkSize, (c.cz + 0.5) * index.chunkSize]);
    }
    for (const [x, z] of spots) {
      const f = frame(x, z, 'low');
      expect(f.calls, `draw calls at ${x},${z}`).toBeLessThanOrEqual(LOW_BUDGET.drawCalls);
      expect(f.tris, `triangles at ${x},${z}`).toBeLessThanOrEqual(LOW_BUDGET.triangles);
    }
  }, 120_000);
});
