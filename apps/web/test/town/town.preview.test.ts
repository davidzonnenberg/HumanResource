// T2: the 2D preview is built from the real TypeScript and agrees with the generator / `town:bake`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import bakeJson from '../../../../packages/content/data/maps/generated/town-start_city.json';
import overridesJson from '../../../../packages/content/data/maps/town-overrides.json';
import { lockedBuildings } from '../../src/render/procedural/town/applyOverrides';
import { formatTownCounts, townCounts } from '../../src/render/procedural/town/townCounts';
import { buildPreview, nextSeed } from '../../src/render/procedural/town/preview/previewModel';
import { parseTownData, parseTownOverrides } from '../../src/render/procedural/town/townSchema';
import { BRIEF, townFor } from './townHelpers';

const bake = parseTownData(bakeJson, 'town-start_city.json');

describe('town preview model', () => {
  it('gives the same town and the same counts as generateTown for the same seed', () => {
    const p = buildPreview(BRIEF, 'v1', null);
    expect(JSON.stringify(p.raw)).toBe(JSON.stringify(townFor('v1')));
    expect(p.counts).toEqual(townCounts(townFor('v1')));
    expect(p.countsLine).toBe(formatTownCounts(p.counts));
  });

  it('applies the overrides on the shown town only; the downloadable JSON stays the raw bake', () => {
    const p = buildPreview(BRIEF, BRIEF.seed, parseTownOverrides(overridesJson));
    expect(p.overridesApplied).toBe(true);
    expect(p.counts.buildings).toBe(p.raw.buildings.length);
    expect(p.shown.buildings.length).toBeLessThanOrEqual(p.raw.buildings.length);
  });

  it('counts one singel bridge per gate', () => {
    expect(buildPreview(BRIEF, 'v1', null).singelGates).toBe(BRIEF.gates.length);
  });

  it('next seed is deterministic (no randomness)', () => {
    expect(nextSeed('v1')).toBe('v2');
    expect(nextSeed('v9')).toBe('v10');
    expect(nextSeed('start')).toBe('start2');
  });
});

describe('preview vs committed bake (same brief, same seed)', () => {
  // The bake is written by `town:bake --force`, which passes the locked buildings of the previous bake to the generator.
  // The preview does the same, so it reproduces the committed bake exactly.
  const ov = parseTownOverrides(overridesJson);
  const p = buildPreview(BRIEF, BRIEF.seed, ov, lockedBuildings(bake, ov));

  it('gives the same counts as the committed bake', () => {
    expect(p.counts).toEqual(townCounts(bake));
    expect(p.countsLine).toBe('326 roads, 1265 buildings, 19 bridges, 566 junctions');
  });

  it('gives the same town as the committed bake, byte for byte', () => {
    expect(JSON.stringify(p.raw)).toBe(JSON.stringify(bake));
  });

  it('without the locked buildings the town differs (the lock is why the counts differ from a plain generation)', () => {
    expect(buildPreview(BRIEF, BRIEF.seed, null).counts.buildings).not.toBe(bake.buildings.length);
  });
});

describe('docs/previews/town-map-preview.html', () => {
  const findRoot = (d: string): string => (existsSync(join(d, 'scripts/town-bake.ts')) || dirname(d) === d ? d : findRoot(dirname(d)));
  it('is up to date with the TypeScript (npm.cmd run town:preview)', () => {
    const root = findRoot(process.cwd());
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/town-preview.ts', '--check'], { cwd: root, encoding: 'utf8' });
    expect(`${r.stdout}${r.stderr}`).toContain('up to date');
    expect(r.status).toBe(0);
  }, 120_000);
});
