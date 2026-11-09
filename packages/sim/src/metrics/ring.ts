// Rolling-window ring buffers indexed by game second. Stored in state so they survive saves.
import type { Ring } from '../state/types';

export const newRing = (size: number): Ring => ({ size, secs: new Array<number>(size).fill(-1), values: new Array<number>(size).fill(0) });

/** Adds v to the bucket of `second`, resetting the bucket if it held an older second. */
export function ringAdd(r: Ring, second: number, v: number): void {
  const i = second % r.size;
  if (r.secs[i] !== second) {
    r.secs[i] = second;
    r.values[i] = 0;
  }
  r.values[i] = (r.values[i] as number) + v;
}

/** Sets the bucket of `second` to v. */
export function ringSet(r: Ring, second: number, v: number): void {
  const i = second % r.size;
  r.secs[i] = second;
  r.values[i] = v;
}

/** Sum over the window (now - size, now]. */
export function ringSum(r: Ring, now: number): number {
  let s = 0;
  for (let i = 0; i < r.size; i++) {
    const sec = r.secs[i] as number;
    if (sec > now - r.size && sec <= now) s += r.values[i] as number;
  }
  return s;
}

/** Number of seconds in the window that have samples. */
export function ringCount(r: Ring, now: number): number {
  let c = 0;
  for (let i = 0; i < r.size; i++) {
    const sec = r.secs[i] as number;
    if (sec > now - r.size && sec <= now) c += 1;
  }
  return c;
}
