// The Grand Opening services (task 48; Requirements 62 to 66, 61.5, 61.6).
// Feature: human-resource-mvp, Property 67: Loan repayment conservation
// Feature: human-resource-mvp, Property 68: Loan rules
// Feature: human-resource-mvp, Property 70: Fit-out budget
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/simulation';
import type { Command, ReasonCode } from '../src/commands/types';
import { newGame } from '../src/state/newGame';
import type { Business, SimState } from '../src/state/types';
import { entrance } from '../src/world/geometry';
import { loadOrThrow, patchedContent } from './contentVariants';
import { registry } from './helpers';

/** A new game that looks like the start of the Grand Opening: nothing licensed, no loan, no deal, a closed empty pub. */
function grandOpening(reg = registry(), seed = 5): Simulation {
  const sim = new Simulation(reg, newGame(reg, seed));
  const s = sim.state;
  s.player.license = null;
  s.player.supplyDeal = null;
  s.player.fitOutBudget = 0;
  s.reveals.fired = [];
  s.quests = {};
  const pub = playerPub(s);
  if (pub.pub) Object.assign(pub.pub, { seatsBuilt: 0, tapsBuilt: 0, vibeBase: 0, open: false });
  for (const slot of pub.jobSlots) slot.filledBy = null;
  for (const h of Object.values(s.humans)) if (h.owner === 'player') Reflect.deleteProperty(s.humans, h.id);
  return sim;
}
const playerPub = (s: SimState): Business => {
  const b = Object.values(s.businesses).find((x) => x.owner === 'player' && x.pub);
  if (!b) throw new Error('no player pub');
  return b;
};
const biz = (s: SimState, defId: string): Business => {
  const b = Object.values(s.businesses).find((x) => x.defId === defId);
  if (!b) throw new Error(defId);
  return b;
};
function goTo(sim: Simulation, b: Business): void {
  const d = entrance(sim.reg, b.plotId);
  sim.state.ceo.x = d.x;
  sim.state.ceo.z = d.z;
  sim.state.ceo.insideBusinessId = null;
}
/** Every fit-out item must be named in the params (the Service lists them all), so unnamed ones are 0. */
const fit = (picks: Record<string, number>): Record<string, number> => ({ ...Object.fromEntries(Object.keys(registry().phase3.fitOutItems).map((id) => [id, 0])), ...picks });

/** Uses a Service at the Business (CEO walks to its door first) and returns the result of that Command. */
function use(sim: Simulation, defId: string, serviceId: string, params?: Record<string, number>): { ok: boolean; reason?: ReasonCode; missingGold?: number } {
  const b = biz(sim.state, defId);
  goTo(sim, b);
  const cmd: Command = params ? { type: 'useService', businessId: b.id, serviceId, params } : { type: 'useService', businessId: b.id, serviceId };
  sim.submit(cmd);
  const r = sim.tick().results[0];
  if (!r) throw new Error('no result');
  return r.ok ? { ok: true } : { ok: false, reason: r.reason, ...(r.missingGold !== undefined ? { missingGold: r.missingGold } : {}) };
}

describe('licence (62)', () => {
  it('takes the fee, sets the licence, fires license_granted and rejects a second licence', () => {
    const sim = grandOpening();
    const fee = registry().phase3.licenseTiers.pub?.fee ?? 0;
    const gold0 = sim.state.player.gold;
    expect(use(sim, 'municipality', 'take_license_pub')).toEqual({ ok: true });
    expect(sim.state.player.license).toBe('pub');
    expect(gold0 - sim.state.player.gold).toBeGreaterThanOrEqual(fee);
    expect(sim.state.reveals.fired).toContain('license_granted');
    expect(use(sim, 'municipality', 'take_license_late')).toMatchObject({ ok: false, reason: 'already_licensed' });
    expect(sim.state.player.license).toBe('pub');
  });
  it('needs the CEO at the Municipality and enough Gold', () => {
    const sim = grandOpening();
    sim.state.player.gold = 100;
    expect(use(sim, 'municipality', 'take_license_cafe')).toMatchObject({ ok: false, reason: 'insufficient_gold' });
    sim.state.player.gold = 10_000_000;
    const hall = biz(sim.state, 'municipality');
    sim.state.ceo.x = 0;
    sim.state.ceo.z = 30; // far away
    sim.submit({ type: 'useService', businessId: hall.id, serviceId: 'take_license_cafe' });
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'not_present' });
  });
});

describe('loans (63)', () => {
  it('a loan pays out the principal minus the fit-out budget and sets that budget (63.2)', () => {
    const sim = grandOpening();
    const offer = registry().phase3.loanOffers.sensible;
    if (!offer) throw new Error('offer');
    const before = sim.state.player.gold;
    expect(use(sim, 'bank', 'take_loan_sensible')).toEqual({ ok: true });
    expect(sim.state.player.fitOutBudget).toBe(offer.fitOutBudget);
    expect(sim.state.loans).toHaveLength(1);
    expect(sim.state.player.gold - before).toBeGreaterThan(offer.principal - offer.fitOutBudget - 5000); // minus a tick of costs
    expect(sim.state.reveals.fired).toContain('loan_taken');
  });
  it('Property 68: a second loan is rejected with loan_active; early payoff removes it; repayment may push Gold negative', () => {
    const sim = grandOpening();
    use(sim, 'bank', 'take_loan_sensible');
    expect(use(sim, 'bank', 'take_loan_ambitious')).toMatchObject({ ok: false, reason: 'loan_active' });
    expect(sim.state.loans).toHaveLength(1);
    sim.state.player.gold = 0;
    for (let t = 0; t < 700; t++) sim.tick();
    expect(sim.state.player.gold).toBeLessThan(0); // the repayment applies in debt too (63.4)
    sim.state.player.gold = 10_000_000;
    const remaining = sim.state.loans?.[0]?.remaining ?? 0;
    const gold0 = sim.state.player.gold;
    expect(use(sim, 'bank', 'pay_off_loan')).toEqual({ ok: true });
    expect(sim.state.loans).toEqual([]);
    expect(gold0 - sim.state.player.gold).toBeGreaterThanOrEqual(remaining);
    sim.state.player.gold = 5;
    expect(use(sim, 'bank', 'take_loan_sensible')).toEqual({ ok: true });
    sim.state.player.gold = 5;
    expect(use(sim, 'bank', 'pay_off_loan')).toMatchObject({ ok: false, reason: 'insufficient_gold' });
  });
  it('Property 67: repaying in full costs exactly principal plus interest', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5000, max: 40000 }), fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 0, max: 100 }), (principal, interestBp, budgetPct) => {
        const interest = Math.ceil((principal * interestBp) / 10000);
        const fitOut = Math.floor((principal * budgetPct) / 100);
        const perMinute = Math.ceil((principal + interest) / 3);
        const offer = { id: 'quick', nameKey: 'loan.sensible', descriptionKey: 'loan.sensible.desc', principal, fitOutBudget: fitOut, repaymentPerMinute: perMinute, interestBp, termMinutes: 4 };
        const reg = loadOrThrow(
          patchedContent((r) => {
            (r.phase3 as Record<string, unknown>).loanOffers = [offer];
            (r.phase3 as Record<string, unknown>).requests = []; // they name Bank services this test replaces
            const bank = r.businesses.find((b) => b.id === 'bank') as { services: unknown[] };
            bank.services = [{ id: 'take_loan_quick', nameKey: 'loan.sensible', cost: 0, access: 'presence', conditions: [], effects: [{ kind: 'domain', op: 'startLoan', params: { offerId: 'quick' } }] }];
          }),
        );
        const looped = grandOpening(reg, 9);
        const control = grandOpening(reg, 9);
        const bank = biz(looped.state, 'bank');
        goTo(looped, bank);
        looped.submit({ type: 'useService', businessId: bank.id, serviceId: 'take_loan_quick' });
        looped.tick();
        control.tick();
        for (let t = 0; t < 600 * 8; t++) {
          looped.tick();
          control.tick();
        }
        if ((looped.state.loans ?? []).length !== 0) return false; // removed once repaid (63.5)
        // The only difference between the two games is the loan: the principal in, the repayments out, and the budget kept aside.
        return looped.state.player.gold - control.state.player.gold === -(fitOut + interest);
      }),
      { numRuns: 12 },
    );
  });
  it('the registry rejects a loan whose budget exceeds the principal or that cannot be repaid in its term (63.11)', () => {
    const bad = (o: Record<string, unknown>) => patchedContent((r) => void ((r.phase3 as Record<string, unknown>).loanOffers = [{ id: 'x', nameKey: 'loan.sensible', descriptionKey: 'loan.sensible.desc', principal: 1000, fitOutBudget: 0, repaymentPerMinute: 100, interestBp: 0, termMinutes: 20, ...o }]));
    expect(() => loadOrThrow(bad({ fitOutBudget: 2000 }))).toThrow(/Fit_Out_Budget/);
    expect(() => loadOrThrow(bad({ repaymentPerMinute: 10 }))).toThrow(/below the principal/);
  });
});

describe('fit-out (64)', () => {
  function ready(): Simulation {
    const sim = grandOpening();
    use(sim, 'municipality', 'take_license_pub');
    use(sim, 'bank', 'take_loan_sensible'); // budget 400.00
    return sim;
  }
  it('Property 70: the price of a fit-out comes off the budget, never more than the budget, and builds what was bought', () => {
    const sim = ready();
    const items = registry().phase3.fitOutItems;
    const budget = sim.state.player.fitOutBudget;
    const pub = playerPub(sim.state);
    const r = use(sim, pub.defId, 'fit_out', fit({ table_small: 2, tap_standard: 1, decor_plant: 1 }));
    expect(r).toEqual({ ok: true });
    const price = 2 * (items.table_small?.price ?? 0) + (items.tap_standard?.price ?? 0) + (items.decor_plant?.price ?? 0);
    expect(sim.state.player.fitOutBudget).toBe(budget - price);
    expect(pub.pub).toMatchObject({ seatsBuilt: 4, tapsBuilt: 1, vibeBase: 5 });
    expect(sim.state.reveals.fired).toContain('fit_out_done');
  });
  it('rejects an over-budget pick with insufficient_gold and the missing amount, changing nothing (64.4)', () => {
    const sim = ready();
    const budget = sim.state.player.fitOutBudget;
    const pub = playerPub(sim.state);
    const r = use(sim, pub.defId, 'fit_out', fit({ table_large: 12 }));
    expect(r).toMatchObject({ ok: false, reason: 'insufficient_gold' });
    expect(r.missingGold).toBe(12 * (registry().phase3.fitOutItems.table_large?.price ?? 0) - budget);
    expect(sim.state.player.fitOutBudget).toBe(budget);
    expect(pub.pub?.seatsBuilt).toBe(0);
  });
  it('rejects more tables than the licence allows with limit_reached (64.5)', () => {
    const sim = ready();
    sim.state.player.license = 'cafe'; // 6 Seats
    sim.state.player.fitOutBudget = 10_000_000;
    const pub = playerPub(sim.state);
    expect(use(sim, pub.defId, 'fit_out', fit({ table_large: 2 }))).toMatchObject({ ok: false, reason: 'limit_reached' }); // 2 x 4 = 8 Seats > 6
    expect(use(sim, pub.defId, 'fit_out', fit({ table_large: 1 }))).toEqual({ ok: true });
    expect(pub.pub?.seatsBuilt).toBe(4);
    expect(use(sim, pub.defId, 'fit_out', fit({ tap_standard: 4 }))).toMatchObject({ ok: false, reason: 'limit_reached' }); // beyond the Pub's maximum Taps
  });
});

describe('supplier deal (65)', () => {
  it('rejects Orders with deal_missing until a deal is signed, then charges per drink', () => {
    const sim = grandOpening();
    const pub = playerPub(sim.state);
    const sup = biz(sim.state, 'supplier_beer');
    const order: Command = { type: 'placeOrder', supplierId: sup.id, destinationId: pub.id, resourceId: 'beer', quantity: 10 };
    sim.submit(order);
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'deal_missing' });
    expect(use(sim, 'supplier_beer', 'sign_deal_small_flexible')).toEqual({ ok: true });
    expect(sim.state.player.supplyDeal).toMatchObject({ dealId: 'small_flexible', kegDrinks: 20 });
    expect(sim.state.reveals.fired).toContain('supplier_deal');
    sim.submit(order);
    expect(sim.tick().results[0]).toMatchObject({ ok: true });
  });
  it('a contract deal takes its fee every game minute with an exact carry (65.6)', () => {
    const reg = registry();
    const sim = grandOpening(reg, 7);
    const control = grandOpening(reg, 7);
    use(sim, 'supplier_beer', 'sign_deal_big_contract');
    control.tick();
    const fee = reg.phase3.supplyDeals.big_contract?.contractFeePerMinute ?? 0;
    expect(fee).toBeGreaterThan(0);
    for (let t = 0; t < 3000; t++) {
      sim.tick();
      control.tick();
    } // five game minutes
    expect(control.state.player.gold - sim.state.player.gold).toBe(fee * 5);
  });
});

describe('hiring (66)', () => {
  it('hires a candidate with a Quirk for the hiring cost and fires first_hire', () => {
    const sim = grandOpening();
    const cost = registry().phase3.candidates.cand_thomas?.hiringCost ?? 0;
    const gold0 = sim.state.player.gold;
    expect(use(sim, 'job_centre', 'hire_cand_thomas')).toEqual({ ok: true });
    const thomas = Object.values(sim.state.humans).find((h) => h.name === 'Thomas');
    expect(thomas?.quirkId).toBe('road_philosopher');
    expect(gold0 - sim.state.player.gold).toBeGreaterThanOrEqual(cost);
    expect(sim.state.reveals.fired).toContain('first_hire');
    expect(use(sim, 'job_centre', 'hire_cand_thomas')).toMatchObject({ ok: false }); // once
  });
  it('a second Bar_Worker waits for the hiring option; a Driver never does (66.5)', () => {
    const sim = grandOpening();
    expect(use(sim, 'job_centre', 'hire_cand_jan')).toEqual({ ok: true });
    expect(use(sim, 'job_centre', 'hire_cand_julia')).toMatchObject({ ok: false, reason: 'not_available' });
    expect(use(sim, 'job_centre', 'hire_cand_thomas')).toEqual({ ok: true });
    sim.state.reveals.fired.push('hiring_option');
    expect(use(sim, 'job_centre', 'hire_cand_julia')).toEqual({ ok: true });
  });
  it('rejects a hire without enough Gold', () => {
    const sim = grandOpening();
    sim.state.player.gold = 10;
    expect(use(sim, 'job_centre', 'hire_cand_jan')).toMatchObject({ ok: false, reason: 'insufficient_gold' });
  });
});

describe('cutting the ribbon (61)', () => {
  it('no Customers arrive before pub_open; the ribbon needs the whole checklist and then opens the pub', () => {
    const sim = grandOpening();
    const pub = playerPub(sim.state);
    pub.pub?.seats.fill(null);
    let arrived = 0;
    for (let t = 0; t < 3000; t++) arrived += sim.tick().events.filter((e) => e.type === 'customerArrived' && e.owner === 'player').length;
    expect(arrived).toBe(0); // 61.6
    expect(use(sim, pub.defId, 'cut_ribbon')).toMatchObject({ ok: false, reason: 'conditions_not_met' });
    // do the whole checklist
    use(sim, 'municipality', 'take_license_pub');
    use(sim, 'bank', 'take_loan_sensible');
    use(sim, pub.defId, 'fit_out', fit({ table_small: 2, tap_standard: 1 }));
    use(sim, 'supplier_beer', 'sign_deal_small_flexible');
    use(sim, 'job_centre', 'hire_cand_jan');
    sim.tick();
    expect(use(sim, pub.defId, 'cut_ribbon')).toMatchObject({ ok: false }); // the first kegs have not arrived yet
    sim.state.reveals.fired.push('first_kegs');
    sim.tick();
    expect(use(sim, pub.defId, 'cut_ribbon')).toEqual({ ok: true });
    expect(sim.state.reveals.fired).toContain('pub_open');
    expect(pub.pub?.open).toBe(true);
    expect(sim.state.quests?.grand_opening?.stepsDone).toContain('back_at_pub');
    let after = 0;
    for (let t = 0; t < 3000; t++) after += sim.tick().events.filter((e) => e.type === 'customerArrived' && e.owner === 'player').length;
    expect(after).toBeGreaterThan(0);
  });
});