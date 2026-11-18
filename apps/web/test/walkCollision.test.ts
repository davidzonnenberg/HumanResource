import { describe, expect, it } from 'vitest';
import { shapeMove } from '../src/input/walkCollision';

const house = { minX: -4, maxX: 4, minZ: -10, maxZ: -5, height: 8 };
const step = 0.5;
const r = 0.4;

function walk(x: number, z: number, dx: number, dz: number, n: number) {
  for (let i = 0; i < n; i++) {
    const m = shapeMove(x, z, dx, dz, step, r, [house]);
    const len = Math.sqrt(m.dx * m.dx + m.dz * m.dz);
    const k = len > 1 ? 1 / len : 1;
    x += m.dx * k * step;
    z += m.dz * k * step;
  }
  return { x, z };
}

describe('walk collision against model hitboxes', () => {
  it('never walks into the hitbox, from any direction', () => {
    for (const [dx, dz] of [[0, -1], [1, -1], [-1, -1], [0.3, -1]] as const) {
      const p = walk(0, -2, dx, dz, 40);
      const inside = p.x > house.minX - r && p.x < house.maxX + r && p.z > house.minZ - r && p.z < house.maxZ + r;
      expect(inside).toBe(false);
    }
  });

  it('slides along the wall instead of stopping dead', () => {
    const p = walk(0, -4.5, 1, -1, 10);
    expect(p.x).toBeGreaterThan(2);
  });

  it('does not block when already overlapping (old save), so you can walk out', () => {
    expect(shapeMove(0, -7, 0, 1, step, r, [house])).toEqual({ dx: 0, dz: 1 });
  });

  it('a smaller hitbox lets you walk where a bigger one would block', () => {
    const small = { ...house, minX: -1, maxX: 1 };
    expect(shapeMove(3, -4.3, 0, -1, step, r, [small])).toEqual({ dx: 0, dz: -1 });
    expect(shapeMove(3, -4.3, 0, -1, step, r, [house])).toEqual({ dx: 0, dz: 0 });
  });
});
