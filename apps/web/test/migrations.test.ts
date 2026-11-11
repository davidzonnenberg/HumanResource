// v1 -> v2 migration (phase2-guide A5): every committed v1 fixture migrates, then passes the
// state schema AND the invariant checker, and the sim keeps running from it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rawContent } from '@hr/content';
import { checkInvariants, loadRegistry, Simulation, type DefinitionRegistry, type SimState } from '@hr/sim';
import { CURRENT_SCHEMA_VERSION, migrate } from '@hr/shared';
import { deserialize } from '../src/persistence/serializer';

const reg: DefinitionRegistry = (() => {
  const r = loadRegistry(rawContent);
  if (!r.ok) throw new Error('content');
  return r.value;
})();

const dir = join(__dirname, '..', '..', '..', 'packages', 'shared', 'test', 'fixtures', 'v1');
const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) as Record<string, unknown>;

describe('v1 -> v2 migration', () => {
  it('current schema version is 2', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });

  for (const name of ['new-game', 'played', 'in-debt']) {
    it(`${name}.json migrates, validates and still runs`, () => {
      const old = fixture(name);
      expect(old.schemaVersion).toBe(1);
      const m = migrate(old);
      expect(m).toMatchObject({ ok: true, applied: ['v1_to_v2_phase2_sections'] });
      expect(old.schemaVersion).toBe(1); // input untouched

      const res = deserialize(JSON.parse(JSON.stringify(old)), reg);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.migrated).toBe(true);
      const state: SimState = res.doc.state;
      expect(res.doc.schemaVersion).toBe(2);
      expect(checkInvariants(state, reg)).toEqual([]);

      // Phase 2 sections and the Market_Depot exist
      expect(state.market?.prices.hops).toMatchObject({ buy: 115, sell: 105 });
      expect(state.acquisitions?.offers).toEqual({});
      expect(state.chains).toEqual({ edges: {}, registered: {}, synergyCarry: 0 });
      expect(state.boosts).toEqual([]);
      const depot = Object.values(state.businesses).find((b) => b.defId === 'market_depot');
      expect(depot?.plotId).toBe('plot_depot');
      expect(state.plots.plot_depot?.businessId).toBe(depot?.id);

      // The migrated game keeps simulating without violating invariants
      const sim = new Simulation(reg, state);
      for (let t = 0; t < 300; t++) sim.tick();
      expect(checkInvariants(sim.state, reg)).toEqual([]);
    });
  }

  it('keeps the debt and the open Order of the in-debt fixture', () => {
    const res = deserialize(fixture('in-debt'), reg);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.state.player.gold).toBeLessThan(0);
    expect(Object.keys(res.doc.state.orders).length).toBeGreaterThan(0);
  });
});
