# Design Document: Procedural Town

## Overview

The agreed design is `docs/procedural-town-handover.md`; this document is the technical summary the tasks build on. The generator exists (`apps/web/src/render/procedural/town/`) and is wired to a bake script (T1). The rest of the work is previewing, chunking, rendering, quality presets and edit tools (Phase A), then the sim graph (Phase B2, save-relevant) and regions (Phase C). Nothing before T7 touches `packages/sim`, the save schema or the sim RNG.

## Pipeline

```
town-brief.json --> generateTown() --> generated/town-<id>.json   (BAKED, committed, frozen)
   (data)           (bake script /                  |
                     preview only)                  v
                              town-overrides.json --> applyOverrides() at load
                                                          |
              +-------------------------------------------+------------------------+
              v                                           v                        v
   render: roads, water, bridges,         render: buildings (chunks,       sim: road graph -> District
   signs, trees (chunked meshes)          instancing, LOD) via recipes     nodes/edges (T7, own phase)
```

Why bake: the generator uses `Math.sin/cos/atan2`, which engines may round differently (the same seed could give a slightly different town on Safari and Chrome); `packages/sim` may not use transcendental math; loading JSON is faster than generating on a phone; and it matches "finished streets get pinned" in `docs/buildings.md`.

## Files

| File | Role |
|---|---|
| `render/procedural/town/townTypes.ts` | Types: brief, roads, buildings, bridges, junctions, overrides |
| `render/procedural/town/townSchema.ts` | zod schemas for Brief, Overrides, TownData + `parseTown*` helpers (same style as `streetsSchema.ts`) |
| `render/procedural/town/geom.ts` | Polyline helpers (measure, sample, offset, Catmull-Rom, intersections) |
| `render/procedural/town/generateTown.ts` | Pure `generateTown(brief, { locked })` |
| `render/procedural/town/applyOverrides.ts` | `applyOverrides(town, overrides)` (returns `{ town, orphans }`) and `lockedBuildings()` |
| `render/procedural/buildings/randomBuilding.ts` | `hashSeed` (FNV-1a) and `mulberry32`, shared with the building generator |
| `packages/content/data/maps/town-brief.json` | The town recipe |
| `packages/content/data/maps/town-overrides.json` | Hand edits keyed by building / road id |
| `packages/content/data/maps/generated/town-<id>.json` | The frozen Bake |
| `scripts/town-bake.ts` | CLI, run with `npm.cmd run town:bake -- <id> [--force] [--check]` (tsx) |
| `docs/previews/town-map-preview.html` | 2D preview (T2 rebuilds it from the real TS) |

Validation is web-side, like `streetsSchema.ts` and the phone `appsSchema`: the data is render-only and the sim never reads it.

## Generator order

zones, water, highway, ring and singel roads, radials and roundabouts, highway overpasses and ramps, gate roads, river quays, centre lanes, landmarks and locked buildings, parks, neighbourhood branch streets, bridges, buildings along every road (following the curve), trees. 1 m occupancy grids keep things from overlapping. A Brief must have the zone keys `core` and `<district>_inner` / `<district>_outer` for every district in `sectors` and `defaultDistrict`.

## Stable ids

| Object | Format |
|---|---|
| Road | kind + index, branches append `.n` to the parent: `ring`, `radial_3`, `radial_3.2`, `lane_14`, `gate_N` |
| Building | `<roadId>/<L|R><n>`, e.g. `lane_0/L2` |
| Landmark | the id from the Brief, e.g. `zuid:tower_synergy` |
| Bridge, sign, junction, park | `br12`, `s40`, `j200`, `park_3` |

Ids are frozen with the Bake. Four tools, light to strong: an override per house; `lock` (kept exactly on `--force`); a Landmark in the Brief; the frozen Bake itself.

## Units and coordinates

1 unit = 1 m. `[x, z]`: x east, z south (towards the camera). Origin is the top-left corner of the town; one `worldOffset` (Brief or `world.json`) lines it up with the current world. No rotation (fixed camera yaw). Widths: lanes 3.2 to 3.4 m, quays 4 m, streets 5 to 8 m, radials 8 m, ring 10 m, highway 26 m.

## Tolerances and known limits

The generator checks footprints on a 1 m grid and samples the inside of a footprint every `max(0.9, min(w, d) / 10)` m with a 0.4 m inset. Since the T1 fix round `rectFree` samples a grid that includes both footprint edges (0.4 m inset, step at most 1 m), and new houses never reuse the id of a landmark or locked building (`n` is incremented). A locked building keeps its id, stores the old road as `lockedRoadId` and gets `roadId` of the road it touches now (or null). The tests keep the agreed 0.5 m tolerance; footprint, ribbon and Property 1 checks are `it.fails` because the generator still exceeds it (neighbours up to about 1.2 m, roads about 0.8 m, landmarks against later branch streets about 2 m). They flip to failing when the generator is tight enough; then make them normal tests.

## Performance plan

Chunks (256 m, bake step), LOD tiers per building (LOD0 near, recipe at `low`; LOD1 box, roof and atlas; LOD2 chunk merged), instancing by snapped footprint, geometry built in a Web Worker in small batches, cheap instanced props (far trees as billboards), roads as one ribbon mesh per Chunk with surface from a texture. The camera is top-down with a fixed yaw, so only a small area is on screen.

| Setting | Low (phones) | High (PC) |
|---|---|---|
| Pixel ratio cap | 1.5 | device |
| Chunk radius | 1 ring (about 400 m) | 2 rings (about 650 m) |
| LOD0 distance | 35 m | 80 m |
| Shadows | off / blob | shadow map near the camera |
| Trees | billboards beyond 40 m | meshes to 150 m |
| Max new buildings per frame | 4 | 16 |

Auto-pick on first launch from a 3 s frame-rate measurement (Low below about 50 fps), with a manual override in the phone Settings app, stored per device. Budgets on Low: 150 draw calls, 400k triangles, 16 ms per frame.

## Determinism and saves

Seeds come from string ids through `hashSeed`; `mulberry32` is integer based; nothing about the town is written to saves or sent to the server. Every device rebuilds the same town from the content that ships in the web build plus the ids. The sim sees only baked numbers (T7).

## Phase B2: sim graph (T7)

Own sub-spec when it starts. First step is the save-impact check: which District, Node, Edge, Plot, Frontage_Slot and Unloading_Zone data changes, whether `SimState` or the save schema changes, which migrations are needed (pure functions over JSON), and what happens to existing saves. No code before the user has seen it. Node ids are `<district>:<node>`; curves become chains of short edges; path-finding stays behind `pathCacheFor(reg, unlockedDistricts)`; Plots and Unloading_Zones come from Frontage_Slots; the golden hash is re-recorded only on purpose.

## Phase C: regions (T9)

World features (river, highways, main radials) as world polylines in `maps/world-features.json`, clipped per region; per-region brief, bake and overrides in `maps/regions/<id>/`; edge connectors `{ id, at, kind, width, heading }` written by a bake and read by its neighbour; each region has its own seed so adding one never changes another; unlock through Districts. Not started until a second region is needed.
