// Game-time formatting for the phone (ceo-phone 1.2, 1.10). There is no clock and no days (D5):
// the status bar shows elapsed game time and deadlines show remaining game time. Pure.

/** "1h 23m" for an hour or more, else "12m 05s". Uses whole game seconds. */
export function formatElapsed(ticks: number, ticksPerSecond: number): string {
  const s = Math.max(0, Math.floor(ticks / ticksPerSecond));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, '0')}s`;
}

/** Remaining game time until a Tick, e.g. "3m 40s" (never negative). */
export function formatRemaining(untilTick: number, nowTick: number, ticksPerSecond: number): string {
  return formatElapsed(Math.max(0, untilTick - nowTick), ticksPerSecond);
}
