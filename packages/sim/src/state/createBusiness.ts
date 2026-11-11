// The single code path that creates a Business from its Definition (phase2-guide A6).
// newGame, `construct`, `acquireWarehouse` and Competitor `openLocation` all go through here, so
// every Business type gets storage, job slots, sourcing defaults, brand, traits, recipes,
// production entries, the Pub runtime and a name drawn from its text table the same way.
import type { DefinitionRegistry } from '../defs/registry';
import { nextId } from '../core/ids';
import { newRing } from '../metrics/ring';
import { rngPick } from '../rng/xoshiro128ss';
import { addToStock, emptyStock } from '../storage/stock';
import type { Business, JobSlot, OwnerId, PubMetrics, SimState } from './types';
import { PLAYER } from './types';

export function emptyPubMetrics(windowSeconds: number): PubMetrics {
  return {
    arrivals: newRing(windowSeconds),
    lostNoSeat: newRing(windowSeconds),
    lostOutOfBeer: newRing(windowSeconds),
    lostPatience: newRing(windowSeconds),
    waitSum: newRing(windowSeconds),
    waitCount: newRing(windowSeconds),
    staff: newRing(windowSeconds),
  };
}

export interface CreateBusinessOptions {
  /** Starting stock as a percent of storage capacity per Resource (start-state data). */
  stockPct?: Record<string, number>;
  /** Auto-reorder settings as percent of capacity per Resource (start-state data). */
  autoReorder?: Record<string, { enabled: boolean; thresholdPct: number }>;
}

/**
 * Creates the Business, registers it in `state.businesses`, links its Plot and (for Pubs) its
 * metrics. RNG use: exactly one draw for the name, and none when the name table has a single
 * entry (a fixed name), so adding fixed-name Businesses never shifts the RNG stream.
 */
export function createBusiness(
  state: SimState,
  reg: DefinitionRegistry,
  defId: string,
  plotId: string,
  owner: OwnerId,
  opts: CreateBusinessOptions = {},
): Business {
  const def = reg.businesses[defId];
  if (!def) throw new Error(`unknown business def ${defId}`);
  const id = nextId(state, 'biz');
  const names = reg.text[def.nameTable];
  const name = Array.isArray(names) && names.length > 0 ? String(names.length === 1 ? names[0] : rngPick(state, names)) : def.id;

  const storage: Business['storage'] = {};
  for (const [res, cap] of Object.entries(def.storage)) {
    const stock = emptyStock();
    const qty = Math.floor((cap * (opts.stockPct?.[res] ?? 0)) / 100);
    if (qty > 0) addToStock(stock, { qty, recipeId: null, arrivedTick: 0, origin: 'start' }, cap);
    storage[res] = stock;
    state.resourceTotals[res] = (state.resourceTotals[res] ?? 0) + stock.amount;
  }

  const jobSlots: JobSlot[] = [];
  for (const hr of def.humanRequirements)
    for (let i = 0; i < hr.slots; i++) jobSlots.push({ slotId: `${hr.jobId}_${i + 1}`, jobId: hr.jobId, filledBy: null });

  const autoReorder: Business['autoReorder'] = {};
  for (const [res, ar] of Object.entries(opts.autoReorder ?? {}))
    autoReorder[res] = { enabled: ar.enabled, threshold: Math.floor(((def.storage[res] ?? 0) * ar.thresholdPct) / 100), failed: false };

  const biz: Business = {
    id,
    defId: def.id,
    owner,
    plotId,
    name,
    storage,
    jobSlots,
    brandId: def.brand,
    // A trait with a reveal delay is a hidden attribute until revealed, but only for Businesses the
    // Player does not own yet (acquisition schedules the reveal). The Player knows their own.
    traits: def.traits.map((t) => ({ traitId: t, hidden: owner !== PLAYER && reg.traits[t]?.revealDelaySeconds !== undefined })),
    sourcing: Object.fromEntries(def.inputs.map((r) => [r, def.automation.defaultSourcing])),
    autoReorder,
  };
  if (def.recipes && def.recipes.length > 0) biz.recipes = [...def.recipes];
  if (def.productionRules.length > 0)
    biz.production = def.productionRules.map((rule) => ({
      ruleId: rule.id,
      recipeId: rule.recipeFromState ? (def.recipes?.[0] ?? null) : null,
      progressTicks: 0,
      running: false,
      started: false,
      missing: [],
    }));
  if (def.pub) {
    biz.pub = { drinkPrice: def.pub.defaultDrinkPrice, seats: new Array<string | null>(def.pub.seats).fill(null), orderQueue: [], bar: [], arrivalAcc: 0 };
    state.metrics.pubs[id] = emptyPubMetrics(reg.config.pubWindowSeconds);
  }
  state.businesses[id] = biz;

  const plot = state.plots[plotId];
  if (plot) {
    plot.status = 'occupied';
    plot.owner = owner;
    plot.businessId = id;
    plot.price = null;
    Reflect.deleteProperty(plot, 'construction');
  }
  return biz;
}
