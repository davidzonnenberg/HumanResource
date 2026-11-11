// Plot construction (task 26.1). `constructionDone` is dispatched by the scheduler.
import type { TickContext } from '../../core/context';
import type { ScheduledPayload } from '../../core/scheduler';

/** payload: { plotId } - creates the Player-owned Business via createBusiness (task 26.1). */
export function constructionDone(_ctx: TickContext, _payload: ScheduledPayload): void {
  throw new Error('constructionDone is not implemented yet (task 26.1)');
}
