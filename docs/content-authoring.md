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
- `maps/districts/<id>.json` holds that district's bounds, road nodes/edges, streets of Frontage_Slots (see below) or hand-placed plots, and drivable/walkable areas. Node ids are local; the loader namespaces them as `<district>:<node>`.

## Reveals

- `reveal-triggers.json` decides when a UI feature or mechanic appears, from a game-state condition (e.g. "a customer gave up waiting" reveals hiring). Add a trigger and reference its reveal key where the feature checks `isRevealed`.
## Streets and Frontage_Slots
A District lists `streets` next to (or instead of) hand-placed `plots`. A street runs along a straight road between two nodes of the District (same x or same z) and lists its slots shoulder to shoulder. The Plots, the access node, the Unloading_Zone, the hitbox and the walkable cut-out are all derived from that list (`packages/sim/src/defs/frontage.ts`). Never write them by hand for a slot.
```json
{
  "id": "main_north_centre", "from": "w_end", "to": "e_end", "side": "left", "start": 34.5,
  "setback": 6, "depth": 12, "tags": ["commercial"],
  "slots": [
    { "kind": "filler", "id": "fl_n03", "width": 3.5 },
    { "kind": "business", "id": "plot_home", "width": 16 },
    { "kind": "plot", "id": "plot_west", "width": 16, "initial": { "kind": "for_sale", "price": 600000 } },
    { "kind": "filler", "id": "city_hall", "width": 20, "modelKey": "building_town_hall" }
  ]
}
```
- `side` is relative to the direction from `from` to `to`: on a +x line `left` is north (-z). `start` is the distance along the line before the first slot. `setback` is the distance from the road centre line to the slot front (at least 4.5: road half width plus sidewalk). `depth` is the default slot depth; a slot may override `depth`, `setback`, `tags` and `unloadingZone` (`w`, `d`, `offset`).
- **Add a filler:** append `{ "kind": "filler", "id": "<unique id>", "width": <metres> }`. With no `modelKey` the game draws a generated house of exactly that width (seeded from the District and slot id, so it never changes by itself). With a `modelKey` it draws that model fitted into the slot. A narrow canal house is 6 to 8 wide, a Landmark such as the town hall takes a double slot.
- **Turn a filler into a business:** change `kind` to `business` and keep the `id`, `width` and position. The slot, its model and its hitbox stay exactly where they are. Then add the Business to `start-state.json` (or let the Player construct it) on the Plot with the same id as the slot (`plotId` if you want another id).
- **Add a plot:** `{ "kind": "plot", "id": "plot_x", "width": 16, "initial": { "kind": "empty" } }` (or `for_sale` with a `price`). A plot slot has no hitbox until something is built on it.
- Business and plot slots only work on streets along the x axis (their door faces north or south). Fillers can stand on any street.
- The registry rejects a street whose slots overlap each other, an explicit Plot or a road, leave the District bounds or run past the end of the street. The error names the District and the slot.
- Keep the id of every Plot a save can mention: `plotId` (or the slot id) is the Plot id. If a Plot id has to change, add the old to new mapping to the next save migration (Requirement 54.10).
- `maps/landmarks.json` is for off-street landmarks only; a building in a street is a filler slot.
## Stats, Modifiers and `getStat`
- A stat that a system reads is a `StatId` (`defs/vocabulary.ts`, today `demand`, `premiumPrice`, `repeatOrderChance`). A new stat is added to that list in the same change that makes a system read it through `getStat(env, stat, target)` in `packages/sim/src/stats/getStat.ts`. Nothing reads a stat directly from a Definition.
- A stat is `base + sum(addFlat) + floor(base * sum(addBp) / 10000)` in integer basis points. Traits, Brands, Recipe Traits and Reputation are derived from Definitions on every read; temporary or permanent changes (boosts, Effects, policies) are stored Modifiers in `state.modifiers` (add them with the `addModifier` Effect, never by hand).
- `explainStat` lists the base and every Modifier with its source: that is what the "Why this number?" card in the Pub Panel shows.
## Conditions, Effects and Services
- Everything that asks a question about the game (Reveal_Triggers, Achievements, District unlocks, Service requirements) uses the Condition vocabulary in `defs/vocabulary.ts` (`CONDITION_KINDS`). Everything that changes the game as a result (Services, quest rewards, consequences) uses the Effect vocabulary (`EFFECT_KINDS`: `gold`, `addModifier`, `reveal`, `schedule`, `grantResource`, `news`, `domain`) through `applyEffects`. An unknown kind, StatId or domain op is rejected at startup with the Definition and the entry named.
- A building action is a **Service** in the Business Definition's `services` list (id, `cost`, `access: remote | presence`, `conditions` with an optional `reason`, `effects`, `once`, `params`). The one Command `useService` runs it; no new Command is needed. Settings that need the CEO present are tagged `presence` in `settings.json`.
- Behaviour that none of the Effect kinds can express is a **domain op**: add the name to `DOMAIN_OPS`, add its handler file under `packages/sim/src/conditions/domainOps/` and register it in `domainOps/index.ts`.
- New Reason_Codes go in `REASON_CODES` (`commands/types.ts`) with a `reason.<code>` text key.
## Command log, State_Hash and the golden playthrough
- The web app records every Command with its Tick (`apps/web/src/loop/commandRecorder.ts`). Pause menu, "Download bug report" saves the start state, the full log and the latest State_Hash as one JSON file; `runLog(reg, start, { entries }, tick)` replays it headless.
- `packages/sim/test/golden/` replays a recorded ten-minute playthrough and asserts the final State_Hash. If you change balance numbers or the order in which the RNG is used, this test fails on purpose. Check that the change is intended, then run `npm.cmd run golden:record` and commit the new `golden-playthrough.json`.