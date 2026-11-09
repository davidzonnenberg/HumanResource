// PIN hashing (PBKDF2-SHA256 via WebCrypto, available in browsers and Node >= 20) and the pure
// lockout rule (26.2–26.6). Security is deliberately light: Tailscale is the real access control.
import type { PinRecord } from './api';

export const PIN_ITERATIONS = 210_000;
export const PIN_LOCK_FAILURES = 5;
export const PIN_LOCK_WINDOW_MS = 5 * 60_000;
export const PIN_LOCK_DURATION_MS = 5 * 60_000;

const toHex = (buf: ArrayBuffer | Uint8Array): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string): Uint8Array<ArrayBuffer> => new Uint8Array((hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));

async function derive(pin: string, saltHex: string, iterations: number): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations }, key, 256);
  return toHex(bits);
}

export async function hashPin(pin: string, iterations = PIN_ITERATIONS): Promise<PinRecord> {
  const salt = toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  return { salt, iterations, hash: await derive(pin, salt, iterations) };
}

export async function verifyPin(pin: string, rec: PinRecord): Promise<boolean> {
  const h = await derive(pin, rec.salt, rec.iterations);
  // constant-time-ish comparison
  let diff = h.length ^ rec.hash.length;
  for (let i = 0; i < Math.min(h.length, rec.hash.length); i++) diff |= h.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
}

export type LockStatus = { locked: false; attemptsLeft: number } | { locked: true; retryAfterMs: number };

/** Pure lockout rule: 5 failures within 5 minutes lock for 5 minutes from the last failure. */
export function lockStatus(failureTimes: readonly number[], now: number): LockStatus {
  const recent = failureTimes.filter((t) => now - t < PIN_LOCK_WINDOW_MS).sort((a, b) => a - b);
  if (recent.length >= PIN_LOCK_FAILURES) {
    const last = recent[recent.length - 1] as number;
    const until = last + PIN_LOCK_DURATION_MS;
    if (now < until) return { locked: true, retryAfterMs: until - now };
  }
  return { locked: false, attemptsLeft: Math.max(0, PIN_LOCK_FAILURES - recent.length) };
}
