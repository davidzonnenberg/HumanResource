// Determinism replay (task 8.4; Requirement 2.5). A scripted run is recorded as the Commands it
// actually submitted; replaying that log alone must reproduce the same results, events and state.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Command } from '../src/commands/types';
import type { DomainEvent } from '../src/core/events';
import type { TickOutput } from '../src/core/simulation';
import { arbSchedule, freshSim, resolveChoice } from './helpers';

const TICKS = 300;

interface LoggedCommand {
  tick: number;
  cmd: Command;
}

describe('determinism replay', () => {
  it('a recorded Command log replays to identical results, events and final state', () => {
    fc.assert(
      fc.property(fc.integer(), arbSchedule(TICKS, 30), (seed, schedule) => {
        // Pass 1: resolve the scripted choices against the live state and record what was submitted.
        const live = freshSim(seed);
        const log: LoggedCommand[] = [];
        const liveOutputs: TickOutput[] = [];
        let next = 0;
        for (let t = 0; t < TICKS; t++) {
          while (next < schedule.length && (schedule[next]?.atTick ?? Infinity) <= t) {
            const cmd = resolveChoice(live.state, schedule[next]!.choice);
            if (cmd) {
              log.push({ tick: t, cmd });
              live.submit(cmd);
            }
            next++;
          }
          liveOutputs.push(live.tick());
        }

        // Pass 2: replay only the recorded log, with no choice resolution at all.
        const replay = freshSim(seed);
        const replayOutputs: TickOutput[] = [];
        let at = 0;
        for (let t = 0; t < TICKS; t++) {
          while (at < log.length && (log[at]?.tick ?? Infinity) <= t) {
            replay.submit(log[at]!.cmd);
            at++;
          }
          replayOutputs.push(replay.tick());
        }

        // Compare everything observable: per-Tick results and events, and the final state.
        const observable = (outs: TickOutput[]) => JSON.stringify(outs.map((o) => ({ results: o.results, events: o.events as DomainEvent[] })));
        expect(observable(replayOutputs)).toBe(observable(liveOutputs));
        expect(JSON.stringify(replay.state)).toBe(JSON.stringify(live.state));
      }),
      { numRuns: 25 },
    );
  });
});
