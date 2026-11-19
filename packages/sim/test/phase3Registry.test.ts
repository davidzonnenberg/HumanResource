// Task 41.2: the Phase 3 tables load, and broken entries are rejected with an error naming them.
import { describe, expect, it } from 'vitest';
import { rawContent } from '@hr/content';
import { loadRegistry } from '../src/defs/registry';

type Raw = Record<string, unknown>;
const withPhase3 = (patch: Raw) => loadRegistry({ ...rawContent, phase3: { ...(rawContent.phase3 as Raw), ...patch } });
const messages = (r: ReturnType<typeof loadRegistry>): string[] => (r.ok ? [] : r.errors.map((e) => `${e.definition}: ${e.message}`));

describe('Phase 3 tables', () => {
  it('the shipped data loads and the Loans satisfy the repayment rule', () => {
    const r = loadRegistry(rawContent);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.value.phase3.licenseTiers)).toEqual(['cafe', 'pub', 'late']);
    expect(Object.keys(r.value.phase3.loanOffers)).toEqual(['sensible', 'ambitious', 'visionary']);
    for (const o of Object.values(r.value.phase3.loanOffers)) {
      expect(o.fitOutBudget).toBeLessThanOrEqual(o.principal);
      expect(o.repaymentPerMinute * o.termMinutes).toBeGreaterThanOrEqual(o.principal + Math.ceil((o.principal * o.interestBp) / 10000));
    }
  });
  it('rejects a Loan whose fit-out budget is above its principal, naming the offer', () => {
    const loan = { id: 'bad_loan', nameKey: 'loan.sensible', descriptionKey: 'loan.sensible.desc', principal: 1000, fitOutBudget: 2000, repaymentPerMinute: 100, interestBp: 0, termMinutes: 20 };
    expect(messages(withPhase3({ loanOffers: [loan] })).join('\n')).toContain('bad_loan');
  });
  it('rejects a Loan that cannot repay principal plus interest within its term', () => {
    const loan = { id: 'thin_loan', nameKey: 'loan.sensible', descriptionKey: 'loan.sensible.desc', principal: 10000, fitOutBudget: 0, repaymentPerMinute: 10, interestBp: 1000, termMinutes: 10 };
    expect(messages(withPhase3({ loanOffers: [loan] })).join('\n')).toContain('thin_loan');
  });
  it('rejects a Quest with an unknown Condition kind, naming the Quest (73.7)', () => {
    const quest = { id: 'broken_quest', nameKey: 'loan.sensible', steps: [{ id: 's1', textKey: 'loan.sensible', done: { kind: 'bogus' } }] };
    const m = messages(withPhase3({ quests: [quest] })).join('\n');
    expect(m).toContain('phase3/quests#broken_quest');
    expect(m).toContain('unknown Condition kind "bogus"');
  });
  it('rejects a Quest step that requires an unknown step', () => {
    const quest = { id: 'q', nameKey: 'loan.sensible', steps: [{ id: 's1', textKey: 'loan.sensible', done: { kind: 'never' }, requires: ['nope'] }] };
    expect(messages(withPhase3({ quests: [quest] })).join('\n')).toContain('unknown step "nope"');
  });
  it('rejects a fit-out table that adds no Seats and an unknown candidate Job', () => {
    const item = { id: 'ghost_table', nameKey: 'fitout.tableSmall', kind: 'table', price: 1, modelKey: null };
    const cand = { id: 'cand_x', name: 'X', jobId: 'astronaut', quirkId: 'q', cvKey: 'cv.jan', salaryPerMinute: 1, hiringCost: 1 };
    const m = messages(withPhase3({ fitOutItems: [item], candidates: [cand] })).join('\n');
    expect(m).toContain('ghost_table');
    expect(m).toContain('unknown Job "astronaut"');
  });
});

describe('unlock menu texts (67)', () => {
  it('every Reveal_Trigger has a teaser and a description with text', () => {
    const r = loadRegistry(rawContent);
    if (!r.ok) throw new Error('content');
    const text = rawContent.text as Record<string, unknown>;
    for (const tr of Object.values(r.value.revealTriggers)) {
      expect(typeof text[tr.teaserKey], tr.id).toBe('string');
      expect(typeof text[tr.descriptionKey], tr.id).toBe('string');
      expect(tr.teaserKey).not.toBe(tr.descriptionKey);
    }
  });
  it('rejects a Reveal_Trigger without a teaser or a description, naming it (67.5)', () => {
    const drop = (field: string) =>
      messages(
        loadRegistry({
          ...rawContent,
          revealTriggers: (rawContent.revealTriggers as Record<string, unknown>[]).map((t) => (t.id === 'game_speed' ? Object.fromEntries(Object.entries(t).filter(([k]) => k !== field)) : t)),
        }),
      ).join('\n');
    expect(drop('teaserKey')).toContain('reveal-triggers#game_speed');
    expect(drop('descriptionKey')).toContain('reveal-triggers#game_speed');
  });
  it('rejects a teaser key that has no text', () => {
    const bad = loadRegistry({ ...rawContent, revealTriggers: (rawContent.revealTriggers as Record<string, unknown>[]).map((t) => (t.id === 'game_speed' ? { ...t, teaserKey: 'unlock.nope' } : t)) });
    expect(messages(bad).join('\n')).toContain('unknown text key "unlock.nope"');
  });
});