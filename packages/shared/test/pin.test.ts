/// <reference types="node" />
// Property 34: PIN hash verification parity (Requirements 22.7, 26.2, 26.3).
// Property 35: PIN lockout (Requirements 26.4, 26.5, 26.6).
// Node's crypto is used only as the reference implementation in this test; src/ stays Node-free.
import { pbkdf2Sync } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  hashPin,
  lockStatus,
  PIN_ITERATIONS,
  PIN_LOCK_DURATION_MS,
  PIN_LOCK_FAILURES,
  PIN_LOCK_WINDOW_MS,
  verifyPin,
} from '../src/pin';

// Low iteration count keeps property runs fast; one example below checks the production default.
const TEST_ITERATIONS = 1000;
const pinArb = fc.stringMatching(/^[0-9]{4,6}$/);

describe('PIN hash verification parity (Property 34)', () => {
  it('uses the production iteration count and a 16-byte hex salt', async () => {
    const rec = await hashPin('4821');
    expect(rec.iterations).toBe(PIN_ITERATIONS);
    expect(rec.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(rec.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the WebCrypto hash matches node:crypto PBKDF2-SHA256 with the same salt and iterations', async () => {
    const rec = await hashPin('4821');
    const reference = pbkdf2Sync('4821', Buffer.from(rec.salt, 'hex'), rec.iterations, 32, 'sha256').toString('hex');
    expect(rec.hash).toBe(reference);
  }, 60_000);

  // Feature: human-resource-mvp, Property 34: PIN hash verification parity
  it('Property 34: stored hashes match node:crypto for generated PINs', async () => {
    await fc.assert(
      fc.asyncProperty(pinArb, async (pin) => {
        const rec = await hashPin(pin, TEST_ITERATIONS);
        const reference = pbkdf2Sync(pin, Buffer.from(rec.salt, 'hex'), TEST_ITERATIONS, 32, 'sha256').toString('hex');
        expect(rec.hash).toBe(reference);
      }),
    );
  });

  it('Property 34: verifyPin accepts the stored PIN and rejects every different PIN', async () => {
    await fc.assert(
      fc.asyncProperty(pinArb, pinArb, async (pin, other) => {
        const rec = await hashPin(pin, TEST_ITERATIONS);
        expect(await verifyPin(pin, rec)).toBe(true);
        if (other !== pin) expect(await verifyPin(other, rec)).toBe(false);
      }),
    );
  });

  it('verifyPin rejects an empty input against a PIN record', async () => {
    const rec = await hashPin('1234', TEST_ITERATIONS);
    expect(await verifyPin('', rec)).toBe(false);
  });
});

describe('PIN lockout (Property 35)', () => {
  // Failure times are never after `now`, which matches how the app records them.
  const failuresArb = fc.array(fc.integer({ min: 0, max: 1_000_000 }), { maxLength: 12 });
  const nowArb = fc.integer({ min: 1_000_000, max: 1_000_000 + 2 * PIN_LOCK_DURATION_MS });
  const inWindow = (failures: readonly number[], now: number): number[] => failures.filter((t) => now - t < PIN_LOCK_WINDOW_MS);

  // Feature: human-resource-mvp, Property 35: PIN lockout
  it('Property 35: fewer than five failures in the window never lock and report the attempts left', () => {
    fc.assert(
      fc.property(failuresArb, nowArb, (failures, now) => {
        const recent = inWindow(failures, now);
        fc.pre(recent.length < PIN_LOCK_FAILURES);
        expect(lockStatus(failures, now)).toEqual({ locked: false, attemptsLeft: PIN_LOCK_FAILURES - recent.length });
      }),
    );
  });

  it('Property 35: a lock lasts at most five minutes and runs from the most recent failure', () => {
    fc.assert(
      fc.property(failuresArb, nowArb, (failures, now) => {
        const status = lockStatus(failures, now);
        if (!status.locked) return;
        const recent = inWindow(failures, now);
        expect(recent.length).toBeGreaterThanOrEqual(PIN_LOCK_FAILURES);
        expect(status.retryAfterMs).toBeGreaterThan(0);
        expect(status.retryAfterMs).toBeLessThanOrEqual(PIN_LOCK_DURATION_MS);
        expect(now + status.retryAfterMs).toBe(Math.max(...recent) + PIN_LOCK_DURATION_MS);
      }),
    );
  });

  it('Property 35: a locked account stays locked when another failure is recorded at the current time', () => {
    // Five or more failures inside the window, all at or before `now`: the account is locked by construction.
    const lockedScenario = fc.tuple(
      fc.integer({ min: 1_000_000, max: 2_000_000 }),
      fc.array(fc.integer({ min: 0, max: PIN_LOCK_WINDOW_MS - 1 }), { minLength: PIN_LOCK_FAILURES, maxLength: 12 }),
    );
    fc.assert(
      fc.property(lockedScenario, ([now, agesMs]) => {
        const failures = agesMs.map((age) => now - age);
        expect(lockStatus(failures, now).locked).toBe(true);
        expect(lockStatus([...failures, now], now).locked).toBe(true);
      }),
    );
  });

  it('five failures at the same moment lock for exactly five minutes', () => {
    const failures = [0, 0, 0, 0, 0];
    expect(lockStatus(failures, 0)).toEqual({ locked: true, retryAfterMs: PIN_LOCK_DURATION_MS });
    expect(lockStatus(failures, PIN_LOCK_WINDOW_MS - 1)).toEqual({ locked: true, retryAfterMs: 1 });
    expect(lockStatus(failures, PIN_LOCK_WINDOW_MS)).toEqual({ locked: false, attemptsLeft: PIN_LOCK_FAILURES });
  });

  it('the lock runs from the latest failure, not the first', () => {
    expect(lockStatus([0, 0, 0, 0, 200_000], 200_000)).toEqual({ locked: true, retryAfterMs: PIN_LOCK_DURATION_MS });
  });

  it('failures older than the window do not count towards the lock', () => {
    const failures = [0, 60_000, 120_000, 180_000, 240_000];
    expect(lockStatus(failures, 300_000)).toEqual({ locked: false, attemptsLeft: 1 });
  });
});
