// The quest engine (Requirement 73.1, 73.2): checks the open steps every Tick, advances the ones whose
// Condition holds and applies each step's reward Effects exactly once. Pipeline slot 20.5.
import type { TickContext } from '../core/context';
import { applyEffects } from '../conditions/effects';
import { evaluateCondition } from '../conditions/evaluate';
import type { DefinitionRegistry } from '../defs/registry';
import type { SimState } from '../state/types';

/** True when every step of the Quest is done. */
export function questComplete(state: SimState, reg: DefinitionRegistry, questId: string): boolean {
  const q = reg.phase3.quests[questId];
  const done = state.quests?.[questId]?.stepsDone;
  return q !== undefined && done !== undefined && q.steps.every((s) => done.includes(s.id));
}

export function questsSystem(ctx: TickContext): void {
  const { state, reg } = ctx;
  for (const q of Object.values(reg.phase3.quests)) {
    if (q.after !== undefined && !questComplete(state, reg, q.after)) continue; // a chained Quest starts when its predecessor is done
    state.quests ??= {};
    const progress = (state.quests[q.id] ??= { stepsDone: [] });
    for (const step of q.steps) {
      if (progress.stepsDone.includes(step.id)) continue;
      if (!(step.requires ?? []).every((r) => progress.stepsDone.includes(r))) continue;
      if (!evaluateCondition(step.done, state, ctx.events, reg)) continue;
      progress.stepsDone.push(step.id); // marked first, so the reward can never apply twice (73.2)
      applyEffects(ctx, step.reward ?? [], { source: `${q.id}.${step.id}` });
      ctx.events.push({ type: 'questStepDone', questId: q.id, stepId: step.id });
    }
  }
}
