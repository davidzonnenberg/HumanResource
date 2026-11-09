// Simulation: owns the state, the Command queue and the derived path cache. tick() advances
// exactly one Tick through the ordered pipeline (Requirement 2).
import type { DefinitionRegistry } from '../defs/registry';
import { pathCacheFor, unlockedDistricts, type PathCache } from '../logistics/pathCache';
import type { SimState } from '../state/types';
import type { Command, CommandEnvelope, CommandResult, Issuer } from '../commands/types';
import type { DomainEvent } from './events';
import type { TickContext } from './context';
import { PIPELINE } from './pipeline';

export interface TickOutput {
  results: CommandResult[];
  events: DomainEvent[];
  ledger: Record<string, number>;
}

export class Simulation {
  readonly reg: DefinitionRegistry;
  state: SimState;
  private queue: CommandEnvelope[] = [];
  private seq = 0;
  private cache: PathCache;

  constructor(reg: DefinitionRegistry, state: SimState) {
    this.reg = reg;
    this.state = state;
    this.cache = pathCacheFor(reg, unlockedDistricts(state.districts));
  }

  /** Queues a Command for the next Tick boundary (2.7). Returns its sequence number. */
  submit(cmd: Command, issuer: Issuer = 'player'): number {
    this.seq += 1;
    this.queue.push({ seq: this.seq, issuer, cmd });
    return this.seq;
  }

  get pendingCommands(): number {
    return this.queue.length;
  }

  paths(): PathCache {
    return this.cache;
  }

  /** Advances exactly one Tick. */
  tick(): TickOutput {
    const cfg = this.reg.config;
    const ctx: TickContext = {
      state: this.state,
      reg: this.reg,
      cfg,
      tps: cfg.ticksPerSecond,
      dt: cfg.tickMs / 1000,
      events: [],
      results: [],
      queue: this.queue,
      ledger: {},
      paths: () => this.cache,
      refreshPaths: () => {
        this.cache = pathCacheFor(this.reg, unlockedDistricts(this.state.districts));
      },
    };
    for (const sys of PIPELINE) sys.run(ctx);
    const news = this.state.news;
    for (const e of ctx.events) if (e.type === 'news') news.push(e.item);
    if (news.length > cfg.newsLimit) news.splice(0, news.length - cfg.newsLimit);
    return { results: ctx.results, events: ctx.events, ledger: ctx.ledger };
  }
}

/** Deep copy of plain-JSON state. */
export const cloneState = (s: SimState): SimState => JSON.parse(JSON.stringify(s)) as SimState;

/** Test helper: clones the state, applies the Commands at the next boundary and runs one Tick. */
export function stepPure(reg: DefinitionRegistry, state: SimState, cmds: { cmd: Command; issuer?: Issuer }[]): { state: SimState } & TickOutput {
  const sim = new Simulation(reg, cloneState(state));
  for (const c of cmds) sim.submit(c.cmd, c.issuer ?? 'player');
  const out = sim.tick();
  return { state: sim.state, ...out };
}
