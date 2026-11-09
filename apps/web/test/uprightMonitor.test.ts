// Upright and out-of-bounds reset timing with fake timers (task 14.5, Requirements 13.14, 13.15).
// The monitor is fed from a fake-timer interval, the same way the render loop feeds it per frame.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newUprightState, OUT_RESET_MS, TILT_RESET_MS, updateUpright, type UprightVerdict } from '../src/physics/uprightMonitor';

const FRAME_MS = 100;

interface Sample {
  upY: number;
  inBounds: boolean;
}

interface ResetEvent {
  atMs: number;
  verdict: Exclude<UprightVerdict, 'ok'>;
}

const UPRIGHT: Sample = { upY: 1, inBounds: true };
const UPSIDE_DOWN: Sample = { upY: -1, inBounds: true };
const OUT_OF_BOUNDS: Sample = { upY: 1, inBounds: false };

function runMonitor(sample: (elapsedMs: number) => Sample): { events: ResetEvent[]; stop: () => void } {
  const state = newUprightState();
  const events: ResetEvent[] = [];
  let elapsed = 0;
  const id = setInterval(() => {
    elapsed += FRAME_MS;
    const { upY, inBounds } = sample(elapsed);
    const verdict = updateUpright(state, upY, inBounds, FRAME_MS);
    if (verdict !== 'ok') events.push({ atMs: elapsed, verdict });
  }, FRAME_MS);
  return { events, stop: () => clearInterval(id) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('upright reset (13.14)', () => {
  it('resets after exactly two seconds upside down, not before', () => {
    expect(TILT_RESET_MS).toBe(2000);
    const m = runMonitor(() => UPSIDE_DOWN);
    vi.advanceTimersByTime(1900);
    expect(m.events).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(m.events).toEqual([{ atMs: 2000, verdict: 'resetUpright' }]);
    m.stop();
  });

  it('one upright frame restarts the two-second count', () => {
    // Upside down for 1.4 s, upright for one frame, then upside down again from 1.6 s.
    const m = runMonitor((t) => (t === 1500 ? UPRIGHT : UPSIDE_DOWN));
    vi.advanceTimersByTime(3000);
    expect(m.events).toEqual([]);
    vi.advanceTimersByTime(500);
    expect(m.events).toEqual([{ atMs: 3500, verdict: 'resetUpright' }]);
    m.stop();
  });

  it('keeps resetting every two seconds while the van stays upside down', () => {
    const m = runMonitor(() => UPSIDE_DOWN);
    vi.advanceTimersByTime(4000);
    expect(m.events.map((e) => e.atMs)).toEqual([2000, 4000]);
    m.stop();
  });

  it('never resets while the van is upright and in bounds', () => {
    const m = runMonitor(() => UPRIGHT);
    vi.advanceTimersByTime(10_000);
    expect(m.events).toEqual([]);
    m.stop();
  });
});

describe('out-of-bounds reset (13.15)', () => {
  it('resets after half a second outside the drivable area', () => {
    expect(OUT_RESET_MS).toBe(500);
    const m = runMonitor(() => OUT_OF_BOUNDS);
    vi.advanceTimersByTime(400);
    expect(m.events).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(m.events).toEqual([{ atMs: 500, verdict: 'resetOutOfBounds' }]);
    m.stop();
  });

  it('returning inside the drivable area before half a second cancels the count', () => {
    // Out for four frames (400 ms), back in, then out again for three frames: no reset.
    const m = runMonitor((t) => (t >= 1000 && t < 1400 ? OUT_OF_BOUNDS : UPRIGHT));
    vi.advanceTimersByTime(5000);
    expect(m.events).toEqual([]);
    m.stop();
  });
});
