// Save property generators (task 24.3). arbSimState() yields states for the round-trip and
// continuation properties (25, 26). Phase 2 sections are filled two ways:
//  1. the market is revealed and the real market system runs, so its values come from simulation;
//  2. acquisitions, questionable, chains, boosts and reputationPending are filled with structurally
//     valid random values, because their systems are not implemented yet (tasks 28-29).
import fc from 'fast-check';
import type { DefinitionRegistry } from '../../src/defs/registry';
import { Simulation } from '../../src/core/simulation';
import { newGame } from '../../src/state/newGame';
import type { SimState } from '../../src/state/types';

export type Phase2Sections = Pick<SimState, 'acquisitions' | 'questionable' | 'chains' | 'boosts' | 'reputationPending'>;

/** Reveal_Trigger ids whose reveals include `feature` (fired by the reveals system in a real game). */
function revealIdsFor(reg: DefinitionRegistry, feature: string): string[] {
  return Object.values(reg.revealTriggers)
    .filter((t) => t.reveals.includes(feature))
    .map((t) => t.id);
}

/** Random but structurally valid Phase 2 sections that reference ids of the given state. */
export function arbPhase2Sections(reg: DefinitionRegistry, state: SimState): fc.Arbitrary<Phase2Sections> {
  const businessId = fc.constantFrom(...Object.keys(state.businesses));
  const humanId = fc.subarray(Object.keys(state.humans));
  const traitId = fc.constantFrom(...Object.keys(reg.traits));
  const recipeId = fc.constantFrom(...Object.keys(reg.recipes));
  const questionableDefId = fc.constantFrom(...Object.keys(reg.questionables));
  const tickValue = fc.nat(100_000);

  const offer = fc
    .record({
      n: fc.integer({ min: 1, max: 9_999 }),
      businessId,
      askingPrice: fc.integer({ min: 0, max: 50_000_000 }),
      expiresTick: tickValue,
      knownTraits: fc.uniqueArray(traitId, { maxLength: 3 }),
      hidden: fc.array(
        fc.oneof(
          traitId.map((id) => ({ kind: 'trait' as const, id })),
          recipeId.map((id) => ({ kind: 'recipe' as const, id })),
        ),
        { maxLength: 2 },
      ),
    })
    .map((o) => ({ id: `off_${o.n}`, businessId: o.businessId, askingPrice: o.askingPrice, expiresTick: o.expiresTick, knownTraits: o.knownTraits, hidden: o.hidden }));

  const offerOpen = fc
    .record({ n: fc.integer({ min: 1, max: 9_999 }), defId: questionableDefId, expiresTick: tickValue })
    .map((o) => ({ id: `qo_${o.n}`, defId: o.defId, expiresTick: o.expiresTick }));

  const running = fc
    .record({ n: fc.integer({ min: 1, max: 9_999 }), defId: questionableDefId, humanIds: humanId, destinationId: businessId, doneTick: tickValue })
    .map((r) => ({ id: `run_${r.n}`, defId: r.defId, humanIds: r.humanIds, destinationId: r.destinationId, doneTick: r.doneTick }));

  const chain = fc
    .record({ nodes: fc.uniqueArray(businessId, { minLength: 3, maxLength: 3 }), active: fc.boolean(), lastFlowSecond: fc.nat(100_000) })
    .map((c) => ({ key: c.nodes.join('>'), nodes: c.nodes, length: c.nodes.length, active: c.active, lastFlowSecond: c.lastFlowSecond }));

  const boost = fc.record({
    businessId,
    stat: fc.constant('serviceSpeed' as const),
    pct: fc.integer({ min: 1, max: 15 }),
    untilTick: tickValue,
  });

  const repPending = fc.record({
    delta: fc.integer({ min: -10, max: 10 }),
    causeKey: fc.constantFrom('news.reputation.questionable', 'news.reputation.competitor'),
  });

  return fc.record({
    offers: fc.array(offer, { maxLength: 3 }),
    nextOfferTick: tickValue,
    openQuestionables: fc.array(offerOpen, { maxLength: 2 }),
    runs: fc.array(running, { maxLength: 2 }),
    nextRefreshTick: tickValue,
    edges: fc.array(fc.tuple(businessId, businessId, fc.nat(100_000)), { maxLength: 4 }),
    chains: fc.array(chain, { maxLength: 2 }),
    synergyCarry: fc.integer({ min: 0, max: 59 }),
    boosts: fc.array(boost, { maxLength: 2 }),
    repPending: fc.array(repPending, { maxLength: 3 }),
  }).map((s) => {
    const offers = Object.fromEntries(s.offers.map((o) => [o.id, o]));
    const chainRecords = Object.fromEntries(s.chains.map((c) => [c.key, c]));
    return {
      acquisitions: { offers, nextOfferTick: s.nextOfferTick },
      questionable: {
        offers: Object.fromEntries(s.openQuestionables.map((o) => [o.id, o])),
        running: Object.fromEntries(s.runs.map((r) => [r.id, r])),
        nextRefreshTick: s.nextRefreshTick,
      },
      chains: {
        edges: Object.fromEntries(s.edges.map(([a, b, sec]) => [`${a}>${b}`, sec])),
        registered: chainRecords,
        synergyCarry: s.synergyCarry,
      },
      boosts: s.boosts,
      reputationPending: s.repPending,
    };
  });
}

/**
 * A state from a new game, advanced by random Phase 1 Commands and Ticks, with the Phase 2 sections
 * filled as described in the file header.
 */
export function arbSimState(reg: DefinitionRegistry): fc.Arbitrary<SimState> {
  return fc
    .record({
      seed: fc.integer(),
      ticks: fc.nat(1500),
      hires: fc.nat(3),
      marketRevealed: fc.boolean(),
    })
    .chain(({ seed, ticks, hires, marketRevealed }) => {
      const sim = new Simulation(reg, newGame(reg, seed));
      if (marketRevealed) sim.state.reveals.fired.push(...revealIdsFor(reg, 'market'));
      for (let i = 0; i < hires; i++) sim.submit({ type: 'hire' });
      for (let t = 0; t < ticks; t++) sim.tick();
      return arbPhase2Sections(reg, sim.state).map((sections) => ({ ...sim.state, ...sections }));
    });
}
