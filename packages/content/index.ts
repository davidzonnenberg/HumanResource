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
}

export const rawContent: RawContent = {
  resources,
  businesses,
  vehicles,
  jobs,
  humans,
  traits,
  recipes,
  brands,
  achievements,
  revealTriggers,
  models,
  namePool,
  startState,
  world,
  districtFiles: { old_town: oldTown, harbour },
  simConfig,
  text,
};

export { cameraConfig, themeConfig, text };
export type TextTable = typeof text;
