/**
 * Dutch gable outlines as pure 2D data (no three.js), so they are testable.
 * Coordinates: x across the facade (centre 0), y up from the eave line (0).
 * Outlines are counter-clockwise polygons without a repeated last point.
 * They start at (hw, 0), run up the right side, over the top and end at (-hw, 0),
 * so the outline is also the open path for the moulded rim tube.
 */
export type Pt = [number, number];
export type GableKind = 'triangle' | 'step' | 'neck' | 'bell' | 'spout' | 'cornice' | 'flat';

export interface GableLayout {
  /** null for 'cornice' and 'flat' (no gable). */
  outline: Pt[] | null;
  /** Ball ornaments, at outline positions. */
  finials: Pt[];
  /** Chunky cap blocks (step gables): outer top corner of each step, both sides, plus the top. */
  caps: Pt[];
  /** Centre height of the optional gable window, null when there is no room. */
  windowCentreY: number | null;
  windowMaxWidth: number;
  /** Height of the roof ridge behind the gable (above the eave line). */
  ridgeHeight: number;
}

function quadBezier(p0: Pt, c: Pt, p1: Pt, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    out.push([a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]]);
  }
  return out;
}

/** right: points from (hw,0) up the right side, all with x > 0. apex: optional top point at x = 0. */
function mirrored(right: Pt[], apex: Pt | null): Pt[] {
  const left = right
    .slice()
    .reverse()
    .map(([x, y]): Pt => [-x, y]);
  return apex ? [...right, apex, ...left] : [...right, ...left];
}

export function gableLayout(kind: GableKind, halfWidth: number, height: number): GableLayout {
  const hw = halfWidth;
  const h = height;
  switch (kind) {
    case 'triangle':
      return { outline: mirrored([[hw, 0]], [0, h]), finials: [[0, h]], caps: [], windowCentreY: h * 0.32, windowMaxWidth: hw * 0.7, ridgeHeight: h };
    case 'step': {
      const n = hw > 2.2 ? 4 : 3;
      const tw = Math.max(0.35, hw * 0.28);
      const sy = h / (n + 1);
      const sx = (hw - tw) / n;
      const right: Pt[] = [
        [hw, 0],
        [hw, sy],
      ];
      for (let i = 1; i <= n; i++) {
        const x = hw - i * sx;
        right.push([x, i * sy], [x, (i + 1) * sy]);
      }
      const caps: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const x = hw - i * sx;
        caps.push([x, (i + 1) * sy], [-x, (i + 1) * sy]);
      }
      caps.push([0, h]);
      return { outline: mirrored(right, null), finials: [], caps, windowCentreY: sy * 1.4, windowMaxWidth: Math.min(hw * 0.9, (hw - sx) * 1.4), ridgeHeight: h * 0.97 };
    }
    case 'neck': {
      const nw = Math.max(0.4, hw * 0.38);
      const right: Pt[] = [[hw, 0], [hw, h * 0.1], ...quadBezier([hw, h * 0.1], [nw, h * 0.12], [nw, h * 0.5], 8), [nw, h * 0.82]];
      return {
        outline: mirrored(right, [0, h]),
        finials: [
          [hw, h * 0.1],
          [-hw, h * 0.1],
          [0, h],
        ],
        caps: [],
        windowCentreY: h * 0.55,
        windowMaxWidth: nw * 1.5,
        ridgeHeight: h * 0.9,
      };
    }
    case 'bell': {
      const nw = Math.max(0.45, hw * 0.42);
      const lower = quadBezier([hw, h * 0.12], [nw, h * 0.14], [nw, h * 0.55], 10);
      const upper = quadBezier([nw, h * 0.55], [nw * 0.98, h * 0.98], [0, h], 10);
      upper.pop(); // the apex is added by mirrored()
      const right: Pt[] = [[hw, 0], [hw, h * 0.12], ...lower, ...upper.filter(([x]) => x > 1e-6)];
      return {
        outline: mirrored(right, [0, h]),
        finials: [
          [hw, h * 0.12],
          [-hw, h * 0.12],
          [0, h],
        ],
        caps: [],
        windowCentreY: h * 0.42,
        windowMaxWidth: nw * 1.4,
        ridgeHeight: h * 0.88,
      };
    }
    case 'spout': {
      const nw = Math.max(0.35, hw * 0.3);
      const right: Pt[] = [
        [hw, 0],
        [hw, h * 0.08],
        [nw, h * 0.5],
        [nw, h * 0.9],
      ];
      return { outline: mirrored(right, [0, h]), finials: [[0, h]], caps: [], windowCentreY: h * 0.62, windowMaxWidth: nw * 1.4, ridgeHeight: h * 0.85 };
    }
    case 'cornice':
    case 'flat':
      return { outline: null, finials: [], caps: [], windowCentreY: null, windowMaxWidth: 0, ridgeHeight: 0 };
  }
}

/** Signed area; positive = counter-clockwise. */
export function polygonArea(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Insert points so no edge of the closed polygon is longer than maxEdge (lets the warp bend it). */
export function densifyPolygon(pts: readonly Pt[], maxEdge: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / maxEdge));
    for (let k = 0; k < n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  return out;
}

/** Same as densifyPolygon, for an open path (keeps the last point, no closing edge). */
export function densifyPath(pts: readonly Pt[], maxEdge: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / maxEdge));
    for (let k = 0; k < n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  const last = pts[pts.length - 1];
  if (last) out.push([last[0], last[1]]);
  return out;
}

/** Grow a CCW polygon outward by `d` (mitre, clamped). Used for step-gable rims. */
export function offsetPolygon(pts: readonly Pt[], d: number): Pt[] {
  const src = polygonArea(pts) >= 0 ? pts.slice() : pts.slice().reverse();
  const n = src.length;
  const normal = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dy / len, -dx / len];
  };
  return src.map((p, i): Pt => {
    const prev = src[(i - 1 + n) % n]!;
    const next = src[(i + 1) % n]!;
    const n1 = normal(prev, p);
    const n2 = normal(p, next);
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const len = Math.hypot(mx, my) || 1;
    mx /= len;
    my /= len;
    const cos = Math.max(0.35, mx * n1[0] + my * n1[1]);
    return [p[0] + (mx * d) / cos, p[1] + (my * d) / cos];
  });
}
