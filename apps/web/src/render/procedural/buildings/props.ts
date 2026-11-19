/**
 * Storytelling props and identity markers. Facade frame unless noted:
 * u across, y up, +z out of the wall (the pavement is in front, z > 0).
 */
import * as THREE from 'three';
import { circleShape, rrectShape, type Collector, type Paint } from './collector';
import { IRON } from './facade';

const GREENS = ['#4f8f34', '#5e9e3a', '#6fae44', '#3f7a2c'];
const GOLD = '#d9b04a';

// ======================================================================
// Street level
// ======================================================================

export function addBike(c: Collector, u: number, z: number, flatTyre: boolean): void {
  const paint = c.pick(['#2f6fa8', '#c0392b', '#2e7d6b', '#e0a43a', '#3a3236', '#9a9aa0']);
  const wr = 0.3;
  const y = wr + 0.02;
  const R = u - 0.48;
  const F = u + 0.48;
  const lean = 0.08 + c.rng() * 0.08;
  c.tilted(u, 0, 0, () => {
    for (const [x, flat] of [
      [R, flatTyre],
      [F, false],
    ] as const) {
      const g = new THREE.TorusGeometry(wr, 0.035, 8, c.q.radial);
      if (flat) g.scale(1, 0.82, 1);
      g.translate(x, flat ? y - 0.05 : y, z);
      c.add('trim', g, '#2b2a30');
      c.torus('trim', '#d6d6dc', wr - 0.05, 0.012, 'z', x, flat ? y - 0.05 : y, z);
      c.cyl('trim', '#d6d6dc', 0.035, 0.08, 'z', x, flat ? y - 0.05 : y, z, 0.01);
    }
  });
  const S: [number, number] = [u - 0.16, y + 0.5];
  const H: [number, number] = [u + 0.32, y + 0.55];
  const C: [number, number] = [u, y - 0.02];
  const t = 0.045;
  c.bar('trim', paint, R, y, S[0], S[1], z, t);
  c.bar('trim', paint, S[0], S[1], C[0], C[1], z, t);
  c.bar('trim', paint, C[0], C[1], R, y, z, t);
  c.bar('trim', paint, S[0], S[1], H[0], H[1], z, t);
  c.bar('trim', paint, H[0], H[1], C[0], C[1], z, t);
  c.bar('trim', paint, H[0], H[1], F, y, z, t);
  c.slab('trim', '#3a2a22', 0.22, 0.06, 0.12, S[0] - 0.02, S[1] + 0.07, z, { r: 0.03 });
  c.slab('trim', '#3a3236', 0.05, 0.05, 0.5, H[0] + 0.03, H[1] + 0.12, z, { r: 0.02, ry: lean });
  c.slab('trim', '#a8703f', 0.32, 0.2, 0.3, F + 0.05, y + 0.34, z, { r: 0.03 });
  c.slab('trim', 'band', 0.28, 0.08, 0.22, R + 0.02, y + 0.33, z, { r: 0.03 });
}

export function addKliko(c: Collector, u: number, z: number): void {
  const col = c.pick(['#3f7a3c', '#3f7a3c', '#5a5f66', '#2f5fa8']);
  c.slab('trim', col, 0.55, 0.9, 0.6, u, 0.5, z, { r: 0.08, b: 0.05, rx: -0.03 });
  c.slab('trim', c.shade(col, -0.15), 0.6, 0.08, 0.66, u, 0.97, z + 0.01, { r: 0.04, rx: c.jit(0.15) - 0.05 });
  for (const s of [-1, 1]) c.cyl('trim', '#2b2a30', 0.08, 0.06, 'x', u + s * 0.22, 0.09, z - 0.22, 0.02);
}

export function addGardenStrip(c: Collector, u0: number, u1: number): void {
  const w = Math.abs(u1 - u0);
  if (w < 0.4) return;
  const u = (u0 + u1) / 2;
  c.slab('trim', '#8a7f70', w, 0.12, 0.34, u, 0.06, 0.17, { r: 0.04 });
  c.slab('trim', '#5a4632', w - 0.08, 0.05, 0.28, u, 0.13, 0.17, { r: 0.03 });
  const n = Math.max(2, Math.round(w / 0.28));
  const cols = ['#e86a9a', '#f4b6c8', '#ffffff', '#c0392b', '#f5c542'];
  for (let i = 0; i < n; i++) {
    const x = u - w / 2 + 0.14 + ((w - 0.28) * i) / Math.max(1, n - 1);
    const hgt = 1.0 + c.rng() * 0.9;
    c.cyl('trim', '#4f8f34', 0.018, hgt, 'y', x, 0.15 + hgt / 2, 0.17, 0.008);
    for (let k = 0; k < 3; k++) c.ball('trim', c.pick(GREENS), 0.08, x + (k - 1) * 0.06, 0.25 + k * 0.05, 0.17 + (k % 2) * 0.05);
    const col = c.pick(cols);
    for (let k = 0; k < 5; k++) c.ball('trim', col, 0.05 - k * 0.004, x + (k % 2 ? 0.03 : -0.03), 0.15 + hgt * (0.55 + k * 0.09), 0.2);
  }
}

export function addParcel(c: Collector, u: number, z: number): void {
  c.slab('trim', '#c49a6c', 0.42, 0.3, 0.34, u, 0.17, z, { r: 0.03, b: 0.02, ry: c.jit(0.4) + 0.2 });
  c.slab('trim', '#e8d8b0', 0.43, 0.04, 0.08, u, 0.33, z, { b: 0.01, ry: c.jit(0.4) + 0.2 });
}

export function addApron(c: Collector, W: number, pub: boolean): void {
  const rows = 3;
  const cols = Math.max(3, Math.round(W / 0.5));
  const cw = W / cols;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const off = r % 2 ? cw / 2 : 0;
      const x = -W / 2 + cw * (i + 0.5) + off;
      if (x > W / 2 - cw * 0.3) continue;
      const curb = r === rows - 1;
      c.slab('trim', c.shade(curb ? '#a99f94' : '#c2b8ac', (c.rng() - 0.5) * 0.14), cw - 0.05 + c.jit(0.04), (curb ? 0.16 : 0.1) + c.jit(0.02), 0.42, x, curb ? 0.08 : 0.05, 0.24 + r * 0.46, {
        r: 0.06,
        ry: c.jit(0.06),
      }, { contact: false });
    }
  }
  if (c.q.props) {
    for (let x = -W / 2 + 0.5; x < W / 2 - 0.2; x += 1.6) {
      c.cyl('trim', '#6b2a22', 0.075, 0.7, 'y', x, 0.45, 1.16, 0.03);
      c.ball('trim', '#6b2a22', 0.085, x, 0.82, 1.16);
    }
  }
  if (!pub || !c.q.props) return;
  const pot = (x: number, z: number) => {
    c.cyl('trim', '#b8653f', 0.17, 0.3, 'y', x, 0.25, z, 0.04);
    for (let k = 0; k < 5; k++) c.ball('trim', k % 2 ? '#5e9e3a' : '#7cbf4a', 0.12, x + (k - 2) * 0.05, 0.48 + (k % 2) * 0.07, z + ((k % 3) - 1) * 0.05);
  };
  const bench = (x: number, z: number) => {
    c.slab('trim', '#a8703f', 1.0, 0.08, 0.32, x, 0.48, z, { r: 0.03, rz: c.jit(0.03) });
    for (const lx of [-0.4, 0.4]) c.slab('trim', '#7a4f2c', 0.08, 0.38, 0.28, x + lx, 0.25, z, { b: 0.02 });
  };
  pot(-W / 2 + 0.3, 0.35);
  pot(W / 2 - 0.3, 0.35);
  bench(-W / 4 - 0.1, 0.45);
  addBarrel(c, W / 4 + 0.35, 0.42, 1);
}

export function addBarrel(c: Collector, u: number, z: number, scale: number): void {
  const r = 0.24 * scale;
  const h = 0.6 * scale;
  c.cyl('trim', '#9a6234', r, h, 'y', u, h / 2 + 0.1, z, 0.06 * scale);
  c.ball('trim', '#9a6234', r * 1.04, u, h / 2 + 0.1, z, 0.9);
  for (const yy of [0.15, 0.5, 0.85]) c.torus('trim', '#4a4046', r * 1.04, 0.02 * scale, 'y', u, 0.1 + h * yy, z);
}

export function addCrateStack(c: Collector, u: number, z: number): void {
  const layers = 2 + Math.floor(c.rng() * 2);
  for (let l = 0; l < layers; l++) {
    const y = 0.15 + l * 0.3;
    c.slab('trim', c.pick(['#c58b4b', '#2f6b4f', '#c0392b']), 0.5, 0.28, 0.36, u + c.jit(0.05), y, z, { r: 0.03, ry: c.jit(0.15) });
    for (let k = 0; k < 3; k++) c.ball('trim', '#f2a531', 0.05, u - 0.12 + k * 0.12, y + 0.17, z, 1.4);
  }
}

export function addWeeds(c: Collector, W: number, eave: number): void {
  const n = Math.round(3 + 5 * c.r.weathering);
  for (let i = 0; i < n; i++) {
    const x = (c.rng() - 0.5) * (W - 0.3);
    for (let k = 0; k < 3; k++) c.cone('trim', c.pick(GREENS), 0.04, 0.2 + c.rng() * 0.15, x + (k - 1) * 0.05, 0.1, 0.12, (k - 1) * 0.4);
  }
  // a tuft in the gutter
  const x = (c.rng() - 0.5) * (W - 0.6);
  for (let k = 0; k < 3; k++) c.cone('trim', c.pick(GREENS), 0.05, 0.25, x + (k - 1) * 0.06, eave + 0.2, 0.1, (k - 1) * 0.5);
}

export function addMoss(c: Collector, W: number): void {
  const n = Math.round(4 + 8 * c.r.weathering);
  for (let i = 0; i < n; i++) c.ball('trim', c.shade('#6f8f4a', (c.rng() - 0.5) * 0.2), 0.08 + c.rng() * 0.08, (c.rng() - 0.5) * (W - 0.2), 0.32 + c.rng() * 0.12, 0.08, 0.6, 0.4);
}

/** Brick showing through chipped plaster (brick group, so it gets the brick texture). */
export function addChippedPlaster(c: Collector, W: number, eave: number): void {
  const n = Math.round(2 + 6 * c.r.weathering);
  for (let i = 0; i < n; i++) {
    const w = 0.3 + c.rng() * 0.5;
    const h = 0.2 + c.rng() * 0.35;
    c.plate('brick', c.mix('#8a3f2c', 'brick', 0.25), rrectShape(w, h, 0.08, c.q), 0.008, 0.004, 0, (c.rng() - 0.5) * (W - w - 0.3), 0.6 + c.rng() * (eave - 1.2), false, (c.rng() - 0.5) * 0.6);
  }
}

// ======================================================================
// Facade life
// ======================================================================

export function addIvy(c: Collector, x0: number, minX: number, maxX: number, top: number): void {
  let x = x0;
  for (let y = 0.35; y < top; y += 0.16) {
    const spread = 0.2 + 0.25 * Math.min(1, y / 1.5);
    const n = 2 + Math.floor(c.rng() * 3);
    for (let k = 0; k < n; k++) {
      const bx = Math.max(minX, Math.min(maxX, x + (c.rng() - 0.5) * spread));
      c.ball('trim', c.pick(GREENS), 0.08 + c.rng() * 0.06, bx, y + (c.rng() - 0.5) * 0.12, 0.05 + c.rng() * 0.06, 1, 0.55);
    }
    x += (c.rng() - 0.5) * 0.22;
    x = Math.max(minX, Math.min(maxX, x));
  }
}

export function addLaundry(c: Collector, u: number, y: number, w: number): void {
  for (const s of [-1, 1]) c.slab('trim', IRON, 0.04, 0.04, 0.3, u + (s * w) / 2, y, 0.15, { b: 0.01 });
  c.mover('sway', 'laundry', [u, y, 0.3], [1, 0, 0], 0.12, 0.6, () => {
    c.cyl('trim', '#e8e0d0', 0.008, w, 'x', u, y, 0.3, 0.004);
    const cols = ['#ffffff', '#7aa0d8', '#e86a6a', '#f5c542', '#7cbf4a', '#fbf6ea'];
    let x = u - w / 2 + 0.15;
    while (x < u + w / 2 - 0.15) {
      const gw = 0.18 + c.rng() * 0.2;
      const gh = 0.22 + c.rng() * 0.25;
      c.slab('trim', c.pick(cols), gw, gh, 0.03, x + gw / 2, y - gh / 2 - 0.02, 0.3, { r: 0.04, b: 0.01, rz: c.jit(0.1) }, { contact: false });
      x += gw + 0.05;
    }
  });
}

export function addSatellite(c: Collector, u: number, y: number): void {
  c.slab('trim', IRON, 0.05, 0.05, 0.35, u, y, 0.17, { b: 0.012 });
  const g = new THREE.SphereGeometry(0.32, c.q.sphere[0], c.q.sphere[1], 0, Math.PI * 2, 0, Math.PI / 2.6);
  g.scale(1, 0.45, 1);
  g.rotateX(-Math.PI / 2 + 0.4);
  g.rotateY(-0.5);
  g.translate(u, y + 0.05, 0.38);
  c.add('trim', g, '#e8e8ea');
  c.slab('trim', IRON, 0.03, 0.03, 0.3, u + 0.08, y + 0.08, 0.55, { rx: 0.4, b: 0.008 });
  c.ball('trim', '#3a3236', 0.04, u + 0.12, y + 0.14, 0.68);
}

/** Flag on a pole sticking out of the wall at 45°. colours: stripes top to bottom. */
export function addFlag(c: Collector, u: number, y: number, colours: readonly Paint[]): void {
  const len = 1.3;
  const a = Math.PI / 4;
  const d: [number, number] = [Math.sin(a), Math.cos(a)]; // along the pole (y, z)
  const e: [number, number] = [-Math.cos(a), Math.sin(a)]; // away from the pole, downward
  const tipY = y + d[0] * len;
  const tipZ = d[1] * len;
  const pole = new THREE.CylinderGeometry(0.025, 0.025, len, 8);
  pole.rotateX(Math.PI / 2 - a);
  pole.translate(u, y + (d[0] * len) / 2, tipZ / 2);
  c.add('trim', pole, '#e8e0d0');
  c.ball('gloss', GOLD, 0.05, u, tipY, tipZ);
  const fw = 0.75;
  const fh = 0.5;
  c.mover('wave', 'flag', [u, tipY, tipZ], [0, d[0], d[1]], 0.3, 0.9, () => {
    colours.forEach((col, i) => {
      const sh = fh / colours.length;
      const along = 0.06 + fw / 2;
      const down = sh * (i + 0.5) + 0.03;
      c.slab('trim', col, 0.02, sh + 0.004, fw, u, tipY - d[0] * along + e[0] * down, tipZ - d[1] * along + e[1] * down, { rx: -a, r: 0.01, b: 0.006 }, { contact: false });
    });
  });
}

export function addXmasLights(c: Collector, W: number, y: number, hasLit: boolean): void {
  if (!hasLit) return;
  const cols = ['#ff5a5a', '#ffd25a', '#5ad1ff', '#7cff7a', '#ff9af0'];
  c.mover('flicker', 'lights', [0, y, 0.2], [0, 1, 0], 0, 2, () => {
    const n = Math.max(6, Math.round(W / 0.22));
    for (let i = 0; i <= n; i++) {
      const x = -W / 2 + (W * i) / n;
      const sag = Math.sin((i / n) * Math.PI * 3) * 0.05;
      c.ball('lit', cols[i % cols.length] ?? '#ffd25a', 0.045, x, y - 0.06 - Math.abs(sag), 0.2);
    }
  });
}

export function addBirdNest(c: Collector, x: number, y: number, z: number): void {
  c.torus('trim', '#8a6a3a', 0.13, 0.05, 'y', x, y + 0.04, z);
  c.ball('trim', '#7a5a2e', 0.12, x, y, z, 0.4);
  for (let i = 0; i < 2; i++) c.ball('trim', '#bfe0ff', 0.035, x - 0.03 + i * 0.06, y + 0.06, z);
}

export function addPigeon(c: Collector, x: number, y: number, z: number): void {
  const grey = '#8f949c';
  const s = c.chance(0.5) ? 1 : -1;
  c.ball('trim', grey, 0.09, x, y + 0.08, z, 0.8, 1.4);
  c.ball('trim', grey, 0.055, x + s * 0.0, y + 0.18, z + 0.08);
  c.ball('trim', '#6a8f7a', 0.05, x, y + 0.13, z + 0.06, 0.8);
  c.cone('trim', '#e0a43a', 0.015, 0.05, x, y + 0.18, z + 0.14, 0);
  c.cone('trim', '#5a5f66', 0.05, 0.12, x, y + 0.09, z - 0.13, Math.PI / 2);
}

export function addPosters(c: Collector, u: number, y: number, w: number): void {
  const cols = ['#f5c542', '#e86a6a', '#7aa0d8', '#7cbf4a', '#ffffff', '#ff9af0'];
  const n = 2 + Math.floor(c.rng() * 3);
  for (let i = 0; i < n; i++) {
    const pw = 0.3 + c.rng() * 0.2;
    const ph = 0.4 + c.rng() * 0.2;
    const x = u + (c.rng() - 0.5) * w;
    const yy = y + (c.rng() - 0.5) * 0.4;
    const rz = (c.rng() - 0.5) * 0.3;
    c.slab('trim', c.pick(cols), pw, ph, 0.01, x, yy, 0.01 + i * 0.004, { rz, r: 0.01, b: 0 }, { contact: false });
    c.slab('trim', '#2b2b2e', pw * 0.7, 0.05, 0.01, x, yy + ph * 0.25, 0.016 + i * 0.004, { rz, b: 0 }, { contact: false });
  }
}

export function addTeKoop(c: Collector, u: number, y: number): void {
  c.slab('trim', IRON, 0.05, 0.05, 0.5, u, y + 0.4, 0.25, { b: 0.012 });
  c.mover('swing', 'sign', [u, y + 0.4, 0.42], [1, 0, 0], 0.05, 0.5, () => {
    c.slab('trim', '#f08c00', 0.9, 0.5, 0.05, u, y + 0.08, 0.42, { r: 0.05, b: 0.015 });
    c.signText('TE KOOP', 0.78, 0.3, u, y + 0.08, 0.45, '#ffffff');
    c.slab('trim', IRON, 0.02, 0.1, 0.02, u - 0.3, y + 0.35, 0.42, { b: 0.006 });
    c.slab('trim', IRON, 0.02, 0.1, 0.02, u + 0.3, y + 0.35, 0.42, { b: 0.006 });
  });
}

export function addYearStone(c: Collector, u: number, y: number): void {
  c.slab('trim', 'trim', 1.05, 0.34, 0.08, u, y, 0.04, { r: 0.08, b: 0.03 });
  c.signText(c.pick(['ANNO 1672', 'ANNO 1718', 'ANNO 1764', 'ANNO 1893']), 0.95, 0.26, u, y, 0.085, c.shade('ledge', -0.2));
}

export function addSynergyPlate(c: Collector, u: number, y: number): void {
  c.slab('gloss', GOLD, 0.46, 0.3, 0.03, u, y, 0.02, { r: 0.03, b: 0.01 });
  c.signText('SYNERGY', 0.4, 0.1, u, y + 0.04, 0.037, '#3a2a22');
  synergyLogo(c, u, y - 0.07, 0.05, 0.04, '#3a2a22');
}

export function addLinkedInBanner(c: Collector, u: number, top: number, len: number): void {
  c.slab('trim', IRON, 0.9, 0.05, 0.05, u, top, 0.12, { b: 0.012 });
  c.mover('sway', 'flag', [u, top, 0.12], [1, 0, 0], 0.05, 0.4, () => {
    c.slab('trim', '#2f6fa8', 0.8, len, 0.03, u, top - len / 2 - 0.03, 0.12, { r: 0.04, b: 0.01 }, { contact: false });
    c.signText('THRIVING', 0.7, 0.2, u, top - 0.3, 0.14, '#ffffff');
    synergyLogo(c, u, top - len * 0.6, 0.2, 0.14, '#ffffff');
  });
}

export function addSolarPanels(c: Collector, W: number, D: number, eave: number): void {
  const cols = Math.max(1, Math.floor((W - 1) / 1.1));
  const rows = Math.max(1, Math.floor((D - 1.5) / 1.4));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = -W / 2 + 0.6 + 1.1 * (i + 0.5);
      const z = -D / 2 + 0.8 + 1.4 * (j + 0.5);
      c.slab('gloss', '#24324f', 0.95, 0.05, 1.1, x, eave + 0.45, z, { rx: -0.35, r: 0.03, b: 0.015 });
      c.slab('trim', '#c9c9cf', 0.05, 0.3, 0.05, x, eave + 0.3, z + 0.35, { b: 0.01 });
    }
  }
}

// ======================================================================
// Identity markers (important buildings)
// ======================================================================

/** The € sign as extrudable shapes, centred at (0,0), height ~2R. */
export function euroShapes(R: number): THREE.Shape[] {
  const ring = new THREE.Shape();
  ring.absarc(0, 0, R, 0.75, Math.PI * 2 - 0.75, false);
  ring.absarc(0, 0, R * 0.7, Math.PI * 2 - 0.75, 0.75, true);
  ring.closePath();
  const bars: THREE.Shape[] = [0.2, -0.2].map((yy) => {
    const s = new THREE.Shape();
    const h = R * 0.15;
    const x0 = -R * 1.2;
    const x1 = R * 0.25;
    s.moveTo(x0, yy * R - h / 2);
    s.lineTo(x1, yy * R - h / 2);
    s.lineTo(x1 + h * 0.4, yy * R + h / 2);
    s.lineTo(x0 + h * 0.4, yy * R + h / 2);
    s.closePath();
    return s;
  });
  return [ring, ...bars];
}

/** Gold medallion with a big € (bank). */
export function addEuroMedallion(c: Collector, u: number, y: number, R: number): void {
  c.slab('trim', 'band', R * 1.5, 0.3, 0.5, u, y - R - 0.05, 0.2, { r: 0.08 });
  c.plate('gloss', GOLD, circleShape(R), 0.12, 0.08, 0.04, u, y);
  c.torus('gloss', c.shade(GOLD, -0.15), R, 0.06, 'z', u, y, 0.15);
  c.plate('gloss', c.shade(GOLD, 0.15), euroShapes(R * 0.62), 0.1, 0.2, 0.025, u + R * 0.08, y);
}

export function addBankPortico(c: Collector, doorU: number, Hg: number, steps: number, text: string | null): void {
  const base = steps * 0.16;
  const colH = Hg - base - 0.45;
  for (const dx of [-1.6, -0.95, 0.95, 1.6]) {
    c.slab('trim', 'band', 0.44, 0.18, 0.44, doorU + dx, base + 0.09, 0.95, { r: 0.05 });
    c.cyl('trim', 'band', 0.17, colH, 'y', doorU + dx, base + 0.18 + colH / 2, 0.95, 0.04);
    c.slab('trim', 'band', 0.44, 0.16, 0.44, doorU + dx, base + 0.18 + colH + 0.08, 0.95, { r: 0.05 });
  }
  const beamY = base + 0.18 + colH + 0.32;
  c.slab('trim', 'band', 4.1, 0.42, 1.3, doorU, beamY, 0.85, { r: 0.08, b: 0.05 });
  c.slab('trim', 'trim', 4.3, 0.12, 1.42, doorU, beamY + 0.25, 0.86, { r: 0.05 });
  if (text) {
    c.slab('gloss', GOLD, 2.3, 0.3, 0.04, doorU, beamY, 1.51, { r: 0.04, b: 0.01 });
    c.signText(text, 2.1, 0.24, doorU, beamY, 1.535, '#3a2a22');
  }
}

/** Big 3D beer mug with foam (pub). */
export function addBeerMug(c: Collector, u: number, y: number, z: number, s: number): void {
  c.cyl('gloss', '#f2a531', 0.22 * s, 0.5 * s, 'y', u, y, z, 0.05 * s);
  c.cyl('trim', '#fff6e0', 0.235 * s, 0.06 * s, 'y', u, y - 0.2 * s, z, 0.02 * s);
  for (const [dx, dy, r] of [
    [-0.12, 0.27, 0.12],
    [0.02, 0.32, 0.14],
    [0.14, 0.27, 0.11],
    [0.06, 0.4, 0.1],
  ] as const) c.ball('trim', '#fffaf0', r * s, u + dx * s, y + dy * s, z + 0.02 * s);
  c.ball('trim', '#fffaf0', 0.06 * s, u + 0.2 * s, y + 0.12 * s, z + 0.1 * s, 1.6);
  c.torus('gloss', '#f2a531', 0.13 * s, 0.04 * s, 'z', u + 0.26 * s, y, z);
  for (let i = 0; i < 5; i++) c.ball('gloss', '#ffe08a', 0.02 * s, u + (c.rng() - 0.5) * 0.25 * s, y + (c.rng() - 0.5) * 0.3 * s, z + 0.22 * s);
}

/** Hanging pub sign with a beer mug on both sides; swings. */
export function addBeerSign(c: Collector, u: number, y: number, s: number): void {
  c.slab('trim', IRON, 0.07, 0.07, 1.1 * s, u, y + 0.55 * s, 0.55 * s, { b: 0.02 });
  c.torus('trim', IRON, 0.13 * s, 0.03, 'x', u, y + 0.42 * s, 0.24 * s, Math.PI * 1.5);
  const bz = 0.7 * s;
  c.mover('swing', 'sign', [u, y + 0.55 * s, bz], [0, 0, 1], 0.06, 0.45, () => {
    c.cyl('trim', IRON, 0.012, 0.18 * s, 'y', u, y + 0.47 * s, bz - 0.28 * s, 0.005);
    c.cyl('trim', IRON, 0.012, 0.18 * s, 'y', u, y + 0.47 * s, bz + 0.28 * s, 0.005);
    c.slab('trim', 'accent', 0.1, 0.95 * s, 0.82 * s, u, y, bz, { r: 0.16 * s });
    c.slab('trim', 'trim', 0.13, 0.78 * s, 0.65 * s, u, y, bz, { r: 0.12 * s });
    for (const side of [-1, 1]) {
      const g = new THREE.Matrix4().makeTranslation(u + side * 0.09, 0, bz).multiply(new THREE.Matrix4().makeRotationY((side * Math.PI) / 2));
      c.inFrame(c.face.clone().multiply(g), () => addBeerMug(c, 0, y - 0.02 * s, 0, 0.62 * s));
    }
  });
}

/** Amsterdam-style shield: red, black band, three white crosses (municipality). */
export function addCoatOfArms(c: Collector, u: number, y: number, s: number): void {
  const sh = new THREE.Shape();
  const w = 0.42 * s;
  const h = 0.55 * s;
  sh.moveTo(-w, h * 0.5);
  sh.lineTo(w, h * 0.5);
  sh.lineTo(w, -h * 0.1);
  sh.quadraticCurveTo(w, -h * 0.6, 0, -h * 0.75);
  sh.quadraticCurveTo(-w, -h * 0.6, -w, -h * 0.1);
  sh.closePath();
  c.plate('gloss', GOLD, sh, 0.1, 0.05, 0.03, u, y);
  const inner = new THREE.Shape(sh.getPoints(12).map((p) => new THREE.Vector2(p.x * 0.86, p.y * 0.86)));
  c.plate('gloss', '#c0392b', inner, 0.06, 0.1, 0.02, u, y);
  c.slab('gloss', '#1f1f22', 0.22 * s, 0.98 * h, 0.04, u, y - 0.05 * s, 0.13, { b: 0.01, r: 0.02 });
  for (const dy of [0.2, 0, -0.2]) {
    for (const a of [0.78, -0.78]) c.slab('gloss', '#ffffff', 0.17 * s, 0.045 * s, 0.03, u, y + dy * s - 0.03 * s, 0.16, { rz: a, b: 0.008 });
  }
  c.ball('gloss', GOLD, 0.08 * s, u, y + h * 0.62, 0.07);
}

/** Friendly logo: rounded triangle, an eye and a smile. (Synergy, later revealed as a cult.) */
export function synergyLogo(c: Collector, u: number, y: number, s: number, z: number, paint: Paint): void {
  const tri = new THREE.Shape();
  const k = s;
  tri.moveTo(0, k);
  tri.quadraticCurveTo(k * 0.15, k * 1.0, k * 0.9, -k * 0.45);
  tri.quadraticCurveTo(k * 0.95, -k * 0.6, k * 0.75, -k * 0.6);
  tri.lineTo(-k * 0.75, -k * 0.6);
  tri.quadraticCurveTo(-k * 0.95, -k * 0.6, -k * 0.9, -k * 0.45);
  tri.quadraticCurveTo(-k * 0.15, k * 1.0, 0, k);
  const ring = new THREE.Shape(tri.getPoints(8));
  ring.holes.push(new THREE.Path(tri.getPoints(8).map((p) => new THREE.Vector2(p.x * 0.78, p.y * 0.78 - k * 0.04))));
  c.plate('gloss', paint, ring, k * 0.25, z, k * 0.05, u, y);
  c.torus('gloss', paint, k * 0.2, k * 0.05, 'z', u, y + k * 0.02, z);
  c.ball('gloss', paint, k * 0.08, u, y + k * 0.02, z + k * 0.03, 1, 0.5);
  c.torus('gloss', paint, k * 0.22, k * 0.04, 'z', u, y - k * 0.08, z, Math.PI * 0.6, Math.PI * 1.2);
}

/** Neon coffee cup in the shop window; always glows (flicker mover). */
export function addNeonCup(c: Collector, u: number, y: number, z: number): void {
  c.mover('flicker', 'neon', [u, y, z], [0, 1, 0], 0, 3, () => {
    const pink = '#ff6fae';
    c.torus('lit', pink, 0.22, 0.03, 'z', u, y + 0.05, z, Math.PI, Math.PI);
    for (const s of [-1, 1]) c.slab('lit', pink, 0.06, 0.28, 0.06, u + s * 0.22, y + 0.19, z, { r: 0.03, b: 0.01 });
    c.torus('lit', pink, 0.09, 0.03, 'z', u + 0.3, y + 0.16, z, Math.PI * 1.2, -Math.PI * 0.6);
    for (const dx of [-0.08, 0.08]) {
      c.torus('lit', '#9ae6ff', 0.06, 0.02, 'z', u + dx, y + 0.42, z, Math.PI, Math.PI / 2);
      c.torus('lit', '#9ae6ff', 0.06, 0.02, 'z', u + dx, y + 0.54, z, Math.PI, -Math.PI / 2);
    }
  });
}
