// CEO Commands (Requirement 14): walking, entering and leaving Businesses.
import type { TickContext } from '../core/context';
import { dist2d } from '../core/math';
import type { Command, Rejection } from '../commands/types';
import { PLAYER } from '../state/types';
import { entrance, isBusinessInUnlockedDistrict, plotInfo } from '../world/geometry';

export function handleCeoMove(ctx: TickContext, cmd: Extract<Command, { type: 'ceoMove' }>): Rejection | null {
  const ceo = ctx.state.ceo;
  if (ceo.drivingVehicleId) return null; // driving uses manualVehicleUpdate
  if (!Number.isFinite(cmd.dx) || !Number.isFinite(cmd.dz)) return { reason: 'not_allowed' };
  let dx = cmd.dx;
  let dz = cmd.dz;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 1) {
    dx /= len;
    dz /= len;
  }
  const step = ctx.cfg.ceoWalkingSpeed * ctx.dt;
  const cache = ctx.paths();
  const nx = ceo.x + dx * step;
  const nz = ceo.z + dz * step;
  // The CEO walks freely on walkable ground; entering/leaving a Business is now proximity-based
  // (handled by ceoProximitySystem), so there is no separate "inside" movement mode.
  if (cache.walkable(nx, nz)) {
    ceo.x = nx;
    ceo.z = nz;
  } else if (cache.walkable(nx, ceo.z)) ceo.x = nx;
  else if (cache.walkable(ceo.x, nz)) ceo.z = nz;
  return null;
}

/**
 * Auto-enter/leave: the CEO is "inside" the nearest owned Business while standing within its
 * entrance range, and leaves automatically when walking away. No Enter/Leave command is needed;
 * the renderer removes the roof while inside and the UI opens the Business panel on entry (14.3).
 */
export function ceoProximitySystem(ctx: TickContext): void {
  const ceo = ctx.state.ceo;
  if (ceo.drivingVehicleId) {
    if (ceo.insideBusinessId) ceo.insideBusinessId = null;
    return;
  }
  const enterRange = ctx.cfg.interactionRange;
  const leaveRange = ctx.cfg.interactionRange * 1.5; // hysteresis so the edge does not flicker
  let nearestId: string | null = null;
  let nearestD = Infinity;
  for (const b of Object.values(ctx.state.businesses)) {
    if (b.owner !== PLAYER) continue;
    if (!isBusinessInUnlockedDistrict(ctx.reg, ctx.state, b)) continue;
    const door = entrance(ctx.reg, b.plotId);
    const d = dist2d(ceo.x, ceo.z, door.x, door.z);
    if (d < nearestD) {
      nearestD = d;
      nearestId = b.id;
    }
  }
  if (ceo.insideBusinessId) {
    // Stay inside until the CEO walks clearly away from that Business's door.
    const cur = ctx.state.businesses[ceo.insideBusinessId];
    if (!cur || cur.owner !== PLAYER) {
      ceo.insideBusinessId = null;
      return;
    }
    const door = entrance(ctx.reg, cur.plotId);
    if (dist2d(ceo.x, ceo.z, door.x, door.z) > leaveRange) ceo.insideBusinessId = null;
    return;
  }
  if (nearestId && nearestD <= enterRange) ceo.insideBusinessId = nearestId;
}

export function handleCeoEnter(ctx: TickContext, cmd: Extract<Command, { type: 'ceoEnter' }>): Rejection | null {
  const ceo = ctx.state.ceo;
  const b = ctx.state.businesses[cmd.businessId];
  if (!b) return { reason: 'unknown_entity' };
  if (b.owner !== PLAYER) return { reason: 'not_owner' };
  if (!isBusinessInUnlockedDistrict(ctx.reg, ctx.state, b)) return { reason: 'district_locked' };
  if (ceo.drivingVehicleId) return { reason: 'not_allowed' };
  const door = entrance(ctx.reg, b.plotId);
  if (dist2d(ceo.x, ceo.z, door.x, door.z) > ctx.cfg.interactionRange + 1) return { reason: 'not_in_range' };
  const p = plotInfo(ctx.reg, b.plotId).def;
  ceo.insideBusinessId = b.id;
  ceo.x = door.x;
  ceo.z = door.z + (door.z > p.z ? -1.5 : 1.5);
  return null;
}

export function handleCeoExit(ctx: TickContext): Rejection | null {
  const ceo = ctx.state.ceo;
  if (!ceo.insideBusinessId) return { reason: 'not_allowed' };
  const b = ctx.state.businesses[ceo.insideBusinessId];
  ceo.insideBusinessId = null;
  if (b) {
    const door = entrance(ctx.reg, b.plotId);
    const p = plotInfo(ctx.reg, b.plotId).def;
    ceo.x = door.x;
    ceo.z = door.z + (door.z > p.z ? 1.2 : -1.2);
  }
  return null;
}
