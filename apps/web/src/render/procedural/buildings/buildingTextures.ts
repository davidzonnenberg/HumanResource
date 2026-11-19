/**
 * Procedural canvas textures for the toy look, generated once at start-up.
 * Brick / slate / plaster: near-white colour map (tinted by vertex colour) plus a
 * normal map baked from a height map. Bricks and slates are hand-laid: widths
 * vary per row (rows still tile), slight tilt, some chipped or darker.
 * Sign atlas: white painted letters on transparent cells, tinted by vertex colour.
 * Mapping: 1 UV unit = 1 metre (see worldUv in buildingGeometry.ts).
 */
import * as THREE from 'three';
import { mulberry32, type Rng } from './randomBuilding';
import { ATLAS_COLS, ATLAS_ROWS, SIGN_TEXTS } from './signAtlas';

const S = 512;

function canvas(w = S, h = S): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas not available');
  return [c, g];
}

const grey = (v: number) => {
  const n = Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${n},${n},${n})`;
};

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

function pillow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, base: number, top: number, steps = 8): void {
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const inset = t * Math.min(w, h) * 0.24;
    g.fillStyle = grey(base + (top - base) * Math.sqrt(t));
    rrect(g, x + inset, y + inset, w - 2 * inset, h - 2 * inset, Math.max(1, r - inset * 0.5));
    g.fill();
  }
}

function rowWidths(rng: Rng, avg: number, spread: number): number[] {
  const n = Math.max(2, Math.round(S / avg));
  const raw = Array.from({ length: n }, () => 1 - spread + rng() * 2 * spread);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => (v / sum) * S);
}

function wrapped(fn: (dx: number) => void): void {
  for (const dx of [-S, 0, S]) fn(dx);
}

function normalFromHeight(src: CanvasRenderingContext2D, strength: number): HTMLCanvasElement {
  const h = src.getImageData(0, 0, S, S).data;
  const [c, g] = canvas();
  const out = g.createImageData(S, S);
  const at = (x: number, y: number) => (h[(((y + S) % S) * S + ((x + S) % S)) * 4] ?? 0) / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * S + x) * 4;
      out.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export interface SurfaceTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

export function makeBrickTextures(seed = 7): SurfaceTextures {
  const rng = mulberry32(seed);
  const [cc, cg] = canvas();
  const [, hg] = canvas();
  cg.fillStyle = grey(0.7);
  cg.fillRect(0, 0, S, S);
  hg.fillStyle = grey(0.05);
  hg.fillRect(0, 0, S, S);
  const rows = 10;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const widths = rowWidths(rng, S / 3, 0.25);
    let x = -rng() * (widths[0] ?? 0) * 0.6;
    for (const bw of widths) {
      const gap = 6 + rng() * 3;
      const w = bw - gap;
      const h = rh - gap - rng() * 3;
      const bx = x + gap / 2;
      const by = r * rh + gap / 2 + (rng() - 0.5) * 2.5;
      const rot = (rng() - 0.5) * 0.035;
      const radius = 7 + rng() * 8;
      const dark = rng() < 0.08;
      const v = dark ? 0.68 + rng() * 0.08 : 0.86 + rng() * 0.14;
      const top = 0.8 + rng() * 0.2;
      const chip = rng() < 0.12;
      wrapped((dx) => {
        for (const [g, isHeight] of [
          [cg, false],
          [hg, true],
        ] as const) {
          g.save();
          g.translate(bx + dx + w / 2, by + h / 2);
          g.rotate(rot);
          if (isHeight) {
            pillow(g, -w / 2, -h / 2, w, h, radius + 4, 0.3, top);
          } else {
            g.fillStyle = grey(v);
            rrect(g, -w / 2, -h / 2, w, h, radius);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.13)';
            rrect(g, -w / 2 + 6, -h / 2 + 3, w - 12, h * 0.26, 6);
            g.fill();
            g.fillStyle = 'rgba(0,0,0,0.07)';
            rrect(g, -w / 2 + 4, h / 2 - h * 0.22, w - 8, h * 0.2, 6);
            g.fill();
          }
          if (chip) {
            g.fillStyle = isHeight ? grey(0.12) : grey(0.7);
            g.beginPath();
            g.arc(w / 2 - 4, -h / 2 + 4, 15, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
        }
      });
      x += bw;
    }
  }
  return { map: tex(cc, true), normalMap: tex(normalFromHeight(hg, 5.5), false) };
}

export function makeSlateTextures(seed = 9): SurfaceTextures {
  const rng = mulberry32(seed);
  const [cc, cg] = canvas();
  const [, hg] = canvas();
  cg.fillStyle = grey(0.6);
  cg.fillRect(0, 0, S, S);
  hg.fillStyle = grey(0.05);
  hg.fillRect(0, 0, S, S);
  const rows = 4;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const widths = rowWidths(rng, S / 4, 0.3);
    let x = -rng() * (widths[0] ?? 0) * 0.5;
    for (const sw of widths) {
      const bx = x + 4;
      const by = r * rh + 3 + (rng() - 0.5) * 6;
      const w = sw - 8;
      const h = rh - 6 + rng() * 8;
      const rot = (rng() - 0.5) * 0.05;
      const v = 0.82 + rng() * 0.18;
      const radius = 16 + rng() * 14;
      wrapped((dx) => {
        cg.save();
        cg.translate(bx + dx + w / 2, by + h / 2);
        cg.rotate(rot);
        cg.fillStyle = grey(v);
        rrect(cg, -w / 2, -h / 2, w, h, radius);
        cg.fill();
        cg.fillStyle = 'rgba(0,0,0,0.11)';
        rrect(cg, -w / 2 + 4, h / 2 - 18, w - 8, 13, 6);
        cg.fill();
        cg.restore();
        hg.save();
        hg.translate(bx + dx + w / 2, by + h / 2);
        hg.rotate(rot);
        const grad = hg.createLinearGradient(0, -h / 2, 0, h / 2);
        grad.addColorStop(0, grey(0.25));
        grad.addColorStop(0.82, grey(0.97));
        grad.addColorStop(1, grey(0.55));
        hg.fillStyle = grad;
        rrect(hg, -w / 2, -h / 2, w, h, radius);
        hg.fill();
        hg.restore();
      });
      x += sw;
    }
  }
  return { map: tex(cc, true), normalMap: tex(normalFromHeight(hg, 4.2), false) };
}

export function makePlasterTextures(seed = 13): SurfaceTextures {
  const rng = mulberry32(seed);
  const [cc, cg] = canvas();
  const [, hg] = canvas();
  cg.fillStyle = grey(0.97);
  cg.fillRect(0, 0, S, S);
  hg.fillStyle = grey(0.5);
  hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 1100; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = 4 + rng() * 18;
    const a = 0.012 + rng() * 0.022;
    const up = rng() < 0.5;
    wrapped((dx) => {
      cg.fillStyle = `rgba(0,0,0,${a})`;
      cg.beginPath();
      cg.arc(x + dx, y, r, 0, Math.PI * 2);
      cg.fill();
      hg.fillStyle = up ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      hg.beginPath();
      hg.arc(x + dx, y, r, 0, Math.PI * 2);
      hg.fill();
    });
  }
  return { map: tex(cc, true), normalMap: tex(normalFromHeight(hg, 1.8), false) };
}

/** White painted letters on transparent cells; tint comes from vertex colour. */
export function makeSignAtlas(): THREE.CanvasTexture {
  const W = 1024;
  const cw = W / ATLAS_COLS;
  const ch = cw / 4;
  const [c, g] = canvas(W, ch * ATLAS_ROWS);
  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  SIGN_TEXTS.forEach((text, i) => {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const cx = col * cw + cw / 2;
    const cy = row * ch + ch / 2 + 4;
    let size = 92;
    g.font = `bold ${size}px "Trebuchet MS", "Arial Rounded MT Bold", Verdana, sans-serif`;
    const m = g.measureText(text).width;
    size = Math.min(size, (size * (cw - 40)) / Math.max(1, m));
    g.font = `bold ${size}px "Trebuchet MS", "Arial Rounded MT Bold", Verdana, sans-serif`;
    g.lineWidth = size * 0.12;
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.strokeText(text, cx, cy);
    g.fillStyle = '#ffffff';
    g.fillText(text, cx, cy);
  });
  const t = tex(c, true, false);
  t.generateMipmaps = true;
  return t;
}
