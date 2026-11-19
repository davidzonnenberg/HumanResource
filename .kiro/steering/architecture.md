---
inclusion: always
---

# Human Resource – architecture rules

These rules keep the foundation stable so new features are additive. Follow them for every change. The full spec lives in `.kiro/specs/human-resource-mvp/` (requirements, design, tasks).

## Packages and dependency direction

| Package | Role | May import |
|---|---|---|
| `packages/content` | JSON game data only (definitions, maps, text, names, config) | nothing |
| `packages/sim` | Pure deterministic game rules (the single source of truth) | `zod`, own files |
| `packages/shared` | Save_Document envelope, migrations, API DTOs, validation, PIN hashing | `zod` |
| `apps/web` | Vite + React + React Three Fiber PWA (loop, render, input, UI, persistence, sync) | everything above |
| `apps/server` | Fastify Save_API, serves the web build | `packages/shared`, Node |

- `apps/server` never imports `packages/sim` or `apps/web`.
- Nothing imports from `apps/*` except the app itself.

## Simulation purity (packages/sim)

- No DOM, no `three`, no `@react-three/*`, no Rapier, no `node:*`, no `fetch`, no timers.
- No `Math.random`, `Date.now`, `performance`. All randomness goes through the seeded RNG in `state.rng` (`rng/xoshiro128ss.ts`).
- No transcendental math (`Math.pow/exp/log/sin/cos/tan/atan2/hypot`). Use `+ - * /`, `Math.sqrt`, floor/ceil/round/min/max/abs. Use piecewise-linear tables for curves.
- State is plain JSON data: `Record<Id, T>` with prefixed string ids from `state.idCounters`, no Maps, classes, `undefined` values or non-finite numbers.
- Every external influence (player input, physics pose, UI events) enters as a `Command` applied at the next Tick boundary. Handlers validate fully before mutating and return a `ReasonCode` on rejection.
- Systems are entries in the ordered pipeline (`core/pipeline.ts`). Add new systems in their reserved slot; never reorder existing ones.
- ESLint enforces these rules. Do not disable the rules; fix the code.

## Data-driven content

- New resources, businesses, vehicles, jobs, traits, recipes, brands, reveals, achievements and districts are JSON in `packages/content/data`, validated by zod schemas in `packages/sim/src/defs/schemas.ts` plus the referential pass in `defs/registry.ts`.
- Never special-case an id like `"beer"` or `"pub_cosy_local"` in systems. Use definition fields (`type`, `inputs`, `outputs`, `storage`, `humanRequirements`, `productionRules`).
- Every numeric tunable lives in data (`config/sim.json`, definitions), not in code.
- Every Business and Vehicle has an `owner`. Competitors run through exactly the same systems as the player.
- Buildings (fixed recipes, generated streets, pinned streets) follow docs/buildings.md and .kiro/steering/procedural-buildings.md: data in packages/content, seeds from stable ids, nothing stored in saves.

## Stats, Conditions, Effects, Services and Frontage_Slots (Phase 2 foundations)
These four are the **only** way to add a stat, a game question, a game change, a building action or a building in a street. Do not add a parallel mechanism.
- **Stats:** a stat a system reads is a `StatId` and is read through `getStat(env, stat, target)` (`packages/sim/src/stats/getStat.ts`). Brands, Traits, Recipe Traits, Reputation, boosts and policies reach it as Modifiers. Never read `demandMul`, `addPct` or `repeatOrderChance` from a Definition directly in a system. Stored Modifiers live in `state.modifiers` (sorted by id) and expire in pipeline slot 0.5.
- **Conditions and Effects:** one evaluator (`evaluateCondition`, pure, never touches the RNG) and one `applyEffects` over closed vocabularies in `defs/vocabulary.ts`. A new kind is added there, in the schema and in the evaluator in the same change. Behaviour no Effect kind can express is a domain op under `conditions/domainOps/`.
- **Services:** a building action is a Service in the Business Definition (`services`), used with the single `useService` Command (order: unknown entity, District, access, params, Conditions, `once`, Gold). Settings tagged `presence` in `settings.json` share the same access check.
- **Frontage_Slots:** buildings in a street are slots (`filler`, `business`, `plot`) in a street of the District file; Plots, access nodes, Unloading_Zones and hitboxes are derived (`defs/frontage.ts`). Never hand-place a Plot that a street slot can express.
- **Domain ops** may carry a validator (`DOMAIN_VALIDATORS` in `conditions/domainOps`): `useService` runs it before anything is charged, for rejections a Condition cannot state (a fit-out over budget). Quests, requests, errands and counters (`state.counters`) are data too: add a Condition kind or an Effect, not a system that names an id.
- **Replay:** every Command enters through `Simulation.submit` and is recorded; `stateHash` (canonical JSON, FNV-1a 64) of the state must equal the golden playthrough hash. A deliberate balance or RNG-order change re-records it with `npm.cmd run golden:record`.## Money

- Gold is an integer number of hundredths (`Gold` type). Never use floats for money.
- All Gold changes go through `applyGold(state, owner, delta, category, source)`.
- Discretionary costs call `requireGold` first; mandatory costs (salary, severance, fines) always apply, even into debt.
- Costs round up, rewards round down. Gold values must stay within `GOLD_LIMIT` (2^50 hundredths).

## Humans and staffing

- A Job_Slot `filledBy` is `null | {kind:'human'} | {kind:'headcount'}`. Always read capacity through `slotCapacity()`; never assume a slot holds a named Human.
- Human labels in the UI always come from `displayName()`.
- Start Humans are Jan (bartender), Julia (server), Thomas (driver). Other names come from `name-pool.json` via the seeded RNG.

## Map and logistics

- The map is split into Districts (`maps/world.json` + `maps/districts/*.json`). Node ids are namespaced `<district>:<node>`.
- Path-finding goes through `pathCacheFor(reg, unlockedDistricts)` / the path provider. Never compute paths ad hoc in systems.
- Resources never teleport between locations: they move as Vehicle cargo.

## Web app

- Game speed (1x/2x/4x, speed pause) lives only in the web loop/session store, never in `SimState`. Speeds above 1x are locked behind the `game_speed` reveal unless Dev_Mode is on (`?dev=1`, dev build, or the Pause_Menu "Testing" toggle).
- The camera has one fixed yaw. No rotation input, ever. Movement and pan use the fixed screen-aligned ground axes.
- R3F components read simulation data via `simBridge` inside `useFrame`; React UI subscribes through throttled selectors. Do not put per-tick state into React state.
- All user-facing text comes from `t('key')` over `packages/content/data/text/en.json`. No string literals in JSX. English only for now.
- Touch first: every mechanic works with touch alone and keyboard alone; touch targets ≥ 44×44 CSS px; panels ≤ 40% of the screen.

## Saves

- `SimState` changes that affect saved data require a schema version bump and a migration in `packages/shared/src/migrations/`. Migrations are pure functions over JSON and never import current types.
- Save round-trip and migration property tests must keep passing.

## Tests and tooling

- Vitest + fast-check. Property tests carry the tag `// Feature: human-resource-mvp, Property N: <title>` and run ≥ 100 cases.
- Before finishing any task run `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd test` from the repo root. CI (`.github/workflows/ci.yml`) runs the same plus `build`.
- Windows/PowerShell: use `npm.cmd`, not `npm`. The repo is OneDrive-synced: caches go to `HR_CACHE_DIR` or the OS temp folder (see `docs/onedrive.md`).
- Do not commit or push unless the user asks.

## Scope

- Build only what the current task needs. Near-term ideas belong in `docs/ideas.md`, far-future ideas in `docs/wishlist.md`, not in code (see `planning-docs.md`).
