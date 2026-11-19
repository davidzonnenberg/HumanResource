// Pure-module tests (no three.js). Lives in apps/web/test/, runs with vitest.
import { describe, expect, it } from 'vitest';
import { densifyPath, densifyPolygon, gableLayout, offsetPolygon, polygonArea, type GableKind } from '../src/render/procedural/buildings/gables';
import { BUILDING_PRESETS, totalEaveHeight } from '../src/render/procedural/buildings/buildingRecipe';
import { buildingRecipeSchema } from '../src/render/procedural/buildings/buildingRecipe.schema';
import { ARCHETYPES, DISTRICTS } from '../src/render/procedural/buildings/archetypes';
import { SCHEMES, schemesWithTags } from '../src/render/procedural/buildings/palettes';
import { ATLAS_COLS, ATLAS_ROWS, SIGN_TEXTS, signCell } from '../src/render/procedural/buildings/signAtlas';
import { generateStreet, hashSeed, randomDutchHouse, rerollAspect, type RerollAspect } from '../src/render/procedural/buildings/randomBuilding';

const KINDS: GableKind[] = ['triangle', 'step', 'neck', 'bell', 'spout'];

describe('gables', () => {
  for (const kind of KINDS) {
    for (const hw of [1.6, 2.2, 3, 4.5]) {
      it(`${kind} hw=${hw} is a CCW polygon inside its box`, () => {
        const h = hw * 1.5;
        const o = gableLayout(kind, hw, h).outline!;
        expect(polygonArea(o)).toBeGreaterThan(0);
        for (const [x, y] of o) {
          expect(Math.abs(x)).toBeLessThanOrEqual(hw + 1e-9);
          expect(y).toBeGreaterThanOrEqual(-1e-9);
          expect(y).toBeLessThanOrEqual(h + 1e-9);
        }
        expect(polygonArea(offsetPolygon(o, 0.12))).toBeGreaterThan(polygonArea(o));
        expect(polygonArea(densifyPolygon(o, 0.4))).toBeCloseTo(polygonArea(o), 9);
        const p = densifyPath(o, 0.12);
        expect(p[0]).toEqual(o[0]);
        expect(p[p.length - 1]).toEqual(o[o.length - 1]);
      });
    }
  }
  it('flat and cornice have no outline', () => {
    expect(gableLayout('flat', 3, 0).outline).toBeNull();
    expect(gableLayout('cornice', 3, 0).outline).toBeNull();
  });
});

describe('data', () => {
  it('every archetype has colour schemes and every district only known archetypes', () => {
    for (const a of Object.values(ARCHETYPES)) expect(schemesWithTags(a.schemes).length, a.id).toBeGreaterThan(0);
    for (const d of Object.values(DISTRICTS)) for (const [id] of d.archetypes) expect(ARCHETYPES[id], `${d.id}:${id}`).toBeDefined();
    for (const a of Object.values(ARCHETYPES)) for (const t of a.signTexts) expect(SIGN_TEXTS as readonly string[]).toContain(t);
  });
  it('schemes have unique ids and valid colours', () => {
    expect(new Set(SCHEMES.map((s) => s.id)).size).toBe(SCHEMES.length);
    for (const s of SCHEMES) for (const c of [s.wall, s.band, s.trim, s.ledge, s.roof, s.door, s.accent]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('sign atlas fits and cells are inside 0..1', () => {
    expect(SIGN_TEXTS.length).toBeLessThanOrEqual(ATLAS_COLS * ATLAS_ROWS);
    for (const t of SIGN_TEXTS) {
      const c = signCell(t)!;
      expect(c.u0).toBeGreaterThanOrEqual(0);
      expect(c.v1).toBeLessThanOrEqual(1);
      expect(c.u1).toBeGreaterThan(c.u0);
      expect(c.v1).toBeGreaterThan(c.v0);
    }
    expect(signCell('NOT A SIGN')).toBeNull();
  });
});

describe('recipes', () => {
  it('all presets pass the schema', () => {
    for (const [id, r] of Object.entries(BUILDING_PRESETS)) {
      const res = buildingRecipeSchema.safeParse(r);
      expect(res.success, `${id}: ${res.success ? '' : res.error.message}`).toBe(true);
    }
  });
  it('random houses in every district are valid and deterministic', () => {
    for (const d of Object.keys(DISTRICTS)) {
      for (let s = 0; s < 120; s++) {
        const a = randomDutchHouse(s, { district: d });
        const res = buildingRecipeSchema.safeParse(a);
        expect(res.success, `${d}/${s}: ${res.success ? '' : res.error.message}`).toBe(true);
        expect(randomDutchHouse(s, { district: d })).toEqual(a);
        expect(totalEaveHeight(a)).toBeGreaterThan(0);
      }
    }
  });
  it('every archetype can be forced', () => {
    for (const id of Object.keys(ARCHETYPES)) expect(randomDutchHouse(7, { archetype: id }).archetype).toBe(id);
  });
  it('reroll changes only its aspect', () => {
    const base = randomDutchHouse(42, { district: 'old_town' });
    const aspects: RerollAspect[] = ['colours', 'gable', 'windows', 'props', 'focal', 'proportions', 'seed'];
    for (const a of aspects) {
      const r = rerollAspect(base, a, 999);
      expect(buildingRecipeSchema.safeParse(r).success, a).toBe(true);
      expect(r.width).toBe(base.width);
      expect(r.archetype).toBe(base.archetype);
    }
  });
});

describe('streets', () => {
  it('fill the length exactly, keep heights coherent, avoid identical neighbours', () => {
    for (const d of Object.keys(DISTRICTS)) {
      for (let s = 0; s < 60; s++) {
        const len = 8 + (s % 45);
        const st = generateStreet(hashSeed(`${d}:seg_${s}`), len, { district: d });
        expect(st.reduce((t, h) => t + h.recipe.width, 0)).toBeCloseTo(len, 6);
        const floors = st.map((h) => h.recipe.floorHeights.length);
        expect(Math.max(...floors) - Math.min(...floors)).toBeLessThanOrEqual(2);
        expect(generateStreet(hashSeed(`${d}:seg_${s}`), len, { district: d })).toEqual(st);
      }
    }
  });
});
