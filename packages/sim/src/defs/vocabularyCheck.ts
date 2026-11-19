// Registry-time check of the closed Condition / Effect / StatId vocabularies (50.4, 52.3, 73.7).
// It walks the RAW JSON before zod, so the error names the Definition, the field path and the
// unknown entry ("unknown Condition kind \"foo\"") instead of a generic union mismatch.
import type { DefinitionError } from './registry';
import { CONDITION_KINDS, DOMAIN_OPS, EFFECT_KINDS, STAT_IDS } from './vocabulary';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (list: readonly string[], v: unknown): boolean => typeof v === 'string' && list.includes(v);

export function checkRawStat(definition: string, field: string, stat: unknown, errors: DefinitionError[]): void {
  if (!has(STAT_IDS, stat)) errors.push({ definition, field, message: `unknown StatId "${String(stat)}"` });
}

export function checkRawCondition(definition: string, field: string, raw: unknown, errors: DefinitionError[]): void {
  if (!isObj(raw)) return; // the shape error comes from zod
  const kind = raw.kind;
  if (!has(CONDITION_KINDS, kind)) {
    errors.push({ definition, field, message: `unknown Condition kind "${String(kind)}"` });
    return;
  }
  if ((kind === 'all' || kind === 'any') && Array.isArray(raw.of)) raw.of.forEach((c, i) => checkRawCondition(definition, `${field}.of.${i}`, c, errors));
  if (kind === 'not') checkRawCondition(definition, `${field}.of`, raw.of, errors);
  if (kind === 'statAtLeast' || kind === 'statBelow') checkRawStat(definition, `${field}.stat`, raw.stat, errors);
}

export function checkRawEffect(definition: string, field: string, raw: unknown, errors: DefinitionError[]): void {
  if (!isObj(raw)) return;
  const kind = raw.kind;
  if (!has(EFFECT_KINDS, kind)) {
    errors.push({ definition, field, message: `unknown Effect kind "${String(kind)}"` });
    return;
  }
  if (kind === 'domain' && !has(DOMAIN_OPS, raw.op)) errors.push({ definition, field: `${field}.op`, message: `unregistered domain op "${String(raw.op)}"` });
  if (kind === 'addModifier') checkRawStat(definition, `${field}.stat`, raw.stat, errors);
}

/** Checks every Condition and Effect of one raw Service. */
export function checkRawService(definition: string, field: string, raw: unknown, errors: DefinitionError[]): void {
  if (!isObj(raw)) return;
  if (Array.isArray(raw.conditions))
    raw.conditions.forEach((c, i) => checkRawCondition(definition, `${field}.conditions.${i}.condition`, isObj(c) ? c.condition : undefined, errors));
  if (Array.isArray(raw.effects)) raw.effects.forEach((e, i) => checkRawEffect(definition, `${field}.effects.${i}`, e, errors));
}
