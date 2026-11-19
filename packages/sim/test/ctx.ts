// A TickContext over a Simulation, for calling handlers, systems and `applyEffects` directly in tests.
import type { TickContext } from '../src/core/context';
import type { Simulation } from '../src/core/simulation';

export function ctxOf(sim: Simulation): TickContext {
  return {
    state: sim.state,
    reg: sim.reg,
    cfg: sim.reg.config,
    tps: sim.reg.config.ticksPerSecond,
    dt: sim.reg.config.tickMs / 1000,
    events: [],
    results: [],
    queue: [],
    ledger: {},
    paths: () => sim.paths(),
    refreshPaths: () => undefined,
  };
}