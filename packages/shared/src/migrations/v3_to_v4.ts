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
    if (player.license === undefined) player.license = null;
    if (player.supplyDeal === undefined) player.supplyDeal = null;
    if (player.fitOutBudget === undefined) player.fitOutBudget = 0;
    if (state.loans === undefined) state.loans = [];
    if (state.servicesUsed === undefined) state.servicesUsed = {};
    if (state.quests === undefined) state.quests = {};
    if (state.requests === undefined) state.requests = {};
    if (isObj(state.businesses)) {
      for (const biz of Object.values(state.businesses)) {
        if (!isObj(biz) || !isObj(biz.pub)) continue;
        const pub = biz.pub;
        const seats = Array.isArray(pub.seats) ? pub.seats.length : 0;
        if (pub.open === undefined) pub.open = true;
        if (pub.seatsBuilt === undefined) pub.seatsBuilt = seats;
        if (pub.tapsBuilt === undefined) pub.tapsBuilt = 1;
        if (pub.vibeBase === undefined) pub.vibeBase = 0;
        if (pub.pace === undefined) pub.pace = 'normal';
        if (pub.lostIncome === undefined) pub.lostIncome = 0;
      }
    }
    if (isObj(state.customers)) {
      for (const c of Object.values(state.customers)) {
        if (!isObj(c)) continue;
        if (c.tab === undefined) c.tab = 0;
        if (c.waitedLong === undefined) c.waitedLong = false;
      }
    }
    return doc;
  },
};