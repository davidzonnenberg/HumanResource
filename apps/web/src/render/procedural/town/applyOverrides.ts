import type { Building, TownData, TownOverrides } from './townTypes';

/**
 * Apply hand edits (town-overrides.json) on top of a baked town.
 * Pure: returns a new TownData plus a list of override ids that no longer match anything.
 */
export function applyOverrides(town: TownData, ov: TownOverrides): { town: TownData; orphans: string[] } {
  const ids = new Set(town.buildings.map((b) => b.id));
  const roadIds = new Set(town.roads.map((r) => r.id));
  const orphans = [
    ...Object.keys(ov.buildings).filter((id) => !ids.has(id)).map((id) => `building ${id}`),
    ...Object.keys(ov.roads).filter((id) => !roadIds.has(id)).map((id) => `road ${id}`),
  ];
  for (const b of town.buildings) {
    const at = ov.buildings[b.id]?.at;
    if (at && Math.hypot(at[0] - b.x, at[1] - b.z) > 3) orphans.push(`building ${b.id} moved (override made at ${at[0]},${at[1]})`);
  }
  const buildings: Building[] = [];
  for (const b of town.buildings) {
    const o = ov.buildings[b.id];
    if (!o) { buildings.push(b); continue; }
    if (o.remove) continue;
    buildings.push({
      ...b,
      ...(o.kind ? { kind: o.kind } : {}),
      ...(o.colour ? { colour: o.colour } : {}),
      ...(o.seed !== undefined ? { seed: o.seed } : {}),
      ...(o.recipe ? { recipe: o.recipe } : {}),
      ...(o.lock ? { locked: true } : {}),
    });
  }
  const roads = town.roads.map((r) => {
    const o = ov.roads[r.id];
    return o ? { ...r, ...(o.surface ? { surface: o.surface } : {}), ...(o.width ? { width: o.width } : {}), ...(o.name ? { name: o.name } : {}) } : r;
  });
  return { town: { ...town, buildings, roads }, orphans };
}

/** Buildings to keep fixed when re-generating (pass to generateTown({ locked })). */
export function lockedBuildings(town: TownData, ov: TownOverrides): Building[] {
  return town.buildings.filter((b) => ov.buildings[b.id]?.lock && b.zone !== 'landmark');
}
