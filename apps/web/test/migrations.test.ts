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

describe('v1 -> v4 migration', () => {
  it('current schema version is 4', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
  });

  for (const name of ['new-game', 'played', 'in-debt']) {
    it(`${name}.json migrates, validates and still runs`, () => {
      const old = fixture(name);
      expect(old.schemaVersion).toBe(1);
      const m = migrate(old);
      expect(m).toMatchObject({ ok: true, applied: ['v1_to_v2_phase2_sections', 'v2_to_v3_savings', 'v3_to_v4_phase3_skeleton'] });
      expect(old.schemaVersion).toBe(1); // input untouched

      const res = deserialize(JSON.parse(JSON.stringify(old)), reg);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.migrated).toBe(true);
      const state: SimState = res.doc.state;
      expect(res.doc.schemaVersion).toBe(4);
      expect(state.player.savings).toBe(0);
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

// Task 41.1 / 41.3: fixtures recorded from the code before the Phase 3 schema change (schema 3).
const v3dir = join(__dirname, '..', '..', '..', 'packages', 'shared', 'test', 'fixtures', 'v3');
const v3fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(v3dir, `${name}.json`), 'utf8')) as Record<string, unknown>;

describe('v3 -> v4 migration skeleton', () => {
  for (const name of ['new-game', 'played', 'mid-order', 'mid-carry']) {
    it(`${name}.json migrates, validates and still runs`, () => {
      const old = v3fixture(name);
      expect(old.schemaVersion).toBe(3);
      const res = deserialize(JSON.parse(JSON.stringify(old)), reg);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const state: SimState = res.doc.state;
      expect(res.migrated).toBe(true);
      expect(res.doc.schemaVersion).toBe(4);
      expect(state.player).toMatchObject({ license: 'pub', supplyDeal: { dealId: 'small_flexible', kegDrinks: 20 }, fitOutBudget: 0 });
      expect(state.loans).toEqual([]);
      expect(state.quests).toEqual({});
      expect(state.requests).toEqual({});
      for (const b of Object.values(state.businesses)) if (b.pub) expect(b.pub).toMatchObject({ open: true, seatsBuilt: b.pub.seats.length, vibeBase: 0, lostIncome: 0 });
      for (const c of Object.values(state.customers)) {
        expect(c.waitedLong).toBe(false);
        expect(c.tab).toBeGreaterThanOrEqual(0);
        expect(c).not.toHaveProperty('priceBpExtra');
        // a Customer who has been served owes at least the drink he is holding
        if (c.servedAny) expect(c.tab).toBeGreaterThan(0);
      }
      expect(checkInvariants(state, reg)).toEqual([]);
      const sim = new Simulation(reg, state);
      for (let t = 0; t < 300; t++) sim.tick();
      expect(checkInvariants(sim.state, reg)).toEqual([]);
    });
  }
  it('the mid-order and mid-carry fixtures really contain such Customers', () => {
    const open = (n: string): boolean => {
      const st = v3fixture(n).state as SimState;
      return Object.values(st.businesses).some((b) => b.pub?.orderQueue.some((o) => !o.poured));
    };
    expect(open('mid-order')).toBe(true);
    const st = v3fixture('mid-carry').state as SimState;
    const carry = Object.values(st.humans).some((h) => h.task?.kind === 'carry') || Object.values(st.businesses).some((b) => b.jobSlots.some((j) => j.headcountTasks?.some((x) => x?.kind === 'carry')));
    expect(carry).toBe(true);
  });
  it('is idempotent on a v4 document', () => {
    const once = deserialize(v3fixture('played'), reg);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const again = deserialize(JSON.parse(JSON.stringify(once.doc)), reg);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.migrated).toBe(false);
  });
});