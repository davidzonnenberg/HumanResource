// The shared Effect engine (Requirement 52.2). Services, quest rewards and Consequences all apply
// their Effects through `applyEffects`. Effects run in list order; `range` amounts draw from the
// seeded RNG in that order, so the RNG stream is part of the replay. Gold always goes through
// `gold()` (applyGold) and is clamped so it never leaves +-GOLD_LIMIT (52.4, 52.6).
import { gold, ledgerChange, secondsToTicks, type TickContext } from '../core/context';
import { schedule } from '../core/scheduler';
import type { Effect, EffectAmount, EffectTarget } from '../defs/schemas';
import { GOLD_LIMIT } from '../money/gold';
import { rngInt } from '../rng/xoshiro128ss';
import { addModifier } from '../stats/modifiers';
import { addToStock } from '../storage/stock';
import type { TargetSelector } from '../state/types';
import { PLAYER } from '../state/types';
import { DOMAIN_HANDLERS, type EffectContext } from './domainOps';

const draw = (ctx: TickContext, a: EffectAmount): number => (typeof a === 'number' ? a : rngInt(ctx.state, a.range[0], a.range[1]));

function resolveTarget(t: EffectTarget | undefined, ectx: EffectContext): TargetSelector | null {
  const kind = t?.kind ?? (ectx.businessId ? 'self' : 'player');
  switch (kind) {
    case 'all':
      return { kind: 'all' };
    case 'player':
      return { kind: 'owner', owner: PLAYER };
    case 'self':
      return ectx.businessId ? { kind: 'business', id: ectx.businessId } : null;
    case 'business':
      return t?.kind === 'business' ? { kind: 'business', id: t.id } : null;
  }
}

function applyOne(ctx: TickContext, e: Effect, ectx: EffectContext): void {
  const { state, reg } = ctx;
  switch (e.kind) {
    case 'gold': {
      const wanted = draw(ctx, e.amount);
      // Clamp the result into [-GOLD_LIMIT, GOLD_LIMIT]; the delta is what actually changes.
      const delta = Math.max(-GOLD_LIMIT, Math.min(GOLD_LIMIT, state.player.gold + wanted)) - state.player.gold;
      gold(ctx, PLAYER, delta, e.category ?? 'other', ectx.businessId ?? ectx.source);
      return;
    }
    case 'addModifier': {
      const target = resolveTarget(e.target, ectx);
      if (!target) return; // `self` without a Business: nothing to attach to
      const m: Parameters<typeof addModifier>[1] = { source: { kind: 'effect', id: ectx.source }, target, stat: e.stat, op: e.op, value: e.value };
      if (e.seconds !== undefined) m.untilTick = state.tick + secondsToTicks(ctx, e.seconds);
      addModifier(state, m);
      return;
    }
    case 'reveal': {
      if (state.reveals.fired.includes(e.triggerId)) return;
      const trig = reg.revealTriggers[e.triggerId];
      if (!trig) return;
      state.reveals.fired.push(trig.id);
      ctx.events.push({ type: 'revealFired', triggerId: trig.id, reveals: [...trig.reveals] });
      return;
    }
    case 'schedule': {
      const delay = Math.max(0, draw(ctx, e.delaySeconds));
      const payload: Record<string, string | number> = { ...(e.payload ?? {}) };
      if (ectx.businessId && payload.businessId === undefined) payload.businessId = ectx.businessId;
      schedule(ctx, e.event, state.tick + secondsToTicks(ctx, delay), payload);
      return;
    }
    case 'grantResource': {
      const qty = Math.max(0, draw(ctx, e.qty));
      const res = reg.resources[e.resourceId];
      if (!res || qty === 0) return;
      if (res.kind === 'corporate') {
        state.player.corporateResources[e.resourceId] = (state.player.corporateResources[e.resourceId] ?? 0) + qty;
        return;
      }
      const b = ectx.businessId ? state.businesses[ectx.businessId] : undefined;
      const stock = b?.storage[e.resourceId];
      const cap = b ? (reg.businesses[b.defId]?.storage[e.resourceId] ?? 0) : 0;
      if (!stock) return;
      const rest = addToStock(stock, { qty, recipeId: null, arrivedTick: state.tick, origin: 'reward' }, cap);
      ledgerChange(ctx, e.resourceId, qty - rest, 'reward'); // only the accepted part was created
      return;
    }
    case 'news':
      ctx.events.push({ type: 'news', item: { tick: state.tick, textKey: e.textKey, params: { ...(e.params ?? {}) } } });
      return;
    case 'domain':
      DOMAIN_HANDLERS[e.op](ctx, ectx, e.params ?? {});
      return;
  }
}

/** Applies the Effects in order. Callers validate first: Effects themselves do not reject. */
export function applyEffects(ctx: TickContext, effects: readonly Effect[], ectx: EffectContext): void {
  for (const e of effects) applyOne(ctx, e, ectx);
}
