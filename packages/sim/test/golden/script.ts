// The scripted ten-minute playthrough of the dev start (task 38.4). Fixed choices, no randomness:
// the recorded Command_Log (golden-playthrough.json) is the product; this script only exists so
// `npm run golden:record` can produce a new one on purpose.
import type { ScheduledChoice } from '../helpers';

export const GOLDEN_SEED = 20260;
export const GOLDEN_TICKS = 6000; // ten Game_Minutes at 10 Ticks per second

export function goldenSchedule(): ScheduledChoice[] {
  const s: ScheduledChoice[] = [];
  const at = (atTick: number, choice: ScheduledChoice['choice']): void => void s.push({ atTick, choice });
  // Staffing and prices
  for (let i = 0; i < 3; i++) at(10 + i * 40, { k: 'hire' });
  at(60, { k: 'assign', h: 0, s: 0 });
  at(100, { k: 'assign', h: 1, s: 1 });
  at(140, { k: 'assign', h: 2, s: 2 });
  at(200, { k: 'price', p: 450 });
  at(900, { k: 'price', p: 650 });
  at(2600, { k: 'price', p: 500 });
  // Supply: a manual order, auto-reorder and a route
  at(220, { k: 'order', q: 20 });
  at(240, { k: 'autoReorder', on: true, t: 30 });
  at(260, { k: 'route', swap: false });
  at(1800, { k: 'route', swap: true });
  at(2200, { k: 'route', swap: false });
  // The CEO walks (one move per Tick: a compressible run), enters and leaves the Pub
  for (let t = 300; t < 360; t++) at(t, { k: 'move', dx: 0.5, dz: 0.25 });
  at(361, { k: 'enter' });
  at(400, { k: 'exit' });
  for (let t = 410; t < 470; t++) at(t, { k: 'move', dx: -0.4, dz: 0.1 });
  at(3000, { k: 'ui' });
  // Manual driving with a pose per Tick, loads and unloads
  at(3100, { k: 'drive' });
  for (let t = 3101; t < 3250; t++) at(t, { k: 'manualPose', dx: 0.05, dz: 0.02, speed: 0.2 });
  at(3250, { k: 'manualLoad' });
  at(3260, { k: 'manualUnload' });
  at(3270, { k: 'endDrive' });
  at(3300, { k: 'resume' });
  // A rejected Command is part of the record too
  at(3400, { k: 'bogus' });
  at(3500, { k: 'fire', h: 2 });
  return s.sort((a, b) => a.atTick - b.atTick);
}