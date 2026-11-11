// Lot threading for poured drinks: the Recipe and origin of the unit taken from Storage follow the
// drink from the order queue to the bar to the Customer, so a Recipe's traits can apply when the
// drink is consumed (phase2-guide A7).
import type { LotOrigin, PubRuntime } from '../state/types';

export interface DrinkLot {
  recipeId: string | null;
  origin: LotOrigin;
}

/** Lot of the unit being poured for `customerId`; Phase 1 behaviour (no recipe) when unknown. */
export function drinkLotFor(pub: PubRuntime, customerId: string): DrinkLot {
  const lot = pub.orderQueue.find((o) => o.customerId === customerId)?.lot;
  return { recipeId: lot?.recipeId ?? null, origin: lot?.origin ?? 'business' };
}

/** Bar entry for a poured drink. */
export function barEntryFor(pub: PubRuntime, customerId: string): PubRuntime['bar'][number] {
  return { customerId, ...drinkLotFor(pub, customerId) };
}
