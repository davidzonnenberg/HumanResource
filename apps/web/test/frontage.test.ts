// Frontage_Slots on screen (tasks 39.3, 39.5; Requirement 54.2, 54.8).
import { fillerStreets, landmarks } from '@hr/content';
import { describe, expect, it } from 'vitest';
import { ROAD_W, SIDEWALK_W } from '../src/render/roadConstants';
import { layoutSlotHouses, slotBlockers, slotLandmarks } from '../src/render/frontage';
import { blockersFor, layoutFillerStreets, type LandmarkRect } from '../src/render/procedural/buildings/streetsLayout';
import { FILLER_STREETS } from '../src/render/procedural/buildings/streetsSchema';
import { houseFootprint, type Rect } from '../src/render/procedural/buildings/streets';
import { ROAD_CLEARANCE } from '@hr/sim';
import { freshRegistry } from './phoneTestHelpers';

const reg = freshRegistry().sim.reg;
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX - 1e-6 && a.maxX > b.minX + 1e-6 && a.minZ < b.maxZ - 1e-6 && a.maxZ > b.minZ + 1e-6;

describe('frontage slots on screen', () => {
  it('the sim clearance equals the road and sidewalk the renderer draws', () => {
    expect(ROAD_CLEARANCE).toBe(ROAD_W / 2 + SIDEWALK_W);
  });
  it('the town hall is a Landmark taken from its double-width slot; landmarks.json holds only off-street ones', () => {
    expect(landmarks).toEqual([]);
    const hall = slotLandmarks(reg).find((l) => l.id === 'city_hall');
    expect(hall).toEqual({ id: 'city_hall', district: 'old_town', modelKey: 'building_town_hall', x: 0, z: -43, w: 20, d: 12, facing: 1 });
  });
  it('every model-less filler slot gets one generated house of exactly its width, deterministically', () => {
    const houses = layoutSlotHouses(reg);
    const fillers = Object.values(reg.world.slots).filter((s) => s.kind === 'filler' && s.modelKey === null);
    expect(houses).toHaveLength(fillers.length);
    expect(fillers.length).toBeGreaterThan(10);
    for (const s of fillers) {
      const h = houses.find((x) => x.id === `slot:${s.id}`);
      expect(h?.recipe.width).toBeCloseTo(s.axis === 'x' ? s.rect.w : s.rect.d, 9);
    }
    expect(JSON.stringify(layoutSlotHouses(reg))).toBe(JSON.stringify(houses));
  });
  it('slot houses stand inside their slot, face the street, and keep the curb strip free', () => {
    for (const h of layoutSlotHouses(reg)) {
      const s = reg.world.slots[h.id.slice(5)]!;
      const f = houseFootprint(h);
      expect(f.minX).toBeGreaterThanOrEqual(s.rect.x - s.rect.w / 2 - 1e-6);
      expect(f.maxX).toBeLessThanOrEqual(s.rect.x + s.rect.w / 2 + 1e-6);
      expect(f.minZ).toBeGreaterThanOrEqual(s.rect.z - s.rect.d / 2 - 1e-6);
      expect(f.maxZ).toBeLessThanOrEqual(s.rect.z + s.rect.d / 2 + 1e-6);
      expect(Math.sin(h.heading)).toBeCloseTo(s.facing.x);
      expect(Math.cos(h.heading)).toBeCloseTo(s.facing.z);
    }
  });
  it('generated rows of houses never overlap a slot, and slot houses never overlap each other', () => {
    const lms = [...(landmarks as LandmarkRect[]), ...slotBlockers(reg)];
    const rowHouses = layoutFillerStreets(reg, FILLER_STREETS, lms).map(houseFootprint);
    const slotFootprints = layoutSlotHouses(reg).map(houseFootprint);
    for (const r of rowHouses) for (const s of slotFootprints) expect(overlaps(r, s)).toBe(false);
    for (let i = 0; i < slotFootprints.length; i++) for (let j = i + 1; j < slotFootprints.length; j++) expect(overlaps(slotFootprints[i]!, slotFootprints[j]!)).toBe(false);
    // Houses of the old streets still avoid every blocker, now including the filler slots.
    for (const street of FILLER_STREETS) {
      const blockers = blockersFor(reg, street, lms);
      for (const h of layoutFillerStreets(reg, [street], lms)) for (const b of blockers) expect(overlaps(houseFootprint(h), b)).toBe(false);
    }
    expect(fillerStreets.length).toBe(3);
  });
});