// CEO_Mode <-> Management_View switch with hysteresis (15.3, 15.4) and the manual-driving clamp (15.7).
export type ViewMode = 'ceo' | 'management';

export interface ViewModeConfig {
  modeSwitchThreshold: number;
  hysteresis: number; // fraction, e.g. 0.05
}

export function nextViewMode(mode: ViewMode, distance: number, cfg: ViewModeConfig): ViewMode {
  const t = cfg.modeSwitchThreshold;
  if (mode === 'ceo' && distance > t) return 'management';
  if (mode === 'management' && distance < t * (1 - cfg.hysteresis)) return 'ceo';
  return mode;
}

/** While driving, the camera may not leave the Person/Business bands. */
export function clampDistance(distance: number, dMin: number, dMax: number, driving: boolean, drivingMax: number): number {
  const hi = driving ? Math.min(dMax, drivingMax) : dMax;
  return Math.min(hi, Math.max(dMin, distance));
}
