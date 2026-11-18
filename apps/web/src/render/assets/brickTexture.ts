// Procedural herringbone brick tile, drawn on a canvas. Seamless by construction (the pattern is
// periodic in 4x4 brick units; the tile holds 3x3 periods so the per-brick colour jitter does not
// repeat too obviously). Bricks are 2x1 units, axis-aligned, laid in diagonal herringbone steps.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

export interface BrickStyle {
  base: string; // brick colour, '#rrggbb'
  mortar: string;
  jitter?: number; // 0..1, per-brick lightness/hue variation
  seed?: number;
}

export const BRICK_UNITS = 12; // brick units across one texture tile

const SIZE = 1024;

function hash(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const css = (r: number, g: number, b: number) => `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function makeBrickTexture(style: BrickStyle): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.flipY = false; // canvas row == world z, so shaders can reproduce the brick lattice
  if (!ctx) return tex;

  const u = SIZE / BRICK_UNITS; // pixels per brick unit
  const [mr, mg, mb] = hexToRgb(style.mortar);
  const [br, bg, bb] = hexToRgb(style.base);
  const jit = style.jitter ?? 0.12;
  const seed = style.seed ?? 1;
  ctx.fillStyle = css(mr, mg, mb);
  ctx.fillRect(0, 0, SIZE, SIZE);

  const gap = 0.07 * u; // mortar half-gap
  const radius = 0.16 * u;
  const lift = Math.max(1.5, 0.05 * u); // clay bevel offset in px

  const drawBrick = (x0: number, y0: number, w: number, h: number, shade: number, tint: number) => {
    const r = br * shade + tint * 6;
    const g = bg * shade;
    const b = bb * shade - tint * 6;
    for (const ox of [-SIZE, 0, SIZE]) {
      for (const oy of [-SIZE, 0, SIZE]) {
        const x = x0 * u + gap + ox;
        const y = y0 * u + gap + oy;
        const bw = w * u - gap * 2;
        const bh = h * u - gap * 2;
        if (x > SIZE || y > SIZE || x + bw < 0 || y + bh < 0) continue;
        // dark underside, base body, light top-left rim: reads as a chunky clay brick
        roundRect(ctx, x, y, bw, bh, radius);
        ctx.fillStyle = css(r * 0.62, g * 0.62, b * 0.62);
        ctx.fill();
        roundRect(ctx, x, y, bw - lift, bh - lift, radius);
        ctx.fillStyle = css(r * 1.12, g * 1.12, b * 1.12);
        ctx.fill();
        roundRect(ctx, x + lift * 0.9, y + lift * 0.9, bw - lift * 2.2, bh - lift * 2.2, radius * 0.8);
        ctx.fillStyle = css(r, g, b);
        ctx.fill();
      }
    }
  };

  for (let x = 0; x < BRICK_UNITS; x++) {
    for (let y = 0; y < BRICK_UNITS; y++) {
      const d = (((x - y) % 4) + 4) % 4;
      const shade = 1 + (hash(x, y, seed) - 0.5) * 2 * jit;
      const tint = (hash(y, x, seed + 9) - 0.5) * 2 * jit;
      if (d === 0) drawBrick(x, y, 2, 1, shade, tint); // horizontal brick
      else if (d === 3) drawBrick(x, y, 1, 2, shade, tint); // vertical brick
    }
  }
  tex.needsUpdate = true;
  return tex;
}

// One shared road/sidewalk brick texture.
let roadTex: CanvasTexture | null = null;
export function roadBrickTexture(): CanvasTexture {
  roadTex ??= makeBrickTexture({ base: '#b4553f', mortar: '#7a3d2e', jitter: 0.1, seed: 3 });
  return roadTex;
}
