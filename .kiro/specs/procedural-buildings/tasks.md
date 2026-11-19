# Implementation Plan: Procedural Buildings

## Overview

One task per step, CI green after each. Web and content only: no changes in `packages/sim`, no save schema bump.

Definition of done for every task, run from the repo root:
- `npm.cmd run typecheck`
- `npx.cmd eslint .`
- `npm.cmd run build`
- `node .\node_modules\vitest\vitest.mjs run`, as a background process (poll until the Test Files summary)

No commits or pushes unless the user asks. Way of working: `docs/buildings.md`.

## Tasks

- [ ] 1. Content
  - Load and validate `buildings.recipes.json` with `buildingRecipeSchema`; reject unknown recipe ids.
  - `models.json` entries of kind `procedural-building` reference a recipe id.
  - Tests: every preset validates; a bad recipe reports its id; an unknown reference is rejected.
  - _Requirements: 1.1–1.3_
- [ ] 2. Renderer
  - `MODEL_MAP` routes procedural keys to `<ProceduralBuilding>` with owner colour, `lit`, `litLevel`, `mood` and `nudge` from data-driven state.
  - Use `createToyLights` + `makeSkyGradient` in the main scene; call `configureBuildingShading` once from settings.
  - _Requirements: 2.1–2.3_
- [ ] 3. Street filling
  - District map data gets `style` and `fillerStreets {id, side, line}`, where `line` is a centreline of 2+ points (straight for now).
  - Pure `streetGaps(district, plots)` returns gaps `{id, length, start, side}` that skip business plots, with `start` and `length` measured as distance along the line. Pure `placeAlongLine(line, side, offset, distance, width)` returns `{x, z, heading}`; tests include a two-point line and a bent polyline (houses stay on the line, headings follow the tangent), even though only straight streets ship. Each gap is filled with `generateStreet(hashSeed(gap.id), length, { district })`. Gaps under 2.5 m become an alley or garden.
  - Tests: gaps never overlap plots; total house width per gap equals the gap length (property test, 100+ runs); seeds come from ids only.
  - _Requirements: 3.1–3.5_
- [ ] 4. Pinning
  - Dev script `npm.cmd run buildings:pin -- <district|streetId>` writes validated recipes to `pinned-streets.json`, keyed by gap id.
  - Renderer uses a pinned entry when it exists and fits the gap, otherwise generates (with a dev warning on mismatch).
  - Tests: pinned output stays identical when archetype data changes; mismatch falls back.
  - _Requirements: 4.1–4.4_
- [ ] 5. Dev Designer
  - Dev-only route `?dev=1&designer=1` behind `isDevMode`, using the real modules: preset / archetype / district pickers, reroll one aspect, sliders, owner colour, night / busy / mood, Save.
  - Save goes through a dev-only Vite middleware that validates with the schema and writes into `buildings.recipes.json` or `pinned-streets.json`. Not in the production build (verify the bundle).
  - _Requirements: 5.1–5.4_
- [ ] 6. Hitboxes and door
  - Footprint from recipe `width x depth`; Enter zone lines up with the door.
  - _Requirements: 6.1, 6.2_
- [ ] 7. Performance pass
  - Triangle and FPS numbers on a flagship phone and PC; `detail: 'low'` and `animate=false` beyond a camera distance.
  - Manual check for the user.
  - _Requirements: 7.1–7.3_

## Progress

- First slice built early (user request, Nov 2026): street filling for three old_town streets (task 3 core: streetGaps, placeAlongLine, iller-streets.json, renderer, hitboxes from recipe size). Tasks 1, 2, 4 to 7 are still open; models.json linking, pinning and the Designer are not built. Tests: pps/web/test/streets.test.ts.

## Notes

- Existing preview `docs/previews/town-preview.html` stays as a quick viewer. Its favourites live in the browser (`hr_building_favs`); the source of truth is the JSON in `packages/content`.