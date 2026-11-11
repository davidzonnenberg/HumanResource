// Sourcing_Policies (task 25.3, Requirements 31.1-31.4). Manual placeOrder is unaffected by policies;
// they only shape automatic reordering (logistics sourcingSystem).
import type { TickContext } from '../../core/context';
import type { Command, Rejection } from '../../commands/types';
import type { DefinitionRegistry } from '../../defs/registry';
import type { Business, SimState } from '../../state/types';
import { PLAYER } from '../../state/types';

/** setSourcingPolicy: only for an input of the Player's own Business (31.1). */
export function handleSetSourcingPolicy(ctx: TickContext, cmd: Extract<Command, { type: 'setSourcingPolicy' }>): Rejection | null {
  const b = ctx.state.businesses[cmd.businessId];
  if (!b) return { reason: 'unknown_entity', field: 'businessId' };
  if (b.owner !== PLAYER) return { reason: 'not_owner' };
  const def = ctx.reg.businesses[b.defId];
  if (!def?.inputs.includes(cmd.resourceId)) return { reason: 'not_allowed', field: 'resourceId' };
  b.sourcing[cmd.resourceId] = cmd.policy;
  return null;
}

/** A Business that can supply internally: a producer (has production rules) or a Warehouse. */
export function isInternalSource(reg: DefinitionRegistry, b: Business): boolean {
  const def = reg.businesses[b.defId];
  return def !== undefined && (def.productionRules.length > 0 || def.warehouse !== undefined);
}

/**
 * Player Businesses that feed `dest` with `resourceId` over a Player Route: a producer or Warehouse
 * that is a pickup stop of a Route which also has `dest` as a drop-off allowing the Resource (31.2).
 */
export function feedingSources(reg: DefinitionRegistry, state: SimState, dest: Business, resourceId: string): Business[] {
  const sources = new Map<string, Business>();
  const allows = (resources: 'all' | string[]): boolean => resources === 'all' || resources.includes(resourceId);
  for (const route of Object.values(state.routes)) {
    if (route.owner !== PLAYER) continue;
    const dropsHere = route.stops.some((s) => s.businessId === dest.id && s.action === 'dropoff' && allows(s.resources));
    if (!dropsHere) continue;
    for (const s of route.stops) {
      if (s.action !== 'pickup' || s.businessId === dest.id) continue;
      const src = state.businesses[s.businessId];
      if (src && src.owner === PLAYER && isInternalSource(reg, src)) sources.set(src.id, src);
    }
  }
  return [...sources.values()];
}

/** Stock of `resourceId` available internally to `dest` (31.2). */
export function internalAvailable(reg: DefinitionRegistry, state: SimState, dest: Business, resourceId: string): number {
  let total = 0;
  for (const src of feedingSources(reg, state, dest, resourceId)) total += src.storage[resourceId]?.amount ?? 0;
  return total;
}
