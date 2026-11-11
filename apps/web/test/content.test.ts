// Text_Key coverage (criterion 46.8, required) and model key coverage (16.4).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rawContent, text } from '@hr/content';
import { loadRegistry } from '@hr/sim';
import { MODEL_MAP } from '../src/render/assets/modelMap';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe('content coverage', () => {
  it('every t(...) key used in apps/web/src exists in en.json', () => {
    const table = text as Record<string, unknown>;
    const missing: string[] = [];
    for (const f of files(join(__dirname, '..', 'src'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) if (typeof table[m[1] as string] !== 'string') missing.push(`${f}: ${m[1]}`);
      for (const m of src.matchAll(/'((?:hud|action|panel|alert|reason|pause|dialog|slots|profiles|sync|pwa|toast|app|news|market|achievement)\.[\w.]+)'/g))
        if (!(m[1] as string).endsWith('.') && table[m[1] as string] === undefined) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('every reveal toast and reason code has text', () => {
    const table = text as Record<string, unknown>;
    const res = loadRegistry(rawContent);
    if (!res.ok) throw new Error('content');
    for (const trig of Object.values(res.value.revealTriggers)) for (const r of trig.reveals) expect(typeof table[`toast.reveal.${r}`]).toBe('string');
  });

  it('every model key in the registry has a mapping', () => {
    const res = loadRegistry(rawContent);
    if (!res.ok) throw new Error('content');
    for (const k of res.value.modelKeys) expect(MODEL_MAP[k], k).toBeDefined();
  });
});
