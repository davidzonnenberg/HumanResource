# Requirements Document

## Introduction

Procedural buildings bring the toy-style Dutch town into the game: hand-designed important buildings, generated filler streets, and a way to freeze (pin) streets once they look right. The renderer, generator, presets and preview already exist in `apps/web/src/render/procedural/buildings/`, `packages/content/data/models/buildings.recipes.json` and `docs/previews/town-preview.html`. This spec wires them into the game. The way of working is `docs/buildings.md`; the technical guide is `.kiro/steering/procedural-buildings.md`. All rules in `.kiro/steering/architecture.md` apply.

Everything here is web/render and content. Nothing changes `packages/sim`, the save schema or the sim RNG.

## Glossary

- **Recipe**: a `BuildingRecipe` (v4), complete data for one building including its seed.
- **Fixed_Building**: an important building whose Recipe is in `buildings.recipes.json`, linked to a business def through `modelKey`.
- **Filler_Street**: a street side listed in district map data as `{id, from, to, side}`.
- **Street_Line**: the centreline of a Filler_Street as a list of points; positions on it are measured as a distance along the line.
- **Gap**: a stretch of a Filler_Street between business plots, with a stable id, a length, a start (distance along the Street_Line) and a side.
- **Generated_Street**: the houses `generateStreet(hashSeed(gapId), gapLength, { district })` returns for a Gap.
- **Pinned_Street**: the recipes of a Gap exported to `pinned-streets.json`, used instead of generating.
- **Designer**: the dev-only tool for editing Recipes.
- **Identity_Marker**: the prop set that makes a business type recognisable (beer sign, euro medallion, coat of arms, ...).
- **Stable_Id**: a string id from content, never an array index.

## Requirements

### Requirement 1: Recipe content

**User Story:** As the developer, I want building recipes validated as content, so that a bad recipe never reaches the renderer.

#### Acceptance Criteria

1. THE content loader SHALL validate every entry of `buildings.recipes.json` with `buildingRecipeSchema` and report the recipe id of any failure.
2. A `models.json` entry of kind `procedural-building` SHALL reference a recipe id, and the loader SHALL reject an unknown id.
3. THE Sim SHALL NOT read recipes or model entries for any rule.

### Requirement 2: Rendering in the game

**User Story:** As a player, I want the town to look like the preview, so that the world feels hand-made.

#### Acceptance Criteria

1. WHEN a model key resolves to a procedural building, THE renderer SHALL draw `<ProceduralBuilding>` with owner colour, `lit`, `litLevel`, `mood` and `nudge` taken from data-driven state, with no business id checks.
2. THE main scene SHALL use `createToyLights` and `makeSkyGradient`.
3. `configureBuildingShading` SHALL be called once from settings.

### Requirement 3: Street filling

**User Story:** As the developer, I want streets filled automatically and exactly, so that no gap has holes or overlaps.

#### Acceptance Criteria

1. District map data SHALL carry a `style` and `fillerStreets` entries `{id, side, line}` with Stable_Ids, where `line` is a centreline of two or more points (`from`/`to` is the two-point case). For now all lines are straight; the placement function SHALL already work on any polyline so curved streets need no rewrite.
2. A pure function `streetGaps(district, plots)` SHALL return gaps `{id, length, start, side}` that never overlap a business plot.
3. EACH gap SHALL be filled with `generateStreet(hashSeed(gapId), length, { district })`, and the total house width of a gap SHALL equal the gap length.
4. A gap under 2.5 m SHALL render an alley or garden instead of a house.
5. Seeds SHALL come only from Stable_Ids. THE renderer SHALL NOT use `Math.random` or array indexes as seeds.

### Requirement 4: Pinning

**User Story:** As the developer, I want to freeze finished streets, so that generator improvements never change them.

#### Acceptance Criteria

1. A dev script SHALL write the generated recipes of a district or a street to `pinned-streets.json`, keyed by gap id, after validating them with `buildingRecipeSchema`.
2. WHEN a pinned entry exists for a gap and its total width matches the gap length, THE renderer SHALL use it and SHALL NOT call the generator for that gap.
3. WHEN a pinned entry does not match its gap length, THE renderer SHALL fall back to generating and SHALL warn in dev.
4. Pinned output SHALL stay identical when archetype, palette or district data changes.

### Requirement 5: Dev Designer

**User Story:** As the developer, I want to design and save recipes inside the real game code, so that what I see is what ships.

#### Acceptance Criteria

1. THE Designer SHALL be reachable only with `?dev=1&designer=1` and `isDevMode`, and SHALL NOT be in the production build.
2. THE Designer SHALL import the real modules, with no bundled copy.
3. THE Designer SHALL offer preset, archetype and district pickers, rerolling one aspect, sliders, owner colour, and night, busy and mood switches.
4. WHEN the developer saves, THE dev-only middleware SHALL validate the recipe with the schema, then write it into `buildings.recipes.json` or `pinned-streets.json`, and SHALL refuse invalid data.

### Requirement 6: Hitboxes and doors

**User Story:** As a player, I want to walk and drive against the real building size, so that collisions feel right.

#### Acceptance Criteria

1. Hitboxes SHALL come from recipe `width x depth`, not from visual bounds.
2. THE Enter zone SHALL line up with the recipe door.

### Requirement 7: Performance

**User Story:** As a player on a flagship phone, I want a smooth town.

#### Acceptance Criteria

1. THE team SHALL record triangle counts and FPS for a full district on a flagship phone and on PC.
2. BEYOND a camera distance, buildings SHALL use detail `low` and `animate=false`.
3. Hero buildings SHALL stay within 180k triangles (high) and filler buildings within 80k (high) / 20k (low); the visible town SHALL stay within 2M.

### Requirement 8: Documentation

1. `docs/buildings.md` SHALL describe the way of working, and the steering file and `architecture.md` SHALL point to it.