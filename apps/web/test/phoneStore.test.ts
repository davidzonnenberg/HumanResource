// CEO Phone navigation store (ceo-phone Requirement 4).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { initialNav, KEEP_AFTER_CAP, MAX_RECENTS, MAX_STACK, navBack, navHome, navOpen, navRecents, navSetDialog, navSetTab, navToggleShade, topScreen, type PhoneNav } from '../src/ui/phone/phoneNav';
import { usePhone } from '../src/ui/phone/phoneStore';
import { PHONE_APPS } from '../src/ui/phone/appsSchema';

describe('phone navigation', () => {
  it('starts closed on Home; open pushes the app, opens the phone and records recents', () => {
    const n0 = initialNav();
    expect(n0.open).toBe(false);
    expect(n0.stack).toEqual([{ kind: 'home' }]);
    const n1 = navOpen(n0, 'set');
    expect(n1.open).toBe(true);
    expect(topScreen(n1)).toEqual({ kind: 'app', app: 'set' });
    expect(n1.recents).toEqual(['set']);
  });

  it('does not push a duplicate when the same app screen is on top', () => {
    const n = navOpen(navOpen(initialNav(), 'news'), 'news');
    expect(n.stack).toHaveLength(2);
    // a different detail id is a different screen
    expect(navOpen(n, 'news', { id: 'x' }).stack).toHaveLength(3);
  });

  it('back closes the shade, then a dialog, then pops, then closes the phone on Home', () => {
    let n = navOpen(initialNav(), 'set');
    n = navSetDialog(navToggleShade(n), 'confirm');
    n = navBack(n);
    expect(n.shadeOpen).toBe(false);
    expect(n.dialog).toBe('confirm');
    n = navBack(n);
    expect(n.dialog).toBeNull();
    expect(n.stack).toHaveLength(2);
    n = navBack(n);
    expect(n.stack).toEqual([{ kind: 'home' }]);
    expect(n.open).toBe(true);
    n = navBack(n);
    expect(n.open).toBe(false);
  });

  it('home resets the stack and closes the shade', () => {
    const n = navHome(navToggleShade(navOpen(navOpen(initialNav(), 'set'), 'news')));
    expect(n.stack).toEqual([{ kind: 'home' }]);
    expect(n.shadeOpen).toBe(false);
  });

  it('recents is pushed once and keeps at most 5 unique apps, newest first', () => {
    let n = initialNav();
    for (const a of ['a', 'b', 'c', 'd', 'e', 'f', 'b']) n = navOpen(n, a);
    expect(n.recents).toEqual(['b', 'f', 'e', 'd', 'c']);
    n = navRecents(navRecents(n));
    expect(n.stack.filter((s) => s.kind === 'recents')).toHaveLength(1);
  });

  it('caps the stack at 12: the 13th push keeps Home plus the last 6', () => {
    let n = initialNav();
    for (let i = 1; i <= MAX_STACK; i++) n = navOpen(n, `app${i}`);
    expect(n.stack).toHaveLength(KEEP_AFTER_CAP + 1);
    expect(n.stack[0]).toEqual({ kind: 'home' });
    expect(topScreen(n)).toEqual({ kind: 'app', app: `app${MAX_STACK}` });
    let m = initialNav();
    for (let i = 1; i < MAX_STACK; i++) m = navOpen(m, `app${i}`);
    expect(m.stack).toHaveLength(MAX_STACK);
  });

  it('remembers the last tab per app and reopens on it', () => {
    let n = navOpen(initialNav(), 'pint', { tab: 'dials' });
    n = navSetTab(n, 'pint', 'visit');
    n = navOpen(navHome(n), 'ledgr', { tab: 'loan' });
    n = navOpen(navHome(n), 'pint');
    expect(topScreen(n)).toEqual({ kind: 'app', app: 'pint', tab: 'visit' });
    expect(n.lastTab).toEqual({ pint: 'visit', ledgr: 'loan' });
  });

  it('the Zustand store wraps the reducers and reset() returns to closed Home', () => {
    usePhone.getState().openApp('set');
    expect(usePhone.getState().open).toBe(true);
    usePhone.getState().reset();
    expect(usePhone.getState().open).toBe(false);
    expect(usePhone.getState().stack).toEqual([{ kind: 'home' }]);
  });
});

type NavAction =
  | { k: 'open'; app: string; tab: string | undefined; id: string | undefined }
  | { k: 'back' }
  | { k: 'home' }
  | { k: 'recents' }
  | { k: 'tab'; app: string; tab: string }
  | { k: 'shade' }
  | { k: 'dialog'; d: string | null };

// Registry ids (including revealFeature null apps such as Settings) plus arbitrary ids.
const appId = fc.oneof(fc.constantFrom(...PHONE_APPS.map((a) => a.id), 'set'), fc.constantFrom('pint', 'ledgr', 'staff', 'todo', 'map'), fc.string({ minLength: 1, maxLength: 6 }));
const tabId = fc.constantFrom('a', 'b', 'c');
const action: fc.Arbitrary<NavAction> = fc.oneof(
  fc.record({ k: fc.constant('open' as const), app: appId, tab: fc.option(tabId, { nil: undefined }), id: fc.option(fc.constantFrom('h1', 'h2'), { nil: undefined }) }),
  fc.constant({ k: 'back' as const }),
  fc.constant({ k: 'home' as const }),
  fc.constant({ k: 'recents' as const }),
  fc.record({ k: fc.constant('tab' as const), app: appId, tab: tabId }),
  fc.constant({ k: 'shade' as const }),
  fc.record({ k: fc.constant('dialog' as const), d: fc.option(fc.constant('x'), { nil: null }) }),
);

function step(n: PhoneNav, a: NavAction): PhoneNav {
  switch (a.k) {
    case 'open': {
      const opts: { tab?: string; id?: string } = {};
      if (a.tab !== undefined) opts.tab = a.tab;
      if (a.id !== undefined) opts.id = a.id;
      return navOpen(n, a.app, opts);
    }
    case 'back':
      return navBack(n);
    case 'home':
      return navHome(n);
    case 'recents':
      return navRecents(n);
    case 'tab':
      return navSetTab(n, a.app, a.tab);
    case 'shade':
      return navToggleShade(n);
    case 'dialog':
      return navSetDialog(n, a.d);
  }
}

describe('phone navigation properties', () => {
  // Feature: ceo-phone, Property 1: phone stack invariants
  it('Property 1: any sequence of nav actions keeps stack[0] = home, length <= 12, recents <= 5 and unique', () => {
    fc.assert(
      fc.property(fc.array(action, { maxLength: 80 }), (actions) => {
        let n = initialNav();
        for (const a of actions) {
          n = step(n, a);
          expect(n.stack[0]?.kind).toBe('home');
          expect(n.stack.length).toBeLessThanOrEqual(MAX_STACK);
          expect(n.recents.length).toBeLessThanOrEqual(MAX_RECENTS);
          expect(new Set(n.recents).size).toBe(n.recents.length);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ceo-phone, Property 2: open is idempotent on top
  it('Property 2: opening the same app screen twice equals opening it once', () => {
    fc.assert(
      fc.property(fc.array(action, { maxLength: 30 }), appId, fc.option(fc.constantFrom('h1', 'h2'), { nil: undefined }), (actions, app, id) => {
        const n = actions.reduce(step, initialNav());
        const opts = id !== undefined ? { id } : {};
        const once = navOpen(n, app, opts);
        expect(navOpen(once, app, opts).stack).toEqual(once.stack);
      }),
      { numRuns: 200 },
    );
  });
});
