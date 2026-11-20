// Bake a procedural town: brief + locked buildings -> frozen JSON in packages/content.
//
//   npm.cmd run town:bake -- start_city            (refuses to overwrite an existing bake)
//   npm.cmd run town:bake -- start_city --force    (re-generate; locked buildings + landmarks are kept)
//   npm.cmd run town:bake -- start_city --check    (only validate overrides against the current bake)
//
// Wire "town:bake" in the root package.json the same way "buildings:pin" is wired (same TS runner).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateTown } from '../apps/web/src/render/procedural/town/generateTown';
import { applyOverrides, lockedBuildings } from '../apps/web/src/render/procedural/town/applyOverrides';
import type { TownBrief, TownData, TownOverrides } from '../apps/web/src/render/procedural/town/townTypes';

const MAPS = resolve(__dirname, '../packages/content/data/maps');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) ?? 'start_city';
const force = args.includes('--force');
const check = args.includes('--check');

const briefPath = resolve(MAPS, 'town-brief.json');
const overridesPath = resolve(MAPS, 'town-overrides.json');
const outPath = resolve(MAPS, 'generated', `town-${id}.json`);

const brief = JSON.parse(readFileSync(briefPath, 'utf8')) as TownBrief;
if (brief.id !== id) throw new Error(`town-brief.json has id "${brief.id}", expected "${id}"`);
const overrides: TownOverrides = existsSync(overridesPath)
  ? (JSON.parse(readFileSync(overridesPath, 'utf8')) as TownOverrides)
  : { buildings: {}, roads: {} };
const previous: TownData | null = existsSync(outPath) ? (JSON.parse(readFileSync(outPath, 'utf8')) as TownData) : null;

if (check) {
  if (!previous) throw new Error(`no bake at ${outPath}`);
  const { orphans } = applyOverrides(previous, overrides);
  report(previous, orphans);
  process.exit(orphans.length ? 1 : 0);
}

if (previous && !force) {
  console.error(`${outPath} exists. The town is frozen. Use --force to re-generate (locked buildings are kept).`);
  process.exit(1);
}

const locked = previous ? lockedBuildings(previous, overrides) : [];
const town = generateTown(brief, { locked });
const { orphans } = applyOverrides(town, overrides);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(town));
console.log(`baked ${outPath}`);
report(town, orphans);

function report(t: TownData, orph: string[]) {
  console.log(`${t.roads.length} roads, ${t.buildings.length} buildings, ${t.bridges.length} bridges, ${t.junctions.length} junctions`);
  for (const w of t.warnings) console.warn(`warning: ${w}`);
  for (const o of orph) console.warn(`override no longer matches: ${o}`);
}
