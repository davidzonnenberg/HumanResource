// CEO Commands (Requirement 14): walking, entering and leaving Businesses.
// Entering is explicit (Context_Action "Enter" / E at the door), Stardew-style: the CEO is put
// just inside the door and the renderer shows only that interior. Leaving is "Leave" at the
// interior door. Building footprints and interior walls block walking.
import type { TickContext } from '../core/context';
import { dist2d } from '../core/math';
import type { Command, Rejection } from '../commands/types';
import type { DefinitionRegistry } from '../defs/registry';
import { PLAYER } from '../state/types';
import { entrance, isBusinessInUnlockedDistrict, plotInfo } from '../world/geometry';

/** Interior walking area of a Business: the plot rectangle minus walls and the CEO radius. */
export function interiorBounds(reg: DefinitionRegistry, plotId: string, inset: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const p = plotInfo(reg, plotId).def;
  const hw = Math.max(0, p.w / 2 - inset);
  const hd = Math.max(0, p.d / 2 - inset);
  return { minX: p.x - hw, maxX: p.x + hw, minZ: p.z - hd, maxZ: p.z + hd };
}

/** How far a client-supplied exterior door point may be from the plot entrance. */
const EXIT_POINT_SLACK = 8;

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
  const nx = ceo.x + dx * step;
  const nz = ceo.z + dz * step;
  const r = ctx.cfg.ceoRadius;

  // Inside: walls (including the front wall with its door) are solid; clamp to the room.
  const inside = ceo.insideBusinessId ? ctx.state.businesses[ceo.insideBusinessId] : undefined;
  if (inside) {
    const box = interiorBounds(ctx.reg, inside.plotId, ctx.cfg.interiorWallThickness + r);
    ceo.x = Math.min(box.maxX, Math.max(box.minX, nx));
    ceo.z = Math.min(box.maxZ, Math.max(box.minZ, nz));
    return null;
  }

  // Outside: walkable ground. Building hitboxes come from the rendered models (their exact,
  // scaled size), so the web input layer shapes the move before it is submitted (input/walkCollision).
  const cache = ctx.paths();
  const free = (x: number, z: number): boolean => cache.walkable(x, z);
  if (free(nx, nz)) {
    ceo.x = nx;
    ceo.z = nz;
  } else if (free(nx, ceo.z)) ceo.x = nx;
  else if (free(ceo.x, nz)) ceo.z = nz;
  return null;
}

/** Keeps insideBusinessId valid: cleared while driving or when the Business is gone or sold. */
export function ceoProximitySystem(ctx: TickContext): void {
  const ceo = ctx.state.ceo;
  if (!ceo.insideBusinessId) return;
  const cur = ctx.state.businesses[ceo.insideBusinessId];
  if (ceo.drivingVehicleId || !cur || cur.owner !== PLAYER) ceo.insideBusinessId = null;
}

export function handleCeoEnter(ctx: TickContext, cmd: Extract<Command, { type: 'ceoEnter' }>): Rejection | null {
  const ceo = ctx.state.ceo;
  const b = ctx.state.businesses[cmd.businessId];
  if (!b) return { reason: 'unknown_entity' };
  if (b.owner !== PLAYER) return { reason: 'not_owner' };
  if (!isBusinessInUnlockedDistrict(ctx.reg, ctx.state, b)) return { reason: 'district_locked' };
  if (ceo.drivingVehicleId || ceo.insideBusinessId) return { reason: 'not_allowed' };
  const door = entrance(ctx.reg, b.plotId);
  // The drawn model's front door may sit in front of the plot edge; accept a plausible hint.
  const hint = cmd.doorX !== undefined && cmd.doorZ !== undefined && Number.isFinite(cmd.doorX) && Number.isFinite(cmd.doorZ) && dist2d(cmd.doorX, cmd.doorZ, door.x, door.z) <= EXIT_POINT_SLACK ? { x: cmd.doorX, z: cmd.doorZ } : door;
  if (dist2d(ceo.x, ceo.z, hint.x, hint.z) > ctx.cfg.interactionRange + 1) return { reason: 'not_in_range' };
  const p = plotInfo(ctx.reg, b.plotId).def;
  const inward = door.z > p.z ? -1 : 1;
  ceo.insideBusinessId = b.id;
  ceo.x = door.x;
  ceo.z = door.z + inward * (ctx.cfg.interiorWallThickness + ctx.cfg.ceoRadius + 0.6);
  return null;
}

export function handleCeoExit(ctx: TickContext, cmd: Extract<Command, { type: 'ceoExit' }>): Rejection | null {
  const ceo = ctx.state.ceo;
  if (!ceo.insideBusinessId) return { reason: 'not_allowed' };
  const b = ctx.state.businesses[ceo.insideBusinessId];
  ceo.insideBusinessId = null;
  if (b) {
    const door = entrance(ctx.reg, b.plotId);
    const p = plotInfo(ctx.reg, b.plotId).def;
    const outward = door.z > p.z ? 1 : -1;
    // The client knows where the model's front door is; accept it when it is plausible.
    const hint = cmd.x !== undefined && cmd.z !== undefined && Number.isFinite(cmd.x) && Number.isFinite(cmd.z) ? { x: cmd.x, z: cmd.z } : null;
    if (hint && dist2d(hint.x, hint.z, door.x, door.z) <= EXIT_POINT_SLACK && ctx.paths().walkable(hint.x, hint.z)) {
      ceo.x = hint.x;
      ceo.z = hint.z;
    } else {
      ceo.x = door.x;
      ceo.z = door.z + outward * (ctx.cfg.ceoRadius + 0.8);
    }
  }
  return null;
}
