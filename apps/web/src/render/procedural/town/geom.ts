import type { Vec2 } from './townTypes';

export function segIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r1 = b[0] - a[0], r2 = b[1] - a[1], s1 = d[0] - c[0], s2 = d[1] - c[1];
  const den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s2 - (c[1] - a[1]) * s1) / den;
  const u = ((c[0] - a[0]) * r2 - (c[1] - a[1]) * r1) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + r1 * t, a[1] + r2 * t];
}

/** Cumulative length per point. */
export function measure(p: Vec2[]): number[] {
  const c = [0];
  for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return c;
}

export interface Sample { x: number; z: number; tx: number; tz: number }

/** Point + unit tangent at distance s along a polyline. */
export function sampleAt(p: Vec2[], c: number[], s: number): Sample {
  let i = 1;
  while (i < c.length - 1 && c[i] < s) i++;
  const a = p[i - 1], b = p[i], L = c[i] - c[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (s - c[i - 1]) / L));
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / L, tz: (b[1] - a[1]) / L };
}

export function catmullRom(P: Vec2[], seg: number): Vec2[] {
  const o: Vec2[] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[Math.max(i - 1, 0)], b = P[i], c = P[i + 1], d = P[Math.min(i + 2, P.length - 1)];
    for (let j = 0; j < seg; j++) {
      const t = j / seg, t2 = t * t, t3 = t2 * t;
      const f = (k: 0 | 1) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
      o.push([f(0), f(1)]);
    }
  }
  o.push(P[P.length - 1]);
  return o;
}

/** Parallel offset of a polyline (positive = left of travel direction in x/z screen space). */
export function offsetLine(p: Vec2[], d: number): Vec2[] {
  return p.map((q, i) => {
    const a = p[Math.max(i - 1, 0)], b = p[Math.min(i + 1, p.length - 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return [q[0] - (dz / L) * d, q[1] + (dx / L) * d] as Vec2;
  });
}

export function pointInPolygon(P: Vec2[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

export function bbox(P: Vec2[]): [number, number, number, number] {
  const a: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const q of P) { a[0] = Math.min(a[0], q[0]); a[1] = Math.min(a[1], q[1]); a[2] = Math.max(a[2], q[0]); a[3] = Math.max(a[3], q[1]); }
  return a;
}
