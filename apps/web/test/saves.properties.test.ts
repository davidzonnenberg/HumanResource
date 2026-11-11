// Required save property tests (Requirement 44.2): round-trip, continuation, migration validity.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rawContent } from '@hr/content';
import { checkInvariants, loadRegistry, newGame, Simulation, cloneState, type DefinitionRegistry } from '@hr/sim';
import { CURRENT_SCHEMA_VERSION, migrate, type Migration } from '@hr/shared';
import { arbSimState } from '../../../packages/sim/test/arbitraries/simState';
import { buildSaveDocument, deserialize, serialize } from '../src/persistence/serializer';

const reg = ((): DefinitionRegistry => {
  const r = loadRegistry(rawContent);
  if (!r.ok) throw new Error('content');
  return r.value;
})();

const meta = { profileId: 'p1', slotId: 's1', revision: 3, syncedRevision: 2 };

describe('Save_Serializer', () => {
  // Feature: human-resource-mvp, Property 25: Save round-trip
  it('Property 25: deserialize(serialize(state)) equals the state, Phase 2 sections included', () => {
    fc.assert(
      fc.property(arbSimState(reg), (state) => {
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
      fc.property(arbSimState(reg), fc.integer({ min: 1, max: 600 }), (state, after) => {
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
  describe('Property 27: migration validity', () => {
    // Committed v1 documents (packages/shared/test/fixtures/v1), written by the v1 code before the migration.
    const fixtureDir = join(__dirname, '..', '..', '..', 'packages', 'shared', 'test', 'fixtures', 'v1');
    const fixtures = ['new-game', 'played', 'in-debt'].map(
      (name) => JSON.parse(readFileSync(join(fixtureDir, `${name}.json`), 'utf8')) as Record<string, unknown>,
    );

    // Generated v1 documents: a committed fixture with its Phase 1 fields varied (Gold, Reputation).
    // A v1 document cannot be produced by the current code, so variation is applied to real v1 data.
    const arbV1Document = fc
      .record({
        index: fc.integer({ min: 0, max: fixtures.length - 1 }),
        goldDelta: fc.integer({ min: -5_000_000, max: 5_000_000 }),
        reputation: fc.integer({ min: 0, max: 100 }),
        ticks: fc.nat(200),
      })
      .map(({ index, goldDelta, reputation, ticks }) => {
        const doc = JSON.parse(JSON.stringify(fixtures[index])) as { state: { player: { gold: number; reputation: number } } };
        doc.state.player.gold += goldDelta;
        doc.state.player.reputation = reputation;
        return { doc, ticks };
      });

    it('every committed and generated v1 document migrates to a valid current document', () => {
      fc.assert(
        fc.property(arbV1Document, ({ doc, ticks }) => {
          const before = JSON.stringify(doc);
          const res = deserialize(JSON.parse(before) as Record<string, unknown>, reg);
          expect(res.ok).toBe(true);
          if (!res.ok) return;
          expect(res.migrated).toBe(true);
          expect(res.doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
          expect(JSON.stringify(doc)).toBe(before); // input untouched
          expect(checkInvariants(res.doc.state, reg)).toEqual([]);

          // The migrated game keeps simulating without violating invariants
          const sim = new Simulation(reg, res.doc.state);
          for (let t = 0; t < ticks; t++) sim.tick();
          expect(checkInvariants(sim.state, reg)).toEqual([]);
        }),
        { numRuns: 100 },
      );
    }, 300_000);
  });

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
