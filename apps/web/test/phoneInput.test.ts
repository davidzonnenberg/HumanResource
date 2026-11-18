// CEO Phone key routing (ceo-phone Requirements 9.3, 10.1–10.5).
import { describe, expect, it } from 'vitest';
import { freshRegistry } from './phoneTestHelpers';
import { canOpenPhone, phoneKeyAction } from '../src/ui/phone/phoneKeys';
import { formatElapsed, formatRemaining } from '../src/ui/phone/elapsed';
import { clampStep } from '../src/ui/phone/components/Stepper';

describe('phone key routing', () => {
  it('captures movement keys as focus moves, so the CEO does not move', () => {
    for (const k of ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']) expect(phoneKeyAction(k, false).kind).toBe('focus');
  });
  it('maps Esc/Backspace, H, R, N and Tab/Shift+Tab', () => {
    expect(phoneKeyAction('escape', false)).toEqual({ kind: 'back' });
    expect(phoneKeyAction('backspace', false)).toEqual({ kind: 'back' });
    expect(phoneKeyAction('h', false)).toEqual({ kind: 'home' });
    expect(phoneKeyAction('r', false)).toEqual({ kind: 'recents' });
    expect(phoneKeyAction('n', false)).toEqual({ kind: 'shade' });
    expect(phoneKeyAction('tab', false)).toEqual({ kind: 'tab', dir: 1 });
    expect(phoneKeyAction('tab', true)).toEqual({ kind: 'tab', dir: -1 });
  });
  it('Enter/Space activate the focused control natively; E and V are swallowed', () => {
    expect(phoneKeyAction('enter', false).kind).toBe('native');
    expect(phoneKeyAction(' ', false).kind).toBe('native');
    expect(phoneKeyAction('e', false).kind).toBe('swallow');
    expect(phoneKeyAction('v', false).kind).toBe('swallow');
  });
  it('P, Q and the Game_Speed keys still reach the game (no number keys used by the phone)', () => {
    for (const k of ['p', 'q', '1', '2', '3', '0', '[', ']']) expect(phoneKeyAction(k, false).kind).toBe('pass');
  });
});

describe('opening while driving', () => {
  it('opens when walking or when the van is stopped, not while it moves', () => {
    const { sim } = freshRegistry();
    const reg = sim.reg;
    expect(canOpenPhone(sim.state, reg)).toBe(true);
    const van = Object.values(sim.state.vehicles).find((v) => v.owner === 'player');
    if (!van) throw new Error('no player van');
    sim.state.ceo.drivingVehicleId = van.id;
    van.pose.speed = 0;
    expect(canOpenPhone(sim.state, reg)).toBe(true);
    van.pose.speed = reg.config.stoppedSpeed + 1;
    expect(canOpenPhone(sim.state, reg)).toBe(false);
  });
});

describe('phone helpers', () => {
  it('shows elapsed and remaining game time without clock or days', () => {
    expect(formatElapsed(0, 10)).toBe('0m 00s');
    expect(formatElapsed(10 * 125, 10)).toBe('2m 05s');
    expect(formatElapsed(10 * (3600 + 23 * 60), 10)).toBe('1h 23m');
    expect(formatRemaining(10 * 220, 0, 10)).toBe('3m 40s');
    expect(formatRemaining(0, 50, 10)).toBe('0m 00s');
  });
  it('the stepper clamps to its limits', () => {
    expect(clampStep(5, 2, 0, 6)).toBe(6);
    expect(clampStep(1, -5, 0, 6)).toBe(0);
  });
});
