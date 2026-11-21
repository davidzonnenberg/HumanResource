// Loads a chunked town bake (generated/town-<id>/index.json + chunk files) and validates it with the zod schemas.
// The files are lazy imports, so the town costs nothing until the dev scene (or later the game) asks for it, and a
// chunk is only fetched when it comes within the quality's chunk radius (T6).
import { parseTownChunk, parseTownChunkIndex } from './townSchema';
import type { TownChunk, TownChunkIndex } from './townTypes';

const files = import.meta.glob('../../../../../../packages/content/data/maps/generated/town-*/*.json', { import: 'default' });

export interface LoadedTown { index: TownChunkIndex; chunks: TownChunk[] }

const find = (briefId: string, file: string): (() => Promise<unknown>) | undefined => {
  const suffix = `/town-${briefId}/${file}`;
  const key = Object.keys(files).find((k) => k.endsWith(suffix));
  return key ? files[key] : undefined;
};

export async function loadTownIndex(briefId: string): Promise<TownChunkIndex> {
  const loadIndex = find(briefId, 'index.json');
  if (!loadIndex) throw new Error(`no chunked bake for town "${briefId}" (run: npm.cmd run town:bake -- ${briefId} --chunks)`);
  return parseTownChunkIndex(await loadIndex(), `town-${briefId}/index.json`);
}

const chunkCache = new Map<string, Promise<TownChunk>>();

/** One chunk by file name (cached: a chunk that leaves and re-enters the radius is not parsed twice). */
export function loadTownChunk(briefId: string, file: string): Promise<TownChunk> {
  const key = `${briefId}/${file}`;
  let p = chunkCache.get(key);
  if (!p) {
    const load = find(briefId, file);
    p = load
      ? load().then((raw) => parseTownChunk(raw, `town-${briefId}/${file}`))
      : Promise.reject(new Error(`town-${briefId}: chunk file ${file} is missing`));
    chunkCache.set(key, p);
  }
  return p;
}

/** Index plus the chunks; `want` limits which chunks are loaded (default: all). */
export async function loadTown(briefId: string, want: (c: TownChunkIndex['chunks'][number]) => boolean = () => true): Promise<LoadedTown> {
  const index = await loadTownIndex(briefId);
  const chunks = await Promise.all(index.chunks.filter(want).map((c) => loadTownChunk(briefId, c.file)));
  return { index, chunks };
}
