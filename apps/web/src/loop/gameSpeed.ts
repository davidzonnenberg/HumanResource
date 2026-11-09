// Game_Speed rules (Requirement 47). Speed lives in the web session only, never in SimState.
export type GameSpeed = 1 | 2 | 4;
export const ALL_SPEEDS: readonly GameSpeed[] = [1, 2, 4];

/** [1] until the game_speed reveal fired or Dev_Mode is on, then all speeds (47.4, 47.5). */
export function availableSpeeds(gameSpeedRevealed: boolean, devMode: boolean): readonly GameSpeed[] {
  return gameSpeedRevealed || devMode ? ALL_SPEEDS : [1];
}

export function stepSpeed(current: GameSpeed, dir: 1 | -1, available: readonly GameSpeed[]): GameSpeed {
  const i = available.indexOf(current);
  const j = Math.max(0, Math.min(available.length - 1, (i < 0 ? 0 : i) + dir));
  return available[j] ?? 1;
}

/** Manual driving always runs at 1x because physics steps in real time (47.11). */
export function effectiveSpeed(selected: GameSpeed, manualDriving: boolean): GameSpeed {
  return manualDriving ? 1 : selected;
}
