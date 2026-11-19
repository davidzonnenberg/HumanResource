/**
 * Builds the van as two cached, merged, vertex-coloured geometries:
 * one body (per model key + owner colour) and one wheel (per model key).
 * One shared matte material, no textures, no shadows: chunky toy style.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PartColour, VanPart, VanRecipe, WheelSpec } from './vanRecipe';

export const VAN_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });

const WHITE = new THREE.Color('#ffffff');

export function resolveColour(c: PartColour, ownerHex: string): THREE.Color {
  const owner = new THREE.Color(ownerHex);
  if (c === 'owner') return owner;
  if (c === 'ownerDark') return owner.multiplyScalar(0.62);
  if (c === 'ownerLight') return owner.lerp(WHITE, 0.45);
  return new THREE.Color(c);
}

function shapeGeometry(p: VanPart): THREE.BufferGeometry {
  const seg = p.segments;
  if (p.shape === 'cylinder') {
    const g = new THREE.CylinderGeometry(p.radius, p.radius, p.length, seg ?? 24);
    if (p.axis === 'x') g.rotateZ(Math.PI / 2);
    if (p.axis === 'z') g.rotateX(Math.PI / 2);
    return g;
  }
  const [w, h, d] = p.size;
  if (p.shape === 'roundedBox') {
    const r = Math.min(p.radius ?? 0.05, Math.min(w, h, d) / 2 - 0.001);
    return new RoundedBoxGeometry(w, h, d, seg ?? 3, Math.max(r, 0.001));
  }
  return new THREE.BoxGeometry(w, h, d);
}

function paintedPart(p: VanPart, ownerHex: string, mirror: boolean): THREE.BufferGeometry {
  let g = shapeGeometry(p);
  const rot = p.rot ?? [0, 0, 0];
  const rx = mirror ? -rot[0] : rot[0];
  const ry = mirror ? -rot[1] : rot[1];
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rot[2]) g.rotateZ(rot[2]);
  g.translate(p.pos[0], p.pos[1], mirror ? -p.pos[2] : p.pos[2]);
  if (g.index) {
    const ni = g.toNonIndexed();
    g.dispose();
    g = ni;
  }
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  const col = resolveColour(p.colour, ownerHex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function mergeParts(parts: VanPart[], ownerHex: string): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (const p of parts) {
    geos.push(paintedPart(p, ownerHex, false));
    if (p.mirrorZ) geos.push(paintedPart(p, ownerHex, true));
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) throw new Error('van geometry merge failed');
  merged.computeBoundingSphere();
  return merged;
}

function wheelParts(w: WheelSpec): VanPart[] {
  const r = w.radius;
  const parts: VanPart[] = [
    { shape: 'cylinder', radius: r, length: w.width, axis: 'z', pos: [0, 0, 0], colour: w.tyreColour, segments: 28 },
    { shape: 'cylinder', radius: r * 0.62, length: w.width + 0.02, axis: 'z', pos: [0, 0, 0], colour: w.rimColour, segments: 24 },
    { shape: 'cylinder', radius: r * 0.2, length: w.width + 0.05, axis: 'z', pos: [0, 0, 0], colour: w.hubColour, segments: 16 },
  ];
  for (let i = 0; i < w.spokes; i++) {
    parts.push({ shape: 'box', size: [r * 1.12, r * 0.13, w.width + 0.035], pos: [0, 0, 0], rot: [0, 0, (i * Math.PI) / w.spokes], colour: w.hubColour });
  }
  return parts;
}

const bodyCache = new Map<string, THREE.BufferGeometry>();
const wheelCache = new Map<string, THREE.BufferGeometry>();

/** Cached per model key + owner colour. Owners are few, so the cache stays small. */
export function getVanBodyGeometry(modelKey: string, recipe: VanRecipe, ownerHex: string): THREE.BufferGeometry {
  const key = `${modelKey}|${ownerHex.toLowerCase()}`;
  let g = bodyCache.get(key);
  if (!g) {
    g = mergeParts(recipe.parts, ownerHex);
    bodyCache.set(key, g);
  }
  return g;
}

/** Wheels don't use owner colours, so one geometry per model key. */
export function getVanWheelGeometry(modelKey: string, wheels: WheelSpec): THREE.BufferGeometry {
  let g = wheelCache.get(modelKey);
  if (!g) {
    g = mergeParts(wheelParts(wheels), '#ffffff');
    wheelCache.set(modelKey, g);
  }
  return g;
}

/** For hot reload or a content change in dev. */
export function clearVanGeometryCache(): void {
  bodyCache.forEach((g) => g.dispose());
  wheelCache.forEach((g) => g.dispose());
  bodyCache.clear();
  wheelCache.clear();
}
