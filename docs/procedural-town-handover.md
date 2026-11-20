# Handover: procedural town map (Utrecht-style)

Status: **design + working generator, not wired into the game yet.**
Owner: David. Implementer: Kiro. This document is the agreed process; turn sections 8–9 into a spec
(`.kiro/specs/procedural-town/`) before writing game code. Far-future parts stay in docs/wishlist.md.

---

## 1. What we want

- A city that feels Dutch/German, not an American grid: curved roads, crossroads, roundabouts, a highway with ramps,
  narrow klinker lanes in the centre, houses that **follow the curve of the road**.
- Layout like Utrecht:
  - **One river/gracht north → south** through the centre, with quays on both sides.
  - A **rounded-rectangle singel** (canal) around the centre. Only a few **gate bridges** (default: N and S) lead in,
    so driving into the centre is slow and a bit annoying, on purpose.
  - Inside: crowded, narrow, twisting lanes with canal houses.
  - **West**: flats, students, cheaper area. **North + East**: rich, herenhuizen, villas, parks.
    **South**: offices, towers, warehouses, industry. A **ring road** with roundabouts, **radials** outward, a **highway** S + E.
- Everything procedural, but **frozen once we like it**, and every single house editable.
- Expandable later with new regions that connect to the existing roads and rivers.
- Must run on mobile (low preset) and PC (high preset) with thousands of buildings.

## 2. Files in this handover

| File | Goes to | What |
|---|---|---|
| `townTypes.ts` | `apps/web/src/render/procedural/town/` | All types: brief, roads, buildings, bridges, junctions, overrides |
| `rng.ts` | same | `hashSeed` (FNV-1a) + `mulberry32`. **If the repo already has these in `render/procedural/buildings`, delete this file and import those.** |
| `geom.ts` | same | Polyline helpers (measure, sample, offset, Catmull-Rom, intersections) |
| `generateTown.ts` | same | The generator. Pure function `generateTown(brief, { locked })` |
| `applyOverrides.ts` | same | Applies `town-overrides.json` on top of a bake; reports stale overrides |
| `town-brief.json` | `packages/content/data/maps/` | The town "recipe": size, singel, river, districts, zone rules, landmarks |
| `town-overrides.json` | `packages/content/data/maps/` | Hand edits per building / road id (examples inside) |
| `town-bake.ts` | `scripts/` | CLI: brief → `packages/content/data/maps/generated/town-<id>.json` |
| `town-map-preview.html` | `docs/previews/` | Standalone 2D preview: reroll seeds, click a house to get its id, download the bake, load a brief |

The generator TypeScript compiles under `strict` + `noUnusedLocals`. The preview HTML contains the same code, compiled.
Example output (seed `v1`, 1300 × 1050 m): ~1,300 buildings, ~330 roads, 19 bridges (2 singel gates), ~570 junctions,
≈ 1 s to generate, ≈ 0.6 MB JSON.

## 3. The pipeline

```
town-brief.json ──► generateTown() ──► generated/town-<id>.json  (BAKED, committed, frozen)
   (data)            (bake script /                    │
                      preview only)                    ▼
                                    town-overrides.json ──► applyOverrides() at load
                                                                 │
                    ┌────────────────────────────────────────────┼─────────────────────────┐
                    ▼                                            ▼                         ▼
          render: roads, water, bridges,          render: buildings (chunks,    sim: road graph → District
          signs, trees (chunked meshes)           instancing, LOD) via           nodes/edges (separate spec)
                                                  building recipes
```

**Why bake instead of generating at runtime?**
1. The generator uses `Math.sin/cos/atan2`. JS engines may give slightly different floats, so the same seed could give a
   slightly different town on Safari vs Chrome. A baked JSON is identical on every device.
2. `packages/sim` may not use transcendental math (architecture.md). The sim only ever sees the baked numbers.
3. Loading JSON is much faster than generating, which matters on phones.
4. It matches the existing building rule: "finished streets get pinned" (docs/buildings.md). The bake is a pinned *town*.

Rules that carry over from docs/buildings.md and architecture.md:
- Seeds come from stable string ids (`hashSeed("start_city:v1")`, each building `seed = hashSeed(buildingId)`), never `Math.random`.
- Nothing about buildings goes in saves or to the server.
- `packages/content` stays JSON only. Generator code lives in `apps/web` (render) and `scripts/`. `packages/sim` never imports it.

## 4. Units and coordinates

- 1 unit = 1 metre. Generator `[x, z]`: x = east (right), z = south (towards the camera), the same as the top-down game map.
- The town origin is the top-left corner (0, 0). Kiro adds one `worldOffset` (in the brief or world.json) to line it up with the
  current world. Do not rotate: the camera has one fixed yaw.
- Widths: lanes 3.2–3.4 m, quays 4 m, neighbourhood streets 5–8 m, radials 8 m, ring 10 m, highway 26 m.
  Canal houses 4–6.5 m wide; offices up to 26 m; warehouses up to 60 m; towers 18–32 m.

## 5. Keeping track of streets and houses (the "change one house" question)

Every object has a **stable id**:

| Object | Id format | Example |
|---|---|---|
| Road | kind + index, branches append `.n` to the parent | `ring`, `radial_3`, `radial_3.2`, `radial_3.2.1`, `lane_14`, `gate_N` |
| Building | `<roadId>/<L or R><n>` (side of the road, nth house) | `lane_0/L2`, `ring.1/R7` |
| Landmark | the id from the brief | `zuid:tower_synergy` |
| Bridge / sign / junction / park | `br12`, `s40`, `j200`, `park_3` | |

The ids are frozen together with the bake. There are four tools, from light to strong:

1. **Change the look of one house:** `town-overrides.json → buildings["lane_0/L2"]`
   - `seed`: reroll just this house.
   - `colour`, `kind`: different style.
   - `recipe`: use a fixed, hand-designed recipe from `buildings.recipes.json` (hero buildings, a pub, a bank).
   - `remove`: empty plot (garden, parking, a future business).
   - `at: [x, z]`: where the house was when you made the override. If a re-bake moves that id more than 3 m, the bake script
     reports it instead of silently editing the wrong house.
   Overrides are applied **at load**, so editing them never needs a re-bake.
2. **Keep a house exactly where it is, even after re-generating:** `"lock": true`. On `town:bake --force` the locked
   buildings from the previous bake are passed to the generator as fixed obstacles. Roads and other houses are built around them.
3. **Skyscrapers and other must-stay buildings:** put them in `town-brief.json → landmarks` with a fixed position
   (relative to the centre or absolute), size, angle and optional recipe. They are placed before the neighbourhood streets,
   so streets curve around them. If one overlaps water or a road, the bake prints a warning.
4. **Freeze the whole town:** the bake file itself. `town:bake` refuses to overwrite it without `--force`.

Workflow: open `docs/previews/town-map-preview.html`, click a house → the status line shows its id, kind, zone, size,
road and seed → add that id to `town-overrides.json`. Later the in-game dev Designer can do the same (task T8).

Streets get **names** the same way: `town-overrides.json → roads["gate_N"].name`. You can also change `surface` and `width`.

## 6. Expanding the world later (regions)

- The world becomes a list of **regions**, each with its own brief, bake and overrides:
  `maps/regions/<id>/brief.json`, `generated/town-<id>.json`, `overrides.json`. The current town is region `start_city`.
- **World-scale features are defined once, above the regions**: the river, highways and main radials as world polylines
  (`maps/world-features.json`). A region clips them to its bounds instead of making up its own. That is why the river keeps
  flowing and the highway keeps going.
- **Edge connectors.** When a region is baked it writes every road/water crossing on its border as a connector
  `{ id, at, kind, width, heading }`. A new neighbouring region reads those connectors and starts roads from them, so roads
  join cleanly. A region never edits a neighbour's bake.
- A new region has its own seed (`hashSeed("region:oost:v1")`), so adding it never changes existing regions.
- Unlocking regions can reuse the existing District unlock (`pathCacheFor(reg, unlockedDistricts)`).

The current generator makes one region. Splitting `river/highway/radials` out into world features is task T9, done when
the second region is needed, not before.

## 7. Performance plan (thousands of houses, mobile + PC)

Measured today (docs/buildings.md): one house at detail *low* is 19k–32k triangles. 1,300 of those would be ~30–40 M triangles,
which no device can draw. So performance has to be planned now, before the town is in the game:

| # | Technique | How | Gain |
|---|---|---|---|
| 1 | **Chunks** | Split the bake into 256 × 256 m chunks (bake step). Only build chunks within N m of the camera/van; dispose the rest. Generation is deterministic, so rebuilding is free. | Memory, load time |
| 2 | **LOD tiers per building** | LOD0 (near, < ~60 m): the procedural recipe at *low*. LOD1 (60–250 m): box + roof + facade texture/atlas, ~100–300 tris. LOD2 (far): all buildings in a chunk merged into one mesh. | Biggest triangle saving |
| 3 | **Instancing** | Snap footprints to 0.5 m (or 1 m) per kind → ~200 unique shapes for ~1,300 buildings. Build each once and draw with `InstancedMesh` + per-instance colour. Hero buildings and overrides with a recipe stay unique. | ~1,300 draw calls → ~200 or fewer |
| 4 | **Build in a Web Worker** | Build geometry off the main thread and hand over transferable buffers; at most N buildings per frame. | No stutter while driving |
| 5 | **Cheap props** | Trees, signs and lamps as instanced meshes; far trees as flat billboards. | Thousands of props cost almost nothing |
| 6 | **Roads as one mesh per chunk** | Ribbon mesh along each polyline, merged per chunk; klinkers/asphalt via texture, not geometry. | Few draw calls |

The camera is top-down with a fixed yaw, so only a small area is ever on screen. That makes chunks + LOD very effective.

**Quality presets** (one `quality` object that render code reads; part of phone Settings, stored per device like phoneSettings):

| Setting | Low (phones) | High (PC) |
|---|---|---|
| Pixel ratio cap | 1.5 | device |
| Chunk radius | 1 ring (≈ 400 m) | 2 rings (≈ 650 m) |
| LOD0 distance | 35 m | 80 m |
| Shadows | off / blob | shadow map near the camera |
| Trees | billboards beyond 40 m | meshes to 150 m |
| Max new buildings per frame | 4 | 16 |

Auto-pick on first launch: measure the frame rate for ~3 s, pick Low if it is below ~50 fps, keep a manual override.

Budgets to test against (Low): ≤ 150 draw calls, ≤ 400k triangles on screen, ≤ 16 ms/frame on a mid-range Android phone.

## 8. Tasks for Kiro (turn into `.kiro/specs/procedural-town/`)

Do them in order. Each task ends with `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` (architecture.md).
Do not commit or push unless David asks.

**T1 – Drop in the generator (no game change).**
- Copy the files from section 2. Reuse the existing `hashSeed`/`mulberry32` if present (it must still be integer-based).
- Add a zod schema for `TownBrief` and `TownOverrides` in `apps/web/src/render/procedural/town/townSchema.ts`
  (same pattern as `streetsSchema.ts`) and validate both files in a content test.
- Wire `npm.cmd run town:bake` like `buildings:pin`. Run it once → `generated/town-start_city.json`.
- Tests: same brief → identical JSON (determinism); every building id unique; no two building footprints overlap; no building
  overlaps a road ribbon or water; every road has ≥ 2 points; `gates` produce bridges over the singel; property test over
  ≥ 100 random seeds (tag `// Feature: procedural-town, Property 1: ...`).
- *Done when:* the bake exists, the preview and the bake give the same counts for the same seed, all tests pass.

**T2 – Preview stays the design tool.** Keep `docs/previews/town-map-preview.html` working from the real TS
(a small build step, or a dev page `?dev=1&town=preview`). Clicking a building shows its id; "Download baked JSON" works.

**T3 – Chunk the bake.** Bake step splits roads/buildings/trees/signs into 256 m chunks
(`generated/town-<id>/chunk_<cx>_<cz>.json` + an index file). Roads crossing chunk borders are clipped per chunk, keeping their id.

**T4 – Render roads, water and bridges from the bake** (dev scene behind a flag first).
Ribbon meshes per road (width + surface from the data), curved, merged per chunk; water ribbons; bridge decks; roundabouts;
signs as instanced meshes. This replaces the "one width, one texture" assumption in roadField / the road mesh (wishlist: map layout).

**T5 – Render buildings with LOD + instancing.** LOD0 = existing procedural recipe at *low*, fed with
`seed`, `width`, `depth`, `kind` (add archetypes for `flat`, `office`, `tower`, `warehouse`, `villa`; the current max depth of 8.5 m
only fits canal/terrace houses). LOD1 = box/roof/atlas. LOD2 = merged chunk mesh. Fixed recipes (overrides/landmarks) use
`buildings.recipes.json`. Hitboxes from width × depth (as today).

**T6 – Quality presets.** The `quality` object + auto-detect + a setting in the CEO Phone Settings app (per device).
Measure on David's phone against the budgets in section 7.

**T7 – Driving + sim graph (own spec, save-relevant).**
Turn `roads` + `junctions` into District nodes/edges (`<district>:<node>`, curves as chains of short edges) so
`pathCacheFor` and vans use the new map. Sidewalk and driving collision along curves. Plots and unloading zones derived from
Frontage_Slots along the curved roads. This changes District data → check save impact and migrations before starting.

**T8 – Edit tools.** Dev Designer: click a building in game → show its id, reroll its seed, pick a recipe, lock it, remove it,
and write to `town-overrides.json` (validated by the zod schema first, with `at` filled in automatically).
`town:bake --check` lists stale or moved overrides.

**T9 – Regions (only when the second region is needed).** World features file, per-region brief/bake/overrides,
edge connectors, unlock via Districts (section 6).

## 9. Tuning cheatsheet (`town-brief.json`)

- More/fewer gates into the centre: `"gates": ["N","S"]` → add `"E"`, `"W"`.
- Bigger centre: `singel.halfWidth/halfDepth`. Squarer singel: `singel.squareness` (0.5 = square-ish, 1 = ellipse).
- District directions: `sectors` (degrees from the centre, 0 = east, 90 = south). Anything not covered is `defaultDistrict`.
- Street density per zone: `zones.<zone>.branchSpacing` (bigger = fewer streets), `branchLength`.
- Curviness: `curveJitter` + `curveMax` (rich_outer is the curliest, business_outer the straightest).
- Building mix per zone: `zones.<zone>.buildings[]` with `weight`, sizes, gaps, setbacks, palettes.
- Busy centre: `core.laneSpacing` (smaller = more lanes), `core.crossLanes`, `core.riverBridges`.
- New look, same layout? Don't touch the brief: edit archetypes/palettes in the building generator; the bake keeps the layout.
- New layout? Change `seed` (e.g. `"v2"`) and run `town:bake -- start_city --force`. Locked houses and landmarks stay.

## 10. Prompt to paste into Kiro

> Read `docs/procedural-town-handover.md`, `docs/buildings.md` and `.kiro/steering/architecture.md`.
> Create the spec `.kiro/specs/procedural-town/` (requirements, design, tasks) from sections 3–8 of the handover, keeping the
> task order T1–T9 and the acceptance criteria. Then implement **T1 only**: put the provided files in the listed locations,
> reuse the existing `hashSeed`/`mulberry32` if they exist, add the zod schemas and the content/property tests, wire
> `npm.cmd run town:bake`, and run the bake once for `start_city`. Do not touch `packages/sim`, the save schema or the current
> map/District files. Finish with typecheck, lint and tests, and report the bake counts (roads, buildings, bridges, junctions)
> and any warnings. Do not commit.
