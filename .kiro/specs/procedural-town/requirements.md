# Requirements Document

## Introduction

A procedural, Utrecht-style town for the game: curved roads, crossroads, roundabouts, a highway with ramps, a river and a singel (canal) around a crowded centre, and houses that follow the curve of the road. The town is generated once from a brief, then **frozen** (baked to JSON), and every single house can still be edited. The agreed design is `docs/procedural-town-handover.md` (source of truth). The way of working for seeds, pinning and recipes is `docs/buildings.md`; the technical guide is `.kiro/steering/procedural-buildings.md`. All rules in `.kiro/steering/architecture.md` apply.

Phases A and B1 are web, render and content only. Nothing in them changes `packages/sim`, the save schema or the sim RNG. Phase B2 (task T7) is the only part that touches District data and saves, and starts with a save-impact check.

## Glossary

- **Brief**: `packages/content/data/maps/town-brief.json`, the town recipe (size, singel, river, ring, radials, highway, gates, districts, zone rules, landmarks, seed).
- **Bake**: `packages/content/data/maps/generated/town-<id>.json`, the frozen output of `generateTown`. Committed, never hand-edited.
- **Overrides**: `packages/content/data/maps/town-overrides.json`, hand edits per building or road id, applied at load.
- **Stable_Id**: a string id that survives a re-bake: roads `ring`, `radial_3`, `radial_3.2`, `lane_14`, `gate_N`; buildings `<roadId>/<L|R><n>`; landmarks the id from the Brief; bridges `br12`, signs `s40`, junctions `j200`, parks `park_3`.
- **Locked_Building**: a building with `lock: true` in the Overrides. Its footprint and position are passed to the generator as a fixed obstacle on `--force`.
- **Landmark**: a fixed building in the Brief (tower, hero building) placed before the streets, so streets curve around it.
- **Singel**: the rounded-rectangle canal around the centre. **Gate**: a short road with one bridge over the singel into the centre (default N and S).
- **Zone**: `core`, or `<district>_inner` / `<district>_outer`. **District**: a compass sector (west, rich, business) with its own building mix.
- **Chunk**: a 256 x 256 m part of the Bake that is loaded and disposed as one unit.
- **Region**: a later, separately baked part of the world with its own Brief, Bake and Overrides.
- **Quality_Preset**: the `quality` object (Low / High) that render code reads.

## Requirements

### Requirement 1: Frozen, deterministic town data

**User Story:** As the developer, I want the town generated once and frozen, so that every device and every release shows the same town.

#### Acceptance Criteria

1. THE generator `generateTown(brief, { locked })` SHALL be a pure function of the Brief and the Locked_Buildings: the same input twice SHALL give identical JSON.
2. THE game SHALL NEVER run `generateTown` at runtime. It SHALL only load the Bake and apply the Overrides.
3. Seeds SHALL come from stable string ids only (`hashSeed("<briefId>:<seed>")`, building `seed = hashSeed(buildingId)`), using the existing `hashSeed` and `mulberry32` of `render/procedural/buildings`. There SHALL be no `Math.random` in town code.
4. `town:bake` SHALL refuse to overwrite an existing Bake. `--force` SHALL re-generate and keep Locked_Buildings and Landmarks. `--check` SHALL only validate the Overrides against the current Bake.
5. THE Brief, the Overrides and the Bake SHALL be validated with zod schemas before the bake generates and before it writes. The Brief schema SHALL check that all required Zone keys exist and that every Zone has at least one building rule with weight > 0.
6. The Bake SHALL NOT be edited by hand. Changes go through the Brief or the Overrides plus a re-bake.
7. `packages/content` SHALL stay JSON only. Generator code SHALL live in `apps/web/src/render` and `scripts/`. `packages/sim` SHALL NOT import it.

### Requirement 2: Town layout

**User Story:** As a player, I want a Dutch/German town instead of a grid, so that driving through it feels like a real place.

#### Acceptance Criteria

1. THE town SHALL have one river north to south through the centre with quays, a singel around the centre with gate bridges (default N and S), a ring road with roundabouts, radials, and a highway with overpasses and ramps.
2. EACH Gate listed in the Brief SHALL produce exactly one bridge over the singel.
3. District sectors SHALL follow the Brief: west flats and students, north and east rich, south offices, towers and warehouses.
4. Buildings SHALL follow the curve of their road and SHALL NOT overlap each other, a road ribbon (width / 2) or water, within the tolerance of the generator's 1 m occupancy grid. A Landmark that does not fit SHALL produce a warning in the bake.
5. Every road SHALL have at least 2 points and every junction SHALL reference existing road ids. Building ids and road ids SHALL be unique.
6. Units are metres, x east, z south, origin at the top-left of the town; one `worldOffset` SHALL line the town up with the current world. The camera yaw is not rotated.

### Requirement 3: Editing one house or street

**User Story:** As the developer, I want to change a single house without losing the rest, so that the town can be tuned by hand after it is frozen.

#### Acceptance Criteria

1. THE Overrides SHALL support per building: `seed`, `colour`, `kind`, `recipe` (a fixed recipe from `buildings.recipes.json`), `remove`, `lock`, `at`, `note`; and per road: `name`, `surface`, `width`, `note`.
2. Overrides SHALL be applied at load, so editing them never needs a re-bake.
3. WHEN an override id does not exist in the Bake, OR its `at` is more than 3 m from the building, THE tools SHALL report it instead of silently editing the wrong house.
4. WHEN the town is re-baked with `--force`, Locked_Buildings and Landmarks SHALL keep their position and size, and roads and other buildings SHALL be built around them.
5. A Landmark SHALL be placed from the Brief (`centre` or `world` anchor, size, angle, optional recipe) before the neighbourhood streets.
6. Fixed recipe ids named in the Overrides or the Brief SHALL exist in `buildings.recipes.json`.

### Requirement 4: Preview as design tool

**User Story:** As the developer, I want to see and tune the town in 2D before it reaches the game.

#### Acceptance Criteria

1. THE preview `docs/previews/town-map-preview.html` SHALL be built from the real TypeScript, not from a hand-copied compiled copy.
2. Clicking a building SHALL show its id, kind, zone, size, road and seed. "Download baked JSON" SHALL work and a Brief SHALL be loadable.

### Requirement 5: Chunked bake

**User Story:** As a player on a phone, I want only the nearby part of the town in memory.

#### Acceptance Criteria

1. THE bake SHALL split roads, buildings, trees and signs into 256 m Chunks (`generated/town-<id>/chunk_<cx>_<cz>.json` plus an index). A road crossing a Chunk border SHALL be clipped per Chunk and keep its id.
2. THE chunk output SHALL contain the same objects as the monolithic Bake (nothing lost, nothing duplicated except clipped road parts).

### Requirement 6: Rendering

**User Story:** As a player, I want the town to look hand-made and run smoothly on a phone and on a PC.

#### Acceptance Criteria

1. Roads, water, bridges, roundabouts and signs SHALL render from the Bake: ribbon meshes with width and surface from the data, merged per Chunk, signs as instanced meshes. This SHALL start in a dev scene behind a flag.
2. Buildings SHALL render with three levels of detail: LOD0 the procedural recipe at detail `low` (fed with `seed`, `width`, `depth`, `kind`), LOD1 box, roof and facade texture, LOD2 all buildings of a Chunk merged. Footprints SHALL be snapped so identical shapes are instanced. Fixed recipes (Overrides, Landmarks) SHALL stay unique.
3. New archetypes for `flat`, `office`, `tower`, `warehouse` and `villa` SHALL exist as data, because the current maximum depth of 8.5 m only fits canal and terrace houses.
4. Hitboxes SHALL come from `width x depth`, as for existing buildings.
5. Geometry SHALL be built off the main thread in small batches (at most N buildings per frame) and Chunks outside the radius SHALL be disposed.
6. Budgets on Low: at most 150 draw calls, 400k triangles on screen and 16 ms per frame on a mid-range Android phone.

### Requirement 7: Quality presets

**User Story:** As a player, I want the game to pick settings that fit my device, and to change them.

#### Acceptance Criteria

1. ONE `quality` object (Low / High) SHALL hold pixel ratio cap, chunk radius, LOD0 distance, shadows, tree mode and maximum new buildings per frame, with the values of the handover.
2. On first launch the game SHALL measure the frame rate for about 3 s and pick Low below about 50 fps. A manual choice in the CEO Phone Settings app SHALL override it and SHALL be stored per device, like `phoneSettings`.
3. THE preset SHALL NOT be part of the save document.

### Requirement 8: Edit tools in the game (dev)

**User Story:** As the developer, I want to click a house in the game and change it.

#### Acceptance Criteria

1. THE dev Designer SHALL show the id of a clicked building and SHALL offer reroll seed, pick recipe, lock and remove.
2. Writes to `town-overrides.json` SHALL be validated with the zod schema first and SHALL fill `at` automatically. This SHALL NOT be in the production build.
3. `town:bake --check` SHALL list stale or moved overrides.

### Requirement 9 (Phase B2, later): Driving and the sim graph

**User Story:** As a player, I want vans to drive on the new roads.

#### Acceptance Criteria

1. BEFORE any code, a save-impact check SHALL list which District, Node, Edge, Plot, Frontage_Slot and Unloading_Zone data changes, whether `SimState` or the save schema changes, which migrations are needed, and what happens to existing saves. The result SHALL be reviewed by the user.
2. `roads` and `junctions` SHALL become District nodes and edges with ids `<district>:<node>`, curves as chains of short edges, so `pathCacheFor` and vans use the new map.
3. Sidewalk and driving collision SHALL follow the curves. Plots and Unloading_Zones SHALL be derived from Frontage_Slots along the curved roads.
4. Any `SimState` change SHALL bump the save schema version and add a pure migration; save round-trip and migration property tests SHALL keep passing; the golden replay hash SHALL be re-recorded only on purpose.

### Requirement 10 (Phase C, later): Regions

**User Story:** As the developer, I want to add new areas that connect to the existing roads and rivers.

#### Acceptance Criteria

1. Only when a second region is needed: river, highways and main radials SHALL be defined once above the regions in `maps/world-features.json` and clipped to each region.
2. EACH region SHALL have `maps/regions/<id>/brief.json`, `generated/town-<id>.json` and `overrides.json`, and its own seed (`hashSeed("region:<id>:v1")`), so adding a region never changes an existing one. The current town is region `start_city`.
3. A bake SHALL write every road or water crossing on its border as a connector `{ id, at, kind, width, heading }`; a neighbouring region SHALL start its roads from them and SHALL NOT edit a neighbour's Bake.
4. Unlocking regions SHALL reuse the District unlock (`pathCacheFor(reg, unlockedDistricts)`).
