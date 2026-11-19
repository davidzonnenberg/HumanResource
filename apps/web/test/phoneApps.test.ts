// CEO Phone app registry content tests (ceo-phone Requirement 3) and Property 3.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { phoneApps, rawContent, text } from '@hr/content';
import { loadRegistry } from '@hr/sim';
import { appsSchema, PHONE_APPS, type PhoneApp } from '../src/ui/phone/appsSchema';
import { dockApps, gridApps, installedApps } from '../src/ui/phone/installedApps';
import { DEFAULT_PHONE_SETTINGS, parsePhoneSettings } from '../src/ui/phone/phoneSettings';

const table = text as Record<string, unknown>;

function knownFeatures(): Set<string> {
  const res = loadRegistry(rawContent);
  if (!res.ok) throw new Error('content');
  return new Set(Object.values(res.value.revealTriggers).flatMap((t) => t.reveals));
}

describe('phone app registry', () => {
  it('apps.json passes the schema', () => {
    const res = appsSchema.safeParse(phoneApps);
    expect(res.success ? [] : res.error.issues).toEqual([]);
    expect(PHONE_APPS.length).toBe((phoneApps as unknown[]).length);
  });

  it('every nameKey and tab labelKey exists in en.json', () => {
    const missing = PHONE_APPS.flatMap((a) => [a.nameKey, ...a.tabs.map((t) => t.labelKey)]).filter((k) => typeof table[k] !== 'string');
    expect(missing).toEqual([]);
  });

  it('every non-null revealFeature is a known reveal FEATURE (strict)', () => {
    const known = knownFeatures();
    const bad = PHONE_APPS.filter((a) => a.revealFeature !== null && !known.has(a.revealFeature)).map((a) => `${a.id}: ${a.revealFeature}`);
    expect(bad).toEqual([]);
  });

  it('Settings is always installed and docked; LinkedOut is installed by news_feed', () => {
    const none = installedApps([], PHONE_APPS);
    expect(dockApps(none).map((a) => a.id)).toContain('set');
    expect(none.map((a) => a.id)).not.toContain('news');
    expect(installedApps(['news_feed'], PHONE_APPS).map((a) => a.id)).toContain('news');
  });

  it('rejects duplicate ids, duplicate dock positions, duplicate tabs and more than 4 tabs', () => {
    const base = { nameKey: 'k', icon: 'x', colour: '#000000', revealFeature: null, tabs: [], dock: null, order: 1 };
    expect(appsSchema.safeParse([{ ...base, id: 'a' }, { ...base, id: 'a' }]).success).toBe(false);
    expect(appsSchema.safeParse([{ ...base, id: 'a', dock: 0 }, { ...base, id: 'b', dock: 0 }]).success).toBe(false);
    const tab = { id: 't', labelKey: 'k', icon: 'i' };
    expect(appsSchema.safeParse([{ ...base, id: 'a', tabs: [tab, tab] }]).success).toBe(false);
    expect(appsSchema.safeParse([{ ...base, id: 'a', tabs: ['1', '2', '3', '4', '5'].map((id) => ({ ...tab, id })) }]).success).toBe(false);
    expect(appsSchema.safeParse([{ ...base, id: 'rotate' }]).success).toBe(false);
  });

  it('phone settings fall back to defaults field by field', () => {
    expect(parsePhoneSettings(undefined)).toEqual(DEFAULT_PHONE_SETTINGS);
    expect(parsePhoneSettings({ textSize: 'xl', dnd: true })).toEqual({ ...DEFAULT_PHONE_SETTINGS, dnd: true });
  });
});

const appArb: fc.Arbitrary<PhoneApp> = fc.record({
  id: fc.stringMatching(/^[a-z]{1,6}$/),
  nameKey: fc.constant('k'),
  icon: fc.constant('i'),
  colour: fc.constant('#123456'),
  revealFeature: fc.option(fc.constantFrom('f1', 'f2', 'f3'), { nil: null }),
  tabs: fc.constant([]),
  alertTypes: fc.constant([]),
  dock: fc.option(fc.nat(5), { nil: null }),
  order: fc.integer({ min: -5, max: 50 }),
});

describe('installed apps property', () => {
  // Feature: ceo-phone, Property 3: installed apps follow reveals
  it('Property 3: installed = revealFeature null or revealed, sorted by order; revealAll shows all', () => {
    fc.assert(
      fc.property(fc.uniqueArray(appArb, { selector: (a) => a.id, maxLength: 10 }), fc.subarray(['f1', 'f2', 'f3']), (reg, features) => {
        const got = installedApps(features, reg);
        const want = reg.filter((a) => a.revealFeature === null || features.includes(a.revealFeature));
        expect(new Set(got.map((a) => a.id))).toEqual(new Set(want.map((a) => a.id)));
        for (let i = 1; i < got.length; i++) expect((got[i - 1] as PhoneApp).order).toBeLessThanOrEqual((got[i] as PhoneApp).order);
        expect(installedApps(features, reg, true)).toHaveLength(reg.length);
        expect(gridApps(got).length + dockApps(got).length).toBe(got.length);
      }),
      { numRuns: 200 },
    );
  });
});
