// `town:bake --check` against a temp copy of the maps folder (TOWN_MAPS_DIR): stale and moved overrides are reported.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bakeJson from '../../../../packages/content/data/maps/generated/town-start_city.json';
import { parseTownData } from '../../src/render/procedural/town/townSchema';

// Repo root: walk up from the working directory (works from the root or from apps/web).
const findRoot = (d: string): string => (existsSync(join(d, 'scripts/town-bake.ts')) || dirname(d) === d ? d : findRoot(dirname(d)));
const root = findRoot(process.cwd());
const maps = resolve(root, 'packages/content/data/maps');
const bake = parseTownData(bakeJson);
const house = bake.buildings.find((b) => b.zone !== 'landmark')!;
let dir = '';

function check(overrides: unknown) {
  writeFileSync(join(dir, 'town-overrides.json'), JSON.stringify(overrides));
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/town-bake.ts', 'start_city', '--check'], {
    cwd: root, env: { ...process.env, TOWN_MAPS_DIR: dir }, encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'town-check-'));
  mkdirSync(join(dir, 'generated'));
  copyFileSync(join(maps, 'town-brief.json'), join(dir, 'town-brief.json'));
  copyFileSync(join(maps, 'generated/town-start_city.json'), join(dir, 'generated/town-start_city.json'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('town:bake --check', () => {
  it('passes when every override id exists and "at" is within 3 m', () => {
    const r = check({ buildings: { [house.id]: { colour: '#112233', at: [house.x + 1, house.z] } }, roads: {} });
    expect(r.out).not.toMatch(/no longer matches/);
    expect(r.code).toBe(0);
  });

  it('reports the moved-id case: "at" more than 3 m from the house', () => {
    const r = check({ buildings: { [house.id]: { colour: '#112233', at: [house.x + 10, house.z] } }, roads: {} });
    expect(r.code).toBe(1);
    expect(r.out).toContain(`override no longer matches: building ${house.id} moved`);
  });

  it('reports unknown building and road ids', () => {
    const r = check({ buildings: { 'nowhere/L9': { remove: true } }, roads: { gone: { name: 'Gone' } } });
    expect(r.code).toBe(1);
    expect(r.out).toContain('building nowhere/L9');
    expect(r.out).toContain('road gone');
  });
});
