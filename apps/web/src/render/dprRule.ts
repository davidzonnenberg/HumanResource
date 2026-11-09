// Adaptive render resolution (41.5, 41.6): pure rule + R3F component.
export interface DprRule {
  min: number; // fraction of device DPR, e.g. 0.75
  max: number; // 1
  step: number; // 0.05
  lowFps: number; // 30
  highFps: number; // 36
  cooldownMs: number; // 3000
}

export const DEFAULT_DPR_RULE: DprRule = { min: 0.75, max: 1, step: 0.05, lowFps: 30, highFps: 36, cooldownMs: 3000 };

/** Returns the next DPR factor given the rolling FPS. Always stays within [min, max]. */
export function nextDprFactor(current: number, fps: number, msSinceChange: number, rule: DprRule = DEFAULT_DPR_RULE): number {
  if (msSinceChange < rule.cooldownMs) return clamp(current, rule);
  if (fps < rule.lowFps) return clamp(round(current - rule.step), rule);
  if (fps >= rule.highFps) return clamp(round(current + rule.step), rule);
  return clamp(current, rule);
}

const round = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, r: DprRule) => Math.min(r.max, Math.max(r.min, v));
