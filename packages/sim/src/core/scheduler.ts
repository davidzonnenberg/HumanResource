// Scheduled events (phase2-guide A6). `schedule` queues a future event; the scheduler system in
// the pipeline dispatches due events in (fireTick, seq) order through `dispatchScheduled`.
// Each kind is implemented by its feature area under systems/phase2/.
import type { ScheduledEvent, ScheduledKind } from '../state/types';
import type { TickContext } from './context';
import { constructionDone } from '../systems/phase2/construction';
import { revealAttribute } from '../systems/phase2/acquisitions';
import { consequence, questionableDone } from '../systems/phase2/questionable';

export type ScheduledPayload = ScheduledEvent['payload'];

/** Queues an event for `fireTick`. `seq` is monotonic, so equal fireTicks keep submission order. */
export function schedule(ctx: Pick<TickContext, 'state'>, kind: ScheduledKind, fireTick: number, payload: ScheduledPayload): void {
  ctx.state.schedulerSeq += 1;
  ctx.state.scheduler.push({ seq: ctx.state.schedulerSeq, fireTick, kind, payload });
}

export function dispatchScheduled(ctx: TickContext, ev: ScheduledEvent): void {
  switch (ev.kind) {
    case 'constructionDone':
      return constructionDone(ctx, ev.payload);
    case 'revealAttribute':
      return revealAttribute(ctx, ev.payload);
    case 'questionableDone':
      return questionableDone(ctx, ev.payload);
    case 'consequence':
      return consequence(ctx, ev.payload);
    default: {
      // Unreachable for valid state (the state schema only allows the kinds above). Throwing keeps a
      // corrupt event from being silently dropped, which is the bug this dispatcher replaces.
      const unknown: never = ev.kind;
      throw new Error(`unknown scheduled event kind "${String(unknown)}"`);
    }
  }
}

/** Runs every event due at the current Tick, oldest first, and removes it from the queue. */
export function schedulerSystem(ctx: TickContext): void {
  const { state } = ctx;
  if (state.scheduler.length === 0) return;
  const due = state.scheduler.filter((e) => e.fireTick <= state.tick).sort((a, b) => a.fireTick - b.fireTick || a.seq - b.seq);
  if (due.length === 0) return;
  state.scheduler = state.scheduler.filter((e) => e.fireTick > state.tick);
  // Events scheduled by a handler for the current Tick or earlier wait for the next Tick's pass.
  for (const ev of due) dispatchScheduled(ctx, ev);
}
