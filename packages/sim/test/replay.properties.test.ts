// Properties 57-59 (tasks 38.5-38.7): replay reproduces the hash, log compression round-trips and
// the State_Hash is canonical.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Command } from '../src/commands/types';
import { cloneState, Simulation } from '../src/core/simulation';
import { canonicalJson, CommandRecorder, compressLog, expandLog, fnv1a64, runLog, stateHash, type LogEntry } from '../src/replay';
import { newGame } from '../src/state/newGame';
import { arbSimState } from './arbitraries/simState';
import { arbSchedule, freshSim, registry, resolveChoice } from './helpers';

/** Runs the schedule live and returns the compressed log the recorder produced. */
function playRecorded(sim: Simulation, schedule: ReturnType<typeof arbSchedule> extends fc.Arbitrary<infer T> ? T : never, ticks: number): LogEntry[] {
  const rec = new CommandRecorder();
  const submit = sim.submit.bind(sim);
  sim.submit = (cmd, issuer) => {
    rec.record(sim.state.tick, cmd, issuer ?? 'player');
    return submit(cmd, issuer);
  };
  let next = 0;
  for (let t = 0; t < ticks; t++) {
    while (next < schedule.length && (schedule[next]?.atTick ?? Infinity) <= t) {
      const cmd = resolveChoice(sim.state, schedule[next]!.choice);
      if (cmd) sim.submit(cmd);
      next++;
    }
    sim.tick();
  }
  return rec.snapshot();
}

describe('Property 57: Replay reproduces the recorded hash', () => {
  // Feature: human-resource-mvp, Property 57 (Validates: Requirements 53.1, 53.3, 53.4)
  const TICKS = 250;
  it('a recorded log, replayed headless from the start, ends at the recorded State_Hash', () => {
    fc.assert(
      fc.property(fc.integer(), arbSchedule(TICKS, 40), (seed, schedule) => {
        const live = freshSim(seed);
        const entries = playRecorded(live, schedule, TICKS);
        const res = runLog(registry(), newGame(registry(), seed), { entries }, TICKS);
        expect(res.tick).toBe(TICKS);
        expect(res.hash).toBe(stateHash(live.state));
      }),
      { numRuns: 25 },
    );
  });
  it('includes Manual_Driving: recorded poses are fed back as Commands', () => {
    const schedule = [
      { atTick: 5, choice: { k: 'drive' as const } },
      ...Array.from({ length: 60 }, (_, i) => ({ atTick: 10 + i, choice: { k: 'manualPose' as const, dx: 0.3, dz: -0.1, speed: 1.5 } })),
      { atTick: 80, choice: { k: 'endDrive' as const } },
    ];
    const live = freshSim(11);
    const entries = playRecorded(live, schedule, TICKS);
    expect(entries.filter((e) => e.cmd.type === 'manualVehicleUpdate').length).toBeGreaterThan(10); // poses differ every Tick, so they are not merged
    expect(runLog(registry(), newGame(registry(), 11), { entries }, TICKS).hash).toBe(stateHash(live.state));
  });
  it('replays from a snapshot taken mid-run', () => {
    fc.assert(
      fc.property(fc.integer(), arbSchedule(TICKS, 30), fc.integer({ min: 1, max: TICKS - 1 }), (seed, schedule, cut) => {
        const live = freshSim(seed);
        let snap: ReturnType<typeof cloneState> | null = null;
        const rec = new CommandRecorder();
        const submit = live.submit.bind(live);
        live.submit = (cmd, issuer) => {
          rec.record(live.state.tick, cmd, issuer ?? 'player');
          return submit(cmd, issuer);
        };
        let next = 0;
        for (let t = 0; t < TICKS; t++) {
          if (t === cut) snap = cloneState(live.state);
          while (next < schedule.length && (schedule[next]?.atTick ?? Infinity) <= t) {
            const cmd = resolveChoice(live.state, schedule[next]!.choice);
            if (cmd) live.submit(cmd);
            next++;
          }
          live.tick();
        }
        // Only the Commands from the snapshot Tick on: the replay starts at `cut`, not at 0.
        const tail = compressLog(expandLog(rec.snapshot()).filter((e) => e.tick >= cut));
        const res = runLog(registry(), snap as ReturnType<typeof cloneState>, { entries: tail }, TICKS);
        expect(res.hash).toBe(stateHash(live.state));
      }),
      { numRuns: 15 },
    );
  });
  it('refuses a log that starts before its base state', () => {
    const base = freshSim(1);
    base.tick();
    base.tick();
    expect(() => runLog(registry(), base.state, { entries: [{ tick: 0, cmd: { type: 'hire' } }] }, 5)).toThrow();
  });
});

const arbCmd: fc.Arbitrary<Command> = fc.oneof(
  fc.constant<Command>({ type: 'hire' }),
  fc.record({ type: fc.constant('ceoMove' as const), dx: fc.constantFrom(-1, 0, 0.5), dz: fc.constantFrom(0, 1) }),
  fc.record({ type: fc.constant('setDrinkPrice' as const), businessId: fc.constant('biz_0001'), price: fc.integer({ min: 100, max: 900 }) }),
);

describe('Property 58: Command_Log compression round trip', () => {
  // Feature: human-resource-mvp, Property 58 (Validates: Requirements 53.2)
  /** Submission-ordered per-Tick entries: for each Tick, a few Commands. */
  const arbPerTick = fc
    .array(fc.tuple(fc.nat(3), fc.array(arbCmd, { maxLength: 3 }), fc.integer({ min: 1, max: 6 })), { maxLength: 12 })
    .map((rows) => {
      let tick = 0;
      const out: LogEntry[] = [];
      for (const [gap, cmds, run] of rows) {
        tick += gap;
        // A run: the same Commands submitted at `run` consecutive Ticks
        for (let r = 0; r < run; r++) for (const cmd of cmds) out.push({ tick: tick + r, cmd });
        tick += run;
      }
      return out;
    });
  it('expand(compress(x)) equals x, in the same submission order', () => {
    fc.assert(
      fc.property(arbPerTick, (entries) => {
        const packed = compressLog(entries);
        expect(packed.length).toBeLessThanOrEqual(entries.length);
        expect(expandLog(packed)).toEqual(entries);
        // idempotent
        expect(compressLog(expandLog(packed))).toEqual(packed);
      }),
      { numRuns: 200 },
    );
  });
  it('the recorder compresses the same way and keeps only a rolling tail when asked', () => {
    fc.assert(
      fc.property(arbPerTick, (entries) => {
        const rec = new CommandRecorder();
        for (const e of entries) rec.record(e.tick, e.cmd);
        expect(rec.snapshot()).toEqual(compressLog(entries));
        expect(rec.tail(3)).toEqual(compressLog(entries).slice(-3));
        const small = new CommandRecorder(3);
        for (const e of entries) small.record(e.tick, e.cmd);
        expect(small.length).toBeLessThanOrEqual(3);
      }),
      { numRuns: 100 },
    );
  });
  it('compresses a long per-Tick movement run into one entry', () => {
    const run: LogEntry[] = Array.from({ length: 500 }, (_, i) => ({ tick: 100 + i, cmd: { type: 'ceoMove', dx: 1, dz: 0 } }));
    expect(compressLog(run)).toEqual([{ tick: 100, cmd: { type: 'ceoMove', dx: 1, dz: 0 }, repeat: 500 }]);
  });
});

/** The same data with every object's keys re-inserted in the opposite order. */
function reversedKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reversedKeys);
  if (v === null || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse().map(([k, x]) => [k, reversedKeys(x)]));
}

describe('Property 59: State_Hash is canonical', () => {
  // Feature: human-resource-mvp, Property 59 (Validates: Requirements 53.7, 53.8)
  it('FNV-1a 64 matches the published test vectors (no BigInt in the implementation)', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });
  it('agrees with a BigInt reference on arbitrary text, including non-ASCII', () => {
    const ref = (s: string): string => {
      let h = 0xcbf29ce484222325n;
      for (const b of new TextEncoder().encode(s)) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
      return h.toString(16).padStart(16, '0');
    };
    fc.assert(fc.property(fc.string({ unit: 'grapheme', maxLength: 40 }), (s) => fnv1a64(s) === ref(s)), { numRuns: 300 });
  });
  it('does not depend on key insertion order, and changes when a value changes', () => {
    const reg = registry();
    fc.assert(
      fc.property(arbSimState(reg), (state) => {
        const h = stateHash(state);
        expect(h).toMatch(/^[0-9a-f]{16}$/);
        expect(stateHash(reversedKeys(state) as typeof state)).toBe(h);
        expect(canonicalJson(reversedKeys(state))).toBe(canonicalJson(state));
        const changed = cloneState(state);
        changed.player.gold += 1;
        expect(stateHash(changed)).not.toBe(h);
      }),
      { numRuns: 15 },
    );
  });
  it('equal states reached by two runs hash equal', () => {
    const a = freshSim(7);
    const b = freshSim(7);
    for (let i = 0; i < 200; i++) {
      a.tick();
      b.tick();
    }
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });
});
