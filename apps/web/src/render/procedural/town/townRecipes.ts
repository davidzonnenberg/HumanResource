// Fixed (hand-designed) building recipes and the town's hand edits, as shipped in packages/content. Render only.
// A recipe that does not pass `buildingRecipeSchema` is skipped with a warning, so one bad recipe cannot blank the town.
import recipesJson from '../../../../../../packages/content/data/models/buildings.recipes.json';
import overridesJson from '../../../../../../packages/content/data/maps/town-overrides.json';
import type { BuildingRecipe } from '../buildings/buildingRecipe';
import { buildingRecipeSchema } from '../buildings/buildingRecipe.schema';
import type { FixedRecipes } from './townBuildings';
import { parseTownOverrides } from './townSchema';
import type { TownOverrides } from './townTypes';

let cached: FixedRecipes | null = null;

export function fixedRecipes(): FixedRecipes {
  if (cached) return cached;
  const map = new Map<string, BuildingRecipe>();
  for (const [id, raw] of Object.entries(recipesJson as Record<string, unknown>)) {
    const r = buildingRecipeSchema.safeParse(raw);
    if (r.success) map.set(id, r.data as BuildingRecipe);
    else console.warn(`[town] fixed recipe "${id}" is not valid: ${r.error.issues[0]?.message ?? 'unknown'}`);
  }
  cached = map;
  return map;
}

export const townOverrides = (): TownOverrides => parseTownOverrides(overridesJson);
