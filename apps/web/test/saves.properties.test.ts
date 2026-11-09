// Required save property tests (Requirement 44.2): round-trip, continuation, migration validity.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rawContent } from '@hr/content';
import { loadRegistry, newGame, Simulation, cloneState, type DefinitionRegistry } from '@hr/sim';
import { CURRENT_SCHEMA_VERSION, migrate, type Migration } from '@hr/shared';
import { buildSaveDocument, deserialize, serialize } from '../src/persistence/serializer';

const reg = ((): DefinitionRegistry => {
  const r = loadRegistry(rawContent);
  if (!r.ok) throw new Error('content');
  return r.value;
})();

/** A played state: new game advanced by some Ticks with a few Commands. */
function playedState(seed: number, ticks: number, hires: number) {
  const sim = new Simulation(reg, newGame(reg, seed));
  for (let i = 0; i < hires; i++) sim.submit({ type: 'hire' });
  for (let t = 0; t < ticks; t++) sim.tick();
  return sim.state;
}

const meta = { profileId: 'p1', slotId: 's1', revision: 3, syncedRevision: 2 };

describe('Save_Serializer', () => {
  // Feature: human-resource-mvp, Property 25: Save round-trip
  it('Property 25: deserialize(serialize(state)) equals the state', () => {
    fc.assert(
      fc.property(fc.integer(), fc.nat(1500), fc.nat(3), (seed, ticks, hires) => {
        const state = playedState(seed, ticks, hires);
        const res = deserialize(serialize(buildSaveDocument(state, meta)), reg);
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.doc.state).toEqual(state);
          expect(res.doc.revision).toBe(3);
          expect(res.doc.syncedRevision).toBe(2);
        }
      }),
      { numRuns: 100 },
    );
  }, 300_000);

  // Feature: human-resource-mvp, Property 26: Round-trip continuation equivalence
  it('Property 26: continuing from a loaded save equals continuing from memory', () => {
    fc.assert(
      fc.property(fc.integer(), fc.nat(800), fc.integer({ min: 1, max: 600 }), (seed, before, after) => {
        const state = playedState(seed, before, 1);
        const res = deserialize(serialize(buildSaveDocument(state, meta)), reg);
        if (!res.ok) throw new Error('load failed');
        const a = new Simulation(reg, cloneState(state));
        const b = new Simulation(reg, res.doc.state);
        for (let t = 0; t < after; t++) {
          a.tick();
          b.tick();
        }
        expect(b.state).toEqual(a.state);
      }),
      { numRuns: 100 },
    );
  }, 300_000);

  // Feature: human-resource-mvp, Property 27: Migration validity
  it('Property 27: every stored older document migrates to a valid current document', () => {
    // No older schema exists yet (v1 is current). The harness migrates synthetic v0 documents
    // through a test pipeline; Phase 2 adds real v1 fixtures in packages/shared/test/fixtures.
    const v0ToV1: Migration = { from: 0, to: CURRENT_SCHEMA_VERSION, name: 'test_v0_to_v1', up: (d) => ({ ...d, state: (d as { legacy: unknown }).legacy, legacy: undefined }) };
    fc.assert(
      fc.property(fc.integer(), fc.nat(600), (seed, ticks) => {
        const state = playedState(seed, ticks, 0);
        const old = { schemaVersion: 0, revision: 1, syncedRevision: 0, timestamp: 'x', profileId: 'p', slotId: 's', legacy: state };
        const m = migrate(old, [v0ToV1]);
        expect(m.ok).toBe(true);
        if (!m.ok) return;
        const res = deserialize(JSON.parse(JSON.stringify(m.doc)), reg, []);
        expect(res.ok).toBe(true);
        expect(old.schemaVersion).toBe(0); // input untouched
      }),
      { numRuns: 100 },
    );
  }, 300_000);

  it('rejects newer versions and reports the first invalid field', () => {
    const state = newGame(reg, 1);
    const doc = buildSaveDocument(state, meta);
    expect(deserialize({ ...doc, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }, reg)).toMatchObject({ ok: false, error: 'newer_version' });
    const broken = JSON.parse(serialize(doc)) as { state: { player: { gold: unknown } } };
    broken.state.player.gold = 'lots';
    expect(deserialize(broken, reg)).toMatchObject({ ok: false, error: 'invalid', field: 'state.player.gold' });
    const failing: Migration = { from: 0, to: 1, name: 'boom', up: () => { throw new Error('x'); } };
    expect(migrate({ ...doc, schemaVersion: 0 }, [failing])).toMatchObject({ ok: false, error: 'step_failed', step: 'boom' });
  });
});
