// State_Hash (Requirement 53.7): FNV-1a, 64 bit, over the UTF-8 bytes of the canonical JSON of the
// Simulation state. The 64-bit value is kept as two 32-bit halves, so no BigInt is needed and the
// result is identical on every JavaScript engine. Output: 16 lowercase hex digits.
import type { SimState } from '../state/types';
import { canonicalJson } from './canonicalJson';

const OFFSET_HI = 0xcbf29ce4;
const OFFSET_LO = 0x84222325;
// FNV prime 0x100000001b3 = 2^40 + 0x1b3
const PRIME_HI = 0x100;
const PRIME_LO = 0x1b3;

/** FNV-1a 64 over a string's UTF-8 bytes. */
export function fnv1a64(text: string): string {
  let hi = OFFSET_HI;
  let lo = OFFSET_LO;
  const step = (byte: number): void => {
    lo = (lo ^ byte) >>> 0;
    // (hi:lo) * (PRIME_HI:PRIME_LO) mod 2^64. lo * PRIME_LO < 2^41 is exact in a double.
    const prod = lo * PRIME_LO;
    const newLo = prod % 4294967296;
    const carry = Math.floor(prod / 4294967296);
    hi = (carry + Math.imul(hi, PRIME_LO) + Math.imul(lo, PRIME_HI)) >>> 0;
    lo = newLo >>> 0;
  };
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd; // a lone surrogate encodes as U+FFFD, like TextEncoder
    if (c < 0x80) step(c);
    else if (c < 0x800) {
      step(0xc0 | (c >> 6));
      step(0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      step(0xe0 | (c >> 12));
      step(0x80 | ((c >> 6) & 0x3f));
      step(0x80 | (c & 0x3f));
    } else {
      step(0xf0 | (c >> 18));
      step(0x80 | ((c >> 12) & 0x3f));
      step(0x80 | ((c >> 6) & 0x3f));
      step(0x80 | (c & 0x3f));
    }
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

/** The State_Hash of a Simulation state. */
export function stateHash(state: SimState): string {
  return fnv1a64(canonicalJson(state));
}