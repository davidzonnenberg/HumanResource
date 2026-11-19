// The golden-playthrough test (task 38.4, Requirement 53.5, 53.6). It replays the recorded ten-minute
// Command_Log of the dev start headless and asserts the final State_Hash. A balance or RNG-order change
// alters the hash and fails this test until the developer re-records on purpose:
//   npm run golden:record
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/simulation';
import { newGame } from '../../src/state/newGame';
import { CommandRecorder, compressLog, runLog, stateHash, type LogEntry } from '../../src/replay';
import { registry, resolveChoice } from '../helpers';
import { GOLDEN_SEED, GOLDEN_TICKS, goldenSchedule } from './script';

const FILE = fileURLToPath(new URL('./golden-playthrough.json', import.meta.url));

interface GoldenFile {
  seed: number;
  ticks: number;
  entries: LogEntry[];
  hash: string;
}

/** Plays the script live, recording every submitted Command, exactly as the web recorder does. */
function record(): GoldenFile {
  const reg = registry();
  const sim = new Simulation(reg, newGame(reg, GOLDEN_SEED));
  const rec = new CommandRecorder();
  const submit = sim.submit.bind(sim);
  sim.submit = (cmd, issuer) => {
    rec.record(sim.state.tick, cmd, issuer ?? 'player');
    return submit(cmd, issuer);
  };
  const sched = goldenSchedule();
  let next = 0;
  for (let t = 0; t < GOLDEN_TICKS; t++) {
    while (next < sched.length && (sched[next] as (typeof sched)[number]).atTick <= t) {
      const cmd = resolveChoice(sim.state, (sched[next] as (typeof sched)[number]).choice);
      if (cmd) sim.submit(cmd);
      next++;
    }
    sim.tick();
  }
  return { seed: GOLDEN_SEED, ticks: GOLDEN_TICKS, entries: compressLog(rec.snapshot()), hash: stateHash(sim.state) };
}

describe('golden playthrough (task 38.4)', () => {
  if (process.env.GOLDEN_RECORD || !existsSync(FILE)) {
    it('records the golden playthrough', () => {
      const g = record();
      writeFileSync(FILE, JSON.stringify(g));
      expect(g.hash).toMatch(/^[0-9a-f]{16}$/);
    });
    return;
  }
  const golden = JSON.parse(readFileSync(FILE, 'utf8')) as GoldenFile;
  it('has the expected shape: ten minutes of Commands, compressed', () => {
    expect(golden.ticks).toBe(6000);
    expect(golden.entries.some((e) => (e.repeat ?? 1) > 50)).toBe(true); // per-Tick runs are compressed
    expect(golden.entries.some((e) => e.cmd.type === 'manualVehicleUpdate')).toBe(true); // poses are part of the log (53.4)
  });
  it('replays the recorded Command_Log to the recorded State_Hash', () => {
    const reg = registry();
    const res = runLog(reg, newGame(reg, golden.seed), { entries: golden.entries }, golden.ticks);
    expect(res.tick).toBe(golden.ticks);
    expect(res.hash).toBe(golden.hash);
  });
  it('the live play of the script gives the same hash as the recording', () => {
    expect(record().hash).toBe(golden.hash);
  });
});