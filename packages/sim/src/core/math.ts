// Deterministic math helpers: only + - * / and Math.sqrt (correctly rounded under IEEE 754).
export const sq = (v: number): number => v * v;
export const dist2d = (ax: number, az: number, bx: number, bz: number): number => Math.sqrt(sq(ax - bx) + sq(az - bz));
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
