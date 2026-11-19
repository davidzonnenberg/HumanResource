// AMROBOT bank rules: money formatting, PIN check and the transfer form.
import { describe, expect, it } from 'vitest';
import { checkPin, maxWhole, planTransfer, splitGold } from '../src/ui/phone/apps/bankLogic';
import { PHONE_APPS } from '../src/ui/phone/appsSchema';
import { installedApps } from '../src/ui/phone/installedApps';

describe('bank logic', () => {
  it('formats Gold in hundredths with dots and small cents', () => {
    expect(splitGold(113_000)).toEqual({ neg: false, whole: '1.130', cents: '00' });
    expect(splitGold(5)).toEqual({ neg: false, whole: '0', cents: '05' });
    expect(splitGold(-123_456)).toEqual({ neg: true, whole: '1.234', cents: '56' });
  });
  it('accepts any 5 digits and explains why other codes fail', () => {
    expect(checkPin('01234')).toBe('ok');
    expect(checkPin('12a45')).toBe('digits');
    expect(checkPin('123')).toBe('length');
    expect(checkPin('')).toBe('length');
  });
  it('plans a transfer in whole Gold and rejects bad ones before sending', () => {
    expect(planTransfer('balance', 'savings', '50', 10_000, 0)).toEqual({ ok: true, direction: 'toSavings', amount: 5_000 });
    expect(planTransfer('savings', 'balance', '10', 0, 1_000)).toEqual({ ok: true, direction: 'toBalance', amount: 1_000 });
    expect(planTransfer('balance', 'balance', '5', 10_000, 0)).toMatchObject({ ok: false, errorKey: 'app.bank.err.same' });
    expect(planTransfer('balance', 'savings', '', 10_000, 0)).toMatchObject({ ok: false, errorKey: 'app.bank.err.amount' });
    expect(planTransfer('balance', 'savings', '0', 10_000, 0)).toMatchObject({ ok: false, errorKey: 'app.bank.err.amount' });
    expect(planTransfer('balance', 'savings', '101', 10_000, 0)).toMatchObject({ ok: false, errorKey: 'app.bank.err.funds' });
    expect(planTransfer('balance', 'savings', '1', -500, 0)).toMatchObject({ ok: false, errorKey: 'app.bank.err.funds' });
  });
  it('"All" is the whole Gold on the account, never negative', () => {
    expect(maxWhole('balance', 12_345, 0)).toBe(123);
    expect(maxWhole('balance', -500, 0)).toBe(0);
    expect(maxWhole('savings', 0, 999)).toBe(9);
  });
  it('the bank app is always installed and sits in the dock', () => {
    const bank = installedApps([], PHONE_APPS).find((a) => a.id === 'bank');
    expect(bank).toMatchObject({ revealFeature: null, dock: 0 });
  });
});