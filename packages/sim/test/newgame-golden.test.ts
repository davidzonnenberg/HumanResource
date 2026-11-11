// Regression guard for the createBusiness refactor and the Phase 2 additions (phase2-guide A6):
// apart from the documented Phase 2 additions, newGame must produce exactly the Phase 1 state for
// the same seed, including the RNG state. The golden file was written from the pre-refactor code.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/state/newGame';
import type { SimState } from '../src/state/types';
import { registry } from './helpers';

const golden = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'newgame-phase1-golden.json'), 'utf8')) as Record<string, SimState>;

/** Removes everything Phase 2 added to a new game so it can be compared with the Phase 1 golden. */
function phase1Projection(state: SimState): SimState {
  const s = JSON.parse(JSON.stringify(state)) as SimState;
  for (const k of ['market', 'acquisitions', 'questionable', 'chains', 'boosts', 'reputationPending'] as const) Reflect.deleteProperty(s, k);
  for (const [id, b] of Object.entries(s.businesses)) {
    if (b.defId === 'market_depot') {
      Reflect.deleteProperty(s.businesses, id);
      Reflect.deleteProperty(s.plots, b.plotId);
      s.idCounters.biz = (s.idCounters.biz ?? 1) - 1;
      continue;
    }
    Reflect.deleteProperty(b, 'recipes');
  }
  for (const v of Object.values(s.vehicles)) {
    Reflect.deleteProperty(v.cargo, 'hops');
    Reflect.deleteProperty(v.cargo, 'malt');
  }
  Reflect.deleteProperty(s.resourceTotals, 'hops');
  Reflect.deleteProperty(s.resourceTotals, 'malt');
  return s;
}

describe('newGame Phase 1 regression', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed} matches the Phase 1 golden state (same ids, names and RNG state)`, () => {
      expect(phase1Projection(newGame(registry(), seed))).toEqual(golden[String(seed)]);
    });
  }

  it('Phase 2 sections exist and the Market_Depot is a fixed-name NPC Business', () => {
    const s = newGame(registry(), 1);
    expect(Object.keys(s.market?.prices ?? {})).toEqual(['beer', 'hops', 'malt']);
    expect(s.market?.prices.beer).toEqual({ buy: 250, sell: 230, history: [] });
    expect(s.acquisitions?.offers).toEqual({});
    expect(s.boosts).toEqual([]);
    const depot = Object.values(s.businesses).find((b) => b.defId === 'market_depot');
    expect(depot).toMatchObject({ owner: 'npc', name: 'Market Depot', plotId: 'plot_depot' });
    expect(s.plots.plot_depot).toMatchObject({ status: 'occupied', businessId: depot?.id });
    expect(s.resourceTotals.synergy).toBeUndefined(); // Corporate_Resources never enter the ledger
  });
});
