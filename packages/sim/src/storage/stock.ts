// Stock and lots (Requirements 9, 34). The only functions that change Storage or cargo amounts.
// Invariant: stock.amount === sum(lots.qty) and inflows never raise amount above capacity.
import type { Lot, Stock } from '../state/types';

export const emptyStock = (): Stock => ({ amount: 0, lots: [] });

export const freeCapacity = (stock: Stock, capacity: number): number => Math.max(0, capacity - stock.amount);

/**
 * Adds as much of `lot` as fits. Returns the quantity that did not fit (the remainder).
 * Over-capacity storage accepts nothing (criterion 9.5).
 */
export function addToStock(stock: Stock, lot: Lot, capacity: number): number {
  const accepted = Math.min(lot.qty, freeCapacity(stock, capacity));
  if (accepted > 0) {
    const last = stock.lots[stock.lots.length - 1];
    if (last && last.recipeId === lot.recipeId && last.origin === lot.origin && last.arrivedTick === lot.arrivedTick) {
      last.qty += accepted;
    } else {
      stock.lots.push({ ...lot, qty: accepted });
    }
    stock.amount += accepted;
  }
  return lot.qty - accepted;
}

/** Takes up to `qty` units first-in-first-out by arrival and returns the taken lots. */
export function takeFromStock(stock: Stock, qty: number): Lot[] {
  const taken: Lot[] = [];
  let need = Math.min(qty, stock.amount);
  while (need > 0 && stock.lots.length > 0) {
    const head = stock.lots[0] as Lot;
    const n = Math.min(need, head.qty);
    taken.push({ ...head, qty: n });
    head.qty -= n;
    need -= n;
    stock.amount -= n;
    if (head.qty === 0) stock.lots.shift();
  }
  return taken;
}

export const lotsTotal = (lots: readonly Lot[]): number => lots.reduce((s, l) => s + l.qty, 0);
