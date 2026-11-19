// Migration v3 -> v4: Phase 3 (Grand Opening, bar redesign, loans, quests, offices).
//
// The spec calls this step "v2 to v3", but schema 3 was already taken by the savings account, so the
// Phase 3 migration is v3 -> v4. A save from before Phase 3 is a running pub, so it becomes the dev start's
// shape: licensed, with a keg deal, every checklist Reveal_Trigger fired and the Grand Opening quest done.
// Pure JSON function over locally typed shapes; it never imports game types. Once a v4 save can exist in the
// wild this step is frozen: later state changes get their own version (59.7).
import type { Migration } from './index';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

export const v3ToV4: Migration = {
  from: 3,
  to: 4,
  name: 'v3_to_v4_phase3',
  up(doc) {
    const state = doc.state;
    if (!isObj(state)) throw new Error('save has no state');
    const player = state.player;
    if (!isObj(player)) throw new Error('save has no player');
    // A save from before Phase 3 has a running pub, so it counts as licensed (task 52.1 also fires license_granted).
    if (player.license === undefined) player.license = 'pub';
    // Beer was priced 2.60 a drink; the small keg deal (20 drinks for 52.00) keeps that price. Amounts stay in drinks (58.5).
    if (player.supplyDeal === undefined) player.supplyDeal = { dealId: 'small_flexible', kegDrinks: 20, pricePerKeg: 5200, contractFeePerMinute: 0, feeCarry: 0 };
    if (player.fitOutBudget === undefined) player.fitOutBudget = 0;
    // The running pub has done the whole Grand Opening (task 52.1 completes this step).
    if (isObj(state.reveals) && Array.isArray(state.reveals.fired)) {
      for (const id of ['license_granted', 'loan_taken', 'fit_out_done', 'supplier_deal', 'first_hire', 'first_kegs', 'pub_open'])
        if (!state.reveals.fired.includes(id)) state.reveals.fired.push(id);
    }
    if (state.loans === undefined) state.loans = [];
    if (state.servicesUsed === undefined) state.servicesUsed = {};
    if (state.quests === undefined) state.quests = {};
    if (state.requests === undefined) state.requests = {};
    if (state.counters === undefined) state.counters = {};
    if (isObj(state.businesses)) {
      mapBartendersAndServers(state);
      addOffices(state);
      for (const biz of Object.values(state.businesses)) {
        if (!isObj(biz) || !isObj(biz.pub)) continue;
        // Orders placed before the worker took them are taken: pouring goes on where it was (55.3, 59.2)
        if (Array.isArray(biz.pub.orderQueue)) for (const o of biz.pub.orderQueue) if (isObj(o) && o.taken === undefined) o.taken = true;
        const pub = biz.pub;
        const seats = Array.isArray(pub.seats) ? pub.seats.length : 0;
        if (pub.open === undefined) pub.open = true;
        if (pub.seatsBuilt === undefined) pub.seatsBuilt = seats;
        if (pub.tapsBuilt === undefined) pub.tapsBuilt = 3; // the three pour spots every pub had before Taps existed
        if (pub.vibeBase === undefined) pub.vibeBase = 0;
        if (pub.pace === undefined) pub.pace = 'normal';
        if (pub.lostIncome === undefined) pub.lostIncome = 0;
      }
    }
    if (isObj(state.customers)) {
      for (const c of Object.values(state.customers)) {
        if (!isObj(c)) continue;
        if (c.waitedLong === undefined) c.waitedLong = false;
        if (c.tab === undefined) {
          // Before tabs a Customer paid price x drinks at the end of the visit. The Tab is what he owes now: every finished
          // drink plus the one he is drinking, at the Pub's current price, plus the Brand and Recipe price extra.
          const biz = isObj(state.businesses) ? state.businesses[String(c.pubId)] : undefined;
          const price = isObj(biz) && isObj(biz.pub) && typeof biz.pub.drinkPrice === 'number' ? biz.pub.drinkPrice : 0;
          const drinks = (typeof c.drinksConsumed === 'number' ? c.drinksConsumed : 0) + (c.state === 'drinking' ? 1 : 0);
          const extra = typeof c.priceBpExtra === 'number' ? Math.floor((price * c.priceBpExtra) / 10000) : 0;
          c.tab = price * drinks + extra;
          Reflect.deleteProperty(c, 'priceBpExtra');
        }
      }
    }
    // The Grand Opening is behind a running pub: no reward, no news, no follow-up request (61.8).
    if (isObj(state.quests) && state.quests.grand_opening === undefined)
      state.quests.grand_opening = { stepsDone: ['municipality', 'bank', 'fit_out', 'supplier', 'job_centre', 'back_at_pub'] };
    if (state.modifiers === undefined) state.modifiers = [];
    return doc;
  },
};

/** `bartender` and `server` Job_Slots and Humans become `bar_worker` (55.1, 59.1). Slot ids are numbered anew per Business. */
function mapBartendersAndServers(state: Json): void {
  if (!isObj(state.businesses)) return;
  const humans = isObj(state.humans) ? Object.values(state.humans) : [];
  for (const biz of Object.values(state.businesses)) {
    if (!isObj(biz) || !Array.isArray(biz.jobSlots)) continue;
    const rename: Record<string, string> = {};
    let n = 0;
    for (const slot of biz.jobSlots) {
      if (!isObj(slot) || (slot.jobId !== 'bartender' && slot.jobId !== 'server')) continue;
      n += 1;
      rename[String(slot.slotId)] = `bar_worker_${n}`;
      slot.slotId = `bar_worker_${n}`;
      slot.jobId = 'bar_worker';
    }
    for (const h of humans) {
      if (!isObj(h) || !isObj(h.assignment) || h.assignment.kind !== 'business' || h.assignment.id !== biz.id) continue;
      const renamed = rename[String(h.assignment.slotId)];
      if (renamed !== undefined) h.assignment.slotId = renamed;
    }
    // The Player's starting pub gained an optional Head of Errands slot.
    if (biz.defId === 'pub_cosy_local' && !biz.jobSlots.some((x) => isObj(x) && x.jobId === 'head_of_errands'))
      biz.jobSlots.push({ slotId: 'head_of_errands_1', jobId: 'head_of_errands', filledBy: null });
  }
}

/** The Municipality, Bank and Job_Centre and their Plots, as literal JSON (60.4). No existing Plot id changed (54.10). */
function addOffices(state: Json): void {
  if (!isObj(state.businesses) || !isObj(state.plots)) return;
  const counters = isObj(state.idCounters) ? state.idCounters : (state.idCounters = {});
  const offices: [string, string, string][] = [
    ['plot_municipality', 'municipality', 'Municipality of Small Print'],
    ['plot_bank', 'bank', 'First Interest Bank'],
    ['plot_job_centre', 'job_centre', 'Job Centre Plus Minus'],
  ];
  for (const [plotId, defId, name] of offices) {
    if (state.plots[plotId] !== undefined) continue;
    const n = (typeof counters.biz === 'number' ? counters.biz : 0) + 1;
    counters.biz = n;
    const id = `biz_${String(n).padStart(4, '0')}`;
    state.plots[plotId] = { id: plotId, districtId: 'old_town', status: 'occupied', owner: 'npc', businessId: id, price: null };
    state.businesses[id] = { id, defId, owner: 'npc', plotId, name, storage: {}, jobSlots: [], brandId: null, traits: [], sourcing: {}, autoReorder: {} };
  }
}