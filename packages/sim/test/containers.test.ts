// Kegs and containers (task 45; Requirement 58).
// Feature: human-resource-mvp, Property 65: Container helpers preserve drinks
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { affordableQty, fromContainers, orderCost, toContainers, unitsPerContainer } from '../src/storage/containers';
import { freshSim, registry } from './helpers';

describe('container helpers (58)', () => {
  it('Property 65: containers always cover the drinks and never lose or invent a whole container', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 1, max: 200 }), (amount, size) => {
        const n = toContainers(amount, size);
        const covered = fromContainers(n, size);
        return covered >= amount && covered - amount < size && toContainers(covered, size) === n;
      }),
      { numRuns: 200 },
    );
  });

  it('Beer is a Keg of 20 drinks and the signed deal sets the display size', () => {
    const reg = registry();
    const sim = freshSim(1);
    expect(reg.resources.beer?.container).toEqual({ kind: 'keg', size: 20 });
    expect(unitsPerContainer(reg, sim.state, 'beer')).toBe(20);
    sim.state.player.supplyDeal = { dealId: 'big_contract', kegDrinks: 50, pricePerKeg: 11000, contractFeePerMinute: 300, feeCarry: 0 };
    expect(unitsPerContainer(reg, sim.state, 'beer')).toBe(50);
    expect(unitsPerContainer(reg, sim.state, 'hops')).toBe(10); // crates are not changed by a Keg deal
  });

  it('prices per drink as pricePerKeg / kegDrinks and rounds every cost up (58.6)', () => {
    const reg = registry();
    const sim = freshSim(1);
    sim.state.player.supplyDeal = { dealId: 'odd', kegDrinks: 7, pricePerKeg: 1000, contractFeePerMinute: 0, feeCarry: 0 };
    expect(orderCost(reg, sim.state, 'player', 'beer', 260, 7)).toBe(1000);
    expect(orderCost(reg, sim.state, 'player', 'beer', 260, 1)).toBe(143); // 142.86 rounded up
    expect(orderCost(reg, sim.state, 'cmp_rival', 'beer', 260, 3)).toBe(780); // rivals pay the Supplier's unit price
    expect(orderCost(reg, sim.state, 'player', 'hops', 120, 3)).toBe(360); // not a Keg Resource
  });

  it('affordableQty returns the largest quantity the budget covers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 1, max: 100 }), fc.integer({ min: 0, max: 1_000_000 }), (price, size, budget) => {
        const cost = (q: number): number => Math.ceil((q * price) / size);
        const q = affordableQty(cost, 300, budget);
        return cost(q) <= budget && (q === 300 || cost(q + 1) > budget);
      }),
      { numRuns: 200 },
    );
  });

  it('orders and storage stay in drinks: ordering 7 drinks moves 7 units, not a whole Keg', () => {
    const sim = freshSim(2);
    const pub = Object.values(sim.state.businesses).find((b) => b.owner === 'player' && b.pub);
    const sup = Object.values(sim.state.businesses).find((b) => b.defId === 'supplier_beer');
    if (!pub || !sup) throw new Error('setup');
    sim.submit({ type: 'placeOrder', supplierId: sup.id, destinationId: pub.id, resourceId: 'beer', quantity: 7 });
    expect(sim.tick().results[0]).toMatchObject({ ok: true });
    const orders = Object.values(sim.state.orders).filter((o) => o.destinationId === pub.id);
    expect(orders.some((o) => o.remaining === 7)).toBe(true);
  });
});