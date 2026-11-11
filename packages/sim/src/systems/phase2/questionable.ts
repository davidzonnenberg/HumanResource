// Questionable_Opportunities (task 29.4). Both scheduled kinds are dispatched by the scheduler.
import type { TickContext } from '../../core/context';
import type { ScheduledPayload } from '../../core/scheduler';

/** payload: { runId } - pays the reward, frees the Humans and rolls consequences (task 29.4). */
export function questionableDone(_ctx: TickContext, _payload: ScheduledPayload): void {
  throw new Error('questionableDone is not implemented yet (task 29.4)');
}

/** payload: { causeKey, ... } - applies a delayed consequence: reputation, fine, headline (task 29.4). */
export function consequence(_ctx: TickContext, _payload: ScheduledPayload): void {
  throw new Error('consequence is not implemented yet (task 29.4)');
}
