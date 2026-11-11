// Property 6: Insufficient Gold rejection reports the exact shortfall (task 6.4; Requirements 7.1,
// 7.2, 8.4, 10.3, 10.5, 32.5). Covers hire and placeOrder; Phase 2 discretionary Commands extend later.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { costOf } from '../src/money/gold';
import { PLAYER } from '../src/state/types';
import { freshSim, registry } from './helpers';

const reg = registry();
const regularHuman = reg.humans.regular ?? Object.values(reg.humans)[0];
if (!regularHuman) throw new Error('no Human Definition in content');
const hireCost = costOf(regularHuman.salaryPerMinute * regularHuman.hiring.minutes, regularHuman.hiring.factor);

function pubAndSupplier(sim: ReturnType<typeof freshSim>) {
  const pub = Object.values(sim.state.businesses).find((b) => b.owner === PLAYER && b.pub);
  const supplier = Object.values(sim.state.businesses).find((b) => b.owner !== PLAYER && reg.businesses[b.defId]?.supplier);
  if (!pub || !supplier) throw new Error('start state lacks a Pub or Supplier');
  return { pub, supplier };
}

describe('insufficient Gold rejection (Property 6)', () => {
  // Feature: human-resource-mvp, Property 6: Insufficient Gold rejection reports the exact shortfall
  it('Property 6: hire is rejected with the exact shortfall and creates no Human', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: hireCost - 1 }), (gold) => {
        const sim = freshSim(11);
        sim.state.player.gold = gold;
        const humansBefore = Object.keys(sim.state.humans).length;
        sim.submit({ type: 'hire' });
        const result = sim.tick().results[0];
        expect(result).toMatchObject({ ok: false, reason: 'insufficient_gold', missingGold: hireCost - gold });
        expect(Object.keys(sim.state.humans).length).toBe(humansBefore);
      }),
    );
  });

  it('Property 6: hire succeeds at exactly the cost', () => {
    const sim = freshSim(12);
    sim.state.player.gold = hireCost;
    const humansBefore = Object.keys(sim.state.humans).length;
    sim.submit({ type: 'hire' });
    const result = sim.tick().results[0];
    expect(result).toMatchObject({ ok: true });
    expect(Object.keys(sim.state.humans).length).toBe(humansBefore + 1);
  });

  // Feature: human-resource-mvp, Property 6: Insufficient Gold rejection reports the exact shortfall
  it('Property 6: placeOrder is rejected with the exact shortfall and creates no Order', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), fc.nat(), (quantity, goldSeed) => {
        const sim = freshSim(13);
        const { pub, supplier } = pubAndSupplier(sim);
        const unitPrice = reg.businesses[supplier.defId]?.supplier?.sells.find((s) => s.resourceId === 'beer')?.unitPrice ?? 0;
        const cost = unitPrice * quantity;
        const gold = goldSeed % cost; // always strictly below the cost
        sim.state.player.gold = gold;
        // Stop auto-reorder so only the explicit Order can touch Gold or Orders this Tick.
        sim.submit({ type: 'setAutoReorder', businessId: pub.id, resourceId: 'beer', enabled: false, threshold: 0 });
        const ordersBefore = Object.keys(sim.state.orders).length;
        sim.submit({ type: 'placeOrder', supplierId: supplier.id, destinationId: pub.id, resourceId: 'beer', quantity });
        const results = sim.tick().results;
        const order = results.find((r) => r.type === 'placeOrder');
        expect(order).toMatchObject({ ok: false, reason: 'insufficient_gold', missingGold: cost - gold });
        expect(Object.keys(sim.state.orders).length).toBe(ordersBefore);
      }),
    );
  });
});
