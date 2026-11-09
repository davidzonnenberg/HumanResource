// Path provider and cursor movement. Routes are stop lists; this module turns "go from here to
// there" into a polyline over the road graph. A traffic-aware provider can replace it later (46.5).
import type { Path } from '../state/types';
import { sq } from '../core/math';
import type { PathCache } from './pathCache';

export interface Point {
  x: number;
  z: number;
}

/**
 * Polyline from `from` onto the road network, along the shortest node path to `toNode`, then to
 * the optional final point. Mid-path starts are valid (criterion 7.9).
 */
export function buildPath(cache: PathCache, from: Point, toNode: string, finalPoint?: Point): Path {
  const pts: [number, number][] = [[from.x, from.z]];
  const target = cache.node(toNode);
  const entry = cache.nearestRoadPoint(from.x, from.z);
  if (target && entry) {
    const viaA = entry.distance + entryDist(cache, entry, entry.a) + cache.distance(entry.a, toNode);
    const viaB = entry.distance + entryDist(cache, entry, entry.b) + cache.distance(entry.b, toNode);
    const startNode = viaA <= viaB ? entry.a : entry.b;
    if (entry.distance > 0.01) pts.push([entry.x, entry.z]);
    for (const id of cache.nodePath(startNode, toNode)) {
      const nd = cache.node(id);
      if (nd) pushDistinct(pts, nd.x, nd.z);
    }
  }
  if (finalPoint) pushDistinct(pts, finalPoint.x, finalPoint.z);
  return { pts, seg: 0, along: 0 };
}

function entryDist(cache: PathCache, p: { x: number; z: number }, nodeId: string): number {
  const nd = cache.node(nodeId);
  return nd ? Math.sqrt(sq(nd.x - p.x) + sq(nd.z - p.z)) : Infinity;
}

function pushDistinct(pts: [number, number][], x: number, z: number): void {
  const last = pts[pts.length - 1];
  if (last && Math.abs(last[0] - x) < 1e-6 && Math.abs(last[1] - z) < 1e-6) return;
  pts.push([x, z]);
}

export function pathLength(path: Path): number {
  let len = 0;
  for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1] as [number, number];
    const b = path.pts[i] as [number, number];
    len += Math.sqrt(sq(b[0] - a[0]) + sq(b[1] - a[1]));
  }
  return len;
}

export function pathPosition(path: Path): Point {
  const a = path.pts[path.seg] as [number, number];
  const b = path.pts[path.seg + 1];
  if (!b) return { x: a[0], z: a[1] };
  const len = Math.sqrt(sq(b[0] - a[0]) + sq(b[1] - a[1]));
  const t = len === 0 ? 1 : Math.min(1, path.along / len);
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t };
}

/** Advances the cursor by `distance`. Returns true when the end of the path is reached. */
export function advancePath(path: Path, distance: number): boolean {
  let left = distance;
  while (left > 0 && path.seg < path.pts.length - 1) {
    const a = path.pts[path.seg] as [number, number];
    const b = path.pts[path.seg + 1] as [number, number];
    const len = Math.sqrt(sq(b[0] - a[0]) + sq(b[1] - a[1]));
    const remaining = len - path.along;
    if (left < remaining) {
      path.along += left;
      left = 0;
    } else {
      left -= remaining;
      path.seg += 1;
      path.along = 0;
    }
  }
  return path.seg >= path.pts.length - 1;
}

export const distance = (a: Point, b: Point): number => Math.sqrt(sq(a.x - b.x) + sq(a.z - b.z));
