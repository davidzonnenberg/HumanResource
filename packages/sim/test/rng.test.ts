// Unit tests for the seeded PRNG helpers (task 3.9, Requirement 2.6).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rngChance, rngInt, rngNext, rngPick, seedRng } from '../src/rng/xoshiro128ss';

const holderFor = (seed: number) => ({ rng: seedRng(seed) });

describe('seedRng', () => {
  it('never produces an all-zero state, which xoshiro cannot leave', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const state = seedRng(seed);
        expect(state.some((w) => w !== 0)).toBe(true);
        for (const w of state) {
          expect(Number.isInteger(w)).toBe(true);
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(0xffffffff);
        }
      }),
    );
  });
});

describe('rngNext and determinism', () => {
  it('the same seed produces the same sequence and different seeds diverge', () => {
    const a = holderFor(42);
    const b = holderFor(42);
    const c = holderFor(43);
    const seqA = Array.from({ length: 100 }, () => rngNext(a));
    const seqB = Array.from({ length: 100 }, () => rngNext(b));
    const seqC = Array.from({ length: 100 }, () => rngNext(c));
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('every draw is a float in [0, 1)', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const h = holderFor(seed);
        for (let i = 0; i < 50; i++) {
          const x = rngNext(h);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
      }),
    );
  });

  it('only the rng field of the holder is touched', () => {
    const h = { rng: seedRng(7), other: 'untouched' };
    rngNext(h);
    expect(h.other).toBe('untouched');
    expect(Object.keys(h)).toEqual(['rng', 'other']);
  });
});

describe('rngInt', () => {
  it('returns integers within the inclusive range for any bounds', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 0, max: 1000 }), (seed, lo, span) => {
        const hi = lo + span;
        const h = holderFor(seed);
        for (let i = 0; i < 30; i++) {
          const v = rngInt(h, lo, hi);
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(lo);
          expect(v).toBeLessThanOrEqual(hi);
        }
      }),
    );
  });

  it('reaches both ends of a small inclusive range', () => {
    const h = holderFor(9);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rngInt(h, 1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});

describe('rngChance and rngPick', () => {
  it('p <= 0 never succeeds and p >= 1 always succeeds', () => {
    const h = holderFor(5);
    for (let i = 0; i < 200; i++) {
      expect(rngChance(h, 0)).toBe(false);
      expect(rngChance(h, -0.5)).toBe(false);
      expect(rngChance(h, 1)).toBe(true);
      expect(rngChance(h, 2)).toBe(true);
    }
  });

  it('p = 0.5 lands close to half of 10 000 draws', () => {
    const h = holderFor(11);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (rngChance(h, 0.5)) hits++;
    expect(hits).toBeGreaterThan(4_700);
    expect(hits).toBeLessThan(5_300);
  });

  it('rngPick returns an element of the array and throws on an empty array', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(fc.string(), { minLength: 1, maxLength: 10 }), (seed, items) => {
        expect(items).toContain(rngPick(holderFor(seed), items));
      }),
    );
    expect(() => rngPick(holderFor(1), [])).toThrow();
  });
});
