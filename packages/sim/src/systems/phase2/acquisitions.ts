// Acquisitions and hidden attributes (task 28). `revealAttribute` is dispatched by the scheduler.
import type { TickContext } from '../../core/context';
import type { ScheduledPayload } from '../../core/scheduler';

/** payload: { businessId, kind: 'trait' | 'recipe', id } - reveals a hidden attribute (task 28.1). */
export function revealAttribute(_ctx: TickContext, _payload: ScheduledPayload): void {
  throw new Error('revealAttribute is not implemented yet (task 28.1)');
}
