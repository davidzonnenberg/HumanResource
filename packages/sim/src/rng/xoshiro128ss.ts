// xoshiro128** PRNG. The 4 x uint32 state lives in SimState.rng, so randomness is part of the
// saved state and fully deterministic (Requirement 2.6). Only integer ops and one division.
import type { SimState } from '../state/types';

type RngHolder = Pick<SimState, 'rng'>;

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** SplitMix32-style seeding so any integer seed yields a well-mixed non-zero state. */
export function seedRng(seed: number): [number, number, number, number] {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const out: [number, number, number, number] = [next(), next(), next(), next()];
  if ((out[0] | out[1] | out[2] | out[3]) === 0) out[0] = 1;
  return out;
}

/** Next uint32. Mutates holder.rng only. */
export function rngNextU32(h: RngHolder): number {
  const s = h.rng;
  const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);
  return result;
}

/** Float in [0, 1). */
export function rngNext(h: RngHolder): number {
  return rngNextU32(h) / 4294967296;
}

/** Integer in [lo, hi] inclusive. */
export function rngInt(h: RngHolder, lo: number, hi: number): number {
  return lo + Math.floor(rngNext(h) * (hi - lo + 1));
}

/** True with probability p (clamped to [0, 1]). */
export function rngChance(h: RngHolder, p: number): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return rngNext(h) < p;
}

export function rngPick<T>(h: RngHolder, items: readonly T[]): T {
  if (items.length === 0) throw new Error('rngPick on empty array');
  return items[rngInt(h, 0, items.length - 1)] as T;
}
