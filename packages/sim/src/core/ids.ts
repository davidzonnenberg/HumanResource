// Deterministic prefixed id allocation (e.g. hum_0004). Counters live in the saved state.
import type { SimState } from '../state/types';

export function nextId(state: SimState, prefix: string): string {
  const n = (state.idCounters[prefix] ?? 0) + 1;
  state.idCounters[prefix] = n;
  return `${prefix}_${String(n).padStart(4, '0')}`;
}
