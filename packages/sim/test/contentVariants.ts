// Registries built from the shipped content plus test-only additions (Services, bad vocabulary).
import { rawContent } from '@hr/content';
import { loadRegistry, type DefinitionError, type DefinitionRegistry, type RawContentInput } from '../src/defs/registry';

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** A deep copy of the shipped content that `patch` may edit freely. */
export function patchedContent(patch: (raw: RawContentInput & { businesses: Record<string, unknown>[]; text: Record<string, unknown> }) => void): RawContentInput {
  const raw = clone(rawContent) as RawContentInput & { businesses: Record<string, unknown>[]; text: Record<string, unknown> };
  patch(raw);
  return raw;
}

/** Adds `services` to a Business Definition of the shipped content (and the text keys they use). */
export function withServices(defId: string, services: unknown[], extraText: Record<string, string> = {}): RawContentInput {
  return patchedContent((raw) => {
    const def = raw.businesses.find((b) => b.id === defId);
    if (!def) throw new Error(`unknown Business ${defId}`);
    def.services = services;
    for (const s of services) {
      const key = (s as { nameKey?: string }).nameKey;
      if (key) raw.text[key] = key;
    }
    Object.assign(raw.text, extraText);
  });
}

export function loadOrThrow(raw: RawContentInput): DefinitionRegistry {
  const res = loadRegistry(raw);
  if (!res.ok) throw new Error('content invalid: ' + JSON.stringify(res.errors, null, 2));
  return res.value;
}

export function errorsOf(raw: RawContentInput): DefinitionError[] {
  const res = loadRegistry(raw);
  return res.ok ? [] : res.errors;
}
