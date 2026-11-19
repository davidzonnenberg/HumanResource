# Design Document: Procedural Buildings

## Overview

The generator, recipes, geometry and `<ProceduralBuilding>` component exist. This design adds content wiring, gap computation, pinning and a dev Designer around them. Web and content only.

## Data

| File | Purpose |
|---|---|
| `packages/content/data/models/buildings.recipes.json` | Fixed recipes keyed by id (pub, bank, municipality, ...) |
| `packages/content/data/models/pinned-streets.json` | `{ [gapId]: BuildingRecipe[] }` for pinned gaps |
| `packages/content/data/models.json` | `kind: 'procedural-building'`, `recipe: <id>` |
| `packages/content/data/maps/districts/*.json` | `style` and `fillerStreets: [{id, from, to, side}]` |

Validation: `buildingRecipeSchema` (web side, `buildingRecipe.schema.ts`), like the phone `appsSchema`: UI-only data that the sim does not read.

## Streets

```
fillerStreets (centreline) + business plots --streetGaps()--> gaps {id, length, start, side}
gap --pinned? yes--> pinned recipes (+ width check)
    --pinned? no --> generateStreet(hashSeed(gap.id), gap.length, { district })
gap < 2.5 m --> alley / garden
```

- `streetGaps(district, plots)` is pure. A gap id is `<streetId>@<start in decimetres>`, so a gap keeps its id (and its houses) when another gap on the same street changes. It changes only when that gap moves. To reroll a street, rename its id in the data.
- A street is a **centreline** (`line`: two or more points). `streetGaps` measures plots and gaps as distance along the line, so straight and curved streets share one code path. Straight streets (all of them for now) are a two-point line.
- `placeAlongLine(line, side, offset, distance, width)` is a pure function returning `{x, z, heading}` for a house: the point on the line at its centre distance, moved sideways by `offset`, with heading from the local tangent. Houses face the street (`+Z`, rotated per `side`).
- On curves rectangles fan apart on the outer side and bunch up on the inner side. Houses do not have to touch: a small gap is allowed, and a house may be narrowed a little on the inner side. A bend that is too tight for the offset (radius under about 3 times the offset) gets a garden or corner house instead. Curves are not built yet; this is why placement works on a line.
- Road width and surface (klinkers, asphalt, highway) belong to a later map spec, see `docs/wishlist.md`.
- A pinned entry is accepted when `sum(width) == gap.length` within 1e-3. Otherwise generate, and warn in dev.

## Determinism and saves

Seeds come from string ids through `hashSeed`. `mulberry32` is integer based. Nothing is written to saves or the server. Pinning protects against generator changes and gap length changes only because pinned recipes are complete data.

## Pin script

`scripts/pinStreets.ts` (run with `npm.cmd run buildings:pin -- <district|streetId>`):
1. load district map data and plots, compute gaps
2. generate each gap, validate with the schema
3. merge into `pinned-streets.json` (keys sorted, stable formatting), overwriting only the named gaps

## Dev Designer

Route `?dev=1&designer=1`, lazy-loaded behind `isDevMode`, excluded from the production build with `import.meta.env.DEV` and a dynamic import. It imports the real generator and component. Save posts to a dev-only Vite middleware (`configureServer`, never in `build`) which validates with the schema and writes `buildings.recipes.json` or `pinned-streets.json`. Paths are fixed on the server side; the client sends only `{ file, id, recipe }`.

## Hitboxes and doors

`footprint` for a procedural building is `width x depth` from the recipe. The Enter zone uses the recipe `door` offset.

## Testing

- Unit: schema accepts all presets; `streetGaps` never overlaps plots and sums to gap length (property test, at least 100 runs).
- Pinned output identical after archetype data changes (test with a modified archetype copy).
- Width mismatch falls back to generation.
- Dev script writes valid, stable JSON.