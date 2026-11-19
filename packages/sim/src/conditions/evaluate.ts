// Declarative condition DSL shared by Reveal_Triggers, Achievements, District unlocks, Services,
// quests and Consequences (Requirement 52). The evaluator reads state and the Tick's events only;
// it never writes state and never touches `state.rng` (52.5).
import type { DefinitionRegistry } from '../defs/registry';
import type { Condition } from '../defs/schemas';
import type { DomainEvent } from '../core/events';
import type { SimState } from '../state/types';
import { PLAYER } from '../state/types';
import { getStat } from '../stats/getStat';
import { firstPlayerPub } from '../world/queries';
import { isRevealed } from './revealed';

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
    case 'not':
      return !evaluateCondition(c.of, state, events, reg);
    case 'revealed':
      return isRevealed(state, reg, c.feature);
    case 'statAtLeast':
    case 'statBelow': {
      const businessId = c.businessId ?? firstPlayerPub(reg, state)?.id;
      if (!businessId || !state.businesses[businessId]) return false; // no target: neither "at least" nor "below" holds
      const v = getStat({ state, reg }, c.stat, { businessId });
      return c.kind === 'statAtLeast' ? v >= c.value : v < c.value;
    }
    case 'loanActive':
      return (state.loans ?? []).some((l) => l.remaining > 0);
    case 'licensed':
      return state.player.license != null && (c.tier === undefined || state.player.license === c.tier);
    case 'pubOpen': {
      const pubs = Object.values(state.businesses).filter((b) => b.owner === PLAYER && b.pub && (c.businessId === undefined || b.id === c.businessId));
      return pubs.some((b) => b.pub?.open !== false);
    }
    case 'humanCountAtLeast': {
      let n = 0;
      for (const h of Object.values(state.humans)) {
        if (h.owner !== PLAYER) continue;
        if (c.jobId !== undefined && !humanHasJob(state, h.id, c.jobId)) continue;
        n++;
      }
      return n >= c.count;
    }
    case 'serviceUsed':
      return (state.servicesUsed?.[c.serviceId] ?? 0) > 0;
    case 'questStepDone':
      return state.quests?.[c.questId]?.stepsDone.includes(c.stepId) ?? false;
  }
}

/** Whether the Human currently fills a slot of the Job. */
function humanHasJob(state: SimState, humanId: string, jobId: string): boolean {
  const a = state.humans[humanId]?.assignment;
  if (!a) return false;
  const holder = a.kind === 'business' ? state.businesses[a.id] : state.vehicles[a.id];
  return holder?.jobSlots.some((s) => s.slotId === a.slotId && s.jobId === jobId) ?? false;
}
