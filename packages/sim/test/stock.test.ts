// Unit tests for stock and lots (task 3.9, Requirements 9.4, 9.5, 34.2, 34.3).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addToStock, emptyStock, freeCapacity, lotsTotal, takeFromStock } from '../src/storage/stock';
import type { Lot, Stock } from '../src/state/types';

const lot = (qty: number, arrivedTick: number, extra: Partial<Lot> = {}): Lot => ({
  qty,
  recipeId: null,
  arrivedTick,
  origin: 'supplier',
  ...extra,
});

const invariantHolds = (stock: Stock): boolean => stock.amount === lotsTotal(stock.lots) && stock.lots.every((l) => l.qty > 0);

describe('addToStock', () => {
  it('accepts what fits and returns the remainder', () => {
    const s = emptyStock();
    expect(addToStock(s, lot(7, 1), 10)).toBe(0);
    expect(s.amount).toBe(7);
    expect(addToStock(s, lot(5, 2), 10)).toBe(2);
    expect(s.amount).toBe(10);
    expect(invariantHolds(s)).toBe(true);
  });

  it('accepts nothing when storage is full and returns the whole lot', () => {
    const s: Stock = { amount: 10, lots: [lot(10, 1)] };
    expect(addToStock(s, lot(4, 2), 10)).toBe(4);
    expect(s.amount).toBe(10);
    expect(s.lots).toEqual([lot(10, 1)]);
  });

  it('accepts nothing above capacity (over-capacity stock from a shrink) and never reports negative free space', () => {
    const s: Stock = { amount: 12, lots: [lot(12, 1)] };
    expect(freeCapacity(s, 10)).toBe(0);
    expect(addToStock(s, lot(3, 2), 10)).toBe(3);
    expect(s.amount).toBe(12);
  });

  it('amounts never exceed capacity and every quantity is either accepted or returned', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 30 }),
        (capacity, qtys) => {
          const s = emptyStock();
          qtys.forEach((qty, i) => {
            const before = s.amount;
            const rest = addToStock(s, lot(qty, i + 1), capacity);
            const accepted = s.amount - before;
            expect(accepted + rest).toBe(qty);
            expect(accepted).toBe(Math.min(qty, Math.max(0, capacity - before)));
            expect(s.amount).toBeLessThanOrEqual(capacity);
            expect(invariantHolds(s)).toBe(true);
          });
        },
      ),
    );
  });
});

describe('takeFromStock', () => {
  it('takes first in, first out and splits the head lot when needed', () => {
    const s = emptyStock();
    addToStock(s, lot(5, 1), 100);
    addToStock(s, lot(5, 2), 100);
    addToStock(s, lot(5, 3), 100);
    const taken = takeFromStock(s, 7);
    expect(taken.map((l) => [l.qty, l.arrivedTick])).toEqual([
      [5, 1],
      [2, 2],
    ]);
    expect(s.amount).toBe(8);
    expect(s.lots[0]).toMatchObject({ qty: 3, arrivedTick: 2 });
    expect(invariantHolds(s)).toBe(true);
  });

  it('keeps recipe identity and origin with the cargo', () => {
    const s = emptyStock();
    addToStock(s, lot(4, 1, { recipeId: 'recipe_ale', origin: 'brewery' }), 100);
    const [taken] = takeFromStock(s, 4);
    expect(taken).toMatchObject({ qty: 4, recipeId: 'recipe_ale', origin: 'brewery' });
  });

  it('takes at most what is stored and returns nothing for zero', () => {
    const s = emptyStock();
    addToStock(s, lot(8, 1), 100);
    expect(takeFromStock(s, 0)).toEqual([]);
    const taken = takeFromStock(s, 100);
    expect(lotsTotal(taken)).toBe(8);
    expect(s).toEqual({ amount: 0, lots: [] });
  });

  it('FIFO property: taken lots are the oldest, and the cargo plus the remainder equals what was stored', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 15 }), fc.integer({ min: 0, max: 200 }), (qtys, want) => {
        const s = emptyStock();
        qtys.forEach((qty, i) => addToStock(s, lot(qty, i + 1), 10_000));
        const before = s.amount;
        const taken = takeFromStock(s, want);
        expect(lotsTotal(taken)).toBe(Math.min(want, before));
        expect(s.amount + lotsTotal(taken)).toBe(before);
        const maxTaken = taken.reduce((m, l) => Math.max(m, l.arrivedTick), 0);
        for (const l of s.lots) expect(l.arrivedTick).toBeGreaterThanOrEqual(maxTaken);
        expect(invariantHolds(s)).toBe(true);
      }),
    );
  });
});
