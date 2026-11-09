// District-aware path cache (Requirements 46.5, 48.5–48.7). The routable graph is the union of
// unlocked Districts plus connectors whose two Districts are unlocked. All-pairs shortest paths
// are precomputed (Floyd–Warshall, deterministic tie-breaking by node order). Derived data: it
// is memoised per registry + unlocked set and never saved.
import type { DefinitionRegistry, RoadNode } from '../defs/registry';
import { pointInOrOnPolygon } from '../defs/registry';
import { sq } from '../core/math';

export interface RoadPoint {
  x: number;
  z: number;
  a: string; // edge endpoints
  b: string;
  t: number; // 0..1 along a->b
  distance: number; // from the query point
}

export interface PathCache {
  readonly key: string;
  readonly unlocked: readonly string[];
  readonly nodeIds: readonly string[];
  node(id: string): RoadNode | undefined;
  hasNode(id: string): boolean;
  distance(a: string, b: string): number;
  /** Node ids from a to b inclusive; [] if unreachable. */
  nodePath(a: string, b: string): string[];
  nearestRoadPoint(x: number, z: number): RoadPoint | null;
  walkable(x: number, z: number): boolean;
  drivable(x: number, z: number): boolean;
  /** Combined bounding box of the unlocked Districts. */
  bounds(): { minX: number; maxX: number; minZ: number; maxZ: number };
}

const cacheByRegistry = new WeakMap<DefinitionRegistry, Map<string, PathCache>>();

export function unlockedDistricts(districts: Record<string, { unlocked: boolean }>): string[] {
  return Object.keys(districts)
    .filter((d) => districts[d]?.unlocked)
    .sort();
}

export function pathCacheFor(reg: DefinitionRegistry, unlocked: readonly string[]): PathCache {
  const sorted = [...unlocked].sort();
  const key = sorted.join(',');
  let perReg = cacheByRegistry.get(reg);
  if (!perReg) {
    perReg = new Map();
    cacheByRegistry.set(reg, perReg);
  }
  const hit = perReg.get(key);
  if (hit) return hit;
  const built = buildCache(reg, sorted, key);
  perReg.set(key, built);
  return built;
}

function buildCache(reg: DefinitionRegistry, unlocked: string[], key: string): PathCache {
  const open = new Set(unlocked);
  const nodes = Object.values(reg.world.nodes).filter((n) => open.has(n.districtId));
  const nodeIds = nodes.map((n) => n.id);
  const index = new Map(nodeIds.map((id, i) => [id, i] as const));
  const n = nodeIds.length;
  const dist: number[] = new Array<number>(n * n).fill(Infinity);
  const next: number[] = new Array<number>(n * n).fill(-1);
  for (let i = 0; i < n; i++) {
    dist[i * n + i] = 0;
    next[i * n + i] = i;
  }
  const edges = reg.world.edges.filter((e) => index.has(e.a) && index.has(e.b));
  for (const e of edges) {
    const a = index.get(e.a) as number;
    const b = index.get(e.b) as number;
    if (e.length < (dist[a * n + b] as number)) {
      dist[a * n + b] = e.length;
      dist[b * n + a] = e.length;
      next[a * n + b] = b;
      next[b * n + a] = a;
    }
  }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++) {
      const ik = dist[i * n + k] as number;
      if (ik === Infinity) continue;
      for (let j = 0; j < n; j++) {
        const alt = ik + (dist[k * n + j] as number);
        if (alt < (dist[i * n + j] as number) - 1e-9) {
          dist[i * n + j] = alt;
          next[i * n + j] = next[i * n + k] as number;
        }
      }
    }

  const polys = (kind: 'walkableBounds' | 'drivableBounds') => unlocked.map((d) => reg.world.districts[d]?.def[kind]).filter((p) => p !== undefined);
  const walkPolys = polys('walkableBounds');
  const drivePolys = polys('drivableBounds');
  const allPts = unlocked.flatMap((d) => reg.world.districts[d]?.def.bounds ?? []);
  const bbox = {
    minX: Math.min(...allPts.map((p) => p[0])),
    maxX: Math.max(...allPts.map((p) => p[0])),
    minZ: Math.min(...allPts.map((p) => p[1])),
    maxZ: Math.max(...allPts.map((p) => p[1])),
  };

  return {
    key,
    unlocked,
    nodeIds,
    node: (id) => (index.has(id) ? reg.world.nodes[id] : undefined),
    hasNode: (id) => index.has(id),
    distance(a, b) {
      const ia = index.get(a);
      const ib = index.get(b);
      if (ia === undefined || ib === undefined) return Infinity;
      return dist[ia * n + ib] as number;
    },
    nodePath(a, b) {
      let ia = index.get(a);
      const ib = index.get(b);
      if (ia === undefined || ib === undefined || next[ia * n + ib] === -1) return [];
      const out = [a];
      while (ia !== ib) {
        ia = next[ia * n + ib] as number;
        out.push(nodeIds[ia] as string);
      }
      return out;
    },
    nearestRoadPoint(x, z) {
      let best: RoadPoint | null = null;
      for (const e of edges) {
        const A = reg.world.nodes[e.a] as RoadNode;
        const B = reg.world.nodes[e.b] as RoadNode;
        const dx = B.x - A.x;
        const dz = B.z - A.z;
        const len2 = dx * dx + dz * dz;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / len2));
        const px = A.x + dx * t;
        const pz = A.z + dz * t;
        const d = Math.sqrt(sq(x - px) + sq(z - pz));
        if (!best || d < best.distance - 1e-9) best = { x: px, z: pz, a: e.a, b: e.b, t, distance: d };
      }
      if (!best && nodes[0]) {
        const n0 = nodes[0];
        best = { x: n0.x, z: n0.z, a: n0.id, b: n0.id, t: 0, distance: Math.sqrt(sq(x - n0.x) + sq(z - n0.z)) };
      }
      return best;
    },
    walkable: (x, z) => walkPolys.some((p) => pointInOrOnPolygon(x, z, p)),
    drivable: (x, z) => drivePolys.some((p) => pointInOrOnPolygon(x, z, p)),
    bounds: () => bbox,
  };
}
