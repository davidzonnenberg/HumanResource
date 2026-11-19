---
inclusion: auto
name: procedural-buildings
description: Read before adding, changing or wiring procedural buildings (toy-style Dutch houses, archetypes, districts, hero buildings, identity markers, building animation, toy shading) in Human Resource.
---

# Procedural buildings (v4) – foundation and integration guide

Adds to `architecture.md`. Web/render + content only: nothing here touches `packages/sim`, saves or the sim RNG. Trig is fine in render code.
v4 replaces earlier versions in `apps/web/src/render/procedural/buildings/` (recipe format changed; no saved data to migrate).
Target: flagship phones (Galaxy S26, iPhone 18 Pro) and PC. Detail `high` by default.

## Design rules (keep the look consistent)
- **Curated, not random.** A house comes from an *archetype* (a matching set of choices) living in a *district*. Colours come from curated *schemes* (wall + bands + trim + door + roof chosen together). Never pick colours per slot at random.
- **Streets are coherent.** A street picks one base height; houses differ by at most one floor (district `heightJitter`). Neighbours never repeat archetype or gable kind.
- **One focal point per house** (`focal`): round window, bay window, niche, balcony, gable stone or big sign. Detail is not spread evenly.
- **Important buildings have clear identifiers** (`identity`): pub = hanging beer sign + 3D mug + lanterns; bank = portico + gold € medallion; municipality = coat of arms + flag + clock; brewery = barrels + crates + painted sign; coffee = neon cup; Synergy = logo + brass plate + banner. New business types (farm, …) must get their own identity marker.
- **Soft clay toy style**: rounded/bevelled parts, thick cream outlines, moulded tube rims on curved gables, bigger body radius (`bodyRadius`).
- **Hand-made, mildly**: `imperfection` (lean, bulge, ridge sag, crooked windows), `taper` (upper floors slightly wider/narrower), `corniceOverhang`. Keep values in the archetype ranges; don't exaggerate.
- All randomness via `c.rng` / `c.jit(k)` / `c.chance(p)` / `c.pick` (seeded by `recipe.seed`). Wonkiness must scale with `c.imp` so `imperfection: 0` stays straight.
- Everything goes through `Collector.add` (it bakes AO, applies the warp, and routes parts into movers). Never push geometry into groups another way.

## Files (`apps/web/src/render/procedural/buildings/`)
| File | Role |
|---|---|
| `gables.ts` | Pure 2D gable outlines (+ `flat` for modern), finials, step caps, densify/offset helpers |
| `signAtlas.ts` | Fixed sign texts + atlas cell lookup (pure) |
| `palettes.ts` | Curated colour schemes with tags (pure) |
| `buildingRecipe.ts` | `BuildingRecipe` v4 type, `PropFlags`, hero presets |
| `archetypes.ts` | 14 archetypes + 5 district styles (pure data) |
| `randomBuilding.ts` | `randomDutchHouse`, `generateStreet`, `rerollAspect`, RNG, `hashSeed` |
| `buildingRecipe.schema.ts` | zod schema + cross-field checks |
| `buildingTextures.ts` | Brick / slate / plaster maps + sign atlas canvas |
| `buildingMaterials.ts` | Shared materials with toy shading: toon ramp, rim light, wax, wall weathering; `configureBuildingShading` |
| `toyLighting.ts` | Warm sun / cool sky lights + sky gradient |
| `collector.ts` | Shape factories, `Warp`, `Collector` (AO, movers, anchors, sign text) |
| `facade.ts` | Windows (+ window life, boarded), doors, lanterns, awnings, focal points |
| `props.ts` | Street + facade props, identity markers (€, beer mug/sign, coat of arms, Synergy logo, neon) |
| `buildingGeometry.ts` | Main builder → merged geometries per group + movers + smoke anchors; cache |
| `ProceduralBuilding.tsx` | `<ProceduralBuilding … lit litLevel mood nudge animate detail/>`, `<ProceduralStreet district …/>` |

Preview: `docs/previews/town-preview.html` – Town (all districts), One street, Designer (reroll one aspect, copy JSON, favourites). Q/E turning is preview-only; the game keeps its fixed yaw.

## Mesh groups and materials
`brick`, `plaster` (textured walls with weathering), `roof`, `trim` (toon ramp), `gloss` (door paint, brass, gold, solar), `glass`, `lit` (glows at night; per-instance clone in the component), `sign` (atlas letters, alphaTest). Movers carry their own small geometries per group.

## Animation (render only, never sim)
- Movers: `swing` (hanging signs, te-koop board), `wave` (flags), `sway` (laundry, banners), `flicker` (lanterns, neon, Christmas lights – always glowing).
- Smoke anchors on chimneys (not on abandoned houses).
- Component inputs from game state (data-driven, no id checks): `lit` (night), `litLevel` (e.g. pub busyness), `mood` (low = rival struggling: signs hang crooked, lamps dim), `nudge` (increment when a van passes close). `animate=false` for far zoom or low power.

## Conventions
- Metres. Origin = footprint centre at ground level. Street facade faces **+Z**. Facade frame in the builder: u across, y up, +z out of the wall.
- Colour tokens: `#rrggbb`, a recipe colour key, or `owner` / `ownerDark` / `ownerLight`. Owner colour only on accents.
- Seeds from stable ids (`hashSeed(plotId)`, `hashSeed(streetId)`), never `Math.random`.
- Sign texts are art from `SIGN_TEXTS`, drawn into one atlas. If they ever need translation, move them to text keys and redraw per language.

## Budgets
Read `triangles` (static + movers). Targets: hero ≤ 180k (high), filler ≤ 80k (high) / ≤ 20k (low), visible town ≤ 2M on flagship phones. Over budget: `detail: 'low'` beyond a camera distance, `animate=false` far away, merge a street per group, raise `maxEdge` for filler. Build a few buildings per frame when loading a district.

## Integration tasks (in order, CI green after each)
1. **Content:** presets → `packages/content/data/models/buildings.recipes.json` (generated copy included); validate with `buildingRecipeSchema`. `models.json` entries `kind: 'procedural-building'` reference a recipe id. District map data gets `style: <district id>` per district and `fillerStreets: [{id, from, to, side}]`.
2. **MODEL_MAP + renderer:** procedural model keys render `<ProceduralBuilding>`; pass owner colour, `lit`, `litLevel`, `mood`, `nudge` from data-driven state.
3. **Lighting:** use `createToyLights` + `makeSkyGradient` (or match their colours) in the main scene. Call `configureBuildingShading` once from settings (low-power option can turn off toon/weathering).
4. **Hitboxes:** recipe width × depth (not `bounds`: props stick out). Check the Enter zone vs `door`.
5. **Filler streets:** `<ProceduralStreet seed={hashSeed(id)} district={style} />`. Visual only.
6. **Interiors:** room size from recipe `width` / `depth`.
7. **Performance pass** on the S26 and iPhone with a full district.

## Adding things
- New house type: add an archetype (data only). New neighbourhood: add a district style. New colours: add schemes with tags.
- New business identity: add an `IdentityKind`, a marker function in `props.ts` and its call in `buildBuilding`; add sign text to `SIGN_TEXTS` if needed.
- New gable / ground floor / focal: code in `gables.ts` / `buildingGeometry.ts` / `facade.ts` + schema enum + tests.
- Never special-case a Business id in the renderer.

## Way of working

The agreed process lives in `docs/buildings.md`: important buildings are fixed recipes in `buildings.recipes.json`; normal streets are generated per gap from stable ids and are **pinned** into `pinned-streets.json` once final; seeds come from string ids only; buildings are never saved. Follow it when adding or changing buildings.
