// Palette and camera config from content (20.1). Owner colours: player, competitors, npc.
import { cameraConfig, themeConfig } from '@hr/content';

export const theme = themeConfig;
export const camCfg = cameraConfig;

export function ownerColor(owner: string, colorToken?: string): string {
  const owners = theme.owners as Record<string, string>;
  if (owner === 'player') return owners.player ?? '#3a86ff';
  if (owner === 'npc') return owners.npc ?? '#8d99ae';
  return owners[colorToken ?? 'rival'] ?? owners.rival ?? '#ef476f';
}

export const palette = theme.palette;

const DEG = Math.PI / 180;
export const YAW = camCfg.yawDeg * DEG;
/** Fixed screen-aligned ground axes (15.12): computed once, the yaw never changes. */
export const SCREEN_UP = { x: -Math.sin(YAW), z: -Math.cos(YAW) };
export const SCREEN_RIGHT = { x: Math.cos(YAW), z: -Math.sin(YAW) };

/** Screen-space stick (x right, y up) -> world movement vector. */
export function screenToWorld(sx: number, sy: number): { x: number; z: number } {
  return { x: SCREEN_RIGHT.x * sx + SCREEN_UP.x * sy, z: SCREEN_RIGHT.z * sx + SCREEN_UP.z * sy };
}

export function bandOf(distance: number): string {
  for (const b of camCfg.bands) if (distance <= b.max) return b.id;
  return camCfg.bands[camCfg.bands.length - 1]?.id ?? 'city';
}

export function tiltFor(distance: number): number {
  const t = Math.min(1, Math.max(0, (distance - camCfg.dMin) / (camCfg.dMax - camCfg.dMin)));
  return (camCfg.tiltNearDeg + (camCfg.tiltFarDeg - camCfg.tiltNearDeg) * t) * DEG;
}

export const businessBandMax = camCfg.bands.find((b) => b.id === 'business')?.max ?? 30;
