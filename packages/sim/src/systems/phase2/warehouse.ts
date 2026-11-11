// Warehouse (task 26.2, Requirement 28). Gated behind the `warehouse` reveal. The load-rate rule
// lives in logistics (doStopAction) and the rent carry lives in finance, next to salaries.
import type { TickContext } from '../../core/context';
import { gold } from '../../core/context';
import type { Command, Rejection } from '../../commands/types';
import { requireGold } from '../../money/gold';
import { createBusiness } from '../../state/createBusiness';
import { PLAYER } from '../../state/types';
import { humanPosition } from '../../world/queries';
import { isRevealed } from '../observe';
import { plotFitsTags } from './construction';

/** acquireWarehouse: buy outright, or start renting with the first fee charged now (28.1). */
export function handleAcquireWarehouse(ctx: TickContext, cmd: Extract<Command, { type: 'acquireWarehouse' }>): Rejection | null {
  const info = ctx.reg.world.plots[cmd.plotId];
  const plot = ctx.state.plots[cmd.plotId];
  if (!info || !plot) return { reason: 'unknown_entity', field: 'plotId' };
  if (cmd.mode !== 'buy' && cmd.mode !== 'rent') return { reason: 'not_allowed', field: 'mode' };
  if (!ctx.state.districts[info.districtId]?.unlocked) return { reason: 'district_locked' };
  if (!isRevealed(ctx.state, ctx.reg, 'warehouse')) return { reason: 'not_available' };
  if (plot.owner !== null && plot.owner !== PLAYER) return { reason: 'not_owner', field: 'plotId' };
  if (plot.status !== 'empty') return { reason: 'slot_occupied', field: 'plotId' };
  const def = Object.values(ctx.reg.businesses).find((d) => d.warehouse !== undefined && plotFitsTags(ctx.reg, plot.id, d.locationConstraints.plotTags));
  if (!def?.warehouse) return { reason: 'not_allowed', field: 'plotId' };

  const price = cmd.mode === 'buy' ? def.warehouse.buyPrice : def.warehouse.rentPerMinute;
  const check = requireGold(ctx.state, PLAYER, price);
  if (!check.ok) return { reason: check.reason, missingGold: check.missingGold };
  // Buying is a purchase; renting charges the first Game_Minute of rent now (category rental).
  gold(ctx, PLAYER, -price, cmd.mode === 'buy' ? 'purchase' : 'rental', plot.id);

  const biz = createBusiness(ctx.state, ctx.reg, def.id, plot.id, PLAYER);
  if (cmd.mode === 'rent') biz.rental = { feePerMinute: def.warehouse.rentPerMinute, carry: 0 };
  return null;
}

/**
 * endRental: ends a rental of a Warehouse. Rejected while it holds any Resource or an open Order
 * targets it (28.5). Humans are unassigned, the Business is removed from every Route (a Route left
 * with fewer than two distinct stops is deleted and its Vehicle parks) and the Plot goes back to empty.
 */
export function handleEndRental(ctx: TickContext, cmd: Extract<Command, { type: 'endRental' }>): Rejection | null {
  const b = ctx.state.businesses[cmd.businessId];
  if (!b) return { reason: 'unknown_entity', field: 'businessId' };
  if (b.owner !== PLAYER) return { reason: 'not_owner' };
  if (!b.rental) return { reason: 'not_allowed', field: 'businessId' };
  const stocked = Object.values(b.storage).some((s) => s.amount > 0);
  const ordered = Object.values(ctx.state.orders).some((o) => o.destinationId === b.id);
  if (stocked || ordered) return { reason: 'storage_not_empty' };

  for (const slot of b.jobSlots) {
    if (slot.filledBy?.kind === 'human') {
      const h = ctx.state.humans[slot.filledBy.humanId];
      if (h) {
        const p = humanPosition(ctx.state, h);
        h.assignment = null;
        h.status = 'unassigned';
        h.task = null;
        h.location = { kind: 'at', x: p.x, z: p.z, insideBusinessId: null };
      }
    }
    slot.filledBy = null;
  }

  for (const route of Object.values(ctx.state.routes)) {
    if (!route.stops.some((s) => s.businessId === b.id)) continue;
    route.stops = route.stops.filter((s) => s.businessId !== b.id);
    const v = ctx.state.vehicles[route.vehicleId];
    if (new Set(route.stops.map((s) => s.businessId)).size < 2) {
      Reflect.deleteProperty(ctx.state.routes, route.id);
      if (v) {
        v.routeId = null;
        v.routeSuspended = false;
        if (v.control === 'auto') v.control = 'parked';
      }
    }
    if (v) {
      v.stopIndex = 0;
      v.phase = 'idle';
      v.path = null;
      v.retriedLoad = false;
    }
  }

  Reflect.deleteProperty(ctx.state.businesses, b.id);
  const plot = ctx.state.plots[b.plotId];
  if (plot) {
    plot.status = 'empty';
    plot.owner = null;
    plot.businessId = null;
    plot.price = null;
  }
  return null;
}
