// Content tests for the town data in packages/content/data/maps (brief, overrides, committed bake) and the zod schemas.
import { describe, expect, it } from 'vitest';
import briefJson from '../../../../packages/content/data/maps/town-brief.json';
import overridesJson from '../../../../packages/content/data/maps/town-overrides.json';
import bakeJson from '../../../../packages/content/data/maps/generated/town-start_city.json';
import recipesJson from '../../../../packages/content/data/models/buildings.recipes.json';
import {
  parseTownBrief, parseTownData, parseTownOverrides, requiredZones, townBriefSchema, townDataSchema, townOverridesSchema,
} from '../../src/render/procedural/town/townSchema';
import { applyOverrides } from '../../src/render/procedural/town/applyOverrides';
import { BRIEF, invariantProblems } from './townHelpers';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('town-brief.json', () => {
  it('passes its schema', () => {
    const r = townBriefSchema.safeParse(briefJson);
    expect(r.success ? [] : r.error.issues).toEqual([]);
  });

  it('has the required zone keys and a building rule with weight > 0 in every zone', () => {
    const need = requiredZones(BRIEF);
    expect(need).toContain('core');
    for (const z of need) {
      expect(BRIEF.zones[z], z).toBeDefined();
      expect(BRIEF.zones[z]!.buildings.some((r) => r.weight > 0), z).toBe(true);
    }
  });

  it('is rejected when a required zone is missing', () => {
    const bad = clone(briefJson) as unknown as { zones: Record<string, unknown> };
    delete bad.zones.rich_outer;
    expect(() => parseTownBrief(bad)).toThrow(/missing required zone "rich_outer"/);
  });

  it('is rejected when a zone has no building rule with weight > 0', () => {
    const bad = clone(briefJson) as unknown as { zones: Record<string, { buildings: Array<{ weight: number }> }> };
    for (const r of bad.zones.core!.buildings) r.weight = 0;
    expect(() => parseTownBrief(bad)).toThrow(/weight > 0/);
  });

  it('is rejected when a district only appears in a sector and has no zones', () => {
    const bad = clone(briefJson) as unknown as { sectors: Array<{ fromDeg: number; toDeg: number; district: string }> };
    bad.sectors.push({ fromDeg: 0, toDeg: 10, district: 'harbour' });
    expect(() => parseTownBrief(bad)).toThrow(/harbour_inner/);
  });
});

describe('town-overrides.json', () => {
  it('passes its schema', () => {
    const r = townOverridesSchema.safeParse(overridesJson);
    expect(r.success ? [] : r.error.issues).toEqual([]);
  });

  it('rejects unknown fields and bad colours', () => {
    expect(() => parseTownOverrides({ buildings: { x: { colur: '#ffffff' } }, roads: {} })).toThrow();
    expect(() => parseTownOverrides({ buildings: { x: { colour: 'red' } }, roads: {} })).toThrow();
  });

  it('only names fixed recipes that exist in buildings.recipes.json', () => {
    const known = new Set(Object.keys(recipesJson));
    const ov = parseTownOverrides(overridesJson);
    for (const [id, o] of Object.entries(ov.buildings)) if (o.recipe) expect(known.has(o.recipe), `${id} -> ${o.recipe}`).toBe(true);
    for (const l of BRIEF.landmarks) if (l.recipe) expect(known.has(l.recipe), `${l.id} -> ${l.recipe}`).toBe(true);
  });
});

describe('committed bake generated/town-start_city.json', () => {
  const bake = parseTownData(bakeJson, 'town-start_city.json');

  it('passes its schema and belongs to the committed brief', () => {
    expect(townDataSchema.safeParse(bakeJson).success).toBe(true);
    expect(bake.briefId).toBe(BRIEF.id);
  });

  it('has unique ids, valid roads and junctions, one singel bridge per gate and no overlaps', () => {
    expect(invariantProblems(bake, BRIEF)).toEqual([]);
  });

  it('applies the committed overrides (stale ones are only listed, see "town:bake -- start_city --check")', () => {
    const r = applyOverrides(bake, parseTownOverrides(overridesJson));
    expect(r.town.buildings.length).toBeLessThanOrEqual(bake.buildings.length);
    expect(Array.isArray(r.orphans)).toBe(true);
  });
});
