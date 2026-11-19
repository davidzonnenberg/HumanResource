// Kegs and crates (Requirement 58). A container is a display and pricing unit only: the unit of account in
// every Stock, cargo, load, Order and limit stays the drink (or unit), and is never rounded to whole containers.
import type { DefinitionRegistry } from '../defs/registry';
import { mulDivCeil } from '../money/gold';
import type { SimState } from '../state/types';
import { PLAYER } from '../state/types';

/** Units in one container of the Resource as shown to the Player: the signed deal overrides a Keg's size (58.4). */
export function unitsPerContainer(reg: DefinitionRegistry, state: SimState | undefined, resourceId: string): number {
  const c = reg.resources[resourceId]?.container;
  if (!c) return 1;
  const deal = c.kind === 'keg' ? state?.player.supplyDeal : null;
  return deal ? deal.kegDrinks : c.size;
}
/** Containers needed to show `amount` units (a part-full container still counts). */
export const toContainers = (amount: number, size: number): number => (amount <= 0 ? 0 : Math.ceil(amount / size));
/** Units in `containers` full containers. */
export const fromContainers = (containers: number, size: number): number => containers * size;

/** Price of an Order of `qty` units: a Keg deal prices per Keg, spread per drink and rounded up once (58.6); otherwise unit price x qty. */
export function orderCost(reg: DefinitionRegistry, state: SimState, owner: string, resourceId: string, unitPrice: number, qty: number): number {
  const deal = owner === PLAYER && reg.resources[resourceId]?.container.kind === 'keg' ? state.player.supplyDeal : null;
  return deal ? mulDivCeil(qty, deal.pricePerKeg, deal.kegDrinks) : unitPrice * qty;
}
/** The largest quantity (up to `want`) whose cost does not exceed `budget`. */
export function affordableQty(cost: (qty: number) => number, want: number, budget: number): number {
  let q = want;
  if (q > 0 && cost(q) > budget) q = Math.floor((q * Math.max(0, budget)) / cost(q));
  while (q > 0 && cost(q) > budget) q--;
  while (q < want && cost(q + 1) <= budget) q++; // the estimate can undershoot because every cost is rounded up
  return Math.max(0, q);
}
