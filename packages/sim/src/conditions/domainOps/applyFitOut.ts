// Domain op `applyFitOut` (task 48.3): the Player spends the Fit_Out_Budget on tables, taps and decorations.
// Params carry one count per fit-out item id. The validator rejects an over-budget pick with insufficient_gold
// (and the missing amount) and a pick beyond the licence's Seats or the Pub's Taps with limit_reached (64.4, 64.5).
import type { TickContext } from '../../core/context';
import { PLAYER } from '../../state/types';
import type { DomainHandler, DomainValidator, EffectContext } from './types';
import type { ParamValue } from '../../defs/schemas';

interface Pick {
  seats: number;
  taps: number;
  vibe: number;
  price: number;
  count: number;
}
function picks(ctx: TickContext, params: Record<string, ParamValue>): Pick {
  const total: Pick = { seats: 0, taps: 0, vibe: 0, price: 0, count: 0 };
  for (const item of Object.values(ctx.reg.phase3.fitOutItems)) {
    const n = typeof params[item.id] === 'number' ? Math.max(0, Math.floor(params[item.id] as number)) : 0;
    total.seats += (item.seats ?? 0) * n;
    total.taps += (item.taps ?? 0) * n;
    total.vibe += (item.vibe ?? 0) * n;
    total.price += item.price * n;
    total.count += n;
  }
  return total;
}
const pubOf = (ctx: TickContext, ectx: EffectContext) => (ectx.businessId ? ctx.state.businesses[ectx.businessId] : undefined);
export const validateApplyFitOut: DomainValidator = (ctx, ectx, params) => {
  const b = pubOf(ctx, ectx);
  const def = b ? ctx.reg.businesses[b.defId]?.pub : undefined;
  if (!b?.pub || !def || b.owner !== PLAYER) return { reason: 'unknown_entity', field: 'businessId' };
  const p = picks(ctx, params);
  if (p.count === 0) return { reason: 'invalid_quantity' };
  const budget = ctx.state.player.fitOutBudget;
  if (p.price > budget) return { reason: 'insufficient_gold', missingGold: p.price - budget };
  const tier = ctx.state.player.license ? ctx.reg.phase3.licenseTiers[ctx.state.player.license] : undefined;
  if (b.pub.seatsBuilt + p.seats > Math.min(tier?.maxSeats ?? 0, b.pub.seats.length)) return { reason: 'limit_reached', field: 'seats' };
  if (b.pub.tapsBuilt + p.taps > def.maxTaps) return { reason: 'limit_reached', field: 'taps' };
  return null;
};
export const applyFitOut: DomainHandler = (ctx, ectx, params) => {
  const b = pubOf(ctx, ectx);
  if (!b?.pub) return;
  const p = picks(ctx, params);
  b.pub.seatsBuilt += p.seats;
  b.pub.tapsBuilt += p.taps;
  b.pub.vibeBase += p.vibe;
  ctx.state.player.fitOutBudget -= p.price; // the budget is not Gold: it can only be spent here
};
