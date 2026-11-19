// CEO Phone notification shade, badges and deep links (ceo-phone Requirements 6, 7).
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { appsSchema, type PhoneApp } from '../src/ui/phone/appsSchema';
import { alertBase, alertTarget, appAlertKeys, badgeCount } from '../src/ui/phone/phoneAlerts';
import { addNotification, MAX_NOTIFICATIONS, newAlerts, type PhoneNotification } from '../src/ui/phone/phoneNotifications';
import { usePhone } from '../src/ui/phone/phoneStore';
import { navToggleShade, initialNav, navBack, navOpen } from '../src/ui/phone/phoneNav';

const app = (over: Partial<PhoneApp> & { id: string }): PhoneApp => ({
  nameKey: 'k',
  icon: 'x',
  colour: '#000000',
  revealFeature: null,
  tabs: [],
  dock: null,
  order: 1,
  alertTypes: [],
  ...over,
});
const pintly = app({ id: 'pub', alertTypes: ['out_of_beer', 'unstaffed'], tabs: [{ id: 'status', labelKey: 'k', icon: 'i' }], fixTab: 'status' });
const alert = (key: string, type: string, objectId = 'b1') => ({ key, type, objectId });
const note = (source: string): PhoneNotification => ({ id: 1, text: source, source });

describe('alert mapping and badges', () => {
  it('maps by the base type before the colon', () => {
    expect(alertBase('unstaffed:bartender')).toBe('unstaffed');
    expect(alertTarget(alert('k', 'unstaffed:bartender', 'b9'), [pintly])).toEqual({ app: 'pub', tab: 'status', id: 'b9' });
  });
  it('has no target when no installed app owns the Alert', () => {
    expect(alertTarget(alert('k', 'no_route'), [pintly])).toBeNull();
    expect(alertTarget(alert('k', 'out_of_beer'), [])).toBeNull();
  });
  it('badge counts only Alerts that arrived after the app was last opened', () => {
    const alerts = [alert('a1', 'out_of_beer'), alert('a2', 'unstaffed:server'), alert('a3', 'no_route')];
    expect(badgeCount(pintly, alerts, {})).toBe(2);
    expect(badgeCount(pintly, alerts, { pub: appAlertKeys(pintly, alerts) })).toBe(0);
    expect(badgeCount(pintly, [...alerts, alert('a4', 'out_of_beer', 'b2')], { pub: ['a1', 'a2'] })).toBe(1);
  });
  it('a seen Alert that clears and returns under a new key is new again', () => {
    expect(badgeCount(pintly, [alert('a9', 'out_of_beer')], { pub: ['a1'] })).toBe(1);
  });
  it('apps.json schema rejects a fixTab that is not one of the tabs and defaults alertTypes to empty', () => {
    const base = { id: 'a', nameKey: 'k', icon: 'x', colour: '#000000', revealFeature: null, dock: null, order: 1 };
    expect(appsSchema.safeParse([{ ...base, tabs: [], fixTab: 'nope' }]).success).toBe(false);
    const ok = appsSchema.safeParse([{ ...base, tabs: [] }]);
    expect(ok.success && ok.data[0]?.alertTypes).toEqual([]);
  });
});

describe('notification ring', () => {
  it('is newest first and capped at 20', () => {
    let items: PhoneNotification[] = [];
    for (let i = 0; i < 30; i++) items = addNotification(items, note(`s${i}`));
    expect(items).toHaveLength(MAX_NOTIFICATIONS);
    expect(items[0]?.source).toBe('s29');
  });
  it('drops an immediate repeat of the newest source', () => {
    expect(addNotification(addNotification([], note('a')), note('a'))).toHaveLength(1);
  });
  it('newAlerts returns only unseen keys', () => {
    expect(newAlerts(new Set(['a']), [alert('a', 't'), alert('b', 't')]).map((a) => a.key)).toEqual(['b']);
  });
  it('property: the ring never exceeds the cap and the newest item is the last one added', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 80 }), (sources) => {
        let items: PhoneNotification[] = [];
        for (const s of sources) items = addNotification(items, note(s));
        expect(items.length).toBeLessThanOrEqual(MAX_NOTIFICATIONS);
        if (sources.length > 0) expect(items[0]?.source).toBe(sources[sources.length - 1]);
      }),
      { numRuns: 100 },
    );
  });
});

describe('shade navigation and store', () => {
  beforeEach(() => usePhone.getState().reset());
  it('Back closes the shade before anything else', () => {
    const n = navToggleShade(navOpen(initialNav(), 'set'));
    expect(n.shadeOpen).toBe(true);
    const b = navBack(n);
    expect(b.shadeOpen).toBe(false);
    expect(b.stack).toHaveLength(2);
  });
  it('opening an app from a notification closes the shade', () => {
    expect(navOpen(navToggleShade(initialNav()), 'set').shadeOpen).toBe(false);
  });
  it('store: markSeen, notifications and reset', () => {
    const p = usePhone.getState();
    p.markSeen('pub', ['a1']);
    p.pushNotification({ text: 'hi', source: 'x' });
    expect(usePhone.getState().badgeSeen).toEqual({ pub: ['a1'] });
    expect(usePhone.getState().notifications).toHaveLength(1);
    p.reset();
    expect(usePhone.getState().badgeSeen).toEqual({});
    expect(usePhone.getState().notifications).toEqual([]);
  });
});
