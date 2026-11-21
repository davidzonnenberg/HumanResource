# Implementation Plan: Procedural Town

## Overview

Do the tasks in order. Source of truth: `docs/procedural-town-handover.md`. Web and content only until T7. No changes in `packages/sim`, the save schema, the sim RNG or the current District/map files before T7.

Definition of done for every task, run from the repo root:
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd test`

Do not commit or push unless the user asks. Never hand-edit the generated JSON: change the Brief or the Overrides and re-bake. Seeds only from stable string ids; no `Math.random` in town code.

## Phase A: town in the game (web, render and content only)

- [ ] T1. Drop in the generator (no game change)
  - [x] Files in `render/procedural/town/`; `rng.ts` removed, `hashSeed` and `mulberry32` imported from `render/procedural/buildings/randomBuilding` (same FNV-1a hash, same sequence as the old `rng.ts`).
  - [x] `townSchema.ts` with zod schemas for Brief, Overrides and TownData; Brief checks required zone keys and a rule with weight > 0 in every zone.
  - [x] `npm.cmd run town:bake` wired (tsx); validates Brief and Overrides before generating and TownData before writing; run once for `start_city`.
  - [x] Tests (`apps/web/test/town/`): determinism, unique ids, no overlaps (ribbons, water, footprints), roads >= 2 points, junction references, gates N and S, applyOverrides, lock test, property test over 100 seeds (`Feature: procedural-town, Property 1`), content test for the committed Brief and Overrides.
  - [x] Preview and bake give the same counts for the same seed (done in T2: 326 roads, 1265 buildings, 19 bridges, 566 junctions).
  - _Requirements: 1.1 to 1.7, 2.2, 2.4, 2.5, 3.1 to 3.3, 3.6_
  - _Done when: the bake exists, preview and bake give the same counts for the same seed, all tests pass._

- [x] T2. Preview stays the design tool
  - [x] Keep `docs/previews/town-map-preview.html` working from the real TS: `npm.cmd run town:preview` bundles `render/procedural/town/preview/` (`--check` verifies the page is current).
  - [x] Clicking a building shows its id; "Download baked JSON" works (checked in headless Edge: page renders, counts line shows).
  - [x] Same counts as the bake for the same seed (326 roads, 1265 buildings, 19 bridges, 566 junctions) and the same JSON byte for byte: the preview passes the locked buildings of the committed bake to the generator, like `town:bake --force` does.
  - _Requirements: 4.1, 4.2_
  - _Done when: the preview runs from the repo's TS and gives the same counts as the bake for the same seed._

- [x] T3. Chunk the bake
  - [x] The bake step splits roads, buildings, trees and signs into 256 m chunks (`generated/town-<id>/chunk_<cx>_<cz>.json` plus an index file). Roads crossing chunk borders are clipped per chunk and keep their id.
  - [x] Test: the union of the chunks equals the monolithic bake (no object lost, only clipped road parts repeated).
  - _Requirements: 5.1, 5.2_
  - Everything not listed above (water, bridges, junctions, roundabouts, cul-de-sacs, parks, plaza, zone grid, warnings) stays whole in `index.json` under `shared`; the highway is chunked like a road. `town:bake -- <id> --chunks` re-writes the chunks from the existing bake without touching it.
  - _Done when: chunks and index are written by `town:bake`, and the union test passes._

- [x] T4. Render roads, water and bridges from the bake
  - Dev scene behind a flag first. Ribbon meshes per road (width and surface from the data), curved, merged per chunk; water ribbons; bridge decks; roundabouts; signs as instanced meshes.
  - Replaces the "one width, one texture" assumption in `roadField` and the road mesh (wishlist: map layout).
  - _Requirements: 6.1_
  - _Done when: the dev scene shows the whole town with correct widths and surfaces, with the draw-call budget met on Low._

- [x] T5. Render buildings with LOD and instancing
  - LOD0: existing procedural recipe at `low`, fed with `seed`, `width`, `depth`, `kind`. Add archetypes for `flat`, `office`, `tower`, `warehouse`, `villa` (data). LOD1: box, roof, atlas. LOD2: merged chunk mesh. Fixed recipes (overrides, landmarks) use `buildings.recipes.json`. Hitboxes from width x depth.
  - _Requirements: 6.2 to 6.5_
  - _Done when: the dev scene shows buildings at all three LODs, hitboxes match, and the Low budgets hold in the dev scene._

- [x] T6. Quality presets (phone measurement still open, see Progress)
  - The `quality` object, auto-detect on first launch, a setting in the CEO Phone Settings app (per device, not in the save).
  - Measure on the user's phone against the section 7 budgets (manual check for the user).
  - _Requirements: 7.1 to 7.3, 6.6_
  - _Done when: Low and High presets drive chunk radius, LOD distance, shadows, trees and the per-frame budget, and the phone measurement is recorded._

- [ ] T8. Edit tools
  - Dev Designer: click a building in the game, show its id, reroll its seed, pick a recipe, lock it, remove it, and write to `town-overrides.json` (validated by the zod schema first, `at` filled in automatically; not in the production build).
  - `town:bake --check` lists stale or moved overrides (already works from T1).
  - _Requirements: 8.1 to 8.3, 3.3_
  - _Done when: an edit made in the game appears in `town-overrides.json`, survives a reload, and a stale override is listed by `--check`._

## Phase B2 (LATER): sim graph. Save-relevant. Own spec.

- [ ] T7. Driving and the sim graph
  - **Start with a save-impact check; no code before the user has seen it.** List which District, Node, Edge, Plot, Frontage_Slot and Unloading_Zone data changes, whether `SimState` or the save schema changes, which migrations are needed, and what happens to existing saves.
  - Then: `roads` and `junctions` become District nodes and edges (`<district>:<node>`, curves as chains of short edges) so `pathCacheFor` and vans use the new map. Sidewalk and driving collision along curves. Plots and Unloading_Zones derived from Frontage_Slots along the curved roads.
  - Schema version bump and a pure migration for any `SimState` change; save round-trip and migration property tests keep passing; golden hash re-recorded only on purpose.
  T7 extra requirements (reseed-safe):
- Business plots are anchored to landmarks or locked buildings, never to generated ids,
  so a re-bake keeps every business in place.
- Saves store a layoutVersion (hash of the bake). On load with a different layoutVersion:
  snap vans/workers to the nearest road node, recompute routes, keep businesses on their anchored plots.
  Test: load a save made on bake A into bake B without errors or lost Gold/cargo.
- town:bake --force prints which businesses/plots would move and refuses if one would be lost.
  - _Requirements: 9.1 to 9.4_
  - _Done when: the save-impact check is approved, vans drive the new graph, and the existing tests plus the golden replay pass._

## Phase C (LATER): regions. Only when a second region is needed.

- [ ] T9. Regions
  - World features file (river, highways, main radials), per-region brief, bake and overrides, edge connectors, unlock via Districts.
  - _Requirements: 10.1 to 10.4_
  - _Done when: a second region is baked from a connector of the first without changing the first region's bake._

## Progress

- T1 built (Nov 2026). Typecheck, lint and tests are green. Open items for the user (see the T1 report): the footprint sampling limit of the generator, the id clash after `--force` with locked buildings, and the preview that still has to be rebuilt from the real TS (T2).

- T2 and T3 built (Nov 2026). The committed bake has 1265 buildings (not the 1323 of the handover): it is `town:bake --force` with the locked building `lane_0/L2`, which a plain `generateTown` (1290) does not have. A `--force` re-bake reproduces the committed file byte for byte. `--check` lists 2 stale example overrides (`ring/L1`, `ring/L2`), which were already stale.

- T4 built (Nov 2026). Dev scene: `npm.cmd run dev` then open `/?dev=1&town=roads`. Code in `render/procedural/town/` (`townRoadMesh.ts` pure mesh data, `TownScene.tsx`, `TownDevScene.tsx`, `townLoader.ts`), flag in `dev/townDevFlag.ts`. One merged mesh per chunk, one shared mesh (water, bridges, roundabouts, cul-de-sacs, parks, plaza), one instanced mesh per sign kind: about 40 draw calls for the whole town (budget test: <= 150 calls, <= 400k triangles). Not done yet: the existing game scene still uses the old `Roads`/`roadField`; swapping it in comes with T7. Draw calls on a real phone are not measured (T6).

- T5 and T6 built (Nov 2026). Dev scene: `npm.cmd run dev`, open `/?dev=1&town=full` (add `&q=low` or `&q=high` to force a preset; arrow keys or right mouse pan, wheel zooms). LOD0 = recipe at `low` from seed/width/depth/kind (`townBuildings.ts`), LOD1 = two instanced draw calls (walls with a window texture, roofs), LOD2 = one merged mesh per far chunk. New archetypes `flat_block`, `office_block`, `tower_block`, `warehouse_shed`, `villa_house` with their own `town_*` districts, so the old streets do not change. The recipe schema now allows width up to 64, depth up to 40 and 14 floors. Quality: `render/quality.ts` (presets, probe), `qualityStore.ts` (per device, key `renderQuality`), a Graphics section in the Settings app. Low caps LOD0 at 5 buildings (the handover had no cap; 10 gave up to 490k triangles). Measured by test on the committed bake at the 13 densest spots: Low <= 56 draw calls and <= 260k triangles (budget 150 / 400k). Not done: the game scene does not draw the town yet (T7), the LOD0 hitbox is only a pure function (`buildingHitbox`) until T7 wires collision, and instancing of LOD0 shapes was left out (LOD1 is the instanced tier). **Open for you (manual): measure on your phone with the dev scene (`window.__townStats`, or the console line every 5 s) and write the numbers here.**

## Notes

- Far-future ideas stay in `docs/wishlist.md`.
- `docs/buildings.md` and `.kiro/steering/procedural-buildings.md` describe the building rules the town follows.
