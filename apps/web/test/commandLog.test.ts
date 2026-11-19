// Command_Log recording in the web loop and the bug-report export (tasks 38.2, 38.3, 38.8).
import { rawContent } from '@hr/content';
import { loadRegistry, newGame, runLog, Simulation, stateHash, type DefinitionRegistry } from '@hr/sim';
import { saveEnvelopeSchema } from '@hr/shared';
import { describe, expect, it } from 'vitest';
import { buildBugReport } from '../src/game/bugReport';
import { GameLoop } from '../src/loop/GameLoop';
import { SessionRecorder } from '../src/loop/commandRecorder';
import { buildSaveDocument } from '../src/persistence/serializer';
import { proofOf } from '../src/sync/syncService';

function reg(): DefinitionRegistry {
  const res = loadRegistry(rawContent);
  if (!res.ok) throw new Error('content');
  return res.value;
}
const newSim = (seed = 3): Simulation => new Simulation(reg(), newGame(reg(), seed));

describe('SessionRecorder', () => {
  it('records every submitted Command with its Tick and compresses per-Tick runs', () => {
    const sim = newSim();
    const rec = new SessionRecorder(sim, 1000);
    rec.attach();
    sim.submit({ type: 'hire' });
    for (let i = 0; i < 30; i++) {
      sim.submit({ type: 'ceoMove', dx: 1, dz: 0 });
      sim.tick();
    }
    sim.submit({ type: 'hire' }, 'ui');
    expect(rec.tail()).toEqual([
      { tick: 0, cmd: { type: 'hire' } },
      { tick: 0, cmd: { type: 'ceoMove', dx: 1, dz: 0 }, repeat: 30 },
      { tick: 30, cmd: { type: 'hire' }, issuer: 'ui' },
    ]);
    rec.detach();
    sim.submit({ type: 'hire' });
    expect(rec.tail()).toHaveLength(3); // detached: nothing more is recorded
  });
  it('keeps a rolling tail of at most `commandLogTailLimit` entries but the whole session for the report', () => {
    const sim = newSim();
    const rec = new SessionRecorder(sim, 5);
    rec.attach();
    for (let i = 0; i < 40; i++) {
      sim.submit({ type: 'setDrinkPrice', businessId: 'biz_0002', price: 400 + i }); // all different: nothing compresses
      sim.tick();
    }
    expect(rec.tail()).toHaveLength(5);
    expect((rec.tail()[4] as { tick: number }).tick).toBe(39);
    expect(rec.full.length).toBe(40);
  });
  it('a bug report replays to its recorded State_Hash', () => {
    const sim = newSim(9);
    const rec = new SessionRecorder(sim, 1000);
    rec.attach();
    for (let t = 0; t < 400; t++) {
      if (t % 50 === 0) sim.submit({ type: 'hire' });
      if (t < 120) sim.submit({ type: 'ceoMove', dx: 0.5, dz: 0.5 });
      if (t === 200) sim.submit({ type: 'setDrinkPrice', businessId: 'biz_0002', price: 650 });
      sim.tick();
    }
    const report = buildBugReport(rec, new Date('2026-11-19T12:00:00Z'));
    expect(report).toMatchObject({ kind: 'hr-bug-report', version: 1, tick: 400, truncated: false, createdAt: '2026-11-19T12:00:00.000Z' });
    const replayed = runLog(reg(), report.start, { entries: report.entries }, report.tick);
    expect(replayed.hash).toBe(report.stateHash);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report); // plain JSON
  });
});

describe('State_Hash in the loop and in uploads', () => {
  it('the loop hashes every `stateHashEveryTicks` Ticks', () => {
    const sim = newSim();
    const loop = new GameLoop(sim);
    const every = sim.reg.config.stateHashEveryTicks;
    expect(loop.latestHash).toBeNull();
    for (let i = 0; i < every - 1; i++) loop.runTick();
    expect(loop.latestHash).toBeNull();
    loop.runTick();
    expect(loop.latestHash).toEqual({ tick: every, hash: stateHash(sim.state) });
  });
  it('an upload carries the hash and Tick of the document state', () => {
    const sim = newSim();
    for (let i = 0; i < 25; i++) sim.tick();
    const doc = buildSaveDocument(sim.state, { profileId: 'p', slotId: 's', revision: 1, syncedRevision: 0 });
    expect(proofOf(doc)).toEqual({ stateHash: stateHash(sim.state), tick: 25 });
    expect(proofOf({ ...doc, state: 'nope' })).toBeUndefined();
  });
  it('the Save_Document envelope accepts the optional Command_Log tail', () => {
    const sim = newSim();
    const doc = buildSaveDocument(sim.state, { profileId: 'p', slotId: 's', revision: 1, syncedRevision: 0 }, new Date(), [{ tick: 0, cmd: { type: 'hire' }, repeat: 3 }]);
    expect(doc.commandLog?.entries).toHaveLength(1);
    expect(saveEnvelopeSchema.safeParse(doc).success).toBe(true);
    expect(buildSaveDocument(sim.state, { profileId: 'p', slotId: 's', revision: 1, syncedRevision: 0 }).commandLog).toBeUndefined();
    expect(saveEnvelopeSchema.safeParse({ ...doc, commandLog: { entries: [{ tick: -1, cmd: {} }] } }).success).toBe(false);
  });
});