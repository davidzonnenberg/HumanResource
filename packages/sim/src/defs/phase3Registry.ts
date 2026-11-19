// Loads and validates the Phase 3 tables (task 41.2) for `loadRegistry`. Errors name the offer, tier,
// item or quest, so a broken data file is found without reading code (63.11, 67.5, 73.7).
import { z } from 'zod';
import type { DefinitionError } from './registry';
import { checkRawCondition, checkRawEffect } from './vocabularyCheck';
import type { Condition } from './schemas';
import {
  candidateDefSchema,
  customerTypeDefSchema,
  fitOutItemDefSchema,
  layoutDefSchema,
  licenseTierDefSchema,
  loanOfferDefSchema,
  questDefSchema,
  requestDefSchema,
  supplyDealDefSchema,
  type Phase3Defs,
  type RawPhase3,
} from './phase3Schemas';

export interface Phase3Context {
  jobIds: ReadonlySet<string>;
  modelKeys: ReadonlySet<string>;
  serviceIds: ReadonlySet<string>;
  /** Features some Reveal_Trigger reveals (a Quest step may wait for one). */
  revealFeatures: ReadonlySet<string>;
  textRef: (definition: string, field: string, key: string) => void;
}

function table<T extends { id: string }>(file: string, raw: unknown, schema: z.ZodType<T>, errors: DefinitionError[]): Record<string, T> {
  const out: Record<string, T> = {};
  if (raw === undefined) return out;
  if (!Array.isArray(raw)) {
    errors.push({ definition: file, field: '(root)', message: 'expected an array' });
    return out;
  }
  raw.forEach((item, i) => {
    const res = schema.safeParse(item);
    const rawId = typeof item === 'object' && item !== null && 'id' in item ? String((item as { id: unknown }).id) : `[${i}]`;
    if (!res.success) {
      for (const iss of res.error.issues) errors.push({ definition: `${file}#${rawId}`, field: iss.path.map(String).join('.') || '(root)', message: iss.message });
      return;
    }
    if (out[res.data.id]) errors.push({ definition: `${file}#${res.data.id}`, field: 'id', message: 'duplicate id' });
    out[res.data.id] = res.data;
  });
  return out;
}

const rawObjects = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];

export function loadPhase3(raw: RawPhase3 | undefined, ctx: Phase3Context, errors: DefinitionError[]): Phase3Defs {
  const p = raw ?? {};
  const licenseTiers = table('phase3/licenseTiers', p.licenseTiers, licenseTierDefSchema, errors);
  const loanOffers = table('phase3/loanOffers', p.loanOffers, loanOfferDefSchema, errors);
  const fitOutItems = table('phase3/fitOutItems', p.fitOutItems, fitOutItemDefSchema, errors);
  const supplyDeals = table('phase3/supplyDeals', p.supplyDeals, supplyDealDefSchema, errors);
  const candidates = table('phase3/candidates', p.candidates, candidateDefSchema, errors);
  const requests = table('phase3/requests', p.requests, requestDefSchema, errors);
  const customerTypes = table('phase3/customerTypes', p.customerTypes, customerTypeDefSchema, errors);
  const quests = table('phase3/quests', p.quests, questDefSchema, errors);
  const layouts = table('phase3/layouts', p.layouts, layoutDefSchema, errors);
  const err = (definition: string, field: string, message: string): void => void errors.push({ definition, field, message });

  for (const t of Object.values(licenseTiers)) {
    const def = `phase3/licenseTiers#${t.id}`;
    ctx.textRef(def, 'nameKey', t.nameKey);
    ctx.textRef(def, 'descriptionKey', t.descriptionKey);
    if (t.minSeats > t.maxSeats) err(def, 'minSeats', 'minimum Seats is above the maximum');
    for (const c of t.customerTypes) if (!customerTypes[c]) err(def, 'customerTypes', `unknown customer type "${c}"`);
  }
  for (const o of Object.values(loanOffers)) {
    const def = `phase3/loanOffers#${o.id}`;
    ctx.textRef(def, 'nameKey', o.nameKey);
    ctx.textRef(def, 'descriptionKey', o.descriptionKey);
    if (o.fitOutBudget > o.principal) err(def, 'fitOutBudget', `Loan "${o.id}": the Fit_Out_Budget is above the principal`);
    const interest = Math.ceil((o.principal * o.interestBp) / 10000);
    if (o.repaymentPerMinute * o.termMinutes < o.principal + interest)
      err(def, 'repaymentPerMinute', `Loan "${o.id}": repayment per minute times the term is below the principal plus interest`);
  }
  for (const f of Object.values(fitOutItems)) {
    const def = `phase3/fitOutItems#${f.id}`;
    ctx.textRef(def, 'nameKey', f.nameKey);
    if (f.modelKey !== null && !ctx.modelKeys.has(f.modelKey)) err(def, 'modelKey', `unknown model key "${f.modelKey}"`);
    if (f.kind === 'table' && !(f.seats && f.seats > 0)) err(def, 'seats', 'a table must add at least 1 Seat');
    if (f.kind === 'tap' && !(f.taps && f.taps > 0)) err(def, 'taps', 'a tap item must add at least 1 Tap');
    if (f.kind === 'decoration' && f.vibe === undefined) err(def, 'vibe', 'a decoration must set a Vibe value');
  }
  for (const d of Object.values(supplyDeals)) {
    ctx.textRef(`phase3/supplyDeals#${d.id}`, 'nameKey', d.nameKey);
    ctx.textRef(`phase3/supplyDeals#${d.id}`, 'descriptionKey', d.descriptionKey);
  }
  for (const c of Object.values(candidates)) {
    const def = `phase3/candidates#${c.id}`;
    if (!ctx.jobIds.has(c.jobId)) err(def, 'jobId', `unknown Job "${c.jobId}"`);
    ctx.textRef(def, 'cvKey', c.cvKey);
  }
  for (const r of Object.values(requests)) {
    const def = `phase3/requests#${r.id}`;
    ctx.textRef(def, 'nameKey', r.nameKey);
    if (!ctx.serviceIds.has(r.serviceId)) err(def, 'serviceId', `unknown Service "${r.serviceId}"`);
  }
  rawObjects(p.requests).forEach((r, i) =>
    rawObjects(r.consequence).forEach((e, j) => checkRawEffect(`phase3/requests#${String(r.id ?? i)}`, `consequence.${j}`, e, errors)),
  );
  for (const c of Object.values(customerTypes)) ctx.textRef(`phase3/customerTypes#${c.id}`, 'nameKey', c.nameKey);

  // Quests: unknown Conditions or Effects reject the Quest by name (73.7); steps may only require earlier steps of the same Quest.
  rawObjects(p.quests).forEach((q, i) =>
    rawObjects(q.steps).forEach((s, j) => {
      const def = `phase3/quests#${String(q.id ?? i)}`;
      checkRawCondition(def, `steps.${j}.done`, s.done, errors);
      rawObjects(s.reward).forEach((e, k) => checkRawEffect(def, `steps.${j}.reward.${k}`, e, errors));
    }),
  );
  for (const q of Object.values(quests)) {
    const def = `phase3/quests#${q.id}`;
    ctx.textRef(def, 'nameKey', q.nameKey);
    if (q.after !== undefined && !quests[q.after]) err(def, 'after', `unknown Quest "${q.after}"`);
    const seen = new Set<string>();
    q.steps.forEach((s, j) => {
      ctx.textRef(def, `steps.${j}.textKey`, s.textKey);
      if (seen.has(s.id)) err(def, `steps.${j}.id`, `duplicate step id "${s.id}"`);
      for (const r of s.requires ?? []) if (!q.steps.some((o) => o.id === r)) err(def, `steps.${j}.requires`, `unknown step "${r}"`);
      seen.add(s.id);
    });
  }
  // Quest Conditions may only wait for things that exist (73.7): features, Services and other Quest steps.
  const checkCondition = (def: string, field: string, c: Condition): void => {
    switch (c.kind) {
      case 'all':
      case 'any':
        c.of.forEach((x, i) => checkCondition(def, `${field}.of.${i}`, x));
        break;
      case 'not':
        checkCondition(def, `${field}.of`, c.of);
        break;
      case 'revealed':
        if (!ctx.revealFeatures.has(c.feature)) err(def, `${field}.feature`, `no Reveal_Trigger reveals "${c.feature}"`);
        break;
      case 'serviceUsed':
        if (!ctx.serviceIds.has(c.serviceId)) err(def, `${field}.serviceId`, `unknown Service "${c.serviceId}"`);
        break;
      case 'questStepDone':
        if (!quests[c.questId]?.steps.some((s) => s.id === c.stepId)) err(def, `${field}.stepId`, `unknown Quest step "${c.questId}.${c.stepId}"`);
        break;
      default:
        break;
    }
  };
  for (const q of Object.values(quests)) q.steps.forEach((s, j) => checkCondition(`phase3/quests#${q.id}`, `steps.${j}.done`, s.done));
  return { licenseTiers, loanOffers, fitOutItems, supplyDeals, candidates, requests, customerTypes, quests, layouts };
}
