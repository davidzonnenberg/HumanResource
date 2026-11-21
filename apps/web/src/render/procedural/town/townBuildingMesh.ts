// T5/T6: mesh data for the far LODs and for trees. Pure (no three), same MeshData as the road meshes.
//   buildChunkLod2   every building of one chunk as one vertex-coloured mesh (box + roof), world coordinates
//   lod1Box/lod1Roof unit shapes for the instanced LOD1; the instance matrix scales them to the building
//   treeMesh / treeDiscMesh   a low-poly tree (near) and a flat disc (far), radius 1, to be instanced
import { shapeOf, type BuildingShape, type FixedRecipes } from './townBuildings';
import { Builder, hexToRgb, shade, type MeshData, type V3 } from './townRoadMesh';
import type { Building } from './townTypes';

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Gable roof on a footprint of `len` (local x) by `wid` (local z), ridge along local z, base at height y, `rise` high.
 * Both slopes and both gable ends; no underside.
 */
export function addPrism(b: Builder, cx: number, cz: number, angle: number, len: number, wid: number, y: number, rise: number, roof: V3, gable: V3): void {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const P = (lx: number, ly: number, lz: number): V3 => [cx + lx * ca - lz * sa, ly, cz + lx * sa + lz * ca];
  const N = (lx: number, ly: number, lz: number): V3 => norm([lx * ca - lz * sa, ly, lx * sa + lz * ca]);
  const hl = len / 2, hw = wid / 2, top = y + rise;
  b.quad(P(-hl, y, -hw), P(-hl, y, hw), P(0, top, hw), P(0, top, -hw), N(-rise, hl, 0), roof);
  b.quad(P(hl, y, -hw), P(hl, y, hw), P(0, top, hw), P(0, top, -hw), N(rise, hl, 0), shade(roof, 0.92));
  b.tri(P(-hl, y, hw), P(hl, y, hw), P(0, top, hw), N(0, 0, 1), gable);
  b.tri(P(-hl, y, -hw), P(hl, y, -hw), P(0, top, -hw), N(0, 0, -1), gable);
}

/** One building as walls and roof (world coordinates). */
function addBuilding(b: Builder, bd: Building, s: BuildingShape): void {
  const wall = hexToRgb(s.wall);
  b.box(bd.x, bd.z, bd.angle, bd.width, bd.depth, 0, s.eave, wall);
  if (s.rise <= 0) {
    // Flat roof: a slim parapet-coloured cap so the top reads as a roof, not as a wall.
    b.box(bd.x, bd.z, bd.angle, bd.width, bd.depth, s.eave, s.eave + 0.25, shade(hexToRgb(s.roof), 0.9));
    return;
  }
  const roof = hexToRgb(s.roof), gable = shade(wall, 0.95);
  if (s.ridge === 'depth') addPrism(b, bd.x, bd.z, bd.angle, bd.width, bd.depth, s.eave, s.rise, roof, gable);
  else addPrism(b, bd.x, bd.z, bd.angle + Math.PI / 2, bd.depth, bd.width, s.eave, s.rise, roof, gable);
}

/** LOD2: the whole chunk as one mesh. */
export function buildChunkLod2(buildings: readonly Building[], fixed?: FixedRecipes): MeshData {
  const b = new Builder();
  for (const bd of buildings) addBuilding(b, bd, shapeOf(bd, fixed));
  return b.m;
}

// ---------- LOD1: unit shapes for instancing ----------
export interface InstancedShape {
  positions: number[];
  normals: number[];
  /** 0..1 across the face; the shader scales it by the instance size so windows keep their size in metres. */
  uvs: number[];
  /** 0: faces along x (u runs along z), 1: faces along z (u runs along x), 2: top, roof: plain colour. */
  axes: number[];
  indices: number[];
}

function toInstanced(m: MeshData, plain: boolean): InstancedShape {
  const uvs: number[] = [], axes: number[] = [];
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i]!, y = m.positions[i + 1]!, z = m.positions[i + 2]!;
    const nx = Math.abs(m.normals[i]!), ny = Math.abs(m.normals[i + 1]!), nz = Math.abs(m.normals[i + 2]!);
    const axis = plain || ny >= nx && ny >= nz ? 2 : nx > nz ? 0 : 1;
    axes.push(axis);
    if (axis === 0) uvs.push(z + 0.5, y);
    else if (axis === 1) uvs.push(x + 0.5, y);
    else uvs.push(0, 0);
  }
  return { positions: m.positions, normals: m.normals, uvs, axes, indices: m.indices };
}

/** Box of 1 x 1 x 1 on the ground (x, z centred), no underside. Instance scale = (width, eave height, depth). */
export function lod1Box(): InstancedShape {
  const b = new Builder();
  b.box(0, 0, 0, 1, 1, 0, 1, [1, 1, 1]);
  return toInstanced(b.m, false);
}

/** Gable roof of 1 x 1 x 1, ridge along z. Instance: scale (width, rise, depth) at the eave; turned 90 degrees for a ridge along x. */
export function lod1Roof(): InstancedShape {
  const b = new Builder();
  addPrism(b, 0, 0, 0, 1, 1, 0, 1, [1, 1, 1], [1, 1, 1]);
  return toInstanced(b.m, true);
}

// ---------- trees ----------
function cone(b: Builder, r: number, y0: number, y1: number, col: V3, segs = 7): void {
  const h = y1 - y0;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, m = (a0 + a1) / 2;
    b.tri([0, y1, 0], [Math.cos(a0) * r, y0, Math.sin(a0) * r], [Math.cos(a1) * r, y0, Math.sin(a1) * r], norm([Math.cos(m) * h, r, Math.sin(m) * h]), col);
  }
}

/** A tree of radius 1 (canopy): trunk and two cones, about 3 m high. Scale it by the radius from the bake. */
export function treeMesh(): MeshData {
  const b = new Builder();
  b.box(0, 0, 0, 0.3, 0.3, 0, 1, hexToRgb('#6b4a32'));
  cone(b, 1, 0.7, 2.4, hexToRgb('#4f9a3a'));
  cone(b, 0.7, 1.6, 3.1, hexToRgb('#5aa944'));
  return b.m;
}

/** A tree seen from afar: a flat disc lying on the ground (the camera looks down, so it reads like a billboard). */
export function treeDiscMesh(): MeshData {
  const b = new Builder();
  b.disc(0, 0, 1, 0.4, hexToRgb('#4f9a3a'), 8);
  return b.m;
}
