// Object counts of a town, shared by `town:bake`, the 2D preview and the tests so all three print and compare the
// same numbers ("preview and bake give the same counts for the same seed").
import type { TownData } from './townTypes';

export interface TownCounts {
  roads: number;
  buildings: number;
  bridges: number;
  junctions: number;
  trees: number;
  signs: number;
}

export function townCounts(t: TownData): TownCounts {
  return {
    roads: t.roads.length,
    buildings: t.buildings.length,
    bridges: t.bridges.length,
    junctions: t.junctions.length,
    trees: t.trees.length,
    signs: t.signs.length,
  };
}

/** The line `town:bake` prints after a bake, e.g. "326 roads, 1290 buildings, 19 bridges, 566 junctions". */
export function formatTownCounts(c: TownCounts): string {
  return `${c.roads} roads, ${c.buildings} buildings, ${c.bridges} bridges, ${c.junctions} junctions`;
}
