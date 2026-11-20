// Bake a procedural town: brief + locked buildings -> frozen JSON in packages/content.
//
//   npm.cmd run town:bake -- start_city            (refuses to overwrite an existing bake)
//   npm.cmd run town:bake -- start_city --force    (re-generate; locked buildings + landmarks are kept)
//   npm.cmd run town:bake -- start_city --check    (only validate overrides against the current bake)
//   npm.cmd run town:bake -- start_city --chunks   (only re-write the chunk files from the existing bake; the bake is not touched)
//
// Every bake also writes the 256 m chunks next to it: generated/town-<id>/index.json + chunk_<cx>_<cz>.json (T3).
//
// Wired as "town:bake" in the root package.json (runs through tsx). The brief and overrides are validated with the
// zod schemas before generating, and the TownData is validated before it is written.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTown } from '../apps/web/src/render/procedural/town/generateTown';
import { applyOverrides, lockedBuildings } from '../apps/web/src/render/procedural/town/applyOverrides';
import { chunkDirName, chunkTown } from '../apps/web/src/render/procedural/town/chunkTown';
import { formatTownCounts, townCounts } from '../apps/web/src/render/procedural/town/townCounts';
import {
  parseTownBrief, parseTownChunk, parseTownChunkIndex, parseTownData, parseTownOverrides,
} from '../apps/web/src/render/procedural/town/townSchema';
import type { TownData, TownOverrides } from '../apps/web/src/render/procedural/town/townTypes';

// TOWN_MAPS_DIR lets the tests run the CLI on a temp copy of the maps folder.
const MAPS = process.env.TOWN_MAPS_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '../packages/content/data/maps');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) ?? 'start_city';
const force = args.includes('--force');
const check = args.includes('--check');
const chunksOnly = args.includes('--chunks');

const briefPath = resolve(MAPS, 'town-brief.json');
const overridesPath = resolve(MAPS, 'town-overrides.json');
const outPath = resolve(MAPS, 'generated', `town-${id}.json`);
const chunkDir = resolve(MAPS, 'generated', chunkDirName(id));

const brief = parseTownBrief(JSON.parse(readFileSync(briefPath, 'utf8')), 'town-brief.json');
if (brief.id !== id) throw new Error(`town-brief.json has id "${brief.id}", expected "${id}"`);
const overrides: TownOverrides = existsSync(overridesPath)
  ? parseTownOverrides(JSON.parse(readFileSync(overridesPath, 'utf8')), 'town-overrides.json')
  : { buildings: {}, roads: {} };
const previous: TownData | null = existsSync(outPath) ? parseTownData(JSON.parse(readFileSync(outPath, 'utf8')), outPath) : null;

if (check) {
  if (!previous) throw new Error(`no bake at ${outPath}`);
  const { orphans } = applyOverrides(previous, overrides);
  report(previous, orphans);
  process.exit(orphans.length ? 1 : 0);
}

if (chunksOnly) {
  if (!previous) throw new Error(`no bake at ${outPath}: bake the town first`);
  writeChunks(previous);
  process.exit(0);
}

if (previous && !force) {
  console.error(`${outPath} exists. The town is frozen. Use --force to re-generate (locked buildings are kept).`);
  process.exit(1);
}

const locked = previous ? lockedBuildings(previous, overrides) : [];
const town = generateTown(brief, { locked });
parseTownData(town, `generated town ${id}`);
const { orphans } = applyOverrides(town, overrides);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(town));
console.log(`baked ${outPath}`);
writeChunks(town);
report(town, orphans);

/** Split the bake into chunks, validate every file, and replace the old chunk files (index.json + chunk_*.json only). */
function writeChunks(t: TownData) {
  const { index, chunks } = chunkTown(t);
  parseTownChunkIndex(index, 'chunk index');
  for (const [file, chunk] of Object.entries(chunks)) parseTownChunk(chunk, file);
  mkdirSync(chunkDir, { recursive: true });
  for (const f of readdirSync(chunkDir)) if (f === 'index.json' || /^chunk_-?\d+_-?\d+\.json$/.test(f)) rmSync(resolve(chunkDir, f));
  for (const [file, chunk] of Object.entries(chunks)) writeFileSync(resolve(chunkDir, file), JSON.stringify(chunk));
  writeFileSync(resolve(chunkDir, 'index.json'), JSON.stringify(index));
  console.log(`wrote ${index.chunks.length} chunks (${index.chunkSize} m) + index.json to ${chunkDir}`);
}

function report(t: TownData, orph: string[]) {
  console.log(formatTownCounts(townCounts(t)));
  for (const w of t.warnings) console.warn(`warning: ${w}`);
  for (const o of orph) console.warn(`override no longer matches: ${o}`);
}
