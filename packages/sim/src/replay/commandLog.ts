// Command_Log (Requirement 53): every Command with the Tick it was submitted at, compressed where a
// Command repeats every Tick (ceoMove, manualVehicleUpdate), and a headless `runLog` that replays it.
//
// A LogEntry at `tick` T was submitted while `state.tick === T`, i.e. just before the Tick that
// makes it T + 1. With `repeat: n` the same Command was submitted at the n consecutive Ticks
// T, T + 1, ..., T + n - 1, each time in the same position of that Tick's submission order.
import type { Command, Issuer } from '../commands/types';
import type { DefinitionRegistry } from '../defs/registry';
import { cloneState, Simulation } from '../core/simulation';
import type { SimState } from '../state/types';
import { canonicalJson } from './canonicalJson';
import { stateHash } from './stateHash';

export interface LogEntry {
  tick: number;
  cmd: Command;
  /** Omitted when `player`. */
  issuer?: Issuer;
  /** Number of consecutive Ticks the same Command was submitted; omitted when 1. */
  repeat?: number;
}
export interface CommandLog {
  entries: LogEntry[];
}

const issuerOf = (e: LogEntry): Issuer => e.issuer ?? 'player';
const repeatOf = (e: LogEntry): number => e.repeat ?? 1;
const sameCommand = (a: LogEntry, b: LogEntry): boolean => issuerOf(a) === issuerOf(b) && canonicalJson(a.cmd) === canonicalJson(b.cmd);

/**
 * Merges runs of the identical Command submitted at consecutive Ticks, as long as the runs are
 * adjacent in submission order, so expanding the result restores the exact submission order.
 */
export function compressLog(entries: readonly LogEntry[]): LogEntry[] {
  const out: LogEntry[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && sameCommand(last, e) && repeatOf(e) === 1 && e.tick === last.tick + repeatOf(last)) {
      last.repeat = repeatOf(last) + 1;
    } else {
      const copy: LogEntry = { tick: e.tick, cmd: e.cmd };
      if (e.issuer && e.issuer !== 'player') copy.issuer = e.issuer;
      if (e.repeat && e.repeat > 1) copy.repeat = e.repeat;
      out.push(copy);
    }
  }
  return out;
}

/** The per-Tick form of a log: one entry per submission, in submission order. */
export function expandLog(entries: readonly LogEntry[]): LogEntry[] {
  const out: LogEntry[] = [];
  for (const e of entries) {
    for (let i = 0; i < repeatOf(e); i++) {
      const x: LogEntry = { tick: e.tick + i, cmd: e.cmd };
      if (e.issuer && e.issuer !== 'player') x.issuer = e.issuer;
      out.push(x);
    }
  }
  // Stable: entries of one Tick keep their submission order. (A compressed run lists its Ticks in
  // order, but another entry may sit between two of its Ticks.)
  return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.tick - b.e.tick || a.i - b.i).map((x) => x.e);
}

export interface RunResult {
  state: SimState;
  tick: number;
  hash: string;
}

/**
 * Replays `log` headless from `base` (never modified) until `state.tick === untilTick`. Commands are
 * submitted before the Tick they were recorded at. Throws when an entry lies before the base Tick.
 */
export function runLog(reg: DefinitionRegistry, base: SimState, log: CommandLog, untilTick: number): RunResult {
  const sim = new Simulation(reg, cloneState(base));
  const flat = expandLog(log.entries);
  let next = 0;
  const first = flat[0];
  if (first && first.tick < base.tick) throw new Error(`log starts at tick ${first.tick}, before the base state (tick ${base.tick})`);
  while (sim.state.tick < untilTick) {
    while (next < flat.length && (flat[next] as LogEntry).tick <= sim.state.tick) {
      const e = flat[next] as LogEntry;
      sim.submit(e.cmd, issuerOf(e));
      next++;
    }
    sim.tick();
  }
  return { state: sim.state, tick: sim.state.tick, hash: stateHash(sim.state) };
}

/** Records Commands as they are submitted; the recorder compresses on the fly. */
export class CommandRecorder {
  private entries: LogEntry[] = [];
  /** Entries dropped from the front because the log hit `limit` (the log no longer starts at the base). */
  dropped = 0;
  constructor(readonly limit = Number.POSITIVE_INFINITY) {}
  record(tick: number, cmd: Command, issuer: Issuer = 'player'): void {
    const e: LogEntry = issuer === 'player' ? { tick, cmd } : { tick, cmd, issuer };
    const last = this.entries[this.entries.length - 1];
    if (last && sameCommand(last, e) && tick === last.tick + repeatOf(last)) last.repeat = repeatOf(last) + 1;
    else this.entries.push(e);
    while (this.entries.length > this.limit) {
      this.entries.shift();
      this.dropped += 1;
    }
  }
  /** A copy of the entries, oldest first. */
  snapshot(): LogEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }
  /** The newest `max` entries (a rolling tail for a Save_Document, 53.2). */
  tail(max: number): LogEntry[] {
    return this.snapshot().slice(-max);
  }
  get length(): number {
    return this.entries.length;
  }
}