// Street layout with Frontage_Slots (Requirement 54). A street is a straight line along an axis of a
// District (from one road node to another) and a side. Its slots stand shoulder to shoulder along it,
// each `filler`, `business` or `plot`, each with a width. Everything the rest of the game needs is
// derived from that one list: the Plots, the access node, the Unloading_Zone on the road next to the
// slot, the hitbox and the walkable cut-out. Pure arithmetic (+ - * / and comparisons), so results are
// identical on every JavaScript engine.
import type { DefinitionError } from './registry';
import type { DistrictDef, FrontageSlot, PlotDef, StreetDef } from './schemas';

export interface Rect2 {
  x: number;
  z: number;
  w: number;
  d: number;
}
export interface SlotInfo {
  id: string;
  districtId: string;
  streetId: string;
  kind: FrontageSlot['kind'];
  modelKey: string | null;
  /** The Plot of a `business` or `plot` slot. */
  plotId: string | null;
  /** The slot's footprint (centre, width along x, depth along z). */
  rect: Rect2;
  /** Point of the street line in front of the slot centre (the door side). */
  front: { x: number; z: number };
  /** Unit vector from the slot towards the street. */
  facing: { x: number; z: number };
  /** Axis the street runs along. */
  axis: 'x' | 'z';
  /** Solid box of the slot (`filler` and `business`); a `plot` slot is open ground until something is built. */
  hitbox: Rect2 | null;
}
export interface DerivedFrontage {
  plots: PlotDef[];
  slots: SlotInfo[];
}

/** Road surface half width plus sidewalk (ROAD_W / 2 + SIDEWALK_W in the renderer; a web test keeps them equal). */
export const ROAD_CLEARANCE = 4.5;
export const DEFAULT_ZONE = { w: 12, d: 6, offset: 2 } as const;

export const slotPlotId = (s: FrontageSlot): string => ('plotId' in s && s.plotId !== undefined ? s.plotId : s.id);

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Derives the Plots and slot data of every street of a District. Errors are appended, never thrown. */
export function deriveFrontage(districtId: string, d: DistrictDef, errors: DefinitionError[]): DerivedFrontage {
  const out: DerivedFrontage = { plots: [], slots: [] };
  const where = `maps/districts/${districtId}`;
  const err = (field: string, message: string): void => void errors.push({ definition: where, field, message: `District "${districtId}": ${message}` });
  const seenStreets = new Set<string>();
  for (const street of d.streets ?? []) {
    if (seenStreets.has(street.id)) err(`streets.${street.id}`, `duplicate street id "${street.id}"`);
    seenStreets.add(street.id);
    deriveStreet(districtId, d, street, out, err);
  }
  return out;
}

function deriveStreet(
  districtId: string,
  d: DistrictDef,
  street: StreetDef,
  out: DerivedFrontage,
  err: (field: string, message: string) => void,
): void {
  const at = (slotId: string): string => `streets.${street.id}.slots.${slotId}`;
  const a = d.nodes.find((n) => n.id === street.from);
  const b = d.nodes.find((n) => n.id === street.to);
  if (!a || !b) {
    err(`streets.${street.id}`, `street "${street.id}" names an unknown node "${!a ? street.from : street.to}"`);
    return;
  }
  const dx = sign(b.x - a.x);
  const dz = sign(b.z - a.z);
  if ((dx === 0) === (dz === 0)) {
    err(`streets.${street.id}`, `street "${street.id}" must run along the x or the z axis (nodes "${a.id}" and "${b.id}")`);
    return;
  }
  const axis: 'x' | 'z' = dx !== 0 ? 'x' : 'z';
  const length = axis === 'x' ? Math.abs(b.x - a.x) : Math.abs(b.z - a.z);
  // Left of the direction of travel is (dz, -dx), right is (-dz, dx) (top-down map, x right, z towards the viewer).
  const nx = street.side === 'left' ? dz : -dz;
  const nz = street.side === 'left' ? -dx : dx;
  let along = street.start ?? 0;
  const ids = new Set<string>();
  for (const slot of street.slots) {
    if (ids.has(slot.id)) err(at(slot.id), `slot "${slot.id}" appears twice on street "${street.id}"`);
    ids.add(slot.id);
    const solid = slot.kind !== 'plot';
    const depth = slot.depth ?? street.depth;
    const setback = slot.setback ?? street.setback;
    const centre = along + slot.width / 2;
    along += slot.width;
    if (along > length + 1e-9) err(at(slot.id), `slot "${slot.id}" runs past the end of street "${street.id}" (${along} > ${length})`);
    if (setback < ROAD_CLEARANCE) err(at(slot.id), `slot "${slot.id}" starts ${setback} from the street line, inside the road and sidewalk (needs ${ROAD_CLEARANCE})`);
    if (slot.kind !== 'filler' && axis !== 'x') err(at(slot.id), `slot "${slot.id}" is a ${slot.kind} slot on a street along the z axis (its door must face the x axis side; only filler slots may stand there)`);
    const px = a.x + dx * centre + 0;
    const pz = a.z + dz * centre + 0;
    const r = setback + depth / 2;
    const cx = px + nx * r + 0;
    const cz = pz + nz * r + 0;
    const rect: Rect2 = axis === 'x' ? { x: cx, z: cz, w: slot.width, d: depth } : { x: cx, z: cz, w: depth, d: slot.width };
    const plotId = slot.kind === 'filler' ? null : slotPlotId(slot);
    out.slots.push({
      id: slot.id,
      districtId,
      streetId: street.id,
      kind: slot.kind,
      modelKey: slot.modelKey ?? null,
      plotId,
      rect,
      front: { x: px, z: pz },
      facing: { x: -nx + 0, z: -nz + 0 },
      axis,
      hitbox: solid ? rect : null,
    });
    if (slot.kind === 'filler' || plotId === null || axis !== 'x') continue;
    // Plot: nearest road node as access node, Unloading_Zone on the road next to the slot.
    let access = d.nodes[0];
    let best = Number.POSITIVE_INFINITY;
    for (const n of d.nodes) {
      const dist2 = (n.x - px) * (n.x - px) + (n.z - pz) * (n.z - pz);
      if (dist2 < best) {
        best = dist2;
        access = n;
      }
    }
    const zone = slot.unloadingZone ?? {};
    const zoneW = zone.w ?? Math.min(DEFAULT_ZONE.w, slot.width);
    const zoneD = zone.d ?? DEFAULT_ZONE.d;
    const zoneOffset = zone.offset ?? DEFAULT_ZONE.offset;
    out.plots.push({
      id: plotId,
      x: cx,
      z: cz,
      w: slot.width,
      d: depth,
      rotation: 0,
      tags: [...(slot.tags ?? street.tags ?? [])],
      accessNode: (access as { id: string }).id,
      unloadingZone: { x: px + 0, z: pz + nz * zoneOffset + 0, w: zoneW, d: zoneD },
      initial: slot.kind === 'business' ? { kind: 'reserved' } : (slot.initial ?? { kind: 'empty' }),
    });
  }
}

const overlaps = (a: Rect2, b: Rect2): boolean =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1e-9 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 1e-9;

/** Slots that overlap another slot, an explicit Plot or a road band. Returns one error text per problem. */
export function frontageConflicts(slots: readonly SlotInfo[], explicit: readonly PlotDef[], roads: readonly { ax: number; az: number; bx: number; bz: number }[]): { slotId: string; message: string }[] {
  const out: { slotId: string; message: string }[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i] as SlotInfo;
    for (let j = i + 1; j < slots.length; j++) {
      const o = slots[j] as SlotInfo;
      if (overlaps(s.rect, o.rect)) out.push({ slotId: s.id, message: `slot "${s.id}" (street "${s.streetId}") overlaps slot "${o.id}" (street "${o.streetId}")` });
    }
    for (const p of explicit) if (overlaps(s.rect, { x: p.x, z: p.z, w: p.w, d: p.d })) out.push({ slotId: s.id, message: `slot "${s.id}" overlaps Plot "${p.id}"` });
    for (const r of roads) {
      const band: Rect2 = {
        x: (r.ax + r.bx) / 2,
        z: (r.az + r.bz) / 2,
        w: Math.abs(r.ax - r.bx) + 2 * ROAD_CLEARANCE,
        d: Math.abs(r.az - r.bz) + 2 * ROAD_CLEARANCE,
      };
      if (overlaps(s.rect, band)) out.push({ slotId: s.id, message: `slot "${s.id}" stands on a road` });
    }
  }
  return out;
}

/** Every corner of the rect inside (or on) the polygon. */
export function rectInsidePolygon(r: Rect2, inside: (x: number, z: number) => boolean): boolean {
  const hx = r.w / 2;
  const hz = r.d / 2;
  return inside(r.x - hx, r.z - hz) && inside(r.x + hx, r.z - hz) && inside(r.x + hx, r.z + hz) && inside(r.x - hx, r.z + hz);
}
