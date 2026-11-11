// Humans: hire/assign/unassign/fire handlers and the walking system (Requirement 7).
import type { TickContext } from '../core/context';
import { gold } from '../core/context';
import { nextId } from '../core/ids';
import { dist2d } from '../core/math';
import type { Command, Rejection } from '../commands/types';
import { advancePath, buildPath, pathPosition, type Point } from '../logistics/paths';
import { costOf, requireGold } from '../money/gold';
import { drawHumanName } from '../names/names';
import { findSlot } from '../staffing/capacity';
import { barEntryFor } from './lots';
import type { Business, Human, JobSlot, JobSlotRef, Vehicle } from '../state/types';
import { PLAYER } from '../state/types';
import { entrance, isBusinessInUnlockedDistrict, plotCenter, plotInfo } from '../world/geometry';
import { firstPlayerPub, humanPosition } from '../world/queries';

type Holder = { kind: 'business'; b: Business } | { kind: 'vehicle'; v: Vehicle };

function holderOf(ctx: TickContext, ref: JobSlotRef): Holder | null {
  if (ref.kind === 'business') {
    const b = ctx.state.businesses[ref.id];
    return b ? { kind: 'business', b } : null;
  }
  const v = ctx.state.vehicles[ref.id];
  return v ? { kind: 'vehicle', v } : null;
}

const holderObj = (h: Holder): Business | Vehicle => (h.kind === 'business' ? h.b : h.v);

/** Puts an interrupted staff task's drink back on the bar so no Beer disappears silently. */
export function interruptTask(ctx: TickContext, h: Human): void {
  const task = h.task;
  h.task = null;
  if (!task || (task.kind !== 'pour' && task.kind !== 'carry')) return;
  const ref = h.assignment;
  if (!ref || ref.kind !== 'business') return;
  const pub = ctx.state.businesses[ref.id]?.pub;
  if (!pub) return;
  const order = pub.orderQueue.find((o) => o.customerId === task.customerId);
  if (task.kind === 'pour' && order) pub.bar.push(barEntryFor(pub, task.customerId));
  if (task.kind === 'carry') pub.bar.unshift(barEntryFor(pub, task.customerId));
}

/** Clears the Human's current Job_Slot (both link directions) and stops a driven Vehicle (7.12). */
function leaveSlot(ctx: TickContext, h: Human): void {
  const ref = h.assignment;
  if (!ref) return;
  interruptTask(ctx, h);
  const holder = holderOf(ctx, ref);
  if (holder) {
    const slot = findSlot(holderObj(holder), ref.slotId);
    if (slot?.filledBy?.kind === 'human' && slot.filledBy.humanId === h.id) slot.filledBy = null;
    if (holder.kind === 'vehicle' && h.location.kind === 'onVehicle') {
      holder.v.driverOnBoard = false;
      h.location = { kind: 'at', x: holder.v.pose.x, z: holder.v.pose.z, insideBusinessId: null };
    }
  }
  h.assignment = null;
}

function walkTo(ctx: TickContext, h: Human, targetNode: string, finalPoint: Point): void {
  const from = humanPosition(ctx.state, h);
  if (h.location.kind === 'onVehicle') {
    const v = ctx.state.vehicles[h.location.vehicleId];
    if (v) v.driverOnBoard = false;
  }
  const path = buildPath(ctx.paths(), from, targetNode, finalPoint);
  h.location = { kind: 'walking', path };
}

/** Starts the Human's travel to the location of its assigned Job_Slot. */
export function sendToJob(ctx: TickContext, h: Human): void {
  const ref = h.assignment;
  if (!ref) return;
  h.status = 'en_route';
  h.task = null;
  if (ref.kind === 'business') {
    const b = ctx.state.businesses[ref.id];
    if (!b) return;
    if (h.location.kind === 'at' && h.location.insideBusinessId === b.id) {
      h.status = 'working';
      return;
    }
    walkTo(ctx, h, plotInfo(ctx.reg, b.plotId).accessNode, entrance(ctx.reg, b.plotId));
  } else {
    const v = ctx.state.vehicles[ref.id];
    if (!v) return;
    const pos = humanPosition(ctx.state, h);
    if (dist2d(pos.x, pos.z, v.pose.x, v.pose.z) <= ctx.cfg.boardingDistance) {
      board(ctx, h, v);
      return;
    }
    const rp = ctx.paths().nearestRoadPoint(v.pose.x, v.pose.z);
    walkTo(ctx, h, rp ? rp.a : (ctx.paths().nodeIds[0] as string), { x: v.pose.x, z: v.pose.z });
  }
}

function board(ctx: TickContext, h: Human, v: Vehicle): void {
  if (v.control === 'manual') {
    // The Player is driving: wait next to the van.
    h.location = { kind: 'at', x: v.pose.x, z: v.pose.z, insideBusinessId: null };
    h.status = 'working';
    return;
  }
  h.location = { kind: 'onVehicle', vehicleId: v.id };
  v.driverOnBoard = true;
  h.status = 'working';
  ctx.events.push({ type: 'humanArrived', humanId: h.id, owner: h.owner });
}

// ---------------- Handlers ----------------

export function handleHire(ctx: TickContext): Rejection | null {
  const humanDef = ctx.reg.humans.regular ?? Object.values(ctx.reg.humans)[0];
  if (!humanDef) return { reason: 'unknown_entity' };
  const pub = firstPlayerPub(ctx.reg, ctx.state);
  if (!pub) return { reason: 'unknown_entity' };
  const cost = costOf(humanDef.salaryPerMinute * humanDef.hiring.minutes, humanDef.hiring.factor);
  const check = requireGold(ctx.state, PLAYER, cost);
  if (!check.ok) return { reason: check.reason, missingGold: check.missingGold };
  const id = nextId(ctx.state, 'hum');
  const name = drawHumanName(ctx.state, ctx.reg.namePool, PLAYER);
  const c = plotCenter(ctx.reg, pub.plotId);
  ctx.state.humans[id] = {
    id,
    defId: humanDef.id,
    name,
    owner: PLAYER,
    qualifications: [...humanDef.qualifications],
    assignment: null,
    status: 'unassigned',
    location: { kind: 'at', x: c.x, z: c.z, insideBusinessId: pub.id },
    task: null,
    salaryCarry: 0,
  };
  gold(ctx, PLAYER, -cost, 'hiring', id);
  ctx.events.push({ type: 'humanHired', humanId: id, owner: PLAYER });
  return null;
}

export function handleAssign(ctx: TickContext, cmd: Extract<Command, { type: 'assign' }>): Rejection | null {
  const h = ctx.state.humans[cmd.humanId];
  if (!h) return { reason: 'unknown_entity', field: 'humanId' };
  if (h.owner !== PLAYER) return { reason: 'not_owner', field: 'humanId' };
  const holder = holderOf(ctx, cmd.target);
  if (!holder) return { reason: 'unknown_entity', field: 'target' };
  const obj = holderObj(holder);
  if (obj.owner !== PLAYER) return { reason: 'not_owner', field: 'target' };
  if (holder.kind === 'business' && !isBusinessInUnlockedDistrict(ctx.reg, ctx.state, holder.b)) return { reason: 'district_locked' };
  const slot = findSlot(obj, cmd.target.slotId);
  if (!slot) return { reason: 'unknown_entity', field: 'target.slotId' };
  if (h.status === 'occupied') return { reason: 'human_occupied' };
  const job = ctx.reg.jobs[slot.jobId];
  if (!job) return { reason: 'unknown_entity', field: 'target.slotId' };
  if (!job.requiredQualifications.every((q) => h.qualifications.includes(q))) return { reason: 'not_qualified' };
  if (slot.filledBy?.kind === 'headcount') return { reason: 'slot_occupied' };
  if (slot.filledBy?.kind === 'human' && slot.filledBy.humanId === h.id) return null; // already there

  leaveSlot(ctx, h); // removed from the previous Job_Slot at this boundary (7.8)
  displaceOccupant(ctx, slot); // occupant becomes unassigned at the Job location (7.7)
  slot.filledBy = { kind: 'human', humanId: h.id };
  h.assignment = { ...cmd.target };
  sendToJob(ctx, h); // travel from the current (possibly mid-path) position (7.9)
  return null;
}

function displaceOccupant(ctx: TickContext, slot: JobSlot): void {
  if (slot.filledBy?.kind !== 'human') return;
  const other = ctx.state.humans[slot.filledBy.humanId];
  if (other) {
    leaveSlot(ctx, other);
    const p = humanPosition(ctx.state, other);
    const inside = other.location.kind === 'at' ? other.location.insideBusinessId : null;
    other.location = { kind: 'at', x: p.x, z: p.z, insideBusinessId: inside };
    other.status = 'unassigned';
  }
  slot.filledBy = null;
}

export function handleUnassign(ctx: TickContext, cmd: Extract<Command, { type: 'unassign' }>): Rejection | null {
  const h = ctx.state.humans[cmd.humanId];
  if (!h) return { reason: 'unknown_entity', field: 'humanId' };
  if (h.owner !== PLAYER) return { reason: 'not_owner' };
  if (h.status === 'occupied') return { reason: 'human_occupied' };
  leaveSlot(ctx, h);
  const p = humanPosition(ctx.state, h);
  const inside = h.location.kind === 'at' ? h.location.insideBusinessId : null;
  h.location = { kind: 'at', x: p.x, z: p.z, insideBusinessId: inside };
  h.status = 'unassigned';
  return null;
}

export function handleFire(ctx: TickContext, cmd: Extract<Command, { type: 'fire' }>): Rejection | null {
  const h = ctx.state.humans[cmd.humanId];
  if (!h) return { reason: 'unknown_entity', field: 'humanId' };
  if (h.owner !== PLAYER) return { reason: 'not_owner' };
  if (h.status === 'occupied') return { reason: 'human_occupied' };
  const def = ctx.reg.humans[h.defId];
  leaveSlot(ctx, h);
  // A Human driving the van the CEO took over may still hold a slot link; leaveSlot covered it.
  Reflect.deleteProperty(ctx.state.humans, h.id);
  gold(ctx, PLAYER, -(def?.severance ?? 0), 'severance', h.id); // Mandatory_Expense (7.11)
  ctx.events.push({ type: 'humanFired', humanId: h.id, owner: PLAYER });
  return null;
}

// ---------------- System ----------------

/** Walking along paths, arrival at Job locations, boarding Vehicles (7.4–7.9, 7.15). */
export function humansSystem(ctx: TickContext): void {
  for (const h of Object.values(ctx.state.humans)) {
    if (h.location.kind !== 'walking') continue;
    const def = ctx.reg.humans[h.defId];
    const speed = def?.walkingSpeed ?? 3;
    const done = advancePath(h.location.path, speed * ctx.dt);
    if (!done) continue;
    const end = pathPosition(h.location.path);
    const ref = h.assignment;
    if (!ref) {
      h.location = { kind: 'at', x: end.x, z: end.z, insideBusinessId: null };
      continue;
    }
    if (ref.kind === 'business') {
      const b = ctx.state.businesses[ref.id];
      const c = b ? plotCenter(ctx.reg, b.plotId) : end;
      h.location = { kind: 'at', x: c.x, z: c.z, insideBusinessId: b?.id ?? null };
      h.status = 'working';
      ctx.events.push({ type: 'humanArrived', humanId: h.id, owner: h.owner });
    } else {
      const v = ctx.state.vehicles[ref.id];
      if (!v) {
        h.location = { kind: 'at', x: end.x, z: end.z, insideBusinessId: null };
        continue;
      }
      h.location = { kind: 'at', x: end.x, z: end.z, insideBusinessId: null };
      if (dist2d(end.x, end.z, v.pose.x, v.pose.z) <= ctx.cfg.boardingDistance) board(ctx, h, v);
      else sendToJob(ctx, h); // the Vehicle moved; follow it
    }
  }
}
