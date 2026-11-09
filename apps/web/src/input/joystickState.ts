/** Floating joystick vector in screen space (x right, y up), |v| <= 1. */
export const joystick = { active: false, x: 0, y: 0 };

/** Normalises a pixel offset into a stick vector with the given radius. */
export function stickVector(dx: number, dy: number, radius: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  const m = Math.min(1, len / radius);
  return { x: (dx / len) * m, y: (-dy / len) * m };
}
