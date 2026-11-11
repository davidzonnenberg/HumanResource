// Market with fluctuating prices (task 25.1, Requirements 30.1-30.6).
// Gated behind the `market` reveal (phase2-guide rule 3): until it fires, this system returns at
// once and consumes no RNG, so a new game keeps the Phase 1 random stream.
import type { TickContext } from '../../core/context';
import { gold, ledgerChange, secondsToTicks } from '../../core/context';
import { nextId } from '../../core/ids';
import type { Command, Rejection } from '../../commands/types';
import type { MarketConfig } from '../../defs/schemas';
import { GOLD_LIMIT, requireGold } from '../../money/gold';
import { rngInt } from '../../rng/xoshiro128ss';
import type { Business, MarketState, SimState } from '../../state/types';
import { PLAYER } from '../../state/types';
import { isBusinessInUnlockedDistrict } from '../../world/geometry';
import { isRevealed } from '../observe';

/** Number of recent sell prices kept per Resource for the Market Panel trend (30.6). */
export const MARKET_HISTORY_LENGTH = 10;

/**
 * One bounded random-walk step for every Resource with a price, in data order (30.2, 30.3).
 * The sell price moves by a random integer in [-step, step], clamped to [min, max - minSpread].
 * The buy price is sell + minSpread, so buy > sell and both stay inside [min, max] for every
 * configuration that passes the registry check (min + minSpread <= base <= max).
 */
export function walkMarket(holder: Pick<SimState, 'rng'>, market: MarketState, cfg: MarketConfig): void {
  for (const [resourceId, m] of Object.entries(cfg.resources)) {
    const p = market.prices[resourceId];
    if (!p) continue;
    const moved = p.sell + rngInt(holder, -m.step, m.step);
    const sell = Math.min(Math.max(moved, m.min), m.max - m.minSpread);
    p.sell = sell;
    p.buy = sell + m.minSpread;
    p.history.push(sell);
    if (p.history.length > MARKET_HISTORY_LENGTH) p.history.splice(0, p.history.length - MARKET_HISTORY_LENGTH);
  }
}

/** Pipeline slot `market`: walks the prices at each interval once the reveal has fired. */
export function marketSystem(ctx: TickContext): void {
  const market = ctx.state.market;
  if (!market || !isRevealed(ctx.state, ctx.reg, 'market')) return;
  if (ctx.state.tick < market.nextUpdateTick) return;
  walkMarket(ctx.state, market, ctx.reg.market);
  market.nextUpdateTick = ctx.state.tick + secondsToTicks(ctx, ctx.reg.market.intervalSeconds);
}

/** The Market_Depot Business of the map, or null. */
export function marketDepotOf(ctx: Pick<TickContext, 'state' | 'reg'>): Business | null {
  for (const b of Object.values(ctx.state.businesses)) if (ctx.reg.businesses[b.defId]?.marketDepot !== undefined) return b;
  return null;
}

/**
 * marketBuy: reserves a positive whole quantity at the current buy price (30.4). The reservation is an
 * Order with a null destination at the Market_Depot, so a Vehicle picks it up like any other Order.
 */
export function handleMarketBuy(ctx: TickContext, cmd: Extract<Command, { type: 'marketBuy' }>): Rejection | null {
  if (!Number.isInteger(cmd.quantity) || cmd.quantity <= 0) return { reason: 'invalid_quantity', field: 'quantity' };
  const market = ctx.state.market;
  if (!market || !isRevealed(ctx.state, ctx.reg, 'market')) return { reason: 'not_available' };
  const price = market.prices[cmd.resourceId];
  if (!price) return { reason: 'unknown_entity', field: 'resourceId' };
  const depot = marketDepotOf(ctx);
  if (!depot) return { reason: 'not_available' };
  if (!isBusinessInUnlockedDistrict(ctx.reg, ctx.state, depot)) return { reason: 'district_locked' };
  const cost = price.buy * cmd.quantity;
  if (!Number.isSafeInteger(cost) || cost > GOLD_LIMIT) return { reason: 'invalid_quantity', field: 'quantity' };
  const check = requireGold(ctx.state, PLAYER, cost);
  if (!check.ok) return { reason: check.reason, missingGold: check.missingGold };

  const id = nextId(ctx.state, 'ord');
  ctx.state.orders[id] = {
    id,
    owner: PLAYER,
    sourceId: depot.id,
    destinationId: null,
    resourceId: cmd.resourceId,
    remaining: cmd.quantity,
    placedTick: ctx.state.tick,
  };
  ledgerChange(ctx, cmd.resourceId, cmd.quantity, 'market_buy');
  gold(ctx, PLAYER, -cost, 'purchase', depot.id);
  ctx.events.push({ type: 'orderPlaced', orderId: id, owner: PLAYER, qty: cmd.quantity });
  return null;
}
