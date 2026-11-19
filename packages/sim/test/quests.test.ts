// The quest engine (task 46; Requirement 73).
// Feature: human-resource-mvp, Property 72: Quest steps advance once
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/simulation';
import type { DomainEvent } from '../src/core/events';
import { newGame } from '../src/state/newGame';
import { questComplete } from '../src/systems/quests';
import { loadOrThrow, patchedContent, errorsOf } from './contentVariants';
import { registry } from './helpers';

type Step = { id: string; textKey: string; done: unknown; requires?: string[]; reward?: unknown[] };
const synergy = [{ kind: 'grantResource', resourceId: 'synergy', qty: 1 }];
const withQuests = (quests: unknown[]) => patchedContent((r) => void ((r.phase3 as Record<string, unknown>).quests = quests));

function play(quests: unknown[], ticks: number): { sim: Simulation; events: DomainEvent[] } {
  const reg = loadOrThrow(withQuests(quests));
  const sim = new Simulation(reg, newGame(reg, 1));
  const events: DomainEvent[] = [];
  for (let t = 0; t < ticks; t++) events.push(...sim.tick().events);
  return { sim, events };
}

describe('quest engine (73)', () => {
  it('Property 72: every step advances once and its reward applies once, in `requires` order', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ at: fc.integer({ min: 1, max: 40 }), chain: fc.boolean() }), { minLength: 1, maxLength: 6 }), (spec) => {
        const steps: Step[] = spec.map((s, i) => ({
          id: `s${i}`,
          textKey: 'quest.grandOpening',
          done: { kind: 'tickAtLeast', tick: s.at },
          ...(s.chain && i > 0 ? { requires: [`s${i - 1}`] } : {}),
          reward: synergy,
        }));
        const { sim, events } = play([{ id: 'q', nameKey: 'quest.grandOpening', steps }], 60);
        const done = sim.state.quests?.q?.stepsDone ?? [];
        const fired = events.filter((e) => e.type === 'questStepDone').map((e) => (e.type === 'questStepDone' ? e.stepId : ''));
        const uniq = new Set(done).size === done.length && new Set(fired).size === fired.length;
        const rewarded = sim.state.player.corporateResources.synergy === steps.length; // each step paid exactly once
        // a step never fires before the step it requires
        const ordered = steps.every((s) => !s.requires || fired.indexOf(s.requires[0] as string) < fired.indexOf(s.id));
        return done.length === steps.length && uniq && rewarded && ordered;
      }),
      { numRuns: 60 },
    );
  });

  it('a chained Quest starts only after its predecessor is complete', () => {
    const quests = [
      { id: 'a', nameKey: 'quest.grandOpening', steps: [{ id: 'x', textKey: 'quest.grandOpening', done: { kind: 'tickAtLeast', tick: 20 } }] },
      { id: 'b', nameKey: 'quest.first100', after: 'a', steps: [{ id: 'y', textKey: 'quest.grandOpening', done: { kind: 'tickAtLeast', tick: 1 }, reward: synergy }] },
    ];
    const early = play(quests, 10);
    expect(early.sim.state.quests?.b).toBeUndefined();
    expect(early.sim.state.player.corporateResources.synergy ?? 0).toBe(0);
    const late = play(quests, 40);
    expect(questComplete(late.sim.state, late.sim.reg, 'b')).toBe(true);
    expect(late.sim.state.player.corporateResources.synergy).toBe(1);
  });

  it('questStepDone Conditions see finished steps', () => {
    const quests = [
      { id: 'a', nameKey: 'quest.grandOpening', steps: [{ id: 'x', textKey: 'quest.grandOpening', done: { kind: 'tickAtLeast', tick: 3 } }] },
      { id: 'b', nameKey: 'quest.first100', steps: [{ id: 'y', textKey: 'quest.grandOpening', done: { kind: 'questStepDone', questId: 'a', stepId: 'x' }, reward: synergy }] },
    ];
    const { sim } = play(quests, 10);
    expect(sim.state.quests?.b?.stepsDone).toEqual(['y']);
  });

  it('the registry rejects a Quest naming an unknown Condition, Reveal feature, Service or step, by Quest name (73.7)', () => {
    const bad = (done: unknown): string =>
      errorsOf(withQuests([{ id: 'broken', nameKey: 'quest.grandOpening', steps: [{ id: 's', textKey: 'quest.grandOpening', done }] }]))
        .map((e) => `${e.definition}: ${e.message}`)
        .join('\n');
    expect(bad({ kind: 'bogus' })).toContain('phase3/quests#broken');
    expect(bad({ kind: 'revealed', feature: 'no_such_feature' })).toContain('no_such_feature');
    expect(bad({ kind: 'serviceUsed', serviceId: 'no_such_service' })).toContain('no_such_service');
    expect(bad({ kind: 'questStepDone', questId: 'broken', stepId: 'zzz' })).toContain('zzz');
  });

  it('the shipped chain is Grand Opening, First 100 pints, Second location, plus a side delivery', () => {
    const q = registry().phase3.quests;
    expect(Object.keys(q)).toEqual(['grand_opening', 'first_100_pints', 'second_location', 'side_delivery_hops']);
    expect(q.first_100_pints?.after).toBe('grand_opening');
    expect(q.second_location?.after).toBe('first_100_pints');
    expect(q.grand_opening?.steps.map((s) => s.id)).toEqual(['municipality', 'bank', 'fit_out', 'supplier', 'job_centre', 'back_at_pub']);
    expect(q.grand_opening?.steps.find((s) => s.id === 'back_at_pub')?.requires).toHaveLength(5);
  });
});