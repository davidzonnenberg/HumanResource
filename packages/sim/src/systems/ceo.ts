// CEO Commands (Requirement 14): walking, entering and leaving Businesses.
import type { TickContext } from '../core/context';
import { clamp, dist2d } from '../core/math';
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
  if (ceo.insideBusinessId) {
    const b = ctx.state.businesses[ceo.insideBusinessId];
    if (!b) return null;
    const p = plotInfo(ctx.reg, b.plotId).def;
    ceo.x = clamp(ceo.x + dx * step, p.x - p.w / 2 + 0.6, p.x + p.w / 2 - 0.6);
    ceo.z = clamp(ceo.z + dz * step, p.z - p.d / 2 + 0.6, p.z + p.d / 2 - 0.6);
    return null;
  }
  const cache = ctx.paths();
  const nx = ceo.x + dx * step;
  const nz = ceo.z + dz * step;
  if (cache.walkable(nx, nz)) {
    ceo.x = nx;
    ceo.z = nz;
  } else if (cache.walkable(nx, ceo.z)) ceo.x = nx;
  else if (cache.walkable(ceo.x, nz)) ceo.z = nz;
  return null;
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
