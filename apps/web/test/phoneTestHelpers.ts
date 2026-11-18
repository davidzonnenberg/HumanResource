// Small helper for phone tests: a fresh Simulation from the real content.
import { rawContent } from '@hr/content';
import { loadRegistry, newGame, Simulation } from '@hr/sim';

export function freshRegistry(seed = 1): { sim: Simulation } {
  const res = loadRegistry(rawContent);
  if (!res.ok) throw new Error('content');
  return { sim: new Simulation(res.value, newGame(res.value, seed)) };
}
