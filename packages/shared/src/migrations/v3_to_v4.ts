// Migration v3 -> v4: the Phase 3 state skeleton (Grand Opening, bar redesign, loans, quests).
//
// The spec calls this step "v2 to v3", but schema 3 was already taken by the savings account, so the
// Phase 3 migration is v3 -> v4. This file is a SKELETON (task 41.3): it only adds empty or neutral values.
// Task 52.1 completes it (bar_worker mapping, mid-order Customers, office Businesses, Reveal_Triggers, Plot ids).
// Pure JSON function over locally typed shapes; it never imports game types.
import type { Migration } from './index';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

export const v3ToV4: Migration = {
  from: 3,
  to: 4,
  name: 'v3_to_v4_phase3_skeleton',
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
    if (state.loans === undefined) state.loans = [];
    if (state.servicesUsed === undefined) state.servicesUsed = {};
    if (state.quests === undefined) state.quests = {};
    if (state.requests === undefined) state.requests = {};
    if (state.counters === undefined) state.counters = {};
    if (isObj(state.businesses)) {
      for (const biz of Object.values(state.businesses)) {
        if (!isObj(biz) || !isObj(biz.pub)) continue;
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
    return doc;
  },
};