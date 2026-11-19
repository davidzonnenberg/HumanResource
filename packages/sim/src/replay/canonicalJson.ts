// Canonical JSON (Requirement 53.7): objects with sorted keys at every depth, arrays in order,
// `undefined` members dropped. The same state always prints to the same text, whatever order the
// keys were inserted in, so the State_Hash depends on the data only.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined || typeof v === 'function' ? 'null' : canonicalJson(v))).join(',')}]`;
  const rec = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(rec).sort()) {
    const v = rec[k];
    if (v === undefined || typeof v === 'function') continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJson(v)}`);
  }
  return `{${parts.join(',')}}`;
}