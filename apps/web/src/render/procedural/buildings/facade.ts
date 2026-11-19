/**
 * Facade elements: windows (with things in them), doors, lanterns, awnings and
 * the focal points (round window, bay window, niche, balcony, gable stone, big sign).
 * All coordinates are in the facade frame: u across, y up, +z out of the wall.
 */
import * as THREE from 'three';
import type { ArchKind, WindowLife, WindowStyle } from './buildingRecipe';
import { circleShape, effectiveArch, openingShape, openingTopAt, rrectShape, type Collector, type Paint } from './collector';

export const IRON = '#2e2a2c';
const FLOWERS = ['#e8587a', '#f5c542', '#ff7a4d', '#ffffff', '#c86dd7'];
const CAT_COLOURS = ['#f2a541', '#3a3236', '#fffaf0', '#8a8a8a', '#c8783a'];

export interface WindowOpts {
  style: WindowStyle;
  arch: ArchKind;
  flower: boolean;
  shutters: boolean;
  lit: boolean;
  life?: WindowLife | null;
  boarded?: boolean;
  frame?: Paint;
  sill?: boolean;
  head?: boolean;
}

/** A window with hand-made offsets (position, size, tilt). */
export function addWindow(c: Collector, u0: number, yc0: number, w0: number, h0: number, o: WindowOpts): void {
  const modern = o.style === 'modern';
  const k = modern ? 0.3 : 1;
  const u = u0 + c.jit(0.04 * k);
  const yc = yc0 + c.jit(0.035 * k);
  const w = w0 * (1 + c.jit(0.05 * k));
  const h = h0 * (1 + c.jit(0.05 * k));
  c.tilted(u, yc, c.jit(0.035 * k), () => windowBody(c, u, yc, w, h, o));
}

export function windowBody(c: Collector, u: number, yc: number, w: number, h: number, o: WindowOpts): void {
  const modern = o.style === 'modern';
  const t = modern ? 0.055 : Math.min(0.11, w * 0.13);
  const arch = modern ? 'none' : effectiveArch(w, h, o.arch);
  const frame = o.frame ?? 'trim';
  const boarded = !!o.boarded;
  const lit = o.lit && !boarded;
  // glass, recessed behind the thick frame
  c.plate(lit ? 'lit' : 'glass', lit ? 'lit' : boarded ? c.shade('glass', -0.6) : 'glass', openingShape(w, h, arch), 0.02, 0.012, 0, u, yc, false);
  if (!lit && !boarded) {
    c.slab('glass', c.shade('glass', 0.28), w * 0.16, h * 0.42, 0.01, u - w * 0.22, yc + h * 0.12, 0.026, { rz: -0.35, b: 0, r: 0.02, smooth: false });
  }
  if (!boarded && o.life) windowLife(c, o.life, u, yc, w, h);
  // frame ring
  const ring = openingShape(w + 2 * t, h + 2 * t, arch);
  ring.holes.push(openingShape(w, h, arch));
  c.plate('trim', frame, ring, modern ? 0.1 : 0.15, modern ? 0.05 : 0.075, modern ? 0.015 : 0.03, u, yc);
  // glazing bars
  const bar = modern ? t * 0.7 : t * 0.55;
  const top0 = openingTopAt(0, w, h, arch);
  if (modern) {
    if (w > 1.2) c.slab('trim', frame, bar, h, 0.05, u + w * 0.12, yc, 0.03, { b: 0.01 });
  } else if (o.style !== 'plain') {
    c.slab('trim', frame, bar, top0 + h / 2, 0.07, u, yc + (top0 - h / 2) / 2, 0.045, { b: 0.015 });
    const rows = o.style === 'grid' ? [0.18 * h, -0.18 * h] : [arch === 'round' ? h / 2 - w / 2 : h * 0.12];
    for (const yy of rows) c.slab('trim', frame, w, bar, 0.07, u, yc + yy, 0.045, { b: 0.015 });
    if (o.style === 'grid' && w > 1.1) {
      for (const sx of [-w / 4, w / 4]) {
        const tp = openingTopAt(sx, w, h, arch);
        c.slab('trim', frame, bar, tp + h / 2, 0.07, u + sx, yc + (tp - h / 2) / 2, 0.045, { b: 0.015 });
      }
    }
  }
  if (boarded) boardUp(c, u, yc, w, h);
  // sill and head
  const sillY = yc - h / 2 - t - 0.05;
  if (o.sill !== false) {
    if (modern) c.slab('trim', 'ledge', w + 2 * t + 0.08, 0.06, 0.2, u, sillY + 0.02, 0.1, { r: 0.02, b: 0.015 });
    else c.slab('trim', 'ledge', w + 2 * t + 0.22, 0.13, 0.28, u, sillY, 0.13, { r: 0.04, rx: 0.06 + c.jit(0.04) });
  }
  if (o.head !== false && !modern) {
    if (arch === 'none') c.slab('trim', 'ledge', w + 2 * t + 0.16, 0.14, 0.2, u, yc + h / 2 + t + 0.06, 0.1, { r: 0.04 });
    else c.slab('trim', 'band', 0.2, 0.28, 0.2, u, yc + top0 + t * 0.6, 0.11, { r: 0.05 });
  }
  // weathering streak under the sill
  if (!modern && c.r.weathering > 0.25 && c.chance(c.r.weathering * 0.8)) {
    const sh = 0.25 + 0.45 * c.r.weathering;
    c.plate(c.wall, c.shade('brick', -0.12 - 0.08 * c.r.weathering), rrectShape(w * (0.4 + c.rng() * 0.3), sh, 0.1, c.q), 0.006, 0.004, 0, u + c.jit(0.1), sillY - 0.08 - sh / 2, false);
  }
  if (o.flower && !boarded) flowerBox(c, u, sillY, w);
  if (o.shutters && !boarded) shutters(c, u, yc, w, h, t);
}

function flowerBox(c: Collector, u: number, sillY: number, w: number): void {
  const by = sillY + 0.15;
  c.slab('trim', '#c0583a', w * 0.92, 0.2, 0.22, u, by, 0.24, { r: 0.05 });
  if (!c.q.props) {
    c.slab('trim', '#6cae44', w * 0.85, 0.14, 0.18, u, by + 0.15, 0.24);
    return;
  }
  const n = Math.max(3, Math.round(w / 0.15));
  for (let i = 0; i < n; i++) {
    const x = u - w * 0.4 + (w * 0.8 * i) / (n - 1);
    c.ball('trim', i % 2 ? '#5e9e3a' : '#7cbf4a', 0.085 + c.rng() * 0.035, x, by + 0.14 + c.rng() * 0.05, 0.24 + (c.rng() - 0.5) * 0.07);
    if (c.chance(0.55)) c.ball('trim', c.pick(FLOWERS), 0.04, x + 0.02, by + 0.26, 0.3);
  }
  if (c.chance(0.6)) for (let k = 0; k < 3; k++) c.ball('trim', '#5e9e3a', 0.055, u + w * 0.3, by - 0.1 - k * 0.09, 0.36, 1.2, 0.7);
}

function shutters(c: Collector, u: number, yc: number, w: number, h: number, t: number): void {
  const sw = w * 0.5 + 0.02;
  for (const s of [-1, 1]) {
    const hingeX = u + s * (w / 2 + t + 0.03);
    const open = c.chance(0.12 + 0.25 * c.imp) ? 0.5 + c.rng() * 0.7 : 0;
    const cx = hingeX + s * (sw / 2) * Math.cos(open);
    const cz = 0.035 + (sw / 2) * Math.sin(open);
    c.slab('trim', 'accent', sw, h + 2 * t - 0.04, 0.07, cx, yc, cz, { r: 0.04, ry: -s * open });
    for (const k of [-0.28, 0, 0.28]) {
      c.slab('trim', c.shade('accent', -0.18), sw * 0.8, 0.045, 0.04, cx + s * 0.03 * Math.sin(open), yc + k * h, cz + 0.045 * Math.cos(open), { b: 0.012, ry: -s * open });
    }
  }
}

function boardUp(c: Collector, u: number, yc: number, w: number, h: number): void {
  const n = h > 1 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const y = yc - h / 2 + (h * (i + 0.5)) / n;
    const rz = (c.rng() - 0.5) * 0.3;
    c.slab('trim', c.shade('#a07850', (c.rng() - 0.5) * 0.25), w + 0.22, 0.2, 0.05, u + (c.rng() - 0.5) * 0.06, y, 0.17, { rz, r: 0.03, b: 0.015 });
    for (const s of [-1, 1]) c.ball('trim', IRON, 0.025, u + s * (w / 2 + 0.02), y + s * Math.tan(rz) * (w / 2), 0.2);
  }
}

/** Something visible behind the glass. */
function windowLife(c: Collector, kind: WindowLife, u: number, yc: number, w: number, h: number): void {
  const yb = yc - h / 2;
  const z = 0.035;
  switch (kind) {
    case 'cat': {
      const col = c.pick(CAT_COLOURS);
      const x = u + (c.rng() - 0.5) * w * 0.4;
      c.ball('trim', col, 0.11, x, yb + 0.09, z, 0.75, 0.6);
      c.ball('trim', col, 0.075, x + 0.09, yb + 0.2, z + 0.01);
      for (const s of [-1, 1]) c.cone('trim', col, 0.028, 0.06, x + 0.09 + s * 0.04, yb + 0.27, z + 0.01, -s * 0.3);
      c.torus('trim', col, 0.08, 0.018, 'z', x - 0.1, yb + 0.07, z + 0.02, Math.PI * 0.9, Math.PI);
      break;
    }
    case 'plant': {
      const x = u + (c.rng() - 0.5) * w * 0.4;
      c.cyl('trim', '#c0583a', 0.07, 0.11, 'y', x, yb + 0.06, z, 0.02);
      for (let i = 0; i < 4; i++) c.ball('trim', i % 2 ? '#5e9e3a' : '#7cbf4a', 0.07, x + (i - 1.5) * 0.04, yb + 0.17 + (i % 2) * 0.06, z);
      break;
    }
    case 'lamp': {
      const x = u + (c.rng() - 0.5) * w * 0.3;
      c.slab('trim', IRON, 0.02, 0.2, 0.02, x, yb + 0.1, z, { b: 0.006 });
      c.cone('lit', 'lit', 0.1, 0.12, x, yb + 0.25, z);
      break;
    }
    case 'person': {
      const dark = c.shade('glass', -0.45);
      const x = u + (c.rng() - 0.5) * w * 0.3;
      c.slab('glass', dark, Math.min(w * 0.6, 0.36), 0.22, 0.02, x, yb + 0.11, 0.026, { r: 0.09, b: 0, smooth: false });
      c.ball('glass', dark, 0.1, x, yb + 0.31, 0.026, 1.1, 0.15);
      break;
    }
    case 'scarf': {
      const cols = c.chance(0.5) ? ['#e05a1a', '#ffffff'] : ['#c0392b', '#ffffff'];
      const n = 6;
      for (let i = 0; i < n; i++) {
        c.slab('trim', cols[i % 2] ?? '#ffffff', (w * 0.95) / n, 0.13, 0.02, u - w * 0.45 + (w * 0.95 * (i + 0.5)) / n, yc + h * 0.22 - (i - n / 2) * 0.02, z, { r: 0.02, b: 0.005, rz: -0.12 });
      }
      break;
    }
    case 'drawing': {
      const x = u + (c.rng() - 0.5) * w * 0.3;
      const y = yc + (c.rng() - 0.3) * h * 0.3;
      const rz = (c.rng() - 0.5) * 0.3;
      c.slab('trim', '#fffdf5', 0.24, 0.19, 0.01, x, y, z, { rz, r: 0.01, b: 0 }, { contact: false });
      c.ball('trim', '#f5c542', 0.035, x + 0.06, y + 0.04, z + 0.008, 1, 0.2);
      c.slab('trim', '#7cbf4a', 0.2, 0.04, 0.01, x, y - 0.06, z + 0.006, { rz, b: 0 });
      c.slab('trim', '#e05a4f', 0.06, 0.08, 0.01, x - 0.04, y - 0.02, z + 0.008, { rz: rz + 0.78, b: 0 });
      break;
    }
    case 'lace': {
      const lace = '#fbf6ea';
      c.slab('trim', lace, w * 0.96, h * 0.22, 0.012, u, yc + h * 0.37, z, { r: 0.02, b: 0 }, { contact: false });
      const n = Math.max(4, Math.round(w / 0.09));
      for (let i = 0; i < n; i++) c.ball('trim', lace, 0.035, u - w * 0.45 + (w * 0.9 * i) / (n - 1), yc + h * 0.26, z, 1, 0.3);
      for (const s of [-1, 1]) c.slab('trim', lace, w * 0.18, h * 0.8, 0.01, u + s * w * 0.4, yc - h * 0.05, z - 0.004, { r: 0.04, b: 0 }, { contact: false });
      break;
    }
  }
}

export interface DoorSink {
  set: (v: THREE.Vector3) => void;
}

export interface DoorOpts {
  steps: number;
  arch: boolean;
  modern: boolean;
  neeNee: boolean;
  doormat: boolean;
  /** 0..1, fades the paint. */
  fade: number;
}

export function addDoor(c: Collector, u: number, w: number, h: number, o: DoorOpts, sink: DoorSink): void {
  const base = o.steps * 0.16;
  const paint: Paint = o.fade > 0 ? c.mix('door', '#9a948a', o.fade) : 'door';
  if (o.modern) {
    const t = 0.06;
    c.plate('glass', 'glass', openingShape(w * 0.35, h, 'none'), 0.02, 0.01, 0, u + w * 0.5, base + h / 2, false);
    c.slab('gloss', paint, w, h, 0.08, u - w * 0.1, base + h / 2, 0.03, { r: 0.02, b: 0.015 });
    c.slab('gloss', '#c9c9cf', 0.04, h * 0.55, 0.05, u + w * 0.28, base + h * 0.5, 0.1, { r: 0.02, b: 0.01 });
    const ring = openingShape(w * 1.4 + 2 * t, h + 2 * t, 'none');
    ring.holes.push(openingShape(w * 1.4, h, 'none'));
    c.plate('trim', 'trim', ring, 0.1, 0.05, 0.015, u + w * 0.1, base + h / 2);
    c.slab('trim', 'trim', w * 1.8, 0.1, 0.7, u + w * 0.1, base + h + 0.35, 0.35, { r: 0.04 });
  } else {
    const fan = o.arch ? w / 2 + 0.05 : 0.36;
    const H = h + fan;
    const yc = base + H / 2;
    const kind: ArchKind = o.arch ? 'round' : 'none';
    const t = 0.13;
    c.tilted(u, yc, c.jit(0.02), () => {
      c.plate('glass', 'glass', openingShape(w, H, kind), 0.02, 0.01, 0, u, yc, false);
      c.slab('gloss', paint, w, h, 0.09, u, base + h / 2, 0.03, { r: 0.03 });
      for (const py of [0.28, 0.7]) {
        for (const px of [-0.22, 0.22]) c.slab('gloss', c.shade(paint, 0.12), w * 0.32, h * 0.3, 0.05, u + px * w, base + py * h, 0.085, { r: 0.03 });
      }
      c.slab('trim', 'trim', w, 0.09, 0.08, u, base + h + 0.02, 0.05);
      c.slab('trim', 'trim', 0.06, fan, 0.06, u, base + h + fan / 2, 0.04, { b: 0.015 });
      c.ball('gloss', '#e0b04a', 0.05, u + w * 0.32, base + h * 0.5, 0.11);
      c.slab('gloss', '#e0b04a', w * 0.34, 0.06, 0.04, u, base + h * 0.62, 0.1, { b: 0.012 });
      if (o.neeNee) {
        c.slab('trim', '#ffffff', 0.12, 0.07, 0.01, u - w * 0.12, base + h * 0.7, 0.115, { r: 0.01, b: 0 });
        c.ball('trim', '#e03131', 0.016, u - w * 0.15, base + h * 0.7, 0.12, 1, 0.3);
        c.ball('trim', '#2f9e44', 0.016, u - w * 0.09, base + h * 0.7, 0.12, 1, 0.3);
      }
      const ring = openingShape(w + 2 * t, H + 2 * t, kind);
      ring.holes.push(openingShape(w, H, kind));
      c.plate('trim', 'trim', ring, 0.18, 0.09, 0.035, u, yc);
      if (o.arch) c.slab('trim', 'band', 0.24, 0.32, 0.22, u, base + H + t * 0.4, 0.12, { r: 0.05 });
    });
    // house number plate
    const nx = u + w / 2 + t + 0.2;
    c.slab('trim', '#2f5fa8', 0.2, 0.15, 0.03, nx, base + h * 0.78, 0.04, { r: 0.04, b: 0.01 });
    c.slab('trim', '#ffffff', 0.09, 0.07, 0.02, nx, base + h * 0.78, 0.06, { r: 0.02, b: 0.006 });
  }
  for (let i = 0; i < o.steps; i++) {
    const sw = w + 0.7 - i * 0.16 + c.jit(0.06);
    const sd = 0.3 * (o.steps - i);
    c.slab('trim', c.shade('ledge', c.jit(0.06)), sw, 0.17, sd, u + c.jit(0.04), 0.085 + i * 0.16, sd / 2, { r: 0.05, rz: c.jit(0.02), ry: c.jit(0.03) });
  }
  const front = 0.35 + o.steps * 0.3;
  if (o.doormat) c.slab('trim', c.pick(['#8a5a2e', '#5a6b3a', '#7a2e2a']), w * 0.9, 0.03, 0.45, u, 0.03, front + 0.15, { r: 0.05, b: 0.01 });
  sink.set(new THREE.Vector3(u, 0, front + 0.5));
}

/** Wall lantern; the glowing part flickers (mover). */
export function addLantern(c: Collector, u: number, y: number): void {
  c.slab('trim', IRON, 0.06, 0.06, 0.22, u, y + 0.22, 0.11, { b: 0.015 });
  c.slab('trim', '#3a3236', 0.2, 0.08, 0.2, u, y + 0.17, 0.24, { r: 0.04 });
  c.mover('flicker', 'lamp', [u, y, 0.24], [0, 1, 0], 0, 1, () => c.slab('lit', 'lit', 0.15, 0.22, 0.15, u, y, 0.24, { b: 0.02 }));
  c.slab('trim', '#3a3236', 0.24, 0.07, 0.24, u, y - 0.14, 0.24, { r: 0.04 });
  c.ball('trim', '#3a3236', 0.05, u, y + 0.24, 0.24);
}

export function addAwning(c: Collector, width: number, y: number): void {
  const n = Math.max(4, Math.round(width / 0.42));
  const sw = (width - 0.06) / n;
  const tilt = 0.5;
  const len = 1.0;
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + 0.03 + sw * (i + 0.5);
    const paint: Paint = i % 2 ? '#fff6e8' : 'accent';
    const droop = c.jit(0.03);
    c.slab('trim', paint, sw + 0.005, 0.06, len, x, y - (Math.sin(tilt) * len) / 2 + droop, (Math.cos(tilt) * len) / 2, { rx: tilt + c.jit(0.05), r: 0.02, b: 0.02 });
    c.slab('trim', paint, sw - 0.02, 0.24, 0.07, x, y - Math.sin(tilt) * len - 0.1 + droop, Math.cos(tilt) * len + 0.02, { r: 0.1, b: 0.025, rx: c.jit(0.08) });
  }
  c.slab('trim', c.shade('accent', -0.25), width + 0.1, 0.12, 0.16, 0, y + 0.03, 0.08, { r: 0.05 });
}

export function addWallAnchor(c: Collector, x: number, y: number): void {
  c.tilted(x, y, c.jit(0.4), () => {
    c.torus('trim', IRON, 0.1, 0.028, 'z', x, y + 0.1, 0.04, Math.PI, Math.PI / 2);
    c.torus('trim', IRON, 0.1, 0.028, 'z', x, y - 0.1, 0.04, Math.PI, -Math.PI / 2);
    c.ball('trim', IRON, 0.045, x, y, 0.06);
  });
}

// ======================================================================
// Focal points
// ======================================================================

export function addRoundWindow(c: Collector, u: number, yc: number, d: number, lit: boolean): void {
  const r = d / 2;
  c.plate(lit ? 'lit' : 'glass', lit ? 'lit' : 'glass', circleShape(r), 0.02, 0.012, 0, u, yc, false);
  if (!lit) c.slab('glass', c.shade('glass', 0.28), r * 0.3, r * 0.8, 0.01, u - r * 0.35, yc + r * 0.2, 0.026, { rz: -0.4, b: 0, r: 0.03, smooth: false });
  c.torus('trim', 'trim', r + 0.07, 0.1, 'z', u, yc, 0.08);
  for (let i = 0; i < 4; i++) c.slab('trim', 'trim', d, 0.05, 0.06, u, yc, 0.045, { rz: (i * Math.PI) / 4, b: 0.012 });
  c.ball('trim', 'trim', 0.07, u, yc, 0.07);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    c.slab('trim', 'band', 0.2, 0.26, 0.18, u + Math.cos(a) * (r + 0.12), yc + Math.sin(a) * (r + 0.12), 0.1, { rz: a + Math.PI / 2, r: 0.05 });
  }
}

export function addBayWindow(c: Collector, u: number, base: number, fh: number, maxW: number, o: WindowOpts): void {
  const w = Math.min(maxW, 2.0);
  const hgt = fh * 0.72;
  const dep = 0.55;
  const yb = base + 0.18;
  const yc = yb + hgt / 2;
  c.slab('trim', 'band', w, hgt, dep, u, yc, dep / 2, { r: 0.08, b: 0.05 });
  c.slab('trim', 'ledge', w + 0.2, 0.16, dep + 0.15, u, yb + hgt + 0.06, dep / 2 + 0.05, { r: 0.07, b: 0.05 });
  c.slab('trim', 'ledge', w + 0.12, 0.12, dep + 0.1, u, yb - 0.04, dep / 2 + 0.03, { r: 0.05 });
  for (const s of [-1, 1]) c.slab('trim', 'band', 0.14, 0.4, dep * 0.8, u + s * (w / 2 - 0.15), yb - 0.25, dep * 0.4, { rx: 0.25, r: 0.05 });
  const front = c.face.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, dep));
  c.inFrame(front, () => windowBody(c, u, yc, w * 0.7, hgt * 0.72, { ...o, shutters: false, head: false }));
  for (const s of [-1, 1]) {
    const side = c.face.clone().multiply(new THREE.Matrix4().makeTranslation(u + (s * w) / 2, 0, dep / 2)).multiply(new THREE.Matrix4().makeRotationY((s * Math.PI) / 2));
    c.inFrame(side, () => windowBody(c, 0, yc, dep * 0.55, hgt * 0.6, { ...o, flower: false, shutters: false, life: null, head: false, sill: false }));
  }
}

export function addNiche(c: Collector, u: number, yc: number, w: number, h: number, gilded: boolean): void {
  const arch = effectiveArch(w, h, 'round');
  c.plate(c.wall, c.shade('brick', -0.35), openingShape(w, h, arch), 0.01, 0.004, 0, u, yc, false);
  const ring = openingShape(w + 0.24, h + 0.24, arch);
  ring.holes.push(openingShape(w, h, arch));
  c.plate('trim', 'trim', ring, 0.2, 0.1, 0.04, u, yc);
  const stone: Paint = gilded ? '#d9b04a' : 'trim';
  const grp = gilded ? 'gloss' : 'trim';
  const yb = yc - h / 2;
  c.slab('trim', 'band', w * 0.7, 0.14, 0.3, u, yb + 0.07, 0.15, { r: 0.04 });
  c.cone(grp, stone, 0.16, h * 0.45, u, yb + 0.14 + h * 0.22, 0.14);
  c.ball(grp, stone, 0.1, u, yb + 0.14 + h * 0.48, 0.14);
  c.ball(grp, stone, 0.05, u + 0.12, yb + 0.14 + h * 0.36, 0.2);
  c.slab(grp, stone, 0.03, 0.4, 0.03, u + 0.15, yb + 0.14 + h * 0.36, 0.22, { rz: -0.2, b: 0.01 });
}

export function addBalcony(c: Collector, u: number, base: number, fh: number, w: number, modern: boolean, mattress: boolean, o: WindowOpts): void {
  const dh = fh * 0.78;
  const dw = Math.min(w * 0.5, 1.0);
  windowBody(c, u, base + 0.12 + dh / 2, dw, dh, { ...o, flower: false, sill: false, shutters: false, style: modern ? 'modern' : o.style, arch: modern ? 'none' : o.arch });
  const bw = Math.min(w, 2.2);
  const dep = 0.75;
  const y = base + 0.06;
  c.slab('trim', modern ? 'band' : 'ledge', bw, 0.12, dep, u, y, dep / 2, { r: 0.04, b: 0.03 });
  if (!modern) for (const s of [-1, 1]) c.slab('trim', 'band', 0.14, 0.42, dep * 0.8, u + s * (bw / 2 - 0.2), y - 0.25, dep * 0.4, { rx: 0.3, r: 0.05 });
  const rh = 0.85;
  if (modern) {
    c.slab('glass', c.shade('glass', 0.35), bw - 0.06, rh - 0.1, 0.03, u, y + rh / 2, dep - 0.04, { r: 0.02, b: 0, smooth: false });
    c.slab('gloss', '#c9c9cf', bw, 0.05, 0.06, u, y + rh, dep - 0.04, { b: 0.015 });
  } else {
    c.slab('trim', IRON, bw, 0.05, 0.05, u, y + rh, dep - 0.03, { b: 0.015 });
    const n = Math.max(4, Math.round(bw / 0.14));
    for (let i = 0; i <= n; i++) c.cyl('trim', IRON, 0.015, rh - 0.05, 'y', u - bw / 2 + (bw * i) / n, y + rh / 2 + 0.03, dep - 0.03, 0.006);
    for (const s of [-1, 1]) c.slab('trim', IRON, 0.05, 0.05, dep, u + s * (bw / 2), y + rh, dep / 2, { b: 0.015 });
  }
  if (c.q.props) {
    c.cyl('trim', '#c0583a', 0.12, 0.2, 'y', u + bw * 0.35, y + 0.16, dep * 0.6, 0.03);
    for (let k = 0; k < 4; k++) c.ball('trim', k % 2 ? '#5e9e3a' : '#7cbf4a', 0.1, u + bw * 0.35 + (k - 1.5) * 0.05, y + 0.34 + (k % 2) * 0.07, dep * 0.6);
    if (mattress) {
      const cols = ['#e8d8c0', '#7aa0d8'];
      for (let i = 0; i < 5; i++) c.slab('trim', cols[i % 2] ?? '#e8d8c0', 0.16, 1.2, 0.14, u - bw * 0.25 + (i - 2) * 0.155, y + 0.62, dep - 0.16, { rx: -0.35, rz: 0.08, r: 0.06, b: 0.04 });
    }
  }
}

const STONE_ICONS = ['ship', 'mug', 'bird', 'sun', 'key'] as const;

export function addGableStone(c: Collector, u: number, yc: number): void {
  const w = 0.82;
  const h = 0.66;
  c.slab('trim', 'trim', w + 0.16, h + 0.16, 0.12, u, yc, 0.06, { r: 0.08, b: 0.04 });
  c.slab('trim', c.mix('band', '#7aa0c8', 0.35), w, h, 0.1, u, yc, 0.09, { r: 0.05, b: 0.02 });
  const z = 0.16;
  const icon = c.pick(STONE_ICONS);
  const gold: Paint = '#d9b04a';
  switch (icon) {
    case 'ship':
      c.slab('gloss', '#8a5a2e', 0.5, 0.12, 0.05, u, yc - 0.16, z, { r: 0.06 });
      c.slab('gloss', '#3a2a22', 0.03, 0.38, 0.03, u, yc + 0.04, z, { b: 0.008 });
      c.slab('gloss', '#fff8ea', 0.26, 0.22, 0.03, u + 0.03, yc + 0.06, z, { r: 0.04, rz: -0.08 });
      break;
    case 'mug':
      c.cyl('gloss', '#f2a531', 0.12, 0.28, 'y', u, yc - 0.06, z, 0.03);
      for (const dx of [-0.07, 0, 0.07]) c.ball('gloss', '#fffaf0', 0.07, u + dx, yc + 0.1, z);
      c.torus('gloss', '#f2a531', 0.07, 0.02, 'z', u + 0.14, yc - 0.06, z);
      break;
    case 'bird':
      c.ball('gloss', gold, 0.13, u, yc - 0.03, z, 0.8, 0.4);
      c.ball('gloss', gold, 0.07, u + 0.13, yc + 0.08, z, 1, 0.5);
      c.cone('gloss', '#e0702a', 0.03, 0.08, u + 0.22, yc + 0.08, z, -Math.PI / 2);
      break;
    case 'sun':
      c.ball('gloss', gold, 0.12, u, yc, z, 1, 0.4);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        c.slab('gloss', gold, 0.1, 0.03, 0.03, u + Math.cos(a) * 0.2, yc + Math.sin(a) * 0.2, z, { rz: a, b: 0.008 });
      }
      break;
    case 'key':
      c.torus('gloss', gold, 0.08, 0.025, 'z', u - 0.15, yc, z);
      c.slab('gloss', gold, 0.34, 0.05, 0.03, u + 0.05, yc, z, { b: 0.01 });
      for (const dx of [0.14, 0.2]) c.slab('gloss', gold, 0.04, 0.08, 0.03, u + dx, yc - 0.05, z, { b: 0.008 });
      break;
  }
}

export function addBigSign(c: Collector, width: number, y: number, text: string | null): void {
  c.slab('trim', 'accent', width, 0.56, 0.12, 0, y, 0.1, { r: 0.22, b: 0.05 });
  c.slab('trim', 'trim', width - 0.24, 0.38, 0.06, 0, y, 0.15, { r: 0.15, b: 0.02 });
  if (text) c.signText(text, width - 0.4, 0.3, 0, y, 0.19, c.shade('accent', -0.35));
}
