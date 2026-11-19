// Street filling (docs/buildings.md): gaps, placement along a line, and the real old_town streets.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fillerStreets, landmarks } from '@hr/content';
import { houseFootprint, lineLength, placeAlongLine, streetGaps, type FillerStreet, type Rect } from '../src/render/procedural/buildings/streets';
import { blockersFor, layoutFillerStreets, STREET_CONFIG, type LandmarkRect } from '../src/render/procedural/buildings/streetsLayout';
import { slotBlockers } from '../src/render/frontage';
import { FILLER_STREETS, fillerStreetsSchema } from '../src/render/procedural/buildings/streetsSchema';
import { freshRegistry } from './phoneTestHelpers';

const reg = freshRegistry().sim.reg;
// Landmarks now come from filler slots of the frontage layout (the town hall); landmarks.json holds off-street ones only.
const lms = [...(landmarks as LandmarkRect[]), ...slotBlockers(reg)];
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX - 1e-6 && a.maxX > b.minX + 1e-6 && a.minZ < b.maxZ - 1e-6 && a.maxZ > b.minZ + 1e-6;

describe('placeAlongLine', () => {
  const east: [number, number][] = [[0, 0], [10, 0]];
  const south: [number, number][] = [[0, 0], [0, 10]];
  it('left of a +x line is north (-z) and the facade turns towards the street (+z)', () => {
    const p = placeAlongLine(east, 'left', 4.6, 5, 6);
    expect(p.x).toBeCloseTo(5);
    expect(p.z).toBeCloseTo(-7.6);
    expect(Math.sin(p.heading)).toBeCloseTo(0);
    expect(Math.cos(p.heading)).toBeCloseTo(1);
  });
  it('left of a +z line is east (+x) and faces -x; right is west and faces +x', () => {
    const l = placeAlongLine(south, 'left', 4.6, 5, 6);
    expect(l.x).toBeCloseTo(7.6);
    expect(Math.sin(l.heading)).toBeCloseTo(-1);
    const r = placeAlongLine(south, 'right', 4.6, 5, 6);
    expect(r.x).toBeCloseTo(-7.6);
    expect(Math.sin(r.heading)).toBeCloseTo(1);
  });
  it('follows a bent line: headings follow the local tangent and houses keep their offset from the line', () => {
    const bent: [number, number][] = [[0, 0], [10, 0], [10, 10]];
    expect(lineLength(bent)).toBeCloseTo(20);
    const a = placeAlongLine(bent, 'left', 4, 5, 6);
    const b = placeAlongLine(bent, 'left', 4, 15, 6);
    expect(a.z).toBeCloseTo(-7);
    expect(b.x).toBeCloseTo(17);
    expect(Math.sin(b.heading)).toBeCloseTo(-1);
  });
});

describe('streetGaps', () => {
  const street: FillerStreet = { id: 't:s', district: 'old_town', style: 'old_town', side: 'left', line: [[0, 0], [40, 0]] };
  it('a blocker in the band cuts the street, short leftovers become alleys', () => {
    const block: Rect = { minX: 10, maxX: 20, minZ: -20, maxZ: -5 };
    const gaps = streetGaps(street, [block], STREET_CONFIG);
    expect(gaps.map((g) => [g.start, g.length, g.kind])).toEqual([[0, 10, 'houses'], [20, 20, 'houses']]);
    const tight = streetGaps(street, [{ minX: 2, maxX: 38, minZ: -20, maxZ: -5 }], STREET_CONFIG);
    expect(tight.map((g) => g.kind)).toEqual(['alley', 'alley']);
  });
  it('property: gaps never overlap a blocker and never overlap each other', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ x: fc.integer({ min: -5, max: 45 }), w: fc.integer({ min: 1, max: 15 }) }), { maxLength: 6 }), (bs) => {
        const blockers: Rect[] = bs.map((b) => ({ minX: b.x, maxX: b.x + b.w, minZ: -20, maxZ: -5 }));
        const gaps = streetGaps(street, blockers, STREET_CONFIG);
        let prevEnd = -1;
        for (const g of gaps) {
          expect(g.start).toBeGreaterThanOrEqual(prevEnd - 1e-9);
          prevEnd = g.start + g.length;
          for (const b of blockers) expect(g.start < b.maxX && g.start + g.length > b.minX).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('old_town filler streets', () => {
  const houses = layoutFillerStreets(reg, FILLER_STREETS, lms);
  it('the content file passes the schema and has the three streets', () => {
    expect(fillerStreetsSchema.safeParse(fillerStreets).success).toBe(true);
    expect(FILLER_STREETS.map((s) => s.id)).toEqual(['old_town:west_street_east', 'old_town:west_street_west', 'old_town:north_left_of_hall']);
    expect(houses.length).toBeGreaterThan(8);
  });
  it('is deterministic: same ids, same houses', () => {
    expect(JSON.stringify(layoutFillerStreets(reg, FILLER_STREETS, lms))).toBe(JSON.stringify(houses));
    expect(new Set(houses.map((h) => h.id)).size).toBe(houses.length);
  });
  it('the total house width per gap equals the gap length', () => {
    for (const street of FILLER_STREETS) {
      for (const gap of streetGaps(street, blockersFor(reg, street, lms), STREET_CONFIG)) {
        const w = houses.filter((h) => h.gapId === gap.id).reduce((s, h) => s + h.recipe.width, 0);
        expect(w).toBeCloseTo(gap.kind === 'alley' ? 0 : gap.length, 6);
      }
    }
  });
  it('no house touches a plot, an unloading zone, a landmark or a road', () => {
    const rects: Rect[] = [];
    for (const s of FILLER_STREETS) rects.push(...blockersFor(reg, s, lms));
    // Blockers include a margin around plots; roads (with sidewalks) must not be entered either.
    for (const h of houses) {
      const f = houseFootprint(h);
      for (const r of rects) expect(overlaps(f, r)).toBe(false);
    }
  });
  it('the north street stops at the left edge of the town hall', () => {
    const hall = lms.find((l) => l.district === 'old_town' && l.x === 0 && l.w === 20);
    expect(hall).toBeDefined();
    const north = houses.filter((h) => h.gapId.startsWith('old_town:north_left_of_hall'));
    expect(north.length).toBeGreaterThan(3);
    for (const h of north) expect(houseFootprint(h).maxX).toBeLessThanOrEqual((hall?.x ?? 0) - (hall?.w ?? 0) / 2 + 1e-6);
  });
  it('houses face the street: west row faces +x, east row faces -x, north row faces +z', () => {
    for (const h of houses) {
      const sin = Math.sin(h.heading);
      if (h.gapId.startsWith('old_town:west_street_west')) expect(sin).toBeCloseTo(1);
      if (h.gapId.startsWith('old_town:west_street_east')) expect(sin).toBeCloseTo(-1);
      if (h.gapId.startsWith('old_town:north_left')) expect(Math.cos(h.heading)).toBeCloseTo(1);
    }
  });
});