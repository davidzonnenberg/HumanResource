// Achievements (task 30.2, Requirement 40). Each Achievement is awarded once per Save_Slot, on the
// first Tick its condition holds. No RNG is consumed. Awarded ids are saved in state.achievements.
import type { TickContext } from '../../core/context';
import { evaluateCondition } from '../../conditions/evaluate';

export function achievementsSystem(ctx: TickContext): void {
  const awarded = ctx.state.achievements;
  for (const def of Object.values(ctx.reg.achievements)) {
    if (awarded.includes(def.id)) continue;
    if (!evaluateCondition(def.condition, ctx.state, ctx.events, ctx.reg)) continue;
    awarded.push(def.id);
    ctx.events.push({ type: 'achievementAwarded', achievementId: def.id });
  }
}
