import { describe, expect, it } from 'vitest';
import { rawContent } from '@hr/content';
import { loadRegistry } from '../src/defs/registry';
import { pathCacheFor } from '../src/logistics/pathCache';
import { registry } from './helpers';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('Definition_Registry (Requirement 1, 48)', () => {
  it('loads the base content without errors', () => {
    const res = loadRegistry(rawContent);
    expect(res.ok ? [] : res.errors).toEqual([]);
  });

  it('rejects unknown references and invalid pub fields, naming the definition and field', () => {
    const raw = clone(rawContent);
    const biz = raw.businesses as { id: string; inputs: string[]; pub?: { seats: number; minDrinkPrice: number } }[];
    (biz[0] as { inputs: string[] }).inputs = ['unobtainium'];
    ((biz[1] as { pub: { seats: number } }).pub as { seats: number }).seats = 0;
    const res = loadRegistry(raw);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors).toContainEqual(expect.objectContaining({ definition: 'businesses#pub_cosy_local', message: expect.stringContaining('unobtainium') }));
    expect(res.errors).toContainEqual(expect.objectContaining({ definition: 'businesses#pub_sports', field: 'pub.seats' }));
  });

  it('rejects unknown text keys', () => {
    const raw = clone(rawContent);
    (raw.resources as { nameKey: string }[])[0] = { ...(raw.resources as { nameKey: string }[])[0], nameKey: 'nope.key' } as { nameKey: string };
    const res = loadRegistry(raw);
    expect(res.ok).toBe(false);
  });

  it('starts with exactly one unlocked District; paths stay inside it', () => {
    const reg = registry();
    const unlocked = Object.entries(reg.startState.districts).filter(([, d]) => d.unlocked);
    expect(unlocked.map(([id]) => id)).toEqual(['old_town']);
    const cache = pathCacheFor(reg, ['old_town']);
    expect(cache.nodeIds.every((n) => n.startsWith('old_town:'))).toBe(true);
    expect(cache.nodePath('old_town:home', 'old_town:sup').length).toBeGreaterThan(1);
    const both = pathCacheFor(reg, ['old_town', 'harbour']);
    expect(both.nodePath('old_town:home', 'harbour:pier').length).toBeGreaterThan(2);
    expect(cache.nodePath('old_town:home', 'harbour:pier')).toEqual([]);
  });
});
