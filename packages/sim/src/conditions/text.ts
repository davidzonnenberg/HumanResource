// Canonical text form of a Condition (52.7): JSON with `kind` first and every other key in
// alphabetical order, at every depth. parseCondition validates against the Condition schema, so
// parse(print(c)) is equivalent to c and print(parse(print(c))) is identical to print(c).
import { conditionSchema, type Condition } from '../defs/schemas';

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (typeof value !== 'object' || value === null) return value;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec)
    .filter((k) => rec[k] !== undefined)
    .sort((a, b) => (a === 'kind' ? -1 : b === 'kind' ? 1 : a < b ? -1 : a > b ? 1 : 0));
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = ordered(rec[k]);
  return out;
}

export function printCondition(c: Condition): string {
  return JSON.stringify(ordered(c));
}

/** Throws when the text is not JSON or not a valid Condition. */
export function parseCondition(text: string): Condition {
  return conditionSchema.parse(JSON.parse(text));
}
