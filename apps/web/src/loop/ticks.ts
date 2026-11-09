// Pure Tick scheduling (2.2, 2.3, 47.9–47.11). Extracted for property testing.
export const TICK_MS = 100;
export const BASE_MAX_TICKS_PER_FRAME = 10;

export interface TickSchedule {
  run: number; // Ticks to run this frame
  acc: number; // accumulator after running
}

/**
 * Adds dt × speed to the accumulator and returns how many Ticks to run. At most 10 × speed Ticks
 * run per frame; any larger backlog is discarded (keeping only the sub-Tick remainder).
 */
export function ticksToRun(acc: number, dtMs: number, speed: number, tickMs = TICK_MS, baseCap = BASE_MAX_TICKS_PER_FRAME): TickSchedule {
  const next = acc + Math.max(0, dtMs) * speed;
  const due = Math.floor(next / tickMs);
  const cap = baseCap * speed;
  const run = Math.min(due, cap);
  return { run, acc: due > cap ? next % tickMs : next - run * tickMs };
}
