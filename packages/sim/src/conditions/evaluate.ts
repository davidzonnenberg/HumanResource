// Declarative condition DSL for Reveal_Triggers, Achievements and District unlocks (19, 40, 48).
import type { DefinitionRegistry } from '../defs/registry';
import type { Condition } from '../defs/schemas';
import type { DomainEvent } from '../core/events';
import type { SimState } from '../state/types';
import { PLAYER } from '../state/types';

export function evaluateCondition(c: Condition, state: SimState, events: readonly DomainEvent[], reg: DefinitionRegistry): boolean {
  switch (c.kind) {
    case 'event':
      return events.some((e) => {
        if (e.type !== c.event) return false;
        if (!c.where) return true;
        const rec = e as unknown as Record<string, unknown>;
        return Object.entries(c.where).every(([k, v]) => rec[k] === v);
      });
    case 'goldAtLeast':
      return state.player.gold >= c.amount;
    case 'corporateResourceAtLeast':
      return (state.player.corporateResources[c.resourceId] ?? 0) >= c.amount;
    case 'ownedBusinessCountAtLeast': {
      let n = 0;
      for (const b of Object.values(state.businesses)) if (b.owner === PLAYER && reg.businesses[b.defId]?.type === c.businessType) n++;
      return n >= c.count;
    }
    case 'tickAtLeast':
      return state.tick >= c.tick;
    case 'never':
      return false;
    case 'all':
      return c.of.every((x) => evaluateCondition(x, state, events, reg));
    case 'any':
      return c.of.some((x) => evaluateCondition(x, state, events, reg));
  }
}
