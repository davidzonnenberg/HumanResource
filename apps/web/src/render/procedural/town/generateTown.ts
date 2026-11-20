// Procedural town generator (Utrecht-style): river N→S, rounded singel around the centre,
// narrow klinker lanes inside, ring road + radials, districts by compass sector, highway, parks.
//
// Pure and deterministic for a given (brief, locked buildings) on one JS engine.
// It uses Math.sin/cos/atan2, so results are NOT guaranteed bit-identical across engines:
// that is why the game never runs this at runtime – it loads the BAKED json (see scripts/town-bake.ts).

import type {
  Building, BuildingRule, Bridge, Junction, LandmarkSpec, Park, Road, RoadKind, Sign,
  Surface, TownBrief, TownData, Vec2, Water, ZoneRule,
} from './townTypes';
import { hashSeed, mulberry32 } from './rng';
import { bbox, catmullRom, measure, offsetLine, pointInPolygon, sampleAt, segIntersect } from './geom';

export interface GenerateOptions {
  /** Buildings that must stay exactly where they are (locked overrides from a previous bake). */
  locked?: Building[];
}

const TAU = Math.PI * 2;

export function generateTown(brief: TownBrief, opts: GenerateOptions = {}): TownData {
  const seed = hashSeed(`${brief.id}:${brief.seed}`);
  const R = mulberry32(seed);
  const rnd = (a: number, b: number) => a + (b - a) * R();
  const rr = (r: [number, number]) => rnd(r[0], r[1]);
  const pick = <T>(a: T[]): T => a[Math.floor(R() * a.length)];
  const warnings: string[] = [];

  const W = Math.round(brief.size[0]), H = Math.round(brief.size[1]);
  const cx = W * rr(brief.centre.x), cy = H * rr(brief.centre.z);

  // ---------- singel (rounded rectangle canal) + ring road shapes ----------
  const A = rr(brief.singel.halfWidth), B = rr(brief.singel.halfDepth);
  const rot = rnd(-0.12, 0.12), c0 = Math.cos(rot), s0 = Math.sin(rot);
  const k = [0, 0, 0, 0, 0].map(() => R() * TAU);
  const rp = (x: number, y: number): Vec2 => [cx + x * c0 - y * s0, cy + x * s0 + y * c0];
  const se = (t: number, e: number): Vec2 => {
    const c = Math.cos(t), s = Math.sin(t);
    return [Math.sign(c) * Math.abs(c) ** e, Math.sign(s) * Math.abs(s) ** e];
  };
  const sq = brief.singel.squareness; // 0.5 = quite square, 1 = ellipse
  const SP = (t: number, ex: number): Vec2 => {
    const w = se(t, sq), wb = 7 * Math.sin(3 * t + k[0]) + 5 * Math.sin(5 * t + k[1]);
    return rp((A + ex + wb) * w[0], (B + ex + wb) * w[1]);
  };
  const RA = A + rr(brief.ring.extraWidth), RB = B + rr(brief.ring.extraDepth);
  const RP = (t: number): Vec2 => {
    const w = se(t, 0.72), wb = 14 * Math.sin(2 * t + k[2]) + 9 * Math.sin(3 * t + k[3]);
    return rp((RA + wb) * w[0], (RB + wb) * w[1]);
  };
  const loop = (f: (t: number) => Vec2, n: number) => { const p: Vec2[] = []; for (let i = 0; i <= n; i++) p.push(f((i / n) * TAU)); return p; };
  const sw = brief.singel.waterWidth;
  const singel = loop((t) => SP(t, 0), 480);
  const singelOut = loop((t) => SP(t, sw / 2 + 8), 480);
  const singelIn = loop((t) => SP(t, -(sw / 2 + 7)), 480);
  const ringPts = loop(RP, 480);
  const pS = loop((t) => SP(t, 0), 240), pI = loop((t) => SP(t, -(sw / 2 + 7)), 240), pR = loop(RP, 240);
  const bS = bbox(pS), bI = bbox(pI), bR = bbox(pR);
  const inB = (b: number[], x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  const inS = (x: number, y: number) => inB(bS, x, y) && pointInPolygon(pS, x, y);
  const inI = (x: number, y: number) => inB(bI, x, y) && pointInPolygon(pI, x, y);
  const inR = (x: number, y: number) => inB(bR, x, y) && pointInPolygon(pR, x, y);

  // ---------- zones ----------
  const districts = Array.from(new Set([brief.defaultDistrict, ...brief.sectors.map((s) => s.district)]));
  const zoneNames = ['core', ...districts.flatMap((d) => [`${d}_inner`, `${d}_outer`])];
  for (const z of zoneNames) if (!brief.zones[z]) throw new Error(`town brief: missing zone rule "${z}"`);
  const zoneIdx = new Map(zoneNames.map((z, i) => [z, i]));
  const districtAt = (deg: number) => {
    const d = ((deg % 360) + 360) % 360;
    for (const s of brief.sectors) if (d >= s.fromDeg && d < s.toDeg) return s.district;
    return brief.defaultDistrict;
  };
  const ZC = 5, ZW = Math.ceil(W / ZC), ZH = Math.ceil(H / ZC), zg = new Uint8Array(ZW * ZH);
  for (let gy = 0; gy < ZH; gy++) for (let gx = 0; gx < ZW; gx++) {
    const x = gx * ZC + 2.5, y = gy * ZC + 2.5;
    let name: string;
    if (inS(x, y)) name = 'core';
    else {
      const dx = x - cx, dy = y - cy;
      const a = Math.atan2(dy, dx) + 0.22 * Math.sin(Math.hypot(dx, dy) * 0.012 + k[4]); // wobbly borders
      name = `${districtAt((a * 180) / Math.PI)}_${inR(x, y) ? 'inner' : 'outer'}`;
    }
    zg[gy * ZW + gx] = zoneIdx.get(name)!;
  }
  const zoneAt = (x: number, y: number) => {
    const gx = Math.min(ZW - 1, Math.max(0, Math.floor(x / ZC))), gy = Math.min(ZH - 1, Math.max(0, Math.floor(y / ZC)));
    return zoneNames[zg[gy * ZW + gx]];
  };
  const rule = (z: string): ZoneRule => brief.zones[z];

  // ---------- occupancy grids (1 m cells) ----------
  const N = W * H;
  const blk = new Uint8Array(N); // 1 water, 2 highway, 4 park, 8 landmark
  const rdId = new Int32Array(N); // road index + 1
  const occ = new Uint8Array(N); // building placement: 1 blocked, 2 park (trees ok)
  const cell = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : (y | 0) * W + (x | 0));
  const mark = (arr: Uint8Array | Int32Array, x: number, y: number, r: number, v: number, or = true) => {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.floor(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.floor(y + r)), r2 = r * r;
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const dx = gx + 0.5 - x, dy = gy + 0.5 - y;
      if (dx * dx + dy * dy <= r2) { const i = gy * W + gx; if (or) arr[i] |= v; else if (!arr[i]) arr[i] = v; }
    }
  };
  const stamp = (arr: Uint8Array | Int32Array, p: Vec2[], r: number, v: number, or = true) => {
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 1.5));
      for (let j = 0; j <= n; j++) { const t = j / n; mark(arr, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, r, v, or); }
    }
  };
  const fillRect = (arr: Uint8Array, x: number, y: number, ang: number, w: number, d: number, pad: number, v: number) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let u = -w / 2 - pad; u <= w / 2 + pad + 0.01; u += 0.7) for (let q = -d / 2 - pad; q <= d / 2 + pad + 0.01; q += 0.7) {
      const X = x + u * ca - q * sa, Y = y + u * sa + q * ca;
      if (X >= 0 && Y >= 0 && X < W && Y < H) arr[(Y | 0) * W + (X | 0)] |= v;
    }
  };
  const rectFree = (arr: Uint8Array | Int32Array, x: number, y: number, ang: number, w: number, d: number) => {
    const ca = Math.cos(ang), sa = Math.sin(ang), st = Math.max(0.9, Math.min(w, d) / 10);
    for (let u = -w / 2 + 0.4; u <= w / 2 - 0.4 + 0.01; u += st) for (let q = -d / 2 + 0.4; q <= d / 2 - 0.4 + 0.01; q += st) {
      const X = x + u * ca - q * sa, Y = y + u * sa + q * ca;
      if (X < 2 || Y < 2 || X > W - 2 || Y > H - 2) return false;
      if (arr[(Y | 0) * W + (X | 0)]) return false;
    }
    return true;
  };

  // ---------- water ----------
  const amp = rr(brief.river.amplitude), p0 = R() * 6.28, p1 = R() * 6.28;
  const rf = (y: number) => amp * Math.sin(y * 0.005 + p0) + 10 * Math.sin(y * 0.015 + p1);
  const rx = (y: number) => cx + rf(y) - rf(cy);
  const riverPts: Vec2[] = [], riverW: number[] = [];
  for (let y = -30; y <= H + 30; y += 5) { const x = rx(y); riverPts.push([x, y]); riverW.push(inS(x, y) ? brief.river.widthInside : brief.river.widthOutside); }
  for (let i = 0; i < riverPts.length - 1; i++) stamp(blk, [riverPts[i], riverPts[i + 1]], Math.max(riverW[i], riverW[i + 1]) / 2 + 3, 1);
  stamp(blk, singel, sw / 2 + 3, 1);
  const water: Water[] = [
    { id: 'river', kind: 'river', points: riverPts, widths: riverW },
    { id: 'singel', kind: 'singel', points: singel, widths: singel.map(() => sw) },
  ];

  // ---------- highway ----------
  const hwPts = catmullRom(brief.highway.points.map(([fx, fz]) => [fx * W, fz * H] as Vec2), 30);
  stamp(blk, hwPts, brief.highway.width / 2, 2);
  const highway: Road = { id: 'highway', kind: 'highway', zone: 'highway', width: brief.highway.width, surface: 'asphalt', points: hwPts };

  // ---------- roads ----------
  const roads: Road[] = [], culs: Vec2[] = [], signs: Sign[] = [], roundabouts: Vec2[] = [], junctions: Junction[] = [];
  const roadAngle = new Map<string, number>();
  const addRoad = (id: string, kind: RoadKind, points: Vec2[], width: number, zone: string, surface: Surface, parent?: string): Road => {
    const r: Road = { id, kind, zone, width, surface, points, ...(parent ? { parent } : {}) };
    roads.push(r);
    stamp(rdId, points, width / 2 + 2, roads.length, false);
    return r;
  };
  const junction = (at: Vec2, a: string, b: string, type: Junction['type'] = 'tee') =>
    junctions.push({ id: `j${junctions.length}`, at: [round2(at[0]), round2(at[1])], roads: [a, b], type });
  let signN = 0;
  const sign = (kind: Sign['kind'], x: number, z: number) => signs.push({ id: `s${signN++}`, kind, x: round2(x), z: round2(z) });

  const ring = addRoad('ring', 'ring', ringPts, brief.ring.roadWidth, 'ring', 'asphalt');
  addRoad('singel_outer', 'singel', singelOut, 6, 'ring', 'asphalt');
  const singelInnerRoad = addRoad('singel_inner', 'quay', singelIn, 4, 'core', 'klinkers');

  // radials (curvy main roads from the singel outwards)
  const nR = Math.round(rr(brief.radials.count)), base = R() * TAU, rads: Road[] = [];
  for (let i = 0; i < nR; i++) {
    let a = base + (i * TAU) / nR + rnd(-0.15, 0.15);
    if (Math.abs(Math.sin(a)) > 0.92) a += 0.45; // keep clear of the river's N/S entries
    const st = SP(a, sw / 2 + 8);
    let x = st[0], y = st[1], h = a, c = 0;
    const p: Vec2[] = [[x, y]];
    for (let s = 0; s < 2400; s += 6) {
      c = c * 0.85 + rnd(-0.03, 0.03); h += c + (a - h) * 0.03;
      x += Math.cos(h) * 6; y += Math.sin(h) * 6; p.push([x, y]);
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) break;
    }
    const r = addRoad(`radial_${i}`, 'radial', p, brief.radials.width, 'ring', 'asphalt');
    roadAngle.set(r.id, a); rads.push(r);
    junction(st, r.id, 'singel_outer');
  }
  // roundabouts where radials meet the ring + give-way signs
  for (const r of rads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      let hit: Vec2 | null = null;
      for (let j = 0; j < ring.points.length - 1 && !hit; j++) hit = segIntersect(r.points[i], r.points[i + 1], ring.points[j], ring.points[j + 1]);
      if (hit) {
        roundabouts.push(hit); junction(hit, r.id, 'ring', 'roundabout');
        const a = r.points[i], b = r.points[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L;
        sign('yield', hit[0] - dx * 17 - dy * 8, hit[1] - dy * 17 + dx * 8);
        sign('yield', hit[0] + dx * 17 + dy * 8, hit[1] + dy * 17 - dx * 8);
        break;
      }
    }
    const p = r.points[1], a = roadAngle.get(r.id)!;
    sign('speed30', p[0] + Math.cos(a + 1.57) * 7, p[1] + Math.sin(a + 1.57) * 7);
  }
  // overpasses + ramps where a radial crosses the highway
  const bridges: Bridge[] = [];
  let bridgeN = 0;
  const bridge = (roadId: string, x: number, z: number, angle: number, length: number, width: number, over: Bridge['over']) =>
    bridges.push({ id: `br${bridgeN++}`, roadId, x: round2(x), z: round2(z), angle: round4(angle), length, width, over });
  rads.forEach((r, ri) => {
    for (let i = 0; i < r.points.length - 1; i++) for (let j = 0; j < hwPts.length - 1; j++) {
      const q = segIntersect(r.points[i], r.points[i + 1], hwPts[j], hwPts[j + 1]);
      if (!q) continue;
      const a = r.points[i], b = r.points[i + 1];
      let L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      const c = hwPts[j], d = hwPts[j + 1];
      L = Math.hypot(d[0] - c[0], d[1] - c[1]) || 1;
      const hx = (d[0] - c[0]) / L, hy = (d[1] - c[1]) / L, nx = -hy, ny = hx;
      const P: Vec2 = [q[0] - ux * 30, q[1] - uy * 30];
      const side = Math.sign((P[0] - q[0]) * nx + (P[1] - q[1]) * ny) || 1;
      bridge(r.id, q[0], q[1], Math.atan2(uy, ux), brief.highway.width + 10, brief.radials.width + 4, 'highway');
      [-1, 1].forEach((sd, k2) => {
        const C: Vec2 = [q[0] + hx * sd * 35 + nx * side * 18, q[1] + hy * sd * 35 + ny * side * 18];
        const T: Vec2 = [q[0] + hx * sd * 75 + nx * side * 6, q[1] + hy * sd * 75 + ny * side * 6];
        const pp: Vec2[] = [];
        for (let t = 0; t <= 1.001; t += 1 / 18) { const u = 1 - t; pp.push([u * u * P[0] + 2 * u * t * C[0] + t * t * T[0], u * u * P[1] + 2 * u * t * C[1] + t * t * T[1]]); }
        const ramp = addRoad(`ramp_${ri}_${k2 ? 'b' : 'a'}`, 'ramp', pp, 5, 'ring', 'asphalt', r.id);
        junction(P, ramp.id, r.id, 'ramp'); junction(T, ramp.id, 'highway', 'ramp');
      });
      sign('highway', P[0] - uy * 9, P[1] + ux * 9);
      return;
    }
  });
  for (let j = 0; j < hwPts.length - 1; j++) for (let i = 0; i < riverPts.length - 1; i++) {
    const q = segIntersect(hwPts[j], hwPts[j + 1], riverPts[i], riverPts[i + 1]);
    if (q) bridge('highway', q[0], q[1], Math.atan2(hwPts[j + 1][1] - hwPts[j][1], hwPts[j + 1][0] - hwPts[j][0]), brief.river.widthOutside + 16, brief.highway.width + 6, 'river');
  }

  // gates: short roads across the singel into the centre (N/S/E/W), placed beside the river
  const gateDir: Record<'N' | 'S' | 'E' | 'W', number> = { N: -Math.PI / 2, S: Math.PI / 2, E: 0, W: Math.PI };
  for (const g of brief.gates) {
    const centreT = gateDir[g];
    const side = R() < 0.5 ? -1 : 1;
    let bestT = centreT, best = Infinity;
    for (let t = centreT - 0.8; t <= centreT + 0.8; t += 0.002) {
      const p = SP(t, 0);
      let score: number;
      if (g === 'N' || g === 'S') {
        if ((g === 'N' && p[1] > cy) || (g === 'S' && p[1] < cy)) continue;
        score = Math.abs(p[0] - (rx(p[1]) + side * 45));
      } else {
        score = Math.abs(p[1] - cy - side * 25) + Math.abs(t - centreT) * 50;
      }
      if (score < best) { best = score; bestT = t; }
    }
    const a = SP(bestT, -(sw / 2 + 7)), b = SP(bestT, sw / 2 + 8);
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const pts: Vec2[] = [a, [a[0] + (dx * 0.5), a[1] + (dz * 0.5)], b];
    const gate = addRoad(`gate_${g}`, 'gate', pts, 6, 'core', 'klinkers');
    junction(a, gate.id, 'singel_inner'); junction(b, gate.id, 'singel_outer');
    sign('centre', b[0] + (dx / L) * 6 - (dz / L) * 6, b[1] + (dz / L) * 6 + (dx / L) * 6);
  }

  // quays along the river in the centre
  const inner = (p: Vec2) => inI(p[0], p[1]);
  const coreRiver = riverPts.filter(inner);
  if (coreRiver.length > 2) {
    const off = brief.river.widthInside / 2 + 3;
    addRoad('quay_river_w', 'quay', offsetLine(coreRiver, off), 4, 'core', 'klinkers');
    addRoad('quay_river_e', 'quay', offsetLine(coreRiver, -off), 4, 'core', 'klinkers');
  }

  // narrow, twisting lanes in the centre
  const lane = (x: number, y: number, h: number, maxL: number) => {
    const p: Vec2[] = [[x, y]]; let c = 0; let hit: Road | null = null;
    for (let i = 0; i < maxL / 3; i++) {
      c += rnd(-0.012, 0.012); c = Math.max(-0.05, Math.min(0.05, c)); h += c;
      x += Math.cos(h) * 3; y += Math.sin(h) * 3;
      if (!inI(x, y)) { p.push([x, y]); hit = singelInnerRoad; break; }
      const ci = cell(x, y); if (ci < 0) break;
      if (i > 1 && blk[ci] & 1) break;
      if (i > 3 && rdId[ci]) { p.push([x, y]); hit = roads[rdId[ci] - 1]; break; }
      p.push([x, y]);
    }
    return { p, hit };
  };
  const lanes: Road[] = [];
  const cw = brief.core.laneWidth;
  let laneN = 0;
  [-1, 1].forEach((sd) => {
    let y = cy - B - 20 + rnd(10, 25);
    while (y < cy + B + 20) {
      const x = rx(y) + sd * (brief.river.widthInside / 2 + 3);
      if (inI(x, y)) {
        const res = lane(x, y, (sd > 0 ? 0 : Math.PI) + rnd(-0.35, 0.35), 400);
        if (res.p.length > 4) {
          const r = addRoad(`lane_${laneN++}`, 'lane', res.p, cw, 'core', 'klinkers');
          lanes.push(r); junction(res.p[0], r.id, sd > 0 ? 'quay_river_e' : 'quay_river_w');
          if (res.hit) junction(res.p[res.p.length - 1], r.id, res.hit.id);
        }
      }
      y += rr(brief.core.laneSpacing);
    }
  });
  for (let i = 0; i < brief.core.riverBridges; i++) {
    const y = cy + rnd(-B * 0.8, B * 0.8), x = rx(y), off = brief.river.widthInside / 2 + 3;
    if (inI(x, y)) {
      const r = addRoad(`lane_${laneN++}`, 'lane', [[x - off, y], [x + off, y]], cw, 'core', 'klinkers');
      junction(r.points[0], r.id, 'quay_river_w'); junction(r.points[1], r.id, 'quay_river_e');
    }
  }
  const nL = lanes.length;
  for (let i = 0; i < Math.min(brief.core.crossLanes, nL * 2); i++) {
    const parent = pick(lanes); const p = parent.points;
    if (p.length < 10) continue;
    const q = p[Math.floor(rnd(0.3, 0.8) * p.length)];
    const res = lane(q[0], q[1], (R() < 0.5 ? -1 : 1) * (Math.PI / 2) + rnd(-0.3, 0.3), 300);
    if (res.p.length > 4) {
      const r = addRoad(`lane_${laneN++}`, 'lane', res.p, cw - 0.2, 'core', 'klinkers', parent.id);
      lanes.push(r); junction(q, r.id, parent.id);
      if (res.hit) junction(res.p[res.p.length - 1], r.id, res.hit.id);
    }
  }

  // market square next to the river (kept free)
  const plazaZ = cy + rnd(-40, 20), plaza: Vec2 = [rx(plazaZ) + rnd(34, 48), plazaZ];

  // landmarks (fixed towers / hero buildings) + locked buildings from overrides
  const fixed: Building[] = [];
  const placeFixed = (b: Building) => {
    const ok = rectFree(blk, b.x, b.z, b.angle, b.width, b.depth) && rectFree(rdId, b.x, b.z, b.angle, b.width, b.depth);
    if (!ok) warnings.push(`landmark ${b.id} overlaps water/road/highway – move it in the brief`);
    fillRect(blk, b.x, b.z, b.angle, b.width, b.depth, 2, 8);
    fixed.push(b);
  };
  for (const l of brief.landmarks) placeFixed(landmarkToBuilding(l, cx, cy));
  for (const b of opts.locked ?? []) placeFixed({ ...b, locked: true });

  // parks
  const parks: Park[] = [];
  for (let t = 0; t < 600 && parks.length < brief.parks.count; t++) {
    const x = rnd(30, W - 30), y = rnd(30, H - 30), z = zoneAt(x, y);
    if (z === 'core' || !brief.parks.districts.some((d) => z.startsWith(d))) continue;
    const r = rr(brief.parks.radius);
    if (parks.some((p) => Math.hypot(p.centre[0] - x, p.centre[1] - y) < r + 90 + 40)) continue;
    let ok = true;
    for (let s = 0; s < 36 && ok; s++) {
      const a = (s / 12) * TAU, d = ((Math.floor(s / 12) + 1) / 3) * r * 1.05;
      const ci = cell(x + Math.cos(a) * d, y + Math.sin(a) * d);
      if (ci < 0 || blk[ci] || rdId[ci]) ok = false;
    }
    if (!ok) continue;
    const outline: Vec2[] = [];
    for (let s = 0; s < 20; s++) { const a = (s / 20) * TAU, d = r * (0.85 + 0.2 * Math.sin(a * 2 + x) + 0.08 * Math.sin(a * 5 + y)); outline.push([round2(x + Math.cos(a) * d), round2(y + Math.sin(a) * d)]); }
    outline.push(outline[0]);
    parks.push({ id: `park_${parks.length}`, centre: [round2(x), round2(y)], outline, pond: { x: round2(x + rnd(-r * 0.2, r * 0.2)), z: round2(y + rnd(-r * 0.2, r * 0.2)), rx: round2(r * rnd(0.2, 0.3)), rz: round2(r * rnd(0.12, 0.18)), angle: round4(R() * 3) } });
    for (let gy = Math.max(0, Math.floor(y - r * 1.2)); gy <= Math.min(H - 1, y + r * 1.2); gy++)
      for (let gx = Math.max(0, Math.floor(x - r * 1.2)); gx <= Math.min(W - 1, x + r * 1.2); gx++)
        if (pointInPolygon(outline, gx + 0.5, gy + 0.5)) blk[gy * W + gx] |= 4;
  }

  // neighbourhood streets: branch off main roads, curve, stop at obstacles or connect to a road
  const turtle = (x: number, y: number, h: number, len: number, cj: number, cm: number) => {
    const p: Vec2[] = [[x, y]]; let c = rnd(-cm, cm) * 0.8; let hit: Road | null = null;
    const n = Math.ceil(len / 5);
    for (let i = 0; i < n; i++) {
      c += rnd(-cj, cj); c = Math.max(-cm, Math.min(cm, c)); h += c;
      x += Math.cos(h) * 5; y += Math.sin(h) * 5;
      const ci = cell(x, y);
      if (ci < 0 || x < 5 || y < 5 || x > W - 5 || y > H - 5) break;
      if (blk[ci]) break;
      if (zoneAt(x, y) === 'core') break;
      if (i > 2 && rdId[ci]) { p.push([x, y]); hit = roads[rdId[ci] - 1]; break; }
      p.push([x, y]);
    }
    return { p, hit };
  };
  const queue = roads.filter((r) => r.kind === 'ring' || r.kind === 'singel' || r.kind === 'radial').map((r) => ({ r, d: 0 }));
  const childCount = new Map<string, number>();
  for (let qi = 0; qi < queue.length && roads.length < 4000; qi++) {
    const { r, d } = queue[qi];
    const c = measure(r.points), L = c[c.length - 1];
    let s = rnd(8, 20);
    while (s < L - 8) {
      const q = sampleAt(r.points, c, s), z = zoneAt(q.x, q.z);
      if (z === 'core') { s += 10; continue; }
      const P = rule(z);
      if (d < 2) {
        const sides = R() < P.bothSidesChance ? [-1, 1] : [R() < 0.5 ? -1 : 1];
        for (const sd of sides) {
          const h = Math.atan2(q.tz, q.tx) + (sd * Math.PI) / 2 + rnd(-0.2, 0.2), o = r.width / 2 + 1;
          const sx = q.x - q.tz * sd * o, sy = q.z + q.tx * sd * o;
          let clear = true;
          for (const dd of [10, 16]) { const ci = cell(sx + Math.cos(h) * dd, sy + Math.sin(h) * dd); if (ci < 0 || rdId[ci] || blk[ci]) clear = false; }
          if (!clear) continue;
          const res = turtle(sx, sy, h, rr(P.branchLength) * (d > 0 ? 0.8 : 1), P.curveJitter, P.curveMax);
          if (res.p.length < 8) continue;
          const n = (childCount.get(r.id) ?? 0) + 1; childCount.set(r.id, n);
          const nr = addRoad(`${r.id}.${n}`, 'branch', [[q.x, q.z], ...res.p], P.roadWidth, z, P.surface, r.id);
          junction([q.x, q.z], nr.id, r.id);
          if (res.hit) junction(res.p[res.p.length - 1], nr.id, res.hit.id);
          else if (R() < P.culDeSacChance) culs.push(res.p[res.p.length - 1]);
          queue.push({ r: nr, d: d + 1 });
        }
      }
      s += rr(P.branchSpacing) * (d > 0 ? 1.25 : 1);
    }
  }

  // bridges where roads cross water
  const waters = [{ p: riverPts, kind: 'river' as const }, { p: singel, kind: 'singel' as const }];
  for (const r of roads) {
    if (!['ring', 'radial', 'singel', 'quay', 'lane', 'gate'].includes(r.kind)) continue;
    for (const o of waters) {
      let last: Vec2 | null = null;
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i], b = r.points[i + 1];
        const mnx = Math.min(a[0], b[0]), mxx = Math.max(a[0], b[0]), mny = Math.min(a[1], b[1]), mxy = Math.max(a[1], b[1]);
        for (let j = 0; j < o.p.length - 1; j++) {
          const c = o.p[j], d = o.p[j + 1];
          if (Math.max(c[0], d[0]) < mnx || Math.min(c[0], d[0]) > mxx || Math.max(c[1], d[1]) < mny || Math.min(c[1], d[1]) > mxy) continue;
          const q = segIntersect(a, b, c, d);
          if (!q || (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 10)) continue;
          last = q;
          const ww = o.kind === 'river' ? (inS(q[0], q[1]) ? brief.river.widthInside : brief.river.widthOutside) : sw;
          bridge(r.id, q[0], q[1], Math.atan2(b[1] - a[1], b[0] - a[0]), ww + 8, r.width + 3, o.kind);
        }
      }
    }
  }

  // ---------- buildings ----------
  for (let i = 0; i < N; i++) occ[i] = blk[i] & 11 ? 1 : blk[i] & 4 ? 2 : 0;
  mark(occ, plaza[0], plaza[1], 15, 1);
  for (const r of roads) stamp(occ, r.points, r.width / 2 + 1.3, 1);
  for (const b of roundabouts) mark(occ, b[0], b[1], 12, 1);
  for (const c of culs) mark(occ, c[0], c[1], 8.5, 1);
  for (const p of parks) mark(occ, p.pond.x, p.pond.z, p.pond.rx + 2, 1);

  const buildings: Building[] = [...fixed];
  const pickRule = (rules: BuildingRule[]) => {
    const tot = rules.reduce((s, b) => s + b.weight, 0); let v = R() * tot;
    for (const b of rules) { v -= b.weight; if (v <= 0) return b; }
    return rules[rules.length - 1];
  };
  const placeAlong = (r: Road) => {
    const p = r.points, c = measure(p), L = c[c.length - 1];
    for (const sd of [-1, 1]) {
      let s = rnd(0, 4), guard = 0, n = 0;
      while (s < L - 2 && guard++ < 5000) {
        const q = sampleAt(p, c, s), z = zoneAt(q.x, q.z), br = pickRule(rule(z).buildings);
        const w = rr(br.width), d = rr(br.depth), perp = br.perpendicularChance ? R() < br.perpendicularChance : false;
        const ew = perp ? d : w, ed = perp ? w : d;
        const m = sampleAt(p, c, s + ew / 2), nx = -m.tz * sd, nz = m.tx * sd;
        const o = r.width / 2 + 1.3 + rr(br.setback) + ed / 2 + 0.3;
        const hx = m.x + nx * o, hz = m.z + nz * o, ang = Math.atan2(m.tz, m.tx) + (perp ? Math.PI / 2 : 0);
        if (rectFree(occ, hx, hz, ang, w, d)) {
          fillRect(occ, hx, hz, ang, w, d, br.pad, 1);
          const id = `${r.id}/${sd < 0 ? 'L' : 'R'}${n++}`;
          buildings.push({ id, roadId: r.id, zone: z, kind: br.kind, x: round2(hx), z: round2(hz), angle: round4(ang), width: round2(w), depth: round2(d), colour: pick(br.palette), seed: hashSeed(id) });
          s += ew + rr(br.gap);
        } else s += z === 'core' || z.endsWith('_inner') ? 1.2 : 2.5;
      }
    }
  };
  for (const kind of ['lane', 'quay', 'gate', 'singel', 'ring', 'radial', 'branch'] as RoadKind[]) for (const r of roads) if (r.kind === kind) placeAlong(r);

  // ---------- trees ----------
  const trees: Array<[number, number, number]> = [];
  for (const r of roads) {
    if (r.kind !== 'branch' || !rule(r.zone).streetTrees) continue;
    const c = measure(r.points), L = c[c.length - 1];
    for (let s = 4; s < L - 4; s += 9) {
      const q = sampleAt(r.points, c, s);
      for (const sd of [-1, 1]) {
        const o = r.width / 2 + 2.2, x = q.x - q.tz * sd * o, y = q.z + q.tx * sd * o, ci = cell(x, y);
        if (ci >= 0 && !blk[ci] && occ[ci] !== 1) trees.push([round2(x), round2(y), 1.7]);
      }
    }
  }
  for (let i = 0; i < 16000 && trees.length < 4000; i++) {
    const x = rnd(4, W - 4), y = rnd(4, H - 4), v = occ[cell(x, y)], park = v === 2;
    if (v && !park) continue;
    if (!park && R() > rule(zoneAt(x, y)).treeChance) continue;
    let ok = true;
    for (const dd of [[4, 0], [-4, 0], [0, 4], [0, -4]]) { const cj = cell(x + dd[0], y + dd[1]); if (cj < 0 || (occ[cj] && occ[cj] !== 2)) { ok = false; break; } }
    if (!ok) continue;
    const tr = rnd(2, 3.8); trees.push([round2(x), round2(y), round2(tr)]); mark(occ, x, y, tr + 0.6, 1);
  }

  return {
    version: 1, briefId: brief.id, seed, size: [W, H], centre: [round2(cx), round2(cy)],
    zoneGrid: { cell: ZC, cols: ZW, rows: ZH, zones: zoneNames, data: Array.from(zg) },
    water: water.map((w) => ({ ...w, points: w.points.map(r2v) })),
    highway: { ...highway, points: highway.points.map(r2v) },
    roads: roads.map((r) => ({ ...r, points: r.points.map(r2v) })),
    junctions, roundabouts: roundabouts.map(r2v), culDeSacs: culs.map(r2v), plaza: r2v(plaza),
    bridges, signs, parks, buildings, trees, warnings,
  };
}

function landmarkToBuilding(l: LandmarkSpec, cx: number, cy: number): Building {
  const x = l.anchor === 'centre' ? cx + l.at[0] : l.at[0];
  const z = l.anchor === 'centre' ? cy + l.at[1] : l.at[1];
  return {
    id: l.id, roadId: null, zone: 'landmark', kind: l.kind, x: round2(x), z: round2(z), angle: round4((l.angleDeg * Math.PI) / 180),
    width: l.width, depth: l.depth, colour: l.colour ?? '#5c6f86', seed: hashSeed(l.id), ...(l.recipe ? { recipe: l.recipe } : {}), locked: true,
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
const r2v = (p: Vec2): Vec2 => [round2(p[0]), round2(p[1])];
