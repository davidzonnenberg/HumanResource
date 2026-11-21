// Dev scene flags for the procedural town: `?dev=1&town=roads` (T4, every road at once) and `?dev=1&town=full` (T5/T6,
// buildings, trees and quality presets). A dev build also accepts `?town=...` without `dev=1`.
import { devModeFromEnvironment } from './devMode';

export type TownDevKind = 'roads' | 'full';

export function townDevRequested(search: string, isDevBuild: boolean): TownDevKind | null {
  const v = new URLSearchParams(search).get('town');
  if (v !== 'roads' && v !== 'full') return null;
  return devModeFromEnvironment(search, isDevBuild) ? v : null;
}
