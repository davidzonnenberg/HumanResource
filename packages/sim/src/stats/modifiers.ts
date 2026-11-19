// Stored Modifiers (Requirement 50): add, and expire. `state.modifiers` is kept sorted by id so the
// saved state and the "why this number" list are canonical.
import type { TickContext } from '../core/context';
import { nextId } from '../core/ids';
import type { Modifier, SimState } from '../state/types';
import { compareIds } from './getStat';

export type NewModifier = Omit<Modifier, 'id'>;

/** Stores a Modifier under a fresh id and keeps the list sorted by id. Returns the stored Modifier. */
export function addModifier(state: SimState, m: NewModifier): Modifier {
  const stored: Modifier = { id: nextId(state, 'mod'), ...m };
  const list = (state.modifiers ??= []);
  list.push(stored);
  list.sort((a, b) => compareIds(a.id, b.id));
  return stored;
}

/** Pipeline slot 0.5: removes Modifiers whose `untilTick` has been reached, before any system reads a stat (50.5). */
export function modifiersSystem(ctx: TickContext): void {
  const list = ctx.state.modifiers;
  if (!list || list.length === 0) return;
  const tick = ctx.state.tick;
  if (list.some((m) => m.untilTick !== undefined && m.untilTick <= tick)) ctx.state.modifiers = list.filter((m) => m.untilTick === undefined || m.untilTick > tick);
}
