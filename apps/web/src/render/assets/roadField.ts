// Shared "road field": the road network as uniforms + GLSL, so the road bricks and the ground can
// fade into each other organically without any extra geometry.
//  - Road shader drops whole bricks near the road edge (random per brick, never half bricks).
//  - Ground shader mixes in dirt next to the road, so missing bricks show earth that fades to grass.
import { Vector4 } from 'three';

export const MAX_SEG = 48;
export const MAX_RECT = 64;

export interface RoadField {
  uSeg: { value: Vector4[] };
  uRect: { value: Vector4[] };
}

export interface FieldSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}
export interface FieldRect {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

const FAR = 1e5;

export function makeRoadField(segs: FieldSegment[], rects: FieldRect[]): RoadField {
  const uSeg = Array.from({ length: MAX_SEG }, (_, i) => {
    const s = segs[i];
    return s ? new Vector4(s.ax, s.az, s.bx, s.bz) : new Vector4(FAR, FAR, FAR, FAR);
  });
  const uRect = Array.from({ length: MAX_RECT }, (_, i) => {
    const r = rects[i];
    return r ? new Vector4(r.x, r.z, r.hw, r.hd) : new Vector4(FAR, FAR, 0, 0);
  });
  return { uSeg: { value: uSeg }, uRect: { value: uRect } };
}

/** GLSL: roadSd (signed distance to the road network, <0 on the road), rectDist, h21, roadBrickGone. */
export function roadFieldGlsl(halfWidth: number, brickUnit: number): string {
  return `
uniform vec4 uSeg[${MAX_SEG}];
uniform vec4 uRect[${MAX_RECT}];
float roadSd(vec2 p){
  float d = 1e5;
  for (int i = 0; i < ${MAX_SEG}; i++) {
    vec4 s = uSeg[i];
    vec2 a = s.xy; vec2 ba = s.zw - s.xy;
    float h = clamp(dot(p - a, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
    d = min(d, length(p - a - ba * h));
  }
  return d - ${halfWidth.toFixed(2)};
}
float rectDist(vec2 p){
  float d = 1e5;
  for (int i = 0; i < ${MAX_RECT}; i++) {
    vec4 r = uRect[i];
    vec2 q = abs(p - r.xy) - r.zw;
    d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
  }
  return d;
}
float h21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float rNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Herringbone lattice identical to brickTexture.ts: cell (x,y), d = (x-y) mod 4 selects the brick.
// Towards the road edge bricks first shrink into rounded, worn stones, then drop out at random.
// Returns true when this fragment must be discarded; t (0..1) is how worn the brick is (for dusting).
bool roadBrickFade(vec2 w, out float t){
  t = 0.0;
  float U = ${brickUnit.toFixed(5)};
  vec2 c = floor(w / U);
  float d = mod(c.x - c.y, 4.0);
  vec2 o = c; vec2 ctr; vec2 hs;
  if (d < 0.5) { ctr = c + vec2(1.0, 0.5); hs = vec2(1.0, 0.5); }
  else if (d < 1.5) { o = c - vec2(1.0, 0.0); ctr = o + vec2(1.0, 0.5); hs = vec2(1.0, 0.5); }
  else if (d < 2.5) { o = c - vec2(0.0, 1.0); ctr = o + vec2(0.5, 1.0); hs = vec2(0.5, 1.0); }
  else { ctr = c + vec2(0.5, 1.0); hs = vec2(0.5, 1.0); }
  vec2 wc = ctr * U;
  float sd = roadSd(wc);
  float h = h21(o);
  t = smoothstep(-2.6, -0.4, sd + (h - 0.5) * 0.9);   // wide band, per-brick jitter
  if (t <= 0.0) return false;
  if (rectDist(wc) < 1.4) { t = 0.0; return false; }  // keep the road intact where a curb sits
  if (h21(o + 13.7) < smoothstep(0.6, 1.0, t)) return true; // random dropout
  float s = 1.0 - 0.6 * t;                            // shrink into a rounded stone
  vec2 p = w / U - ctr;
  vec2 q = abs(p) - (hs * s - 0.18);
  return length(max(q, 0.0)) - 0.18 > 0.0;
}`;
}
