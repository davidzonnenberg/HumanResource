// Typed re-export of the raw JSON content. Validation happens in packages/sim (loadRegistry).
import resources from './data/resources.json';
import businesses from './data/businesses.json';
import vehicles from './data/vehicles.json';
import jobs from './data/jobs.json';
import humans from './data/humans.json';
import traits from './data/traits.json';
import recipes from './data/recipes.json';
import brands from './data/brands.json';
import achievements from './data/achievements.json';
import revealTriggers from './data/reveal-triggers.json';
import models from './data/models.json';
import namePool from './data/name-pool.json';
import startState from './data/start-state.json';
import world from './data/maps/world.json';
import oldTown from './data/maps/districts/old_town.json';
import harbour from './data/maps/districts/harbour.json';
import simConfig from './data/config/sim.json';
import cameraConfig from './data/config/camera.json';
import themeConfig from './data/config/theme.json';
import text from './data/text/en.json';
// Phase 2 pack (no auto-glob: every file is imported explicitly)
import phase2Resources from './data/phase2/resources.json';
import phase2Businesses from './data/phase2/businesses.json';
import phase2Traits from './data/phase2/traits.json';
import phase2Recipes from './data/phase2/recipes.json';
import phase2Brands from './data/phase2/brands.json';
import phase2Achievements from './data/phase2/achievements.json';
import phase2RevealTriggers from './data/phase2/reveal-triggers.json';
import market from './data/phase2/market.json';
import acquisitions from './data/phase2/acquisitions.json';
import questionables from './data/phase2/questionables.json';
import questionableConfig from './data/phase2/questionable-config.json';
import competitorEvents from './data/phase2/competitor-events.json';
import minigames from './data/phase2/minigames.json';
import chains from './data/phase2/chains.json';

export interface RawContent {
  resources: unknown;
  businesses: unknown;
  vehicles: unknown;
  jobs: unknown;
  humans: unknown;
  traits: unknown;
  recipes: unknown;
  brands: unknown;
  achievements: unknown;
  revealTriggers: unknown;
  models: unknown;
  namePool: unknown;
  startState: unknown;
  world: unknown;
  districtFiles: Record<string, unknown>;
  simConfig: unknown;
  text: Record<string, unknown>;
  market: unknown;
  acquisitions: unknown;
  questionables: unknown;
  questionableConfig: unknown;
  competitorEvents: unknown;
  minigames: unknown;
  chains: unknown;
}

export const rawContent: RawContent = {
  // Phase 2 definitions are appended after Phase 1 so Phase 1 ordering never changes.
  resources: [...resources, ...phase2Resources],
  businesses: [...businesses, ...phase2Businesses],
  vehicles,
  jobs,
  humans,
  traits: [...traits, ...phase2Traits],
  recipes: [...recipes, ...phase2Recipes],
  brands: [...brands, ...phase2Brands],
  achievements: [...achievements, ...phase2Achievements],
  revealTriggers: [...revealTriggers, ...phase2RevealTriggers],
  models,
  namePool,
  startState,
  world,
  districtFiles: { old_town: oldTown, harbour },
  simConfig,
  text,
  market,
  acquisitions,
  questionables,
  questionableConfig,
  competitorEvents,
  minigames,
  chains,
};

export { cameraConfig, themeConfig, text };
export type TextTable = typeof text;
