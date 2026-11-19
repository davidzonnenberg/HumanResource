// Frontage_Slots (Requirement 54): derivation, registry validation, Plot id stability (task 39.4) and
// Property 60 (task 39.5).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deriveFrontage, frontageConflicts, ROAD_CLEARANCE } from '../src/defs/frontage';
import type { DefinitionError } from '../src/defs/registry';
import type { DistrictDef, FrontageSlot, PlotDef, StreetDef } from '../src/defs/schemas';
import { errorsOf, patchedContent } from './contentVariants';
import { registry } from './helpers';

interface PlotSnapshot {
  districtId: string;
  accessNode: string;
  def: PlotDef;
}
const before = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/plots-before-frontage.json', import.meta.url)), 'utf8')) as Record<string, PlotSnapshot>;

describe('Plot ids and geometry survive the street conversion (task 39.4)', () => {
  it('every Plot of the hand-placed layout still exists with the same id, rectangle, tags, zone and access node', () => {
    const reg = registry();
    expect(Object.keys(before).length).toBe(9);
    for (const [id, snap] of Object.entries(before)) {
      const now = reg.world.plots[id];
      expect(now, `Plot ${id} is gone`).toBeDefined();
      expect(now?.districtId).toBe(snap.districtId);
      expect(now?.accessNode).toBe(snap.accessNode);
      // Nov 2026: the Plots moved to the road (setback 4.6 = road + sidewalk + 0.1), so only z differs from the old layout.
      expect({ ...now?.def, z: 0 }).toEqual({ ...snap.def, z: 0 });
      if (snap.districtId === 'old_town') expect(Math.abs(now?.def.z ?? 0) - (now?.def.d ?? 0) / 2).toBeCloseTo(4.6, 6); // near edge hugs the sidewalk of the main road
    }
    // No old Plot id was renamed, so there is no old -> new mapping for the save migration (54.10).
    expect(Object.keys(reg.world.plots).sort()).toEqual(Object.keys(before).sort());
  });
  it('Old Town is built from streets: hand-placed Plots are gone, the town hall is a double-width slot', () => {
    const reg = registry();
    const hall = reg.world.slots.city_hall;
    expect(hall).toMatchObject({ kind: 'filler', modelKey: 'building_town_hall', rect: { x: 0, w: 20, d: 12 }, facing: { x: 0, z: 1 } });
    expect(hall?.rect.z).toBeCloseTo(-42.6, 6);
    expect(reg.world.districts.old_town?.def.plots).toEqual([]);
    expect(reg.world.slots.plot_home).toMatchObject({ kind: 'business', plotId: 'plot_home' });
    expect(reg.world.slots.fl_n01?.hitbox).not.toBeNull();
    expect(reg.world.slots.plot_south?.hitbox).toBeNull(); // open ground until something is built
  });
  it('the Unloading_Zone lies on the road next to the slot', () => {
    const reg = registry();
    const north = reg.world.plots.plot_home?.def.unloadingZone;
    const south = reg.world.plots.plot_south?.def.unloadingZone;
    expect(north).toEqual({ x: -14, z: -2, w: 12, d: 6 });
    expect(south).toEqual({ x: -14, z: 2, w: 12, d: 6 });
    expect(reg.world.plots.plot_depot?.def.unloadingZone).toEqual({ x: 46, z: -3, w: 12, d: 4 });
  });
});

describe('registry rejects bad frontage, naming the District and the slot (54.11)', () => {
  type RawDistrict = { streets: { id: string; slots: Record<string, unknown>[] }[] };
  const withOldTown = (edit: (d: RawDistrict) => void): DefinitionError[] =>
    errorsOf(
      patchedContent((r) => {
        const files = r.districtFiles as Record<string, unknown>;
        edit(files.old_town as RawDistrict);
      }),
    );
  it('accepts the shipped streets', () => {
    expect(withOldTown(() => undefined)).toEqual([]);
  });
  it('overlapping slots', () => {
    const errs = withOldTown((d) => {
      // A filler slot as wide as the whole north-west segment pushes the Plot after it over the next street.
      (d.streets[0]?.slots[0] as { width: number }).width = 30;
    });
    expect(errs.some((e) => e.definition === 'maps/districts/old_town' && e.message.includes('District "old_town"') && /slot "(fl_n0\d|plot_[a-z]+)"/.test(e.message))).toBe(true);
  });
  it('a slot outside the District bounds', () => {
    const errs = withOldTown((d) => {
      (d.streets[6]?.slots[0] as { width: number }).width = 200; // the town hall slot, far past the end of its street
    });
    expect(errs.some((e) => e.definition === 'maps/districts/old_town' && e.message.includes('"city_hall"'))).toBe(true);
  });
  it('a slot that stands on a road', () => {
    const errs = withOldTown((d) => {
      (d.streets[0] as unknown as { setback: number }).setback = 2; // inside the road and sidewalk
    });
    expect(errs.some((e) => e.message.includes('inside the road'))).toBe(true);
  });
  it('a business slot on a street along the z axis, an unknown node, a duplicate slot id', () => {
    const errs = withOldTown((d) => {
      d.streets.push(
        { id: 'bad_axis', from: 'nw', to: 'sw', side: 'left', start: 0, setback: 6, depth: 10, slots: [{ kind: 'business', id: 'zz_b', width: 10 }] } as unknown as RawDistrict['streets'][number],
        { id: 'bad_node', from: 'nowhere', to: 'sw', side: 'left', setback: 6, depth: 10, slots: [{ kind: 'filler', id: 'zz_c', width: 4 }] } as unknown as RawDistrict['streets'][number],
        { id: 'dup', from: 'w_end', to: 'e_end', side: 'left', start: 0, setback: 40, depth: 6, slots: [{ kind: 'filler', id: 'fl_n01', width: 1 }] } as unknown as RawDistrict['streets'][number],
      );
    });
    const text = errs.map((e) => e.message).join('\n');
    expect(text).toContain('slot "zz_b" is a business slot on a street along the z axis');
    expect(text).toContain('unknown node "nowhere"');
    expect(text).toContain('duplicate slot id "fl_n01"');
  });
  it('hand-placed Plots stay valid next to streets', () => {
    const errs = withOldTown((d) => {
      (d as unknown as { plots: unknown[] }).plots = [
        { id: 'plot_hand', x: 0, z: 26, w: 8, d: 8, rotation: 0, tags: [], accessNode: 's_mid', unloadingZone: { x: 0, z: 30, w: 6, d: 4 }, initial: { kind: 'empty' } },
      ];
    });
    expect(errs).toEqual([]);
  });
});

// ---- Property 60 ----------------------------------------------------------------------------------
const baseDistrict = (): DistrictDef =>
  ({
    id: 'p',
    nameKey: 'x',
    bounds: [[-80, -60], [80, -60], [80, 60], [-80, 60]],
    nodes: [
      { id: 'a', x: -50, z: 0 },
      { id: 'm', x: 0, z: 0 },
      { id: 'b', x: 50, z: 0 },
      { id: 'c', x: 0, z: 40 },
    ],
    edges: [],
    plots: [],
    drivableBounds: [[-80, -60], [80, -60], [80, 60], [-80, 60]],
    walkableBounds: [[-80, -60], [80, -60], [80, 60], [-80, 60]],
  }) as unknown as DistrictDef;

const arbSlot = (i: number): fc.Arbitrary<FrontageSlot> =>
  fc.record({ width: fc.integer({ min: 4, max: 36 }).map((n) => n / 2), kind: fc.constantFrom('filler', 'business', 'plot') }).map(
    ({ width, kind }) => ({ kind, id: `s${i}`, width }) as FrontageSlot,
  );
const arbStreet: fc.Arbitrary<StreetDef> = fc
  .record({
    side: fc.constantFrom('left' as const, 'right' as const),
    reverse: fc.boolean(),
    setback: fc.integer({ min: 9, max: 16 }).map((n) => n / 2),
    depth: fc.integer({ min: 4, max: 24 }).map((n) => n / 2),
    start: fc.integer({ min: 0, max: 12 }),
    count: fc.integer({ min: 1, max: 6 }),
  })
  .chain((s) =>
    fc.tuple(...Array.from({ length: s.count }, (_, i) => arbSlot(i))).map(
      (slots) => ({ id: 'st', from: s.reverse ? 'b' : 'a', to: s.reverse ? 'a' : 'b', side: s.side, start: s.start, setback: s.setback, depth: s.depth, tags: ['commercial'], slots }) as StreetDef,
    ),
  );

describe('Property 60: Frontage layout validity', () => {
  // Feature: human-resource-mvp, Property 60 (Validates: Requirements 54.1, 54.6, 54.9, 54.11)
  const derive = (street: StreetDef): { errs: DefinitionError[]; out: ReturnType<typeof deriveFrontage> } => {
    const errs: DefinitionError[] = [];
    const d = { ...baseDistrict(), streets: [street] } as DistrictDef;
    return { errs, out: deriveFrontage('p', d, errs) };
  };
  it('slots stand shoulder to shoulder, Plots exist for business and plot slots only, zones are on the road side', () => {
    fc.assert(
      fc.property(arbStreet, (street) => {
        const { errs, out } = derive(street);
        // Errors only ever concern the end of the street, and name the District and the slot.
        for (const e of errs) {
          expect(e.definition).toBe('maps/districts/p');
          expect(e.message).toContain('District "p"');
          expect(e.message).toMatch(/slot "s\d"/);
        }
        const total = street.start! + street.slots.reduce((s, x) => s + x.width, 0);
        expect(errs.length === 0).toBe(total <= 100 + 1e-9);
        expect(out.slots).toHaveLength(street.slots.length);
        for (let i = 1; i < out.slots.length; i++) {
          const p = out.slots[i - 1]!;
          const n = out.slots[i]!;
          expect(Math.abs(n.front.x - p.front.x)).toBeCloseTo((street.slots[i - 1]!.width + street.slots[i]!.width) / 2, 9);
          expect(n.front.z).toBe(p.front.z);
          expect(n.rect.w).toBe(street.slots[i]!.width);
        }
        const solid = street.slots.filter((s) => s.kind !== 'filler');
        expect(out.plots.map((p) => p.id)).toEqual(solid.map((s) => s.id));
        for (const s of out.slots) expect(s.hitbox === null).toBe(street.slots.find((x) => x.id === s.id)!.kind === 'plot');
        for (const p of out.plots) {
          const slot = out.slots.find((s) => s.id === p.id)!;
          expect(p.x).toBe(slot.rect.x);
          expect(p.z).toBe(slot.rect.z);
          // The zone sits between the street line and the building front, centred on the slot.
          expect(p.unloadingZone.x).toBe(slot.front.x);
          expect(Math.abs(p.unloadingZone.z - slot.front.z)).toBeLessThanOrEqual(street.setback);
          expect(Math.sign(p.z - slot.front.z)).toBe(Math.sign(p.unloadingZone.z - slot.front.z));
          expect(['a', 'm', 'b']).toContain(p.accessNode);
        }
      }),
      { numRuns: 150 },
    );
  });
  it('turning a filler into a business keeps the slot position and size', () => {
    fc.assert(
      fc.property(arbStreet, (street) => {
        const asFillers = { ...street, slots: street.slots.map((s) => ({ ...s, kind: 'filler' }) as FrontageSlot) };
        const asBusinesses = { ...street, slots: street.slots.map((s) => ({ ...s, kind: 'business' }) as FrontageSlot) };
        const a = derive(asFillers).out.slots.map((s) => s.rect);
        const b = derive(asBusinesses).out.slots.map((s) => s.rect);
        expect(b).toEqual(a);
      }),
      { numRuns: 100 },
    );
  });
  it('two streets whose slots overlap are reported with the slot name', () => {
    fc.assert(
      fc.property(arbStreet, (street) => {
        const twin = { ...street, id: 'st2', slots: street.slots.map((s) => ({ ...s, id: `t${s.id}` }) as FrontageSlot) };
        const d = { ...baseDistrict(), streets: [street, twin] } as DistrictDef;
        const errs: DefinitionError[] = [];
        const derived = deriveFrontage('p', d, errs);
        const conflicts = frontageConflicts(derived.slots, [], []);
        expect(conflicts.length).toBeGreaterThanOrEqual(street.slots.length); // every slot overlaps its twin
        for (const c of conflicts) expect(c.message).toMatch(/slot "t?s\d"/);
      }),
      { numRuns: 60 },
    );
  });
  it('a street at least ROAD_CLEARANCE from the road keeps every slot off the road band', () => {
    fc.assert(
      fc.property(arbStreet, (street) => {
        const { out } = derive(street);
        const road = [{ ax: -50, az: 0, bx: 50, bz: 0 }];
        const onRoad = frontageConflicts(out.slots, [], road).filter((c) => c.message.includes('road'));
        expect(onRoad).toEqual([]);
        expect(street.setback).toBeGreaterThanOrEqual(ROAD_CLEARANCE);
      }),
      { numRuns: 60 },
    );
  });
});
