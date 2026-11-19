// Frontage_Slots on screen (Requirement 54, docs/buildings.md). Pure, so it can be tested without React.
// The sim derives every slot's rectangle, door side and hitbox (`reg.world.slots`); this turns the
// `filler` slots into what is drawn:
//  - a filler with a `modelKey` (the town hall) is drawn as a Landmark, fitted to its slot width;
//  - a filler without one is a generated house of exactly the slot width, front on the slot's front line.
import type { DefinitionRegistry } from '@hr/sim';
import { DISTRICTS } from './procedural/buildings/archetypes';
import { hashSeed, randomDutchHouse } from './procedural/buildings/randomBuilding';
import type { PlacedHouse } from './procedural/buildings/streets';
import type { LandmarkRect } from './procedural/buildings/streetsLayout';
import type { LandmarkDef } from './World';

const landmarkCache = new WeakMap<DefinitionRegistry, LandmarkDef[]>();
const houseCache = new WeakMap<DefinitionRegistry, PlacedHouse[]>();

/** Filler slots that name a model: drawn like Landmarks, with the slot as the box the model is fitted into. */
export function slotLandmarks(reg: DefinitionRegistry): LandmarkDef[] {
  const hit = landmarkCache.get(reg);
  if (hit) return hit;
  const list: LandmarkDef[] = [];
  for (const s of Object.values(reg.world.slots)) {
    if (s.kind !== 'filler' || s.modelKey === null) continue;
    list.push({ id: s.id, district: s.districtId, modelKey: s.modelKey, x: s.rect.x, z: s.rect.z, w: s.rect.w, d: s.rect.d, facing: s.facing.z >= 0 ? 1 : -1 });
  }
  landmarkCache.set(reg, list);
  return list;
}

/** Rectangles of the filler slots, as blockers for the generated rows of houses (they must not overlap). */
export function slotBlockers(reg: DefinitionRegistry): LandmarkRect[] {
  return Object.values(reg.world.slots)
    .filter((s) => s.kind === 'filler')
    .map((s) => ({ district: s.districtId, x: s.rect.x, z: s.rect.z, w: s.rect.w, d: s.rect.d }));
}

/** The generated houses of filler slots without a model: stable ids and seeds, width = slot width. */
export function layoutSlotHouses(reg: DefinitionRegistry): PlacedHouse[] {
  const hit = houseCache.get(reg);
  if (hit) return hit;
  const out: PlacedHouse[] = [];
  for (const s of Object.values(reg.world.slots)) {
    if (s.kind !== 'filler' || s.modelKey !== null) continue;
    const width = s.axis === 'x' ? s.rect.w : s.rect.d;
    const slotDepth = s.axis === 'x' ? s.rect.d : s.rect.w;
    const style = s.districtId in DISTRICTS ? s.districtId : 'old_town';
    const base = randomDutchHouse(hashSeed(`${s.districtId}:${s.id}`), { district: style, width });
    const recipe = base.depth > slotDepth ? { ...base, depth: slotDepth } : base;
    // The facade stays on the slot's front line; a shallower house leaves its back part of the slot empty.
    const shift = (slotDepth - recipe.depth) / 2;
    const id = `slot:${s.id}`;
    out.push({ id, gapId: id, recipe, x: s.rect.x - s.facing.x * shift, z: s.rect.z - s.facing.z * shift, heading: Math.atan2(s.facing.x, s.facing.z) });
  }
  houseCache.set(reg, out);
  return out;
}