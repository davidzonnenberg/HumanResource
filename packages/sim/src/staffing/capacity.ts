// Job_Slot capacity (Requirement 49). Every system reads staffing through these helpers, so a
// Headcount_Fill counts as working capacity exactly like `count` working individual Humans.
import type { Business, Human, JobSlot, SimState, Vehicle } from '../state/types';

/** Working units provided by a slot right now (en-route Humans provide 0). */
export function slotCapacity(slot: JobSlot, state: SimState): number {
  const f = slot.filledBy;
  if (!f) return 0;
  if (f.kind === 'headcount') return f.count;
  const h = state.humans[f.humanId];
  return h && h.status === 'working' ? 1 : 0;
}

/** Working capacity of one Job at a Business or Vehicle. */
export function jobCapacity(holder: Business | Vehicle, jobId: string, state: SimState): number {
  let n = 0;
  for (const s of holder.jobSlots) if (s.jobId === jobId) n += slotCapacity(s, state);
  return n;
}

/** Working individual Humans in a Job (for task assignment and rendering). */
export function workingHumans(holder: Business | Vehicle, jobId: string, state: SimState): Human[] {
  const out: Human[] = [];
  for (const s of holder.jobSlots) {
    if (s.jobId !== jobId || s.filledBy?.kind !== 'human') continue;
    const h = state.humans[s.filledBy.humanId];
    if (h && h.status === 'working') out.push(h);
  }
  return out;
}

export function findSlot(holder: Business | Vehicle, slotId: string): JobSlot | undefined {
  return holder.jobSlots.find((s) => s.slotId === slotId);
}

/** True if the Job has at least one slot and none provides capacity or is filled. */
export function isJobUnstaffed(holder: Business | Vehicle, jobId: string, state: SimState): boolean {
  const slots = holder.jobSlots.filter((s) => s.jobId === jobId);
  if (slots.length === 0) return false;
  return slots.every((s) => slotCapacity(s, state) === 0 && s.filledBy === null);
}
