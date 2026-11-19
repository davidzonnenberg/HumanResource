# Buildings: way of working

How houses and important buildings get into the game. The technical guide is `.kiro/steering/procedural-buildings.md`. The preview and Designer is `docs/previews/town-preview.html`. This document is the agreed process.

## 1. Two kinds of buildings

**Fixed (hero) buildings.** Important buildings are hand-designed recipes in `packages/content/data/models/buildings.recipes.json`: pub, bank, municipality, brewery, later farm and so on. You design them in the Designer, save the recipe under an id, and link it to the business definition with `modelKey` (`models.json`, `kind: 'procedural-building'`, `recipe: <id>`). A fixed recipe is a complete description of the building, seed included. It never changes unless someone edits it.

Each important business type has a clear **identity marker** (see the guide): pub = hanging beer sign, 3D mug and lanterns; bank = portico and gold euro medallion; municipality = coat of arms, flag and clock; brewery = barrels, crates and painted sign; Synergy = logo, brass plate and banner. A new business type (farm, ...) gets its own marker before it gets a building.

**Generated streets.** Normal streets are generated. District map data lists `fillerStreets`, each with a stable `id`, a `side` and a centreline `line` (two or more points; a straight street is just two). The street is cut into **gaps** between the business plots on that side, measured as distance along the line. The length of each gap is filled exactly with `generateStreet(hashSeed(gapId), gapLength, { district })`, so the total house width per gap equals the gap length. A gap shorter than 2.5 m becomes an alley or a garden instead of a house.

## 2. Seeds and saves

- Seeds always come from **stable string ids** (`hashSeed("old_town:canal_a:gap_2")`), never from array indexes, never from `Math.random`. Inserting a plot must not reshuffle other streets.
- Buildings are **never stored in saves and never sent to the server.** The server only stores save documents. Every device rebuilds the town from the content that ships in the web build plus the ids. Resetting a save, changing slots or switching device does not change the houses.
- The web RNG (`mulberry32`) is integer based, so the same seed gives the same recipe on every device and browser. It is separate from the sim RNG and never used by `packages/sim`.

## 3. What can change a generated house

Same ids and same data give the same house. A generated house changes when:
- a **gap length** changes (a plot moves, a street is shortened or lengthened), or
- the **generator code or data** changes: archetypes, palettes (schemes), district styles, or the generator logic itself.

That is why finished streets get **pinned**.

## 4. Pinning

When you are happy with a street, pin it. Pinning exports the generated recipes of its gaps to `packages/content/data/models/pinned-streets.json`, keyed by gap id. From then on the game uses the pinned recipes and does not call the generator for those gaps. You can keep improving archetypes and palettes without touching finished streets.

- Pin with `npm.cmd run buildings:pin -- <district>` or `-- <streetId>`, or from the Designer.
- A pinned recipe is complete data (every value written out), so it does not depend on generator code.
- Pinned recipes can be edited one by one in the Designer and saved back.
- If a gap length changes after pinning, the pinned entry no longer fits. The renderer detects a width mismatch, logs a warning in dev, and falls back to generating that gap until it is re-pinned.
- Rule of thumb: pin a street as soon as you like it.

## 5. Choosing favourites

1. In the preview or Designer, reroll or tweak until a house is right.
2. "Save favourite" keeps it in the browser (`localStorage`, key `hr_building_favs`). "Download favourites" writes `building-favourites.json`. "Copy JSON" copies one recipe.
3. To make it permanent in the game, give the file or the JSON to Kiro (put it in the repo, for example `docs/previews/favourites/`, or paste it in chat) and say where it goes: a fixed building id, or a gap id in a pinned street. Kiro validates it with `buildingRecipeSchema` and writes it to `buildings.recipes.json` or `pinned-streets.json`.
4. Once the dev Designer exists (spec task 5), Save writes straight into those files, validated first. The browser copy is then only a scratch pad.

The browser copy is not the source of truth. Only the JSON files in `packages/content` are.

## 6. Extending

- New house character: add an **archetype** (data).
- New neighbourhood: add a **district style** (data), then point a district's `style` at it.
- New colours: add **schemes** with tags (data).
- New business type: add an **identity marker** (code in `props.ts`, plus sign text if needed).
- Never special-case a business id in the renderer.

## 7. Rules that always apply

- Nothing here touches `packages/sim`, the save schema or the sim RNG.
- A pinned or fixed recipe must pass `buildingRecipeSchema` before it is committed.
- Hitboxes come from recipe `width x depth`, not from the visual bounds, because props stick out.

## 8. Streets in the game now

Data: `packages/content/data/maps/filler-streets.json` (render-only, validated in `apps/web/src/render/procedural/buildings/streetsSchema.ts`). Code: `streets.ts` (pure placement and gaps), `streetsLayout.ts` (blockers from the map), `FillerStreets.tsx` (rendering and hitboxes).

- `side` is relative to the direction of `line`. On the top-down map (x right, z towards the camera), a line running +x has `left` = north, a line running +z has `left` = east and `right` = west.
- Houses start 0.1 m outside the sidewalk and are at most 8.5 m deep. Plots, unloading zones, landmarks (with 0.5 m margin) and crossing roads cut a street into gaps. Short leftovers (under 2.5 m) stay empty.
- Streets today: `west_street_east` and `west_street_west` (both sides of the x = -30 road), and `north_left_of_hall` (north side of the z = -32 road, from the road corner to the left edge of the town hall).
- To end a row at a building, end the `line` at its edge (the landmark margin enforces the rest). If the town hall moves or goes away, edit that street's `line` and add another street for the rest.
- To reroll one street, rename its id. To change a house, pin it (task 4).
- Houses render at detail `low` for now: `high` measured 108k to 217k triangles per house (2.5M for 17 houses), `low` 19k to 32k (0.42M).