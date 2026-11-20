// applyOverrides: hand edits on top of a bake (docs/procedural-town-handover.md section 5).
import { describe, expect, it } from 'vitest';
import { applyOverrides, lockedBuildings } from '../../src/render/procedural/town/applyOverrides';
import type { TownOverrides } from '../../src/render/procedural/town/townTypes';
import { townFor } from './townHelpers';

const town = townFor('v1');
const at = (i: number) => town.buildings[i]!;
const a = at(10), b = at(200), c = at(400), d = at(600), e = at(800);

describe('applyOverrides', () => {
  it('without overrides nothing changes and nothing is orphaned', () => {
    const r = applyOverrides(town, { buildings: {}, roads: {} });
    expect(r.orphans).toEqual([]);
    expect(r.town.buildings).toEqual(town.buildings);
    expect(r.town.roads).toEqual(town.roads);
  });

  it('remove, colour, kind, recipe, lock and seed work and leave other buildings alone', () => {
    const ov: TownOverrides = {
      buildings: {
        [a.id]: { remove: true },
        [b.id]: { colour: '#112233', kind: 'villa' },
        [c.id]: { recipe: 'pub_cosy_local' },
        [d.id]: { lock: true },
        [e.id]: { seed: 4242 },
      },
      roads: {},
    };
    const r = applyOverrides(town, ov);
    expect(r.orphans).toEqual([]);
    const by = new Map(r.town.buildings.map((x) => [x.id, x]));
    expect(by.has(a.id)).toBe(false);
    expect(r.town.buildings.length).toBe(town.buildings.length - 1);
    expect(by.get(b.id)).toMatchObject({ colour: '#112233', kind: 'villa', x: b.x, z: b.z, seed: b.seed });
    expect(by.get(c.id)).toMatchObject({ recipe: 'pub_cosy_local', colour: c.colour });
    expect(by.get(d.id)?.locked).toBe(true);
    expect(by.get(e.id)).toMatchObject({ seed: 4242, x: e.x, z: e.z });
    const untouched = town.buildings.filter((x) => ![a, b, c, d, e].some((y) => y.id === x.id));
    for (const u of untouched.slice(0, 50)) expect(by.get(u.id)).toEqual(u);
  });

  it('does not mutate the input town', () => {
    const before = JSON.stringify(town.buildings[0]);
    applyOverrides(town, { buildings: { [town.buildings[0]!.id]: { remove: true, colour: '#000000' } }, roads: {} });
    expect(JSON.stringify(town.buildings[0])).toBe(before);
  });

  it('road overrides: name, surface and width', () => {
    const road = town.roads.find((r) => r.id === 'gate_N')!;
    const r = applyOverrides(town, { buildings: {}, roads: { gate_N: { name: 'Weerdpoort', surface: 'asphalt', width: 7 } } });
    expect(r.orphans).toEqual([]);
    expect(r.town.roads.find((x) => x.id === 'gate_N')).toMatchObject({ name: 'Weerdpoort', surface: 'asphalt', width: 7 });
    expect(road.width).not.toBe(7);
  });

  it('unknown ids show up in orphans', () => {
    const r = applyOverrides(town, {
      buildings: { 'nowhere/L99': { colour: '#ffffff' }, [a.id]: { colour: '#ffffff' } },
      roads: { road_that_is_gone: { name: 'Gone' } },
    });
    expect(r.orphans).toContain('building nowhere/L99');
    expect(r.orphans).toContain('road road_that_is_gone');
    expect(r.orphans.some((o) => o.includes(a.id))).toBe(false);
  });

  it('an override whose "at" is more than 3 m from the building is reported as moved', () => {
    const near = applyOverrides(town, { buildings: { [a.id]: { at: [a.x + 2, a.z] } }, roads: {} });
    expect(near.orphans).toEqual([]);
    const far = applyOverrides(town, { buildings: { [a.id]: { at: [a.x + 10, a.z] } }, roads: {} });
    expect(far.orphans.some((o) => o.startsWith(`building ${a.id} moved`))).toBe(true);
  });
});

describe('lockedBuildings', () => {
  it('returns the locked buildings of a bake, never landmarks', () => {
    const lm = town.buildings.find((x) => x.zone === 'landmark')!;
    const locked = lockedBuildings(town, { buildings: { [a.id]: { lock: true }, [lm.id]: { lock: true }, [b.id]: { colour: '#000000' } }, roads: {} });
    expect(locked.map((x) => x.id)).toEqual([a.id]);
  });
});
