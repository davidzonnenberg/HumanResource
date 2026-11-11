// Patience expiry reasons (task 5.10; Requirements 4.8, 4.9).
// The partial-drinks payment case is not covered here: forcing a Customer to drink part of an
// order and then run out of patience needs a scripted Customer, which is out of scope for this file.
import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../src/core/events';
import { PLAYER, type Business, type SimState } from '../src/state/types';
import { freshSim, registry, run } from './helpers';

const TICKS_PER_SECOND = 10; // 100 ms Ticks (Requirement 2.1)

function playerPub(state: SimState): Business {
  const pub = Object.values(state.businesses).find((b) => b.owner === PLAYER && b.pub);
  if (!pub) throw new Error('start state has no player Pub');
  return pub;
}

function humanId(state: SimState, name: string): string {
  const h = Object.values(state.humans).find((x) => x.owner === PLAYER && x.name === name);
  if (!h) throw new Error(`start state has no Human named ${name}`);
  return h.id;
}

function lostReasons(outputs: { events: DomainEvent[] }[]): string[] {
  return outputs.flatMap((o) => o.events).flatMap((e) => (e.type === 'customerLost' ? [e.reason] : []));
}

/** Long enough for a full patience window to elapse after the first Customers arrive. */
function ticksForOnePatienceWindow(): number {
  const patience = registry().businesses[playerPub(freshSim(1).state).defId]?.pub?.patienceSeconds ?? 60;
  return Math.ceil((patience * 2 + 30) * TICKS_PER_SECOND);
}

describe('patience expiry reasons (4.8, 4.9)', () => {
  it('stock present but nobody pouring: Customers leave with patience_expired, not out_of_beer', () => {
    const sim = freshSim(7);
    // Jan is the only Bartender; with him unassigned no drink is ever poured, Beer stays in Storage.
    sim.submit({ type: 'unassign', humanId: humanId(sim.state, 'Jan') });
    const reasons = lostReasons(run(sim, [], ticksForOnePatienceWindow()).outputs);
    expect(reasons).toContain('patience_expired');
    expect(reasons).not.toContain('out_of_beer');
  });

  it('empty Beer Storage when patience runs out: Customers leave with out_of_beer', () => {
    const sim = freshSim(7);
    const pub = playerPub(sim.state);
    // Empty the Pub's Beer. Stop auto-reorder and the van (Thomas) so nothing refills during the run.
    const beer = pub.storage.beer;
    if (!beer) throw new Error('Pub has no Beer storage');
    beer.amount = 0;
    beer.lots = [];
    sim.submit({ type: 'setAutoReorder', businessId: pub.id, resourceId: 'beer', enabled: false, threshold: 0 });
    sim.submit({ type: 'unassign', humanId: humanId(sim.state, 'Thomas') });
    const reasons = lostReasons(run(sim, [], ticksForOnePatienceWindow()).outputs);
    expect(reasons).toContain('out_of_beer');
    expect(reasons).not.toContain('patience_expired');
  });
});
