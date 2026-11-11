// Plots and construction (task 26.1, Requirements 27.1-27.3). Gated behind the `expansion` reveal
// (phase2-guide rule 3). Discretionary costs call requireGold first (rule 5).
import type { TickContext } from '../../core/context';
import { gold, secondsToTicks } from '../../core/context';
import { schedule, type ScheduledPayload } from '../../core/scheduler';
import type { Command, Rejection } from '../../commands/types';
import type { DefinitionRegistry } from '../../defs/registry';
import { requireGold } from '../../money/gold';
import { createBusiness } from '../../state/createBusiness';
import { PLAYER } from '../../state/types';
import { isRevealed } from '../observe';

/** True when the Plot carries one of the Definition's location tags (no tags = any Plot). */
export function plotFitsTags(reg: DefinitionRegistry, plotId: string, tags: readonly string[]): boolean {
  if (tags.length === 0) return true;
  const plotTags = reg.world.plots[plotId]?.def.tags ?? [];
  return tags.some((t) => plotTags.includes(t));
}

/** buyPlot: a for-sale Plot in an unlocked District becomes a Player-owned empty Plot (27.1). */
export function handleBuyPlot(ctx: TickContext, cmd: Extract<Command, { type: 'buyPlot' }>): Rejection | null {
  const info = ctx.reg.world.plots[cmd.plotId];
  const plot = ctx.state.plots[cmd.plotId];
  if (!info || !plot) return { reason: 'unknown_entity', field: 'plotId' };
  if (!ctx.state.districts[info.districtId]?.unlocked) return { reason: 'district_locked' };
  if (!isRevealed(ctx.state, ctx.reg, 'expansion')) return { reason: 'not_available' };
  if (plot.status !== 'for_sale' || plot.price === null) return { reason: 'not_allowed', field: 'plotId' };
  const price = plot.price;
  const check = requireGold(ctx.state, PLAYER, price);
  if (!check.ok) return { reason: check.reason, missingGold: check.missingGold };
  gold(ctx, PLAYER, -price, 'purchase', plot.id);
  plot.status = 'empty';
  plot.owner = PLAYER;
  plot.price = null;
  return null;
}

/**
 * construct: starts building a Definition on a Player-owned empty Plot (27.2). The Business is created
 * when `constructionDone` fires (27.3). Production Definitions also need the `brewery` reveal.
 */
export function handleConstruct(ctx: TickContext, cmd: Extract<Command, { type: 'construct' }>): Rejection | null {
  const info = ctx.reg.world.plots[cmd.plotId];
  const plot = ctx.state.plots[cmd.plotId];
  if (!info || !plot) return { reason: 'unknown_entity', field: 'plotId' };
  const def = ctx.reg.businesses[cmd.businessDefId];
  if (!def) return { reason: 'unknown_entity', field: 'businessDefId' };
  if (!def.construction || (def.owner !== 'any' && def.owner !== 'player')) return { reason: 'not_allowed', field: 'businessDefId' };
  if (!ctx.state.districts[info.districtId]?.unlocked) return { reason: 'district_locked' };
  if (!isRevealed(ctx.state, ctx.reg, 'expansion')) return { reason: 'not_available' };
  if (def.productionRules.length > 0 && !isRevealed(ctx.state, ctx.reg, 'brewery')) return { reason: 'not_available' };
  if (plot.owner !== PLAYER) return { reason: 'not_owner', field: 'plotId' };
  if (plot.status !== 'empty') return { reason: 'slot_occupied', field: 'plotId' };
  if (!plotFitsTags(ctx.reg, plot.id, def.locationConstraints.plotTags)) return { reason: 'not_allowed', field: 'plotId' };
  const cost = def.construction.cost;
  const check = requireGold(ctx.state, PLAYER, cost);
  if (!check.ok) return { reason: check.reason, missingGold: check.missingGold };

  gold(ctx, PLAYER, -cost, 'construction', plot.id);
  const doneTick = ctx.state.tick + secondsToTicks(ctx, def.construction.seconds);
  plot.status = 'under_construction';
  plot.construction = { defId: def.id, doneTick };
  schedule(ctx, 'constructionDone', doneTick, { plotId: plot.id });
  return null;
}

/** Scheduler kind `constructionDone` (27.3): creates the Player-owned Business on the Plot. */
export function constructionDone(ctx: TickContext, payload: ScheduledPayload): void {
  const plotId = String(payload.plotId ?? '');
  const plot = ctx.state.plots[plotId];
  if (!plot || plot.status !== 'under_construction' || !plot.construction) return;
  const biz = createBusiness(ctx.state, ctx.reg, plot.construction.defId, plotId, PLAYER);
  ctx.events.push({ type: 'news', item: { tick: ctx.state.tick, textKey: 'news.constructionDone', params: { business: biz.name } } });
}
