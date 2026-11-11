// Migration v1 -> v2: adds the Phase 2 state sections to a v1 Save_Document.
//
// Pure JSON function. The v1 shapes it touches are typed LOCALLY below; it never imports game
// types, and it freezes the Phase 2 starting data as literals (market prices, the Market_Depot,
// the 10 ticks/second clock) because a migration describes the game as it was at that version.
import type { Migration } from './index';

interface V1Stock {
  amount: number;
  lots: unknown[];
}
interface V1Business {
  id: string;
  defId: string;
  sourcing?: Record<string, string>;
  autoReorder?: Record<string, unknown>;
  pub?: unknown;
  recipes?: string[];
  [key: string]: unknown;
}
interface V1Vehicle {
  cargo?: Record<string, V1Stock>;
  [key: string]: unknown;
}
interface V1Plot {
  id: string;
  [key: string]: unknown;
}
interface V1State {
  tick: number;
  idCounters: Record<string, number>;
  businesses: Record<string, V1Business>;
  vehicles: Record<string, V1Vehicle>;
  plots: Record<string, V1Plot>;
  resourceTotals: Record<string, number>;
  [key: string]: unknown;
}

const TICKS_PER_SECOND = 10; // sim.json at the time of v1 -> v2
const DEPOT_PLOT_ID = 'plot_depot';

/** Market starting prices as they were authored for v2 (buy = base, sell = base - minSpread). */
const MARKET_START: Record<string, { buy: number; sell: number }> = {
  beer: { buy: 250, sell: 230 },
  hops: { buy: 115, sell: 105 },
  malt: { buy: 95, sell: 85 },
};

export const v1ToV2: Migration = {
  from: 1,
  to: 2,
  name: 'v1_to_v2_phase2_sections',
  up(doc) {
    const state = doc.state as V1State | undefined;
    if (!state || typeof state !== 'object') throw new Error('save has no state object');
    const tick = state.tick;

    // --- Phase 2 sections, empty ---
    state.market = {
      prices: Object.fromEntries(Object.entries(MARKET_START).map(([res, p]) => [res, { buy: p.buy, sell: p.sell, history: [] }])),
      nextUpdateTick: tick + 30 * TICKS_PER_SECOND,
    };
    state.acquisitions = { offers: {}, nextOfferTick: tick + 180 * TICKS_PER_SECOND };
    state.questionable = { offers: {}, running: {}, nextRefreshTick: tick + 120 * TICKS_PER_SECOND };
    state.chains = { edges: {}, registered: {}, synergyCarry: 0 };
    state.boosts = [];
    state.reputationPending = [];

    // --- New physical Resources start at zero in the ledger ---
    for (const res of ['hops', 'malt']) if (state.resourceTotals[res] === undefined) state.resourceTotals[res] = 0;

    // --- Default Sourcing_Policies for every input that lacks one ---
    for (const b of Object.values(state.businesses)) {
      const sourcing = (b.sourcing ??= {});
      for (const res of Object.keys(b.autoReorder ?? {})) if (sourcing[res] === undefined) sourcing[res] = 'buy_external';
      if (b.pub !== undefined && sourcing.beer === undefined) sourcing.beer = 'buy_external';
      // The rival Pub holds the Secret_Recipe in v2 content.
      if (b.defId === 'pub_sports' && b.recipes === undefined) b.recipes = ['badgers_bite'];
    }

    // --- Vans can now carry hops and malt ---
    for (const v of Object.values(state.vehicles)) {
      const cargo = (v.cargo ??= {});
      if (cargo.beer === undefined) continue; // only vehicles that carry goods
      for (const res of ['hops', 'malt']) if (cargo[res] === undefined) cargo[res] = { amount: 0, lots: [] };
    }

    // --- The Market_Depot and its Plot (literal JSON; a fixed name keeps RNG untouched) ---
    if (state.plots[DEPOT_PLOT_ID] === undefined) {
      const n = (state.idCounters.biz ?? 0) + 1;
      state.idCounters.biz = n;
      const id = `biz_${String(n).padStart(4, '0')}`;
      state.plots[DEPOT_PLOT_ID] = { id: DEPOT_PLOT_ID, districtId: 'old_town', status: 'occupied', owner: 'npc', businessId: id, price: null };
      state.businesses[id] = {
        id,
        defId: 'market_depot',
        owner: 'npc',
        plotId: DEPOT_PLOT_ID,
        name: 'Market Depot',
        storage: {},
        jobSlots: [],
        brandId: null,
        traits: [],
        sourcing: {},
        autoReorder: {},
      };
    }
    return doc;
  },
};
