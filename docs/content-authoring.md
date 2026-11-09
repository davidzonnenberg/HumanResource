# Adding content

All game content is data in `packages/content/data`. Changing it needs no code changes; the registry validates everything at startup and the game blocks on errors (listing them).

## Text and names

- Every user-facing string lives in `data/text/en.json`, keyed (e.g. `panel.price`). Code looks them up with `t('key')`. No English text in code.
- Funny business names are arrays under keys like `names.pub`; a Business Definition points at one via `nameTable`.
- First names for hired Humans are in `data/name-pool.json`. Add names freely; the game picks from unused ones first and adds a numeric suffix if the pool runs out. The three starters (Jan, Julia, Thomas) are fixed in `data/start-state.json`.

## New resource / business / vehicle

- Add a record to `resources.json`, `businesses.json` or `vehicles.json`. Reference only ids that exist (resources, jobs, traits, model keys). Unknown references are reported at startup.
- Add any new `modelKey` to `models.json` and map it in `apps/web/src/render/assets/modelMap.ts` (a primitive shape now, a glTF later). A test fails if a model key has no mapping.
- Numbers (prices, demand, intervals, capacities) are all data. Demand curves are piecewise tables of `[price, multiplier]` and must not increase with price.

## Tunables

- `config/sim.json`: tick length, thresholds, bonuses, window lengths, speeds.
- `config/camera.json`: zoom bands, the fixed camera yaw/tilt/FOV, the mode-switch threshold.
- `config/theme.json`: colours, owner colours, PWA theme.

## Districts / map

- `maps/world.json` lists districts and the connectors between them, each with a data-only `unlockCondition`.
- `maps/districts/<id>.json` holds that district's bounds, road nodes/edges, plots and drivable/walkable areas. Node ids are local; the loader namespaces them as `<district>:<node>`.

## Reveals

- `reveal-triggers.json` decides when a UI feature or mechanic appears, from a game-state condition (e.g. "a customer gave up waiting" reveals hiring). Add a trigger and reference its reveal key where the feature checks `isRevealed`.
