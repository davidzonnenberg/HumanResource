# Design Document: Human Resource MVP

## Overview

Human Resource is a TypeScript monorepo with four parts: a pure deterministic Simulation package, a data/content package, a shared save-format package, and two apps (a Vite + React + React Three Fiber PWA and a small Fastify Save_API). The Simulation owns all game rules and is the single source of truth. The web app runs the game loop, renders interpolated snapshots, converts input into Commands, and persists Save_Documents locally and to the server.

Design goals, in priority order:

1. **Determinism and testability.** All rules live in `packages/sim`, which cannot import DOM, three, Rapier, network or Node APIs. State is plain JSON data. Randomness comes only from a seeded PRNG stored in state. Every external influence (Player input, physics pose of a manually driven van, UI events that fire Reveal_Triggers) enters as a Command applied at a Tick boundary. This makes the determinism, round-trip and invariant properties directly testable in Node (Requirements 2, 24, 44).
2. **Data-driven content.** Businesses, Resources, Vehicles, Jobs, Humans, Recipes, Traits, Brands, Achievements, Reveal_Triggers, text tables, the Name_Pool, start state, map and tunables are JSON data validated by zod schemas plus a referential-integrity pass at startup (Requirement 1). Formulas (demand, staffing, reputation modifier) are parameterised formula kinds, never evaluated strings.
3. **Later phases are additive.** The economy expansion (Phase 6, the former "Phase 2") adds Definitions, optional state sections and systems in reserved pipeline slots. The foundations of Phase 2 (modifiers, shared conditions and effects, services, replay, frontage slots) are built first so that Phases 3 to 6 are mostly JSON. See "Phase plan and dependencies". Phase 1 code paths are already generic (Resource lots with recipe id, generic production rules, Sourcing_Policy defaulting to "buy externally", Owner on every entity, Reputation present at 50). A schema migration (v1 to v2) adds the Phase 6 state sections to existing saves.
4. **Phone-first performance.** Instanced placeholder primitives, aggregated indicators at far zoom, adaptive DPR, a sub-4 ms Tick budget, and lazy loading of the physics chunk.

Key decisions and rationale:

| Decision | Rationale |
|---|---|
| Simulation runs on the main thread in Phase 1 | Tick budget is small (≤4 ms at 10 Hz), and manual driving needs tight coupling with the render loop. Commands and snapshots are serialisable, so moving the Simulation into a Web Worker later is a contained change. |
| Systems mutate a working state in place; `step()` is deterministic | Cloning the full state every Tick would waste the phone budget. Systems are deterministic functions of (state, commands, definitions) with no I/O. Tests use `stepPure()`, which clones first. |
| Entity tables are `Record<Id, T>` with prefixed string ids (`biz_0001`) | Non-integer string keys keep insertion order in JS objects and through `JSON.parse`, so iteration order is deterministic and survives save round-trips. |
| No transcendental math in the Simulation | Only `+ - * /`, `Math.sqrt`, `Math.floor/ceil/round/min/max/abs` are used (correctly rounded under IEEE 754). Demand uses piecewise-linear tables instead of `pow`/`exp`. Determinism therefore also holds across browsers, not just within one runtime. |
| PBKDF2-SHA256 for PIN hashes | Available in both `node:crypto` and browser WebCrypto, so the client can verify a PIN offline against the cached salted hash (Requirement 22.7). scrypt/argon2 are not in WebCrypto. |
| JSON files on a Docker volume for the Save_API | Two users, tiny write rate. Atomic write-then-rename per file avoids native build dependencies (better-sqlite3) in the image. The storage layer sits behind an interface, so SQLite can replace it later. |
| No multiplayer, ever planned | Each device runs its own Simulation; the Save_API only stores Profiles and Save_Documents. No shared cities, no server-side simulation, no real-time sync between players. "Shared city / multiplayer" lives only in `docs/wishlist.md`. This keeps the server rule-free and the Simulation single-writer. |
| Game_Speed lives in the web session layer | The Simulation only counts Ticks, so 1x/2x/4x is purely a loop concern (`acc += dt × speed`, cap `10 × speed` Ticks per frame). Speed is not in `SimState` or the Save_Document; loads start at 1x (Requirement 47). Manual_Driving forces 1x because Rapier steps in real time. |
| Districts from day one | The map is a set of District files plus a world file of District_Connectors. Path-finding runs over the union of unlocked Districts; paths are derived data cached per unlocked set, recomputed on unlock and on load, never saved. Expansion becomes a data and state change (Requirement 48). |
| Job_Slot fill is a tagged union | `filledBy: null \| {kind:'human', humanId} \| {kind:'headcount', count, humanDefId}`. Phase 1 only creates `human` fills, but every system reads capacity through one helper, so the later "people become numbers" automation needs no system rewrite (Requirement 49). |
| Fixed camera angle | Overcooked-like fixed yaw, no rotation input at any band. Input directions map to fixed screen-aligned world axes, which keeps controls, labels and Panels simple on touch (criterion 15.12). |
| English-only text by key | Every user-facing string lives in `packages/content/data/text/en.json` and is looked up via `t(key, params)`; a test fails on keys used in code but missing from `en.json` (criterion 46.8). |
| HTTPS via `tailscale serve` | Service workers need a secure context. `tailscale serve` terminates TLS with a valid `*.ts.net` certificate and exposes the container only on the tailnet (Requirements 26.1, 43.3). |

Research notes that informed the design:

- OneDrive has no supported per-subfolder exclusion for personal accounts; Microsoft's answers state only file-type exclusion exists, and admin folder-name exclusion is a managed-policy feature ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/3984238/how-to-exclude-a-folder-from-onedrive-syncing)). Files reached through a folder link inside the OneDrive folder are still synchronised ([Microsoft Support](https://support.microsoft.com/en-au/office/can-t-synchronize-onedrive-files-and-folders-from-a-local-file-location-other-than-the-default-onedrive-path-b7eef9d4-4203-431d-8345-fe49254f9da0)), so a junction from the project to an outside `node_modules` is not a reliable exclusion. The repository-hygiene section below reflects this. Content was rephrased for compliance with licensing restrictions.
- `@dimforge/rapier3d-compat` (used by `@react-three/rapier`) embeds its WASM in the JS bundle, so Workbox precaches it like any other chunk and manual driving works offline.
- `vite-plugin-pwa` with `registerType: 'prompt'` exposes an `onNeedRefresh` callback and an `updateSW()` function, which lets the Game save first and then activate the new service worker (Requirement 42.4).

## Phase plan and dependencies

The requirements are delivered in six phases. The order is chosen so that each phase turns the next one into mostly data.

| Phase | Delivers | Depends on | Who builds it |
|---|---|---|---|
| 1 Playable core | One pub, customer loop, van, CEO and Management_View, saves and sync. Built, including the polish listed under "Built Phase 1 reference". | none | done |
| 2 Foundations | Modifiers and `getStat`, shared Conditions and Effects, data-defined Services and `useService`, Command_Log, replay and State_Hash, Frontage_Slots | Phase 1 | strong model for the contracts, cheap model for tests and content conversion |
| 3 Grand Opening and bar redesign | `bar_worker`, Seats/Taps/Hands, tabs, Vibe, kegs, offices, license, loans, fit-out, supply deals, job centre, checklist, unlock menu, outside jobs, save v3 | Phase 2 | strong model for the worker state machine and the v3 migration, cheap model for content and panels |
| 4 Phone UI | Gold per hour buckets, HUD, Phone and apps, Desk, quests UI and Waypoint, Info_Layers | Phase 3 (services, quests, loans, finance data) | cheap model, following the existing panel patterns |
| 5 Feel alive and satire | Readable customers, quirks, street life, summary card, satire services | Phases 2 to 4 | cheap model |
| 6 Economy expansion | Second pub, warehouse, brewery, market, acquisitions, chains, reputation, questionable opportunities, competitor events, minigames, achievements | all earlier phases | strong model for acquisition transfer and chains, cheap model for the rest |

Why this order:

- Foundations first. Traits, brands, permits, boosts, quirks and policies all change stats. If each ships its own wiring, every later feature costs a new handler. With `getStat`, `useService` and one effect engine, new offices, loans, permits and satire events are data. Phase 2 therefore has no new gameplay and must not change Phase 1 numbers (equivalence property).
- Phase 3 before Phase 4. The Phone and Desk are views over services, quests, loans and finance buckets. Building the screens first would mean building them twice. The Desk needs the Services of Phase 2 and the offices of Phase 3.
- Phase 5 is polish on top of existing state, so it comes after the systems that produce the state it shows.
- Phase 6 last. It is the largest content block, and it reuses everything: traits and brands become modifiers, plot and building actions use the same cost and effect path, competitor events use the effect engine, and new Business types are placed with Frontage_Slots. The Phase 6 foundation step (contracts, migration v1 to v2, scheduler, `createBusiness`, lot threading) is already built and stays valid. Its later steps are adjusted to read stats through `getStat` once Phase 2 exists.
- One save migration for Phases 2 to 4 (see "Save schema and migrations"), so playthroughs are migrated once.

Working rules, in the spirit of `.kiro/steering/phase2-guide.md` (that guide describes the Phase 6 economy work and keeps its old "Phase 2" naming; it needs a small update to point at `getStat` and the Service model):

- The first task of every phase defines contracts (zod schemas, state shapes, Command and Reason_Code types, migration fixtures). It goes to the strong model. Mistakes there spread everywhere.
- Fixtures for the previous schema version are generated from the current code before any schema change.
- Content JSON, panels that follow the `PubPanel` pattern, Phone app screens and test extensions go to the cheap model. If a cheap model fails the same test twice, the task escalates to the strong model instead of being retried.
- Every phase ends with typecheck, lint, the full test suite and build green, with no Phase 1 test expectation changed to make a new phase pass.

## Architecture

### Layer diagram

```mermaid
flowchart TB
  subgraph content["packages/content (JSON data)"]
    DEFS[Definitions, text tables, Name_Pool]
    START[Start state + world/District maps + tunables]
  end

  subgraph sim["packages/sim (pure TS, no DOM/three/rapier/network)"]
    REG[Definition_Registry loader + validator]
    CORE[Simulation core: step, command queue, RNG]
    SYS[Ordered systems pipeline]
    RULES[Pure helpers: contextAction, nearestRoadPoint, viewMode, displayName]
    SER[Save_Serializer state schema]
  end

  subgraph shared["packages/shared"]
    DOC[Save_Document envelope schema]
    MIG[Migration_Pipeline]
    API[API DTO schemas]
  end

  subgraph web["apps/web (Vite + React + R3F PWA)"]
    LOOP[Game loop: rAF accumulator, pause reasons]
    STORE[Zustand stores: hud, ui, session]
    R3F[Renderer: scene, camera, instancing]
    PHYS[Physics_Layer: Rapier, manual driving only]
    INPUT[Input_System: touch, keyboard, mouse]
    UI[HUD + Panels + screens]
    LOCAL[Local_Store: IndexedDB / localStorage]
    SYNC[Sync_Service]
    PWA[PWA_Shell: Workbox SW + manifest]
  end

  subgraph server["apps/server (Fastify, Node)"]
    ROUTES[REST routes + accessGuard hook]
    FS[(JSON files on Docker volume /data)]
    CLI[remove-pin CLI]
  end

  DEFS --> REG
  START --> REG
  REG --> CORE
  CORE --> SYS
  SYS --> CORE
  LOOP -->|Commands + tick| CORE
  CORE -->|state + events + results| LOOP
  LOOP --> STORE
  LOOP --> R3F
  STORE --> UI
  INPUT -->|intents| LOOP
  INPUT --> R3F
  PHYS -->|pose per Tick| LOOP
  R3F --> RULES
  UI -->|Commands| LOOP
  LOOP --> SER
  SER --> DOC
  DOC --> MIG
  LOOP --> LOCAL
  LOCAL --> SYNC
  SYNC -->|HTTPS JSON| ROUTES
  ROUTES --> FS
  CLI --> FS
  API --> ROUTES
  API --> SYNC
```

### Dependency rules

| Package | May import | Must not import |
|---|---|---|
| `packages/sim` | `zod`, own modules | `react`, `three`, `@react-three/*`, `@dimforge/*`, `idb`, `zustand`, `node:*`, `fetch`, DOM globals, `Date`, `Math.random`, `performance` |
| `packages/content` | nothing (data only) | everything |
| `packages/shared` | `zod` | `packages/sim` internals, DOM, Node |
| `apps/web` | everything above, React stack | `apps/server` |
| `apps/server` | `packages/shared`, Fastify, `node:*` | `packages/sim`, `apps/web` |

Enforcement (Requirement 2.4):

- `packages/sim/tsconfig.json` uses `"lib": ["ES2022"]` and `"types": []`, so DOM and Node globals do not type-check.
- ESLint flat config for `packages/sim/**` sets `no-restricted-imports` (patterns above), `no-restricted-globals` (`window`, `document`, `navigator`, `fetch`, `performance`, `setTimeout`, `setInterval`), and `no-restricted-properties` for `Math.random`, `Date.now` and `Math.pow/exp/log/sin/cos/tan/atan2/hypot`.
- A Vitest test imports the sim entry point under the `node` environment with no DOM shims (Requirement 44.3).

The server does not validate the full Simulation state. It validates the Save_Document envelope (schema version, revisions, ids, size), which keeps the server independent of game rules.

### Runtime data flow per frame

```mermaid
sequenceDiagram
  participant RAF as requestAnimationFrame
  participant Loop as GameLoop
  participant Phys as Physics_Layer
  participant Sim as Simulation
  participant Store as Zustand stores
  participant R3F as Renderer

  RAF->>Loop: frame(now)
  Loop->>Loop: if pauseReasons empty: acc += dt × speed
  Loop->>Loop: n = min(floor(acc/100), 10 × speed); drop backlog if more
  loop n Ticks
    Loop->>Phys: read latest manual pose (if driving)
    Loop->>Sim: enqueue manualVehicleUpdate + queued UI Commands
    Sim->>Sim: step(): pipeline of systems
    Sim-->>Loop: results + domain events
    Loop->>Loop: prevSnapshot = currSnapshot; currSnapshot = state
  end
  Loop->>Store: publish HUD fields, results, events (throttled panels)
  Loop->>R3F: alpha = acc / 100 for interpolation
  R3F->>R3F: useFrame: interpolate poses, update instance matrices
  Phys->>Phys: Rapier step (paused when Ticks stopped)
```

## Components and Interfaces

### Repository and folder layout

```
HumanResource/                       (git: main, remote github.com/davidzonnenberg/HumanResource.git)
  package.json                       npm workspaces: packages/*, apps/*
  package-lock.json                  committed (Requirement 45.3)
  tsconfig.base.json                 strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
  eslint.config.js                   per-package restriction blocks
  vitest.workspace.ts                projects: sim, shared, web, server
  .gitignore  .gitattributes (* text=auto eol=lf)  .editorconfig
  README.md
  .github/workflows/ci.yml           npm ci, typecheck, lint, test, build on push and PR (Node 24)
  .kiro/steering/architecture.md     architecture rules for later tasks (dependency rules, determinism, text keys)
  docs/
    deployment.md                    Docker, tailscale serve, PIN removal CLI, security note
    onedrive.md                      OneDrive handling
    content-authoring.md             how to add Definitions / names / text / Districts
    wishlist.md                      far-future ideas, not specified (time of day, multiplayer, ...)
  packages/
    content/
      data/
        resources.json  businesses.json  vehicles.json  jobs.json  humans.json
        traits.json  recipes.json  brands.json  achievements.json  reveal-triggers.json
        text/en.json                 ALL user-facing strings by Text_Key (UI labels, business names, alerts, news, legal-status lines)
        name-pool.json               Human first names
        start-state.json             start Pub, Humans (Jan/Julia/Thomas), stock %, Gold, orders, District states
        maps/world.json              District list (file, unlock condition) + District_Connectors
        maps/districts/*.json        per District: bounds, road sub-graph, plots, unloading zones, drivable/walkable bounds
        config/sim.json              tunables (tick ms, thresholds, factors)
        config/camera.json           zoom bands, threshold, hysteresis, tilt, fov
        config/theme.json            palette, vehicle/crate scales
        phase2/                      Phase 6 economy definitions (additive pack; folder name kept from before the renumbering)
      index.ts                       typed re-export of raw JSON
    sim/
      src/
        index.ts                     public API
        core/        simulation.ts step.ts commandQueue.ts pipeline.ts ids.ts
        rng/         xoshiro128ss.ts
        money/       gold.ts (hundredths helpers, mulDivFloor, applyGold)
        defs/        schemas.ts registry.ts validateRefs.ts formulas.ts
        state/       types.ts schema.ts (zod for SimState) newGame.ts
        commands/    types.ts handlers/*.ts reasons.ts
        systems/     scheduler.ts humans.ts production.ts customers.ts staff.ts
                     logistics.ts sourcing.ts finance.ts metrics.ts alerts.ts reveals.ts
                     phase2/ market.ts acquisitions.ts competitors.ts questionable.ts
                             chains.ts reputation.ts minigames.ts achievements.ts
        logistics/   roadGraph.ts paths.ts pathCache.ts (per unlocked District set) nearestRoadPoint.ts
        staffing/    capacity.ts (working capacity of a Job_Slot: human or headcount)
        storage/     stock.ts (lots, FIFO, capacity)
        names/       drawName.ts displayName.ts
        conditions/  evaluate.ts (Reveal_Trigger / Achievement condition DSL)
        interaction/ contextAction.ts viewMode.ts
        invariants/  check.ts (used by tests and dev builds)
      test/          unit + property tests, arbitraries/
    shared/
      src/  saveDocument.ts  migrations/index.ts migrations/v1_to_v2.ts ...
            api.ts (DTO zod schemas)  validation.ts (names, PIN format)  pinHash.ts (PBKDF2 params)
      test/fixtures/v1/*.json ...
  apps/
    web/
      vite.config.ts                 cacheDir from env, vite-plugin-pwa
      index.html
      public/icons/
      src/
        main.tsx  app/App.tsx  app/routes.tsx
        loop/        GameLoop.ts pauseReasons.ts tickBudget.ts gameSpeed.ts
        dev/         devMode.ts (?dev=1, dev build, Pause_Menu "Testing" toggle)
        text/        t.ts (typed Text_Key lookup over content en.json)
        store/       hudStore.ts uiStore.ts sessionStore.ts simBridge.ts
        render/      Scene.tsx CameraController.tsx World/* Instanced/* assets/modelMap.ts
                     interpolation.ts aggregation.ts AdaptiveDpr.tsx labels/*
        physics/     ManualDriving.tsx VehicleBody.tsx uprightMonitor.ts colliders.ts
        input/       InputSystem.ts Joystick.tsx ContextButton.tsx keyboard.ts gestures.ts
        ui/          hud/* panels/* screens/* components/Card.tsx
        persistence/ localStore.ts idbStore.ts lsStore.ts autosave.ts
        sync/        syncService.ts loadDecision.ts apiClient.ts deletionQueue.ts
        pwa/         registerSW.ts UpdatePrompt.tsx
    server/
      src/  index.ts app.ts routes/{health,profiles,slots,saves}.ts
            storage/{fileStore.ts,atomicWrite.ts,locks.ts}
            auth/accessGuard.ts pin/{hash.ts,lockout.ts}  cli.ts
  Dockerfile
  docker-compose.yml
```

### Simulation core

Public API of `packages/sim`:

```ts
export interface SimulationInit {
  registry: DefinitionRegistry;     // validated, frozen
  state: SimState;                  // from newGame() or a loaded Save_Document
}

export interface TickOutput {
  results: CommandResult[];          // one per Command applied this Tick
  events: DomainEvent[];             // for UI, News_Feed, toasts, renderer effects
}

export class Simulation {
  constructor(init: SimulationInit);
  get state(): Readonly<SimState>;
  submit(cmd: Command, issuer: Issuer): number;   // returns seq; applied at next Tick boundary
  tick(): TickOutput;                               // advances exactly one Tick
}

export function newGame(registry: DefinitionRegistry, seed: number): SimState;
export function stepPure(registry: DefinitionRegistry, state: SimState,
                         cmds: CommandEnvelope[]): { state: SimState } & TickOutput;
export function loadRegistry(raw: RawContent): Result<DefinitionRegistry, DefinitionError[]>;
export function displayName(human: Pick<Human, 'name'>): string;
export function contextActionFor(view: InteractionView, reg: DefinitionRegistry): ContextAction | null;
export function nextViewMode(mode: ViewMode, distance: number, cam: CameraConfig): ViewMode;
export function nearestRoadPoint(graph: RoadGraph, x: number, z: number): RoadPoint;
export function pathCacheFor(reg: DefinitionRegistry, unlocked: readonly DistrictId[]): PathCache; // memoised, derived data
export function slotCapacity(slot: JobSlot, state: SimState): number;   // working capacity, human or headcount
```

- The `Simulation` instance holds the `PathCache` for the current unlocked District set. It is derived from (registry, `state.districts`) only, so it is rebuilt on load and after an unlock and is never serialised; `stepPure` memoises it by the sorted unlocked-id key. Determinism is unaffected.

- The seed is generated outside the Simulation (`crypto.getRandomValues` in the web app) and passed to `newGame`, which stores it in `state.seed` and initialises `state.rng` (Requirement 3.2).
- `submit` appends to an in-memory queue. `tick()` drains the queue in submission order at the start of the Tick (Requirement 2.7). The queue is not part of the saved state; on save the loop writes only after a Tick boundary, so the queue is empty.
- `tick()` returns rejected Commands with a `ReasonCode` and leaves state unchanged for that Command (Requirement 2.8). Handlers validate fully before mutating.
- RNG: xoshiro128** with 4 × uint32 state in `state.rng`. Helpers `rngNext`, `rngInt(lo, hi)`, `rngChance(p)`, `rngPick(array)` take the state and mutate `state.rng` only.

### Tick pipeline

Systems are entries in an ordered array. Each entry has an id, the phase it belongs to and a `run(ctx)` function. A system that depends on an optional state section (Phase 6 economy, or a Phase 2 to 5 section) returns early when the section is absent. Phase 6 entries already have reserved positions (new Phase 2 to 5 entries use the fractional slots listed after the table), so adding them does not reorder Phase 1 systems.

```ts
interface TickContext {
  state: SimState;
  reg: DefinitionRegistry;
  events: DomainEvent[];      // append-only for this Tick
  ledger: ResourceLedgerTick; // created/removed quantities per Resource and cause
}
interface SystemEntry { id: SystemId; phase: 1 | 2 | 3 | 4 | 5 | 6; run(ctx: TickContext): void; }
```

| # | System | Phase | Responsibility | Requirements |
|---|---|---|---|---|
| 0 | `clock` | 1 | `tick += 1`; derive game second | 2.1 |
| 1 | `commands` | 1 | Drain queue; validate and apply each Command; emit results | 2.7, 2.8, 6.8, 7.x, 10.3–10.5, 12.1–12.3, 13.x |
| 2 | `scheduler` | 1 | Fire due `ScheduledEvent`s in (fireTick, seq) order: construction done, hidden reveals, Consequences, QO completion | 27.3, 32.6, 37.4–37.6 |
| 3 | `competitorEvents` | 6 | Roll Competitor event table | 38 |
| 4 | `market` | 6 | Bounded random-walk price update at interval | 30.2, 30.3 |
| 5 | `acquisitions` | 6 | Generate and expire Acquisition_Offers | 32.1, 32.2 |
| 6 | `humans` | 1 | Walking along paths, arrival → start Job, boarding Vehicles | 7.4–7.9, 7.15, 13.12 |
| 7 | `production` | 1 | Generic production rules (Phase 1 has none active; Brewery in Phase 6) | 9.3, 29.1, 29.2 |
| 8 | `customerArrivals` | 1 | Arrival rate → spawn, seat or lose (no_seat); patience checks | 4.1, 4.3, 4.8–4.10 |
| 9 | `staff` | 1 | Bartenders pour (FIFO lot), Servers carry drinks (Phase 3: replaced in the same slot by the Bar_Worker state machine) | 4.6, 5.1–5.5, 34.3 |
| 10 | `customerVisits` | 1 | Drinking, reorder roll, pay, leave | 4.4, 4.5, 4.7, 34.4, 34.5 |
| 11 | `minigames` | 6 | Apply active temporary boosts / expire | 39.2 |
| 12 | `logistics` | 1 | Automatic Vehicles move along graph paths, arrive, load/unload, wait; manual pose already applied in step 1 | 11.x, 12.4–12.8, 7.12 |
| 13 | `sourcing` | 1 | Auto-reorder (Phase 1); Sourcing_Policy shortfall sizing (Phase 6) | 10.8–10.10, 10.12, 31.2 |
| 14 | `questionable` | 6 | Offer refresh; occupied timers handled via scheduler | 37 |
| 15 | `finance` | 1 | Salaries per Tick with exact carry, rentals; Mandatory_Expenses | 7.3, 8.5, 28.4 |
| 16 | `chains` | 6 | Corporate_Chain detection and Synergy generation | 35 |
| 17 | `reputation` | 6 | Clamp, demand modifier refresh, news | 36 |
| 18 | `metrics` | 1 | Rolling windows: Pub metrics, Vehicle deliveries, Route flows, recommended staff, popularity band, Brewery unit cost | 6.1–6.3, 11.6–11.9, 17.4, 29.4 |
| 19 | `alerts` | 1 | Derive Alert set from conditions and previous Alert set | 4.11, 4.12, 5.6, 6.5, 6.6, 9.8, 9.9, 10.7, 10.10, 12.5, 31.3 |
| 20 | `reveals` | 1 | Evaluate Reveal_Trigger conditions over this Tick's events and state; record first firing | 19.1, 19.4–19.6 |
| 21 | `achievements` | 6 | Evaluate Achievement conditions; award once | 40.2 |

Ordering rationale: Commands first so Player changes apply from this Tick (price change "from the next Tick" holds because the Command is applied at the boundary before any payment). Consumption (8–10) runs before logistics and sourcing, so auto-reorder sees post-consumption stock and post-delivery Pending_Quantity. Finance runs after operations so Salary is charged every Tick regardless of what happened. Metrics, Alerts and Reveals run last because they observe the final state of the Tick.

New systems of Phases 2 to 5 take fractional slots, so no existing slot moves:

| Slot | System | Phase | Responsibility |
|---|---|---|---|
| 0.5 | `modifiers` | 2 | Remove Modifiers whose `untilTick` is reached, before any system reads a stat (50.5) |
| 1.5 | `ceoProximity` | 1 (built) | Only clears `ceo.insideBusinessId` when the CEO is no longer at or inside that Business; it never enters a Business |
| 2.5 | `errands` | 3 | A Headcount_Fill "Head of Errands" performs due presence Outside_Jobs without the CEO (68.8) |
| 9 | `staff` | 3 | Becomes the `bar_worker` state machine (same slot, same order queue and bar entries) |
| 10 | `customerVisits` | 3 | Tabs, payment at leave, Walkouts, Vibe modifiers on long waits |
| 15 | `finance` | 3 and 4 | Also charges Loan repayments and supply contract fees with the exact-carry rule, and rotates the one-minute Gold buckets |
| 18.5 | `summaryCard` | 5 | Decides when the Summary_Card is due and picks the Employee of the Month |
| 20.5 | `quests` | 3 | Advances Quests when a step Condition becomes true and applies the step Effects once |

`customerArrivals` (8) returns immediately while `pub_open` has not fired (61.6). Scheduler kinds are added to the closed `scheduledKindSchema` (see Phases 2 to 5 design).

### Commands

```ts
type Issuer = 'player' | 'physics' | 'ui' | 'system';
interface CommandEnvelope { seq: number; issuer: Issuer; cmd: Command; }

type Command =
  // Human allocation (Req 7)
  | { type: 'hire' }
  | { type: 'assign'; humanId: Id; target: JobSlotRef }
  | { type: 'fire'; humanId: Id }
  // Pub (Req 6, 10)
  | { type: 'setDrinkPrice'; businessId: Id; price: Gold }
  | { type: 'placeOrder'; supplierId: Id; destinationId: Id; resourceId: ResourceId; quantity: number }
  | { type: 'setAutoReorder'; businessId: Id; resourceId: ResourceId; enabled: boolean; threshold: number }
  // Routes and vehicles (Req 12, 13)
  | { type: 'setRoute'; vehicleId: Id; stops: RouteStopInput[]; waitSeconds?: number }
  | { type: 'resumeRoute'; vehicleId: Id }
  | { type: 'startManualDriving'; vehicleId: Id }
  | { type: 'manualVehicleUpdate'; vehicleId: Id; x: number; z: number; heading: number; speed: number }
  | { type: 'manualLoad'; vehicleId: Id; businessId: Id }
  | { type: 'manualUnload'; vehicleId: Id; businessId: Id }
  | { type: 'endManualDriving'; vehicleId: Id }
  | { type: 'resetVehicle'; vehicleId: Id; x: number; z: number; heading: number } // upright reset onto road point
  // CEO (Req 14, 15)
  | { type: 'ceoMove'; dx: number; dz: number }   // normalised intent, |d| <= 1, applied for one Tick
  | { type: 'ceoEnter'; businessId: Id; door?: { x: number; z: number } }   // door hint is validated, see notes
  | { type: 'ceoExit'; door?: { x: number; z: number } }                     // door hint is validated, see notes
  | { type: 'uiEvent'; event: 'managementViewOpened' | 'panelOpened'; target?: Id }
  // Districts (Req 48): issuer 'system' only; no Player UI in Phase 1, used by tests and later expansion
  | { type: 'unlockDistrict'; districtId: DistrictId }
  // Phases 2 to 5 (see "Phases 2 to 5 design")
  | { type: 'useService'; businessId: Id; serviceId: string; params?: ServiceParams }
  | { type: 'setWorkerPace'; businessId: Id; pace: 'relaxed' | 'normal' | 'hustle' }   // access: remote
  | { type: 'setPubOpen'; businessId: Id; open: boolean }                               // access: remote
  // Phase 6 (economy expansion, additive)
  | { type: 'buyPlot'; plotId: Id }
  | { type: 'construct'; plotId: Id; businessDefId: DefId }
  | { type: 'acquireWarehouse'; plotId: Id; mode: 'buy' | 'rent' }
  | { type: 'endRental'; businessId: Id }
  | { type: 'setSourcingPolicy'; businessId: Id; resourceId: ResourceId; policy: SourcingPolicy }
  | { type: 'marketBuy'; resourceId: ResourceId; quantity: number }
  | { type: 'acceptAcquisition'; offerId: Id }
  | { type: 'setProductionRecipe'; businessId: Id; recipeId: RecipeId }
  | { type: 'startQuestionable'; opportunityId: Id; humanIds: Id[]; destinationId: Id }
  | { type: 'completeMinigame'; minigameId: DefId; businessId: Id; score: number };

type ReasonCode =
  | 'insufficient_gold' | 'invalid_price' | 'invalid_quantity' | 'invalid_threshold'
  | 'invalid_route' | 'not_owner' | 'slot_occupied' | 'human_occupied' | 'unknown_entity'
  | 'not_in_range' | 'not_stopped' | 'vehicle_not_manual' | 'storage_not_empty'
  | 'insufficient_humans' | 'nothing_to_load' | 'nothing_to_unload' | 'offer_expired'
  | 'district_locked'
  // Phases 2 to 5
  | 'not_present' | 'conditions_not_met' | 'already_licensed' | 'loan_active'
  | 'deal_missing' | 'limit_reached' | 'already_done';

type CommandResult =
  | { seq: number; ok: true }
  | { seq: number; ok: false; reason: ReasonCode; missingGold?: Gold; field?: string };
```

Notes:

- `assign` to a Job_Slot occupied by a Human is valid and displaces the occupant (7.7); `slot_occupied` is returned when the slot holds a Headcount_Fill (49.6) and for Phase 6 cases such as an occupied Plot.
- `assign`, `setRoute` and `placeOrder` targeting a Business in a locked District are rejected with `district_locked` (48.7).
- `insufficient_gold` always carries `missingGold = cost − gold` (7.2, 8.4, 10.5, 32.5).
- `manualVehicleUpdate` is submitted by the Physics_Layer once per Tick (2.9). The Simulation clamps the reported position to the drivable bounds and stores it; it does not trust speed for anything except the "stopped" check (< 0.5 World_Units/s).
- `manualLoad`/`manualUnload` are valid only if the Vehicle is under Manual_Driving, its last reported speed is below 0.5 and its position is inside the Business's Unloading_Zone (13.6–13.8).
- `ceoEnter` and `ceoExit` accept an optional `door` hint from the web layer, which knows the model-derived door position (16.5). The handler validates the hint: it must lie within `config.doorHintTolerance` of the Business's door point from the map data, otherwise the hint is ignored and the data position is used. A rejected or ignored hint never rejects the Command. Entering is explicit: nothing enters a Business automatically (14.4).
- `useService` is the only Command for data-defined Services. `params` carries the choice for services that need one (for example the fit-out picks). It is a small closed shape (`{ choice?: string; picks?: Record<string, number> }`), validated against the Service Definition. This extends the `businessId` plus `serviceId` shape of 51.3 and should be confirmed in review.
- Settings with an Access_Tag (`setWorkerPace`, `setPubOpen`, `setDrinkPrice`, `setAutoReorder` are `remote`) are listed in `settings.json` with `commandType` and `access`. A handler for a setting tagged `presence` runs the same `requireAccess` check as `useService` and rejects with `not_present` (71.10).
- Instance-level Phase 6 actions (`buyPlot`, `construct`, `acquireWarehouse`, `acceptAcquisition`, `startQuestionable`) keep their dedicated Commands, because their target is a Plot or an offer, not a Business Definition. They run the same `requireGold` plus `applyEffects` path as Services (80.2).

### Simulation systems in detail

#### Money (Requirement 8)

- `Gold` is an integer in hundredths. All arithmetic uses integer helpers: `mulDivFloor(a, num, den)`, `percentOf(amount, basisPoints)`. Rounding rule: costs round up (`ceil`) so the Player never pays less than the defined cost; rewards and tips round down.
- Every change goes through `applyGold(state, owner, delta, category, source)`. For Competitor owners it is a no-op (8.9). For the Player it updates `player.gold` and adds `delta` to the finance ring buffer bucket for the current game second under `category|source`.
- Discretionary handlers call `requireGold(cost)` before mutating; Mandatory_Expenses call `applyGold` unconditionally (8.5).
- Salary per Tick: each Human keeps `salaryCarry` (in hundredths × ticksPerMinute units). Per Tick: `carry += salaryPerMinute; charge = floor(carry / ticksPerMinute); carry -= charge * ticksPerMinute`. Over every 600 Ticks the charged total equals the Salary exactly (7.3).
- Hiring_Cost = `ceil(salaryPerMinute × hiringMinutes × hiringFactor)` from the Human Definition (defaults 60, 0.05).
- Finance Panel (8.3) sums the last 300 game-second buckets per category.
- Safe-integer headroom (8.10): `GOLD_LIMIT = 2 ** 50` hundredths (as a literal constant, not `Math.pow`). `invariants/check.ts` scans every Gold field (player gold, prices, finance buckets, carries, Orders, offers) and reports `gold_limit_exceeded` with the field path when `|value| > GOLD_LIMIT`. Dev and test builds throw like any invariant failure; production logs a developer warning and keeps running (not a `fatalError`). 2^50 leaves 3 bits below `Number.MAX_SAFE_INTEGER` (2^53 − 1), so sums of a few values and `mulDivFloor` intermediates stay exact.

#### Storage and lots (Requirements 9, 34.2, 34.3)

```ts
interface Stock { amount: number; lots: Lot[] }   // invariant: amount === sum(lots.qty)
interface Lot { qty: number; recipeId: RecipeId | null; arrivedTick: Tick; origin: LotOrigin }
type LotOrigin = 'start' | 'supplier' | 'market_depot' | 'brewery' | 'business' | 'reward';
```

- `freeCapacity(stock, cap) = max(0, cap − amount)`. All inflows use `addToStock(stock, lot, cap)` which accepts `min(lot.qty, freeCapacity)` and returns the remainder. This one function enforces 9.4, 9.5 (over capacity accepts nothing) and the storage invariant 2.10.
- Outflows `takeFromStock(stock, qty)` take FIFO by `arrivedTick` and return the taken lots, so Recipe identity and origin travel with cargo.
- Shared capacity across Recipes (34.2) follows naturally: capacity is per Resource and lots share it.
- When loading a Vehicle, taken lots get `origin` set to the pickup kind (`supplier`, `market_depot`, `brewery`, or `business` for any other Business). The Manual_Delivery_Tip (13.9) counts only unloaded lots whose origin is `supplier`, `market_depot` or `brewery`.

#### Supplier and Orders (Requirement 10)

- The Supplier is a Business with `type: 'supplier'`, owner `npc` and unlimited stock (no Storage record). An `Order` reserves `quantity` of a Resource for a named destination. Placing an Order creates the quantity in the world (recorded in the resource ledger as `order_placed`).
- At a Supplier pickup stop, a Vehicle loads from open Orders of its Owner whose destination is the Route's next drop-off stop, oldest first, as lots with origin `supplier`.
- `pendingQuantity(dest, res)` = Σ open Order remaining for `dest` + Σ cargo of the Owner's Vehicles whose next drop-off stop is `dest`.
- Auto-reorder (10.8–10.10): if `amount + pending < threshold`: `want = cap − amount − pending`; `affordable = floor(gold / unitPrice)`; `qty = min(want, affordable)`. If `want > 0` and `qty == 0`, raise `reorder_failed` and retry next Tick. Because `qty ≤ want`, `amount + pending + qty ≤ cap` (10.12). If `amount > cap` (over capacity), `want ≤ 0` and nothing is ordered.
- Competitor auto-reorder uses the same code; for Competitor owners `affordable` is unbounded and `applyGold` is a no-op, so they never fail on Gold (8.9).

#### Customers and staff (Requirements 4, 5, 6)

Customer state machine (rendering positions are derived from the Business layout anchors and the state's progress; the Simulation does not track Customer coordinates):

```mermaid
stateDiagram-v2
  [*] --> Arriving
  Arriving --> Lost_NoSeat: all seats occupied
  Arriving --> Entering: seat free (seat reserved)
  Entering --> Waiting: walk time elapsed, drink order registered
  Waiting --> Drinking: Server delivers drink
  Waiting --> Paying: patience expired (cancel order)
  Drinking --> Waiting: finished and reorder roll succeeds and drinks < max
  Drinking --> Paying: finished otherwise
  Paying --> Leaving: Gold += price x drinksConsumed
  Leaving --> [*]
  Lost_NoSeat --> [*]
```

- Arrival: `rate = demand(pubDef, price, reputation, brandMods)` in Customers per Game_Minute. Each Tick, `arrivalAcc += rate`; while `arrivalAcc ≥ ticksPerMinute`, spawn one Customer with a small seeded jitter on entry delay. `demand` = `baseDemand × priceMultiplier(price) × reputationMultiplier(rep) × brandMultiplier`. `priceMultiplier` is a piecewise-linear table of (price, multiplier) points; the registry rejects tables whose multipliers increase with price, so the arrival rate is monotonically non-increasing in price (4.2).
- Seat taken → register drink order (4.4). Order queue per Pub is FIFO by registration Tick.
- Bartender: if the order queue has an unpoured order and stock ≥ 1, start a pour task; when it completes after `bartendingInterval`, take 1 Beer (FIFO lot, recorded as `consumed` in the ledger) and put a poured drink on the bar (4.6, 5.1, 5.2). Beer is removed at pour time. No Bartender → no pours (5.4).
- Server: takes the oldest poured drink, carry duration = layout distance bar→seat ÷ Job movement speed, delivers (5.3). No Server → drinks stay on the bar (5.5).
- Patience: if `tick − orderTick > patience × ticksPerSecond` for an undelivered order, the order is cancelled. A poured-but-undelivered drink for that order is discarded (it was already removed at pour time, consistent with the ledger). Customer pays for drinks consumed and leaves; if none, Lost_Customer with reason `out_of_beer` when stock is 0 at that moment, else `patience_expired` (4.8, 4.9).
- Reorder: on finishing a drink with `drinks < maxDrinksPerVisit`, roll `rngChance(clamp(effectiveRepeat, 0, 0.9))` (4.5, 34.5). Effective repeat chance = Pub base + Recipe Trait modifiers of the drink's lot.
- Pay: `applyGold(owner, price_at_payment_tick × drinksConsumed, 'sales', pubId)` (4.7).

Staffing recommendation (6.3) uses the formula kind `throughput` from data: `ceil(arrivalsPerMin × expectedDrinksPerVisit × bartendingIntervalSec / 60 × (1 + serverRatio) × headroom)`.

#### Humans and allocation (Requirement 7)

- A Job_Slot's `filledBy` is `null`, `{kind: 'human', humanId}` or `{kind: 'headcount', count, humanDefId}`; a Human references at most one Job_Slot. For human fills both sides are updated together in one handler, and the invariant checker verifies the bidirectional link.
- Headcount_Fill (49): systems never read `filledBy` directly; they call `staffing/capacity.ts`. `slotCapacity(slot)` returns 1 for a human fill whose Human is `working` at the Job location, `count` for a headcount fill, 0 otherwise. The `staff` system keeps one task cursor per capacity unit for headcount fills (`slot.headcountTasks: (StaffTask | null)[]`, length = count), so N headcount Bartenders pour independently exactly like N working Humans. A Driver headcount fill makes `driverOnBoard` true. `finance` charges `count × salaryPerMinute(humanDefId)` per Game_Minute with a per-slot `headcountSalaryCarry` using the same exact-carry rule as Humans. `metrics` and `alerts` sum `slotCapacity`. The renderer draws no figures for headcount fills. `count` is validated against `JobDef.maxHeadcountPerSlot` (default 1) by the state schema. Phase 1 has no Command or content that creates a headcount fill (49.7); tests construct such states directly.
- `assign`: if the Human is assigned elsewhere, clear that slot (at this Tick boundary, 7.8); if the target slot is occupied, set the occupant unassigned at its current position (7.7); set status `en_route`; compute a walking path from the Human's current position (mid-path positions are valid starting points, 7.9) along the road graph to the target location.
- On arrival: status `working` (7.6). For a Driver slot, arrival at the Vehicle sets `driverOnBoard = true`.
- `fire`: reject with `human_occupied` if status is `occupied` (7.13); otherwise remove, apply Severance as Mandatory_Expense (7.11). Firing or reassigning a driving Human stops the Vehicle where it is, keeping cargo and Route (7.12).
- Hiring adds an unassigned Human at the Player's first Pub with a name from `drawHumanName` (7.1, 7.19).
- Qualifications are a string set from the Human Definition (Phase 1/2: `["regular"]`); Job Definitions list required qualifications (7.10, 46.2, 46.3).

Name drawing (7.18–7.22):

```ts
function drawHumanName(state: SimState, pool: readonly string[], forWorkforce: boolean): string {
  const used = forWorkforce ? baseNamesInWorkforce(state) : new Set<string>();
  const unused = pool.filter(n => !used.has(n));
  const base = rngPick(state, unused.length > 0 ? unused : pool);
  return forWorkforce ? uniqueInWorkforce(state, base) : base;
}
// uniqueInWorkforce: if base is free return base; else lowest k >= 2 with `${base} ${k}` free.
```

Acquired employees keep their name unless it collides, in which case `uniqueInWorkforce` appends a suffix (7.21). `displayName(human)` in `names/displayName.ts` returns `human.name` and is the only function the UI uses for Human labels (46.7).

#### Logistics (Requirements 11, 12, 13)

- Districts (48): `maps/world.json` lists Districts (`id`, `file`, `unlockCondition`) and District_Connectors (`{id, a: {district, node}, b: {district, node}}`); each `maps/districts/<id>.json` holds that District's bounds polygon, nodes, edges, Plots, Unloading_Zones and drivable/walkable bounds. Node ids are namespaced `<districtId>:<nodeId>` at load, Plot ids are globally unique. `state.districts` stores `{ unlocked: boolean }` per District.
- Road graph: `nodes {id, x, z}`, `edges {id, a, b, length}` per District, plus one connector edge per District_Connector. At registry load, lengths are computed with `Math.sqrt`. The routable graph is the union of unlocked Districts' sub-graphs plus connectors whose two Districts are unlocked; `pathCacheFor(reg, unlocked)` precomputes all-pairs shortest paths on that union (Floyd–Warshall while the union stays under ~500 nodes; above that, per-source Dijkstra on demand with deterministic tie-breaking by node id). The cache is recomputed by the `unlockDistrict` handler before the `humans` and `logistics` systems run in the same Tick, and on load (48.5, 48.6). Each Plot has an `accessNode` and an `unloadingZone` rectangle.
- Locked Districts: drivable and walkable bounds are the union of unlocked Districts' bounds, so CEO movement clamps there and manual driving into a locked District triggers the out-of-bounds reset (48.8, 13.15). `contextActionFor` ignores interactables in locked Districts (48.9).
- `PathCursor { nodes: NodeId[]; seg: number; along: number }`. Each Tick an automatic Vehicle advances `speed × tickSeconds` along its path, so travel time equals road distance ÷ speed (11.5).
- Route stop cycle: `driving → arrive → loading/unloading (duration = amount ÷ loadRate) → (waiting if load 0, then reload once) → next stop`. Load amount at pickup = `min(available reserved/owned stock, free cargo capacity, next drop-off free Storage)` (12.6). At drop-off, unload via `addToStock` and keep the remainder on board (12.8, 9.4).
- A Vehicle with `driverRequirement` and no Driver on board, not manual, does not move (11.4). With a Driver and no Route it parks and raises `no_route` (12.5).
- Routes are stop lists independent of path-finding; a `pathProvider` function computes paths, so traffic-aware routing can replace it later (46.5).
- Manual driving: `startManualDriving` sets `control = 'manual'`, suspends the Route if it was automatic, and leaves the displaced Driver assigned, off board, idle at the takeover position (13.10). Each Tick the Physics_Layer's `manualVehicleUpdate` sets the pose. `endManualDriving` sets `control = 'parked'`; the UI then asks about resuming (13.11). `resumeRoute` sends the Driver walking to the Vehicle; when the Driver boards, the Vehicle snaps to `nearestRoadPoint`, and the next stop becomes the Route stop with the smallest road distance from that point (13.12).
- Cargo is Simulation data only. Collisions are visual and physical in the render layer and never change cargo (13.5). Upright and out-of-bounds resets send `resetVehicle` with a `nearestRoadPoint` pose; cargo is untouched (13.14, 13.15).

#### Metrics (Requirements 6, 11, 17, 29)

Rolling windows are fixed-length ring buffers indexed by game second (`tick / ticksPerSecond`), stored in state so they survive saves:

- Pub (60 s window): arrivals, lost by reason, wait-time sum and count, working service Humans sampled per second. Lost % = lost ÷ arrivals × 100, or 0 when arrivals are 0 (6.2).
- Vehicle/Route (300 s window): deliveries, delivered and picked-up quantities per Resource. Business (300 s): consumed and produced per Resource. Bottleneck flags (11.7–11.9) compare these with the default 10% margin.
- Popularity band from arrivals per minute thresholds in data (17.4). Brewery effective unit cost (29.4) from input costs and Brewer Salaries over 300 s.

#### Alerts (Requirement 18.10 and the Alert criteria)

```ts
type AlertType = 'out_of_beer' | 'lost_customers' | `unstaffed:${JobId}` | `storage_full:${ResourceId}`
  | `storage_empty:${ResourceId}` | 'awaiting_pickup_no_route' | 'reorder_failed' | 'no_route'
  | 'no_internal_supply';
interface Alert { key: `${AlertType}@${Id}`; type: AlertType; objectId: Id; since: Tick; variant?: string }
```

- `state.alerts` is a `Record<key, Alert>`, so at most one Alert per type per object exists by construction (18.10).
- Each Tick the `alerts` system recomputes the set: `active' = raise(cond) || (active && !clear(cond))`. Most types have `clear = !raise`. `lost_customers` raises at lost% > 10 with ≥ 10 arrivals and clears only at lost% ≤ 10 (6.5, 6.6); its `variant` is the most frequent lost reason, which picks the text "Understaffed", "Out of seats" or "Out of Beer" from the text table.
- The stock-based `out_of_beer` Alert (4.11, 4.12) and the `lost_customers` variant `out_of_beer` would display the same text; the HUD merges them into one row for the Pub.
- Client-side Alerts (save failure 23.7, "Too large to sync" 25.12, "not synced") are kept in `hudStore`, not in the Simulation, and are merged in the HUD with the same one-per-type-per-object rule.

#### Reveal_Triggers and Achievements (Requirements 19, 40)

Conditions are a small declarative DSL validated by zod, never code strings:

```ts
type Condition =
  | { kind: 'event'; event: DomainEventType; where?: Record<string, string | number | boolean> }
  | { kind: 'goldAtLeast'; amount: Gold }
  | { kind: 'corporateResourceAtLeast'; resourceId: ResourceId; amount: number }
  | { kind: 'ownedBusinessCountAtLeast'; businessType: string; count: number }
  | { kind: 'all' | 'any'; of: Condition[] };
```

- Examples: `storage_responses` fires on `{event: 'storageFull', where: {owner: 'player'}}` (19.4); `hiring_option` on `{event: 'customerLost', where: {reason: 'patience_expired', owner: 'player'}}` (19.5); `first_management_view` on `{event: 'uiManagementViewOpened'}` (19.6). The renderer reacts to the `revealFired` event with the 10-second real-time highlight.
- `state.reveals.fired` is an ordered list of trigger ids and is part of the save (19.3). UI features check `isRevealed(featureKey)`. There are no levels or XP (19.2).
- The Pub Panel's "Add Human" response (6.7) is gated by the `hiring_option` reveal, so it appears only after the first patience-expired loss; "Change drink price" is always available.

#### Phase 6 systems (economy expansion, additive)

| System | State section added by migration | Notes |
|---|---|---|
| `market` | `market: { prices: Record<ResourceId, {buy, sell, history: number[]}>; nextUpdateTick }` | Random walk step drawn from RNG, then clamp `sell ∈ [min, max−spread]`, `buy = max(sell + minSpread, …)` clamped to max. Bounds validated `min > 0` at load (30.3). History keeps last 10 (30.6). |
| `acquisitions` | `acquisitions: { offers: Record<Id, AcquisitionOffer> }` | Hidden attributes stored with `hidden: true`; on accept, scheduler entries for reveals at per-attribute delays (32.6). Liability reveal applies cost via `applyGold(..., 'liability')`. |
| `competitorEvents` | `competitors[*].nextEventTick` | Weighted table from data; skip "open location" if no free Plot (38.2); price changes clamped to Pub bounds (38.3). |
| `questionable` | `questionable: { offers, running }` | Start removes Humans from Jobs and sets `occupied`; completion grants reward via `addToStock` (excess discarded, ledger records only the accepted part), then rolls Consequences into the scheduler (37.4, 37.5). |
| `chains` | `chains: { registered: Record<string, Chain> }` | Chain detection over a flow graph built from 300 s ledger of transfers (producer → vehicle → business). Synergy added to `player.corporateResources`. |
| `reputation` | already present in Phase 1 | Phase 1 has no system that changes it, so it stays at 50 (36.2). |
| `minigames`, `achievements` | `boosts`, `achievements` list | Boost ≤ 15% for ≤ 60 s enforced by schema bounds (39.2). |

Each Phase 6 Business type is a Definition (`brewery`, `warehouse`, `market_depot`) handled by the same storage, staffing, production and logistics code (1.8, 1.9, 46.1).

### Interaction helpers (pure, in `packages/sim/interaction`)

- `contextActionFor(view)` takes the CEO position, mode, inside-Business flag, manual Vehicle pose and speed, and the interactable list (Businesses' entrances, Vehicles, Plots, Supplier, Competitor Pub). It returns the action for the nearest object within `interactionRange` (default 2), or `null`: `Enter` for owned Businesses and for Businesses whose Definition has an `office` marker (Phase 3; the Player's Pub also offers its presence Services through Enter), `Leave` on the interior door mat, `Inspect` for Competitor Pub, Competitor Vehicle, Supplier and Plots for sale, `Drive` for owned Vehicles, `Load`/`Unload` when driving, stopped (< 0.5) and inside an Unloading_Zone (`Unload` if the Business accepts part of the cargo, else `Load`), `Exit` when driving and stopped, `Help Serve` (Phase 6) when inside an owned Pub above the waiting threshold (13.1, 13.2, 13.6, 14.2, 14.3, 14.5, 39.1).
- `nextViewMode(mode, d, cam)`: `ceo → management` when `d > T`; `management → ceo` when `d < T × (1 − hysteresis)`; otherwise unchanged (15.3, 15.4).
- `nearestRoadPoint(graph, x, z)`: projection onto every edge segment, minimum distance.

### Built Phase 1 reference (Nov 2026 polish)

These items are built and are the baseline later phases extend. Where a statement above conflicts with this list, this list wins.

| Item | Where | Design consequence |
|---|---|---|
| Explicit building entry | `ceoEnter` / `ceoExit` with validated door hints; `ceoProximity` only clears `insideBusinessId` | Nothing enters a Business on proximity. The Context_Action `Enter` is the only way in. Offices and the pub fit-out reuse this path (Phase 3). |
| Model-derived hitboxes | `apps/web/src/render/footprints.ts` | Footprints come from the bounds of the scaled model. The Simulation keeps only interior walls and the CEO interior position. Frontage fitting (Phase 2) reuses the same code. |
| Curbs | Renderer lifts figures onto the curb height; Physics_Layer curb is a physical step; per-wheel ray-cast suspension | Phase 2 frontage slots must leave the curb strip free in front of every slot. |
| Driving overhaul | `physics/handling.ts` reads `handling` per Vehicle Definition (`manualTopSpeed`, drift, donut, suspension) | There is no `manualSpeedBonus`. New Vehicles only need data. |
| Owner-variant vehicle GLBs | `render/assets/modelMap.ts` maps a model key plus owner to a glTF variant | Owner colour is a model variant, not a tint, for Vehicles. |
| Landmarks | `packages/content/data/maps/landmarks.json`, render-only, model-derived hitbox | Seed of the Frontage_Slot `filler` kind (Phase 2). City hall sits on its own slot of double width. |
| Visibility rule | Customers, staff, crates and Human_Name labels inside a Business are drawn only when the CEO is inside that Business. Outside, Customers are drawn walking to the door and disappear at the door, and appear at the door when leaving (14.10). | Phase 5 thought bubbles, coin pops and the queue at the door follow the same rule: indoor effects only indoors, door queue only outdoors. |

### Game loop (`apps/web/src/loop/GameLoop.ts`)

```ts
type PauseReason = 'hidden' | 'pauseMenu' | 'speedPause' | 'syncConflict' | 'fatalError' | 'loading';
type GameSpeed = 1 | 2 | 4;
class GameLoop {
  pauseReasons: Set<PauseReason>;
  speed: GameSpeed = 1;                       // from sessionStore; not part of SimState
  private acc = 0; private last: number | null = null;
  frame(now: number) {
    if (this.pauseReasons.size > 0) { this.last = null; return this.render(this.acc / TICK_MS); }
    const dt = this.last === null ? 0 : now - this.last; this.last = now;
    const speed = this.effectiveSpeed();        // 1 while Manual_Driving (47.11)
    this.acc += dt * speed;
    const cap = BASE_MAX_TICKS_PER_FRAME * speed;   // 10 × speed (2.3)
    const due = Math.floor(this.acc / TICK_MS);
    const run = Math.min(due, cap);
    this.acc = due > cap ? this.acc % TICK_MS : this.acc - run * TICK_MS;
    for (let i = 0; i < run; i++) this.runTick();
    this.render(this.acc / TICK_MS);
  }
}
```

- `ticksToRun(acc, dt, speed)` is extracted as a pure function for testing (2.2, 2.3).
- Game_Speed (47): `loop/gameSpeed.ts` holds the pure rules: `availableSpeeds(revealed, devMode)` returns `[1]` until the `game_speed` Reveal_Trigger has fired or Dev_Mode is on, then `[1, 2, 4]`; `stepSpeed(current, dir, available)` for `[`/`]`; `effectiveSpeed(selected, manualDriving)` returns 1 while Manual_Driving. Speed is kept in `sessionStore`, reset to 1 on every new or loaded slot (47.3). The speed pause is the `speedPause` pause reason: setting it triggers a Local_Store write like the Pause_Menu; clearing it resumes only if no other reason remains (47.9, 47.10). Because the Simulation only sees Ticks, speed never affects state, saves or determinism (47.2). At 4x the Tick budget (≤ 4 ms) means ~16% of a real second on a phone for 40 Ticks; the per-frame cap of 40 bounds worst-case catch-up frames.
- Dev_Mode (`dev/devMode.ts`): on when `new URLSearchParams(location.search).get('dev') === '1'`, when `import.meta.env.DEV`, or when the Pause_Menu "Testing" toggle is on (stored in Local_Store `meta.devTesting`, per device). It only changes `availableSpeeds` (and shows the debug overlay of task 32.2); it never submits Commands or fires reveals (47.6).
- `last = null` while paused means no elapsed real time is simulated on resume (21.3, 21.5). Only `hidden`, `pauseMenu` and `syncConflict` are pause reasons for Requirement 21/25; the "resume route?" dialog does not pause (operations continue).
- `visibilitychange` → hidden adds `hidden` and triggers a Local_Store write after the current Tick (no Tick runs after the event because the loop checks reasons before the next Tick) (21.1, 21.2). Visible removes `hidden`; Ticks resume only if `pauseMenu` is not set (21.3, 21.4). `pagehide` triggers a write (23.2). Opening the Pause_Menu adds `pauseMenu` and writes (21.6, 21.7).
- Physics: `<Physics paused={pauseReasons.size > 0}>` (21.8).
- Snapshots: the loop keeps `prevPoses` and `currPoses` maps (id → x, z, heading) captured after each Tick for Humans, Vehicles and the CEO. The renderer lerps with `alpha`. Customers derive poses from state progress, which also interpolates with `alpha`.

### State bridge to React (`apps/web/src/store`)

- `hudStore` (Zustand): `gold`, `debt`, `alerts`, `contextAction`, `syncStatus`, `revealed` set, `newsTail`. Updated after each Tick batch; setters compare and skip unchanged values so React re-renders only on change.
- `uiStore`: `viewMode`, `cameraDistance`, `selection`, `openPanel`, `inputDevice` ('touch' | 'keyboard'), `pendingDialogs`.
- `sessionStore`: profile, slot, PIN lock info, migration/backup notices, `gameSpeed` (1 | 2 | 4), `speedPaused`, `devMode`.
- `simBridge`: holds the `Simulation` instance, exposes `useSimSelector(selector, equality)` for Panels. Panel subscriptions refresh at most 5 times per second of real time to avoid re-rendering at 10 Hz.
- R3F components never subscribe to state through React; they read `simBridge` and pose maps inside `useFrame` (transient updates).

### Renderer (`apps/web/src/render`)

- Scene: ground plane and road meshes merged into a few static geometries per material; Businesses as boxes (with removable roof and front-wall groups for interior view); Humans and Customers as capsules; Vehicles as box + four wheel cylinders; crates as small boxes. Owner colours and palette come from `theme.json` (20.1). Business names come from text tables via the registry (16.2).
- Asset mapping (16.4): `modelMap.ts` maps each `modelKey` to either `{ kind: 'primitive', shape, size, colorToken }` or `{ kind: 'gltf', url, scale, offset, rotation }`. A unit test asserts that every model key referenced in the registry has a mapping. Replacing a placeholder with a Kenney/KayKit glTF is a one-line mapping change; glTFs are loaded via drei `useGLTF` and precached by Workbox.
- Instancing: one `InstancedMesh` per (modelKey, material) for Humans, Customers and crates; matrices updated in `useFrame`. Businesses and Vehicles are few, so they are regular meshes until glTF swaps make instancing worthwhile.
- Interior (14.4): entry is explicit. The `ceoEnter` Command (with a validated door hint) sets `ceo.insideBusinessId`, and the `ceoProximity` system only ever clears it; the renderer hides that Business's roof and front walls and the camera eases to the Person band over the interior. No scene change or loading screen (15.1).
- Customers and staff animate between layout anchors (entrance, seats, bar, storage, exit) defined in the Business layout data (4.13, 5.7).
- Cargo crates: `crateCount = ceil(cargo / cratesPerUnit)` capped at a visual max, laid out on the vehicle bed (11.3). Storage indicators: stacked crates at 100%, empty shelf at 0 for Player-owned Businesses (9.6, 9.7).
- Name labels (7.24): drei `Text` (troika SDF) billboards above Humans, shown only in CEO_Mode at Person/Business bands, limited to the 12 nearest Humans in view, text from `displayName()`.
- Management overlays (15.8): Owner-coloured markers per Business, Vehicle and Plot; Route polylines; bottleneck Routes drawn in warning colour (11.7); Phase 6 chain highlight (35.4); Phase 4 Info_Layer tints (see Phases 2 to 5 design).
- Aggregation (15.11): when more than 20 Customer figures (default) would be visible, Customer instances are hidden and each Business shows an activity indicator (bubble with count, pulse rate from arrivals per minute). Visibility count uses Business bounding spheres against the camera frustum.
- Collision effect (20.3): on physics contact events above an impulse threshold, the van body mesh plays a squash-and-wobble spring and a small bounce; the cargo crate meshes jiggle.
- Districts (48.9): static geometry is built per District so an unlock adds a chunk without rebuilding others. Locked Districts render desaturated with a fence/"coming soon" marker at each District_Connector and are not selectable; Phase 1 ships the starting District plus, optionally, one visible locked neighbour.
- Headcount_Fill (49.8): no figures are drawn; a later phase may add an aggregated badge.

### Camera_Controller

- Perspective camera, fixed yaw (45°) and tilt starting at ~55° from horizontal, gently increasing toward ~70° at City band for readability; narrow FOV (~35°) for the Overcooked-like miniature look. All values in `camera.json`.
- No rotation, ever (15.12): there is no yaw input binding or gesture (two-finger twist is ignored), and the yaw is a constant, not state. Movement and pan input map to fixed screen-aligned world axes: screen-up is the ground projection of the camera forward vector, screen-right its perpendicular. Because the yaw never changes, these two axis vectors are computed once from `camera.json`.
- Bounds (48.10): Management_View pan clamps to the combined bounding box of unlocked Districts; the City band's maximum distance is computed so that box fits the viewport at the current aspect ratio (capped by `dMax` from `camera.json`), and is recomputed when a District unlocks.
- Continuous distance `d` within `[dMin, dMax]`; bands in data, e.g. Person 6–14, Business 14–30, Street 30–60, Block 60–120, Neighbourhood 120–220, City 220–400 World_Units. Mode_Switch_Threshold `T` = Business/Street boundary (30), hysteresis 5% (15.3, 15.4).
- Zoom input changes a target distance; actual distance follows with exponential smoothing (15.2).
- CEO_Mode: target follows the CEO (or the manually driven Vehicle). Switching to CEO_Mode recentres on the CEO with a 0.4 s ease (15.5).
- Management_View: target pans by drag or keys, clamped to map bounds (15.9). On first switch, the loop submits `uiEvent managementViewOpened` (19.6).
- Manual_Driving clamps `d` to the Business band maximum (15.7).
- New Save_Slot starts at Person band next to the Pub in CEO_Mode (3.4).

### Physics_Layer (`apps/web/src/physics`)

- Mounted only during Manual_Driving and lazy-loaded (`import('./ManualDriving')`) so the Rapier chunk is not on the startup path (41.4). It is still precached for offline use.
- Colliders: static cuboids for building footprints derived from the scaled model bounds (`render/footprints.ts`, 16.5) and map boundary walls generated from map data; kinematic bodies for other Vehicles positioned from snapshots each frame; a ground plane.
- Driven Vehicle: one dynamic cuboid body with mass and restitution (`bounciness`) from the Vehicle Definition. Per physics step: forward force from throttle × `acceleration`; lateral velocity damped by `(1 − steeringLooseness)` for drift; yaw rate from steer input scaled by speed; linear velocity magnitude clamped to the Vehicle Definition's `handling.manualTopSpeed` (a per-vehicle value in `vehicles.json`, read by `physics/handling.ts`; there is no global manual speed bonus) (13.3, 13.4). Body roll is a visual spring on the mesh proportional to lateral acceleration × `bodyRoll`.
- Upright monitor (13.14): if the body's up vector is more than 90° from world up for 2 s real time, submit `resetVehicle` at `nearestRoadPoint` and teleport the body. Out-of-bounds (13.15): if outside the drivable polygon, reset after a 0.5 s fade (well within 2 s).
- Each Tick, the loop reads the body pose and speed and submits `manualVehicleUpdate` (2.9).
- If Rapier fails to initialise, Manual_Driving is disabled with a toast; Automatic_Delivery covers every delivery (13.16).

### Input_System (`apps/web/src/input`)

Raw Pointer and Keyboard events are mapped to intents; intents become camera actions, UI navigation or Commands.

| Intent | Touch | PC (default bindings, 18.6) |
|---|---|---|
| Move CEO / steer and throttle | Left-thumb floating joystick (left 40% of screen) | WASD / arrow keys |
| Pan (Management_View) | One-finger drag on world | Mouse drag, WASD / arrows |
| Zoom | Pinch | Wheel, `+` / `-` |
| Context_Action | Right-side button (≥ 72 px, min 44 px) | `E` |
| Select object | Tap outside joystick area | Click; `Tab` cycles selectable objects in view, `Enter` selects |
| Close Panel | Close button / swipe down | `Esc` |
| Pause_Menu | Pause button in HUD corner | `P` |
| Game_Speed (once available, 47) | HUD speed control (pause / 1x / 2x / 4x) | `1` / `2` / `3` = 1x / 2x / 4x, `]` / `[` = faster / slower, `0` = speed pause |

- Game_Speed keys are ignored while `availableSpeeds` is `[1]`, so a locked game shows no behaviour change.
- Driving on touch: joystick direction is the desired heading in the fixed screen-aligned axes, magnitude is throttle; a desired direction more than 120° behind the van means reverse. On PC: W/S throttle/brake-reverse, A/D steer.
- CEO movement: the loop submits one `ceoMove` per Tick with the current normalised vector; the Simulation integrates with the CEO walking speed and clamps to walkable bounds.
- All Panels and dialogs use native `<button>`/`<input>` elements with visible focus rings, so every mechanic, including Job_Slot assignment and Route editing, is operable by keyboard alone (18.5) and by touch alone (18.4). Touch targets ≥ 44 × 44 CSS px via a shared `TouchTarget` style (18.3).
- `Tab` cycling order: selectable objects in the current view sorted by screen distance from centre, then Panel controls when a Panel is open.

### UI: HUD, Panels and screens (`apps/web/src/ui`)

- Layout: landscape-first; a CSS `orientation: portrait` media query on coarse-pointer devices shows the rotate-device prompt (18.1, 18.2).
- HUD (18.9): Gold (floor to whole Gold, 8.8) with debt warning when negative (8.6); Alert stack (one per type per object, tap to select the object); joystick (touch only); Context_Action button; small pause button; sync badge only when not synced; Game_Speed control (segmented pause / 1x / 2x / 4x, ≥ 44 × 44 CSS px per segment) only once speeds are available (47.4, 47.7). Phase 6 adds the News_Feed ticker and counters revealed by Reveal_Triggers (3.5).
- Text (46.8): every user-facing string, including button labels, Panel titles, dialogs and error screens, comes from `t(key, params)` in `apps/web/src/text/t.ts`. `TextKey` is the union of keys of the imported `en.json`, so unknown literal keys fail type-checking; at runtime a missing key renders the key itself and logs a dev warning. The Simulation emits only Text_Keys and params (Alerts, News_Feed, reveal names), never strings. ESLint `react/jsx-no-literals` (with an allow-list for punctuation and numbers) blocks raw JSX text. A unit test scans `apps/web/src/**` and content references for `t('…')` keys and text-key fields in Definitions and asserts each exists in `en.json`.
- Pause_Menu contains a "Testing" toggle (Dev_Mode, 47.6) alongside resume, save-slot exit and settings.
- Panels: side sheet ≤ 40% of width in landscape (bottom sheet ≤ 40% height when the side does not fit), built from `Card` components with ≤ 8 values per section; no tables (18.7, 18.8).

| Panel | Content | Requirements |
|---|---|---|
| Pub (owned) | Storage cards ("Beer 480/500", "Over capacity"), staffing, metrics, recommended staff, Job_Slots, responses "Change drink price", "Add Human" (revealed), auto-reorder toggle + threshold, place Order | 6.4, 6.7, 9.2, 9.5, 10.8, 15.10 |
| Job_Slot picker | Every Workforce Human with `displayName` and state (unassigned, en route, working, occupied); tap assigns | 7.16, 7.23 |
| Human | Name, Job, state, Salary, fire (with Severance shown) | 7.11, 7.23 |
| Vehicle | Capacity, cargo, Route, Driver, deliveries/min (5 min), Route editor, "Resume Route" when suspended | 11.6, 12.1, 13.13 |
| Supplier | Unit price, reserved Orders, Order form | 10.1, 10.3 |
| Competitor Pub | Name, popularity band, drink price | 17.4 |
| Plot | Status, price; Phase 6 buy/construct | 14.5, 27.1, 27.2 |
| Customer | State, drinks, wait | 14.6 |
| Finance | Income/expenses per category, last 5 Game_Minutes | 8.3 |
| Phase 6 | Market (prices + 10-update trend), Brewery (missing requirements, unit cost), Acquisition offer ("?" markers), Questionable_Opportunity (no probabilities), multi-Pub summary cards, input sourcing comparison | 27.5, 29.2, 29.5, 30.6, 31.5, 32.3, 37.8 |

- Screens: Definition error screen (lists every error, blocks start/load, 1.7); Profile picker (22.4, 22.5); PIN pad with lockout countdown (22.6, 26.6); Slot list (create, rename, delete with confirmation, 22.9, 22.10); Pause_Menu; Sync conflict dialog (25.4); migration/newer-version errors (24.7–24.9); PWA update prompt (42.3); "Resume Route?" dialog (13.11); localStorage fallback warning (23.6).
- Achievement toast and chain banner (Phase 6) are driven by `DomainEvent`s.

### Persistence (`apps/web/src/persistence`)

```ts
interface KeyValueStore {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  list<T>(store: StoreName, prefix?: string): Promise<T[]>;
}
type StoreName = 'saves' | 'backups' | 'profiles' | 'slots' | 'meta' | 'syncQueue';
```

- `idbStore` uses `idb` with database `human-resource` version 1 and the object stores above. Keys: `${profileId}/${slotId}`.
- `lsStore` implements the same interface over `localStorage` with key prefix `hr:`. `openLocalStore()` tries IndexedDB (open + test transaction); on failure it returns `lsStore` and sets `meta.fallbackWarned` after showing the one-time warning (23.5, 23.6).
- Autosave (23): a real-time interval of 30 s while Ticks advance, plus hidden, pagehide, Pause_Menu open and pre-update triggers. `writeSave(slot)`:
  1. If `state.tick === lastWrittenTick[slot]`, skip (23.3).
  2. Build doc with `revision = prev.revision + 1`, same `syncedRevision`.
  3. `put('saves', key, doc)`. On success, record revision and tick (23.4) and notify Sync_Service. On failure, raise the client save-failure Alert; the next interval retries (23.7).
- `pagehide` writes are best-effort: IndexedDB transactions started synchronously in the handler usually complete; the 30 s interval and visibility-hidden write bound any loss.

### Save_Serializer and Migration_Pipeline

```ts
// packages/shared/src/saveDocument.ts
export const CURRENT_SCHEMA_VERSION = 1;
export interface SaveDocument<S = unknown> {
  schemaVersion: number;
  revision: number;            // +1 per successful Local_Store write
  syncedRevision: number;      // last revision acknowledged by Save_API; 0 = never synced
  timestamp: string;           // ISO 8601, real time of write
  profileId: string;
  slotId: string;              // UUID generated client-side
  state: S;                    // SimState of schemaVersion
}
```

- Serialise: `JSON.stringify(doc)`; the state is already plain data (no Maps, classes, `undefined` values or non-finite numbers; the zod state schema enforces this).
- Deserialise: `JSON.parse` → envelope schema (shared) → version check → migrations → `simStateSchema.safeParse` → semantic checks (`invariants/check.ts`: stock sums, slot links, ids exist). The first zod issue path is reported as the invalid field (24.9).
- Migration_Pipeline: `migrations: Array<{ from: number; to: number; name: string; up(doc: unknown): unknown }>`, applied in order from the document version to current (24.5). Each step is a pure function over JSON; older-version shapes are typed locally inside the migration file and never imported from current code.
- Before applying migrations the loader stores the original document in `backups` for the slot, replacing any older backup (24.6). A throwing step aborts with `{ step: name }`, leaving the stored copy unchanged (24.7). A version above current shows "please update" and does not touch storage (24.8).
- The Phase 6 foundation step added migration `v1 → v2` (built; the v3 migration for Phases 2 to 4 is described under "Save schema and migrations") that inserts empty `market`, `acquisitions`, `questionable`, `chains` sections and default Sourcing_Policies.

### Sync_Service (`apps/web/src/sync`)

States per slot: `synced | pending | offline | conflict | tooLarge | outdated | deleted`.

Load decision (25.7–25.9) is a pure function:

```ts
type LoadDecision = 'useLocal' | 'useServer' | 'useLocalAndUpload' | 'conflict';
function decideLoad(local: {revision: number; syncedRevision: number} | null,
                    server: {revision: number} | null): LoadDecision {
  if (!local) return 'useServer';
  if (!server) return local.revision > local.syncedRevision ? 'useLocalAndUpload' : 'useLocal';
  if (local.revision === local.syncedRevision)
    return server.revision > local.syncedRevision ? 'useServer' : 'useLocal';
  return server.revision === local.syncedRevision ? 'useLocalAndUpload' : 'conflict';
}
```

Upload rules:

- After each successful local write: if the doc exceeds 5 MB (`new Blob([json]).size`), skip and raise "Too large to sync" (25.12). Otherwise `PUT …/save` with `baseRevision = syncedRevision` (25.1).
- 200 → write `syncedRevision = uploaded revision` into the local doc (metadata update, not a Revision increment) (25.2).
- 409 conflict → add `syncConflict` pause reason and show the dialog (25.4).
- 426 client-outdated → ask to update (25.13). 410 slot-deleted → offer "keep as new Save_Slot" (new UUID, `syncedRevision = 0`) (25.15). 413/422 → show the named limit.
- Network error → status `offline`, "not synced" badge, retry every 60 s real time (25.10).
- Deletions while offline go into `syncQueue` and are sent at the next successful request (25.14).

Conflict resolution:

- Keep server: store local doc as backup, load server doc into Local_Store (with `syncedRevision = revision = server revision`) and into the Simulation (25.5).
- Overwrite server: the local document is rebased so its Revision is above the server's: `revision = max(localRevision, serverRevision) + 1`, written to Local_Store, then `POST …/save/overwrite` with `replacedRevision = serverRevision`. The server moves its current document to the server backup and stores the local one (25.6). The rebase prevents another device that last synced the replaced server Revision from wrongly treating its stale copy as newest. This is the only case where a local write increases Revision by more than 1. It is a deliberate interpretation of 23.4 (the write increments by 1 from the rebased base revision) and should be confirmed during review.

```mermaid
sequenceDiagram
  participant Loop as GameLoop
  participant LS as Local_Store
  participant Sync as Sync_Service
  participant API as Save_API

  Note over Loop: autosave (30 s) / hidden / pagehide / pause
  Loop->>LS: put(doc rev=r+1, synced=s) [skip if tick unchanged]
  LS-->>Loop: ok
  Loop->>Sync: saved(doc)
  alt size > 5 MB
    Sync-->>Loop: alert "Too large to sync"
  else
    Sync->>API: PUT /save {baseRevision: s, document}
    alt base == server revision
      API-->>Sync: 200 {revision: r+1}
      Sync->>LS: set syncedRevision = r+1
    else base != server revision
      API-->>Sync: 409 {serverRevision}
      Sync->>Loop: pause (syncConflict) + dialog
    else unreachable
      Sync-->>Loop: status not synced, retry in 60 s
    end
  end
```

```mermaid
sequenceDiagram
  participant UI as Slot list
  participant Sync as Sync_Service
  participant LS as Local_Store
  participant API as Save_API
  participant Sim as Simulation

  UI->>Sync: load(slot)
  Sync->>LS: get local doc
  Sync->>API: GET /save/meta
  alt API unreachable
    Sync->>Sim: load local (status not synced)
  else reachable
    Sync->>Sync: decideLoad(local, server)
    alt useServer
      Sync->>API: GET /save
      Sync->>LS: put server doc (rev = synced = server rev)
      Sync->>Sim: load server doc
    else useLocal
      Sync->>Sim: load local doc
    else useLocalAndUpload
      Sync->>Sim: load local doc
      Sync->>API: PUT /save {baseRevision: synced}
    else conflict
      Sync->>UI: conflict dialog (keep server / overwrite server)
    end
  end
```

### Save_API (`apps/server`)

Fastify with `fastify-type-provider-zod` using DTO schemas from `packages/shared`. All routes under `/api`; everything else is served by `@fastify/static` from the built web app with SPA fallback to `index.html`.

| Method and path | Body | Responses |
|---|---|---|
| `GET /api/health` | – | 200 `{ok: true}` after a write/delete probe in `/data` succeeds; 503 otherwise (43.4) |
| `GET /api/profiles` | – | 200 `[{id, displayName, hasPin, pinSalt?, pinHash?, pinIterations?}]` (hashes for offline verification, 26.3) |
| `POST /api/profiles` | `{displayName, pin?}` | 201 profile; 400 `{error: 'invalid_field', field}`; 409 `{error: 'display_name_taken', field: 'displayName'}` (22.1–22.3) |
| `PATCH /api/profiles/:pid` | `{displayName?, newPin?, currentPin?}` | 200; 401 `wrong_pin`; 423 `pin_locked` `{retryAfterSec}` (22.8) |
| `POST /api/profiles/:pid/pin/verify` | `{pin}` | 200; 401 `wrong_pin` `{attemptsLeft}`; 423 `pin_locked` `{retryAfterSec}` (26.4) |
| `GET /api/profiles/:pid/slots` | – | 200 `[{slotId, name, revision, schemaVersion, updatedAt, deleted}]` |
| `PUT /api/profiles/:pid/slots/:sid` | `{name}` | 200 create-or-rename (name 1–30 chars, 22.9); 410 if tombstoned |
| `DELETE /api/profiles/:pid/slots/:sid` | – | 204; slot marked deleted (tombstone kept) |
| `GET /api/profiles/:pid/slots/:sid/save/meta` | – | 200 `{revision, schemaVersion, updatedAt}`; 404 none; 410 deleted |
| `GET /api/profiles/:pid/slots/:sid/save` | – | 200 Save_Document; 404; 410 |
| `PUT /api/profiles/:pid/slots/:sid/save` | `{baseRevision, document}` | 200 `{revision}`; 409 `conflict` `{serverRevision}`; 410 `slot_deleted`; 413 `too_large` `{limitBytes}`; 422 `unsupported_schema` `{supported}`; 426 `client_outdated` `{storedSchemaVersion}` (25.2, 25.3, 25.11, 25.13, 25.15) |
| `POST /api/profiles/:pid/slots/:sid/save/overwrite` | `{replacedRevision, document}` | 200; 409 if `replacedRevision` is no longer current or `document.revision ≤ replacedRevision` (25.6) |

Server rules:

- Upload accepted iff `baseRevision === current.revision` (0 when no document exists) and `document.revision > baseRevision`. The server stores `revision = document.revision`.
- Size: Fastify `bodyLimit` 6 MB; the route measures the raw `document` JSON byte length and rejects above 5 MB (default from env `MAX_SAVE_BYTES`) naming the limit.
- Schema: reject `schemaVersion > SERVER_MAX_SCHEMA` or `< MIN_SUPPORTED` with 422; reject `schemaVersion < stored.schemaVersion` with 426.
- Envelope `profileId`/`slotId` must match the path.
- Storage layout on volume `/data`: `profiles.json`; `saves/<pid>/<sid>.json` (current), `saves/<pid>/<sid>.backup.json` (server backup), `saves/<pid>/slots.json` (names, tombstones). Writes go to `*.tmp` then `fs.rename` (atomic on the same filesystem). A per-file async mutex serialises writes.
- PINs: PBKDF2-SHA256, 16-byte random salt, 210 000 iterations, 32-byte hash; only salt, iterations and hash are stored (26.2). Lockout: in-memory map per profile of failed attempt timestamps; 5 failures within 5 minutes lock for 5 minutes (26.4). A server restart clears lockouts; acceptable under the deferred-security scope.
- `accessGuard` is a Fastify `onRequest` hook registered for `/api/profiles/*` that currently allows every request (tailnet trust). Adding real auth later means replacing this hook and adding a credentials header; the Save_Document format is unchanged.
- CLI (26.7): `docker compose exec human-resource node dist/cli.js remove-pin "<displayName>"`, documented in `docs/deployment.md` (26.8), along with the statement that the Profile picker and PIN are convenience features and Tailscale membership is the only real access control (26.9).

### PWA_Shell (`apps/web/src/pwa`)

- `vite-plugin-pwa` with `registerType: 'prompt'`, `strategies: 'generateSW'`. Manifest: name "Human Resource", short name, icons 192/512 + maskable, `display: 'standalone'`, `orientation: 'landscape'`, theme colours from `theme.json` (42.1).
- Workbox: `globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,glb,gltf,json}']` so all assets including the Rapier chunk and models are precached (42.2). `navigateFallbackDenylist: [/^\/api\//]`; `/api` uses `NetworkOnly`.
- Update flow: `onNeedRefresh` shows the update prompt (42.3). On confirm: write Save_Document to Local_Store, then `updateSW(true)`. If dismissed, the waiting worker activates on the next launch; the save on pagehide and hidden covers the write-before-update condition (42.4).
- Offline: Profile picker falls back to cached profiles, PIN verification uses cached hashes with a per-device lockout record in `meta` (22.5, 22.7, 26.5), and Save_Slots in Local_Store load normally (42.5).

### Deployment

`Dockerfile` (multi-stage):

```dockerfile
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci && npm run build            # builds shared, sim, web (vite) and server (tsc)

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data STATIC_DIR=/app/public
WORKDIR /app
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/web/dist ./public
COPY --from=build /repo/apps/server/package.json ./package.json
COPY --from=build /repo/package-lock.json ./package-lock.json
RUN npm ci --omit=dev --ignore-scripts && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "dist/index.js"]
```

The server package bundles `packages/shared` into `dist` (tsup/esbuild) so the runtime image needs only the server's production dependencies.

`docker-compose.yml`:

```yaml
services:
  human-resource:
    build: .
    image: human-resource:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:8787:8080"     # loopback only; tailscale serve publishes it on the tailnet
    environment:
      MAX_SAVE_BYTES: "5242880"
    volumes:
      - hr-data:/data
volumes:
  hr-data: {}
```

HTTPS on the tailnet (43.3, 26.1): on the Ubuntu host, `sudo tailscale serve --bg --https=8443 http://127.0.0.1:8787` exposes `https://<host>.<tailnet>.ts.net:8443` with a valid certificate (MagicDNS and HTTPS certificates enabled in the tailnet admin). A separate HTTPS port avoids clashing with other apps already served on 443; using the user's existing Tailscale-only reverse proxy instead is documented as an alternative. Static caching headers: `sw.js`, `index.html` and the manifest `no-cache`; hashed assets `immutable`.

### Repository hygiene, OneDrive and Windows (Requirement 45)

- `.gitignore`: `node_modules/`, `dist/`, `build/`, `.vite/`, `.vitest/`, `coverage/`, `playwright-report/`, `test-results/`, `*.tsbuildinfo`, `.env*` (except `.env.example`), `data/`, `*.local`.
- Caches outside OneDrive: `vite.config.ts` sets `cacheDir` from `process.env.HR_CACHE_DIR ?? path.join(os.tmpdir(), 'human-resource', 'vite')`; Vitest uses the same base for its cache; TypeScript build info goes to the cache dir via `tsBuildInfoFile`. On Windows, `os.tmpdir()` resolves under `%LOCALAPPDATA%\Temp`, outside OneDrive.
- `node_modules` (`docs/onedrive.md`): OneDrive cannot exclude a subfolder by name for personal accounts, and folder links inside the synced tree are followed, so a junction does not keep `node_modules` out of sync. Documented options in order of preference:
  1. Keep the active working copy outside OneDrive (for example `C:\dev\HumanResource`) and rely on GitHub for backup and transfer. This is the only option that fully meets 45.2 for `node_modules`.
  2. If the working copy stays in OneDrive: pause OneDrive syncing while running `npm.cmd ci`, and accept that `node_modules` will sync afterwards. A single root `node_modules` (npm workspaces hoisting) keeps the file count down.
- Lockfile `package-lock.json` committed (45.3). Branch `main`, remote `https://github.com/davidzonnenberg/HumanResource.git` (45.4).
- Scripts are cross-platform (no `rm -rf`; use `rimraf` or Node scripts). README shows PowerShell usage with `npm.cmd`: `npm.cmd ci`, `npm.cmd run dev`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`.
- Root scripts: `test` = `vitest run` (all projects, non-watch, 44.1); `typecheck` = `tsc -b`; `dev` = Vite dev server with `/api` proxied to the server dev process.

### CI and steering

- `.github/workflows/ci.yml`: on `push` and `pull_request`; `ubuntu-latest`, `actions/setup-node` with Node 24 and npm cache; steps `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Pinned action versions. No deploy step and no secrets; deployment stays manual on the Ubuntu host.
- `.kiro/steering/architecture.md` (authored separately) restates the rules later tasks must follow: package dependency rules, Simulation purity and determinism (no `Math.random`/`Date`/transcendental math), Gold in integer hundredths, all Job_Slot reads through `slotCapacity`, paths only via `pathCacheFor`, Game_Speed only in the web loop, user-facing strings only via `t()`, fixed camera, one property test per correctness property with the tag comment. Later tasks treat it plus CI as the contract.

### Performance approach (Requirement 41)

Simulation budget (41.3, ≤ 4 ms per Tick on a Mid_Range_Phone for 3 Pubs, 1 Brewery, 1 Warehouse, 4 Vehicles, 60 Customers):

- Work per Tick is linear in entity count; no per-Tick allocation in hot loops (reused scratch arrays, in-place ring buffers).
- Shortest paths precomputed at map load; per-Tick vehicle movement is constant-time cursor advancement.
- Metrics update only the current-second bucket per Tick; window sums are maintained incrementally (add new, subtract evicted).
- Alerts and conditions are evaluated against dirty flags set by systems (for example storage changed), not by scanning everything.
- A Vitest `bench` runs the reference scenario in Node; CI threshold is 1 ms per Tick on a desktop as a proxy (about 4× headroom for a phone). Real-device verification uses an in-game debug overlay showing average and p95 Tick time.

Rendering (41.1, 41.2, 41.5, 41.6):

- Instanced meshes for repeated primitives; merged static geometry for ground, roads and Plot outlines; one directional light without shadow maps, plus blob-shadow quads under figures and vehicles.
- No post-processing; `antialias` on only when DPR ≤ 1.5; `powerPreference: 'high-performance'`.
- Far zoom: Customer aggregation (15.11), Humans hidden above Block band (only markers), labels only at Person/Business bands.
- Adaptive DPR: a custom monitor keeps a 10 s rolling average FPS. Below 30 FPS it lowers DPR in steps of 0.05 × device DPR to a floor of 0.75 × device DPR; when the average exceeds 36 FPS (target + 20%) at reduced resolution it raises in steps up to 1 × device DPR. A 3 s cooldown between steps prevents oscillation.
- Startup (41.4): the Profile picker is the first route and does not import three/R3F; the game screen chunk is preloaded in the background; Rapier loads only for Manual_Driving.

## Phases 2 to 5 design

This section adds the foundations and the Grand Opening content on top of the Phase 1 design above. It follows `architecture.md`: the Simulation stays pure, content lives in data, input arrives as Commands, Gold is integer hundredths.

### Where each new piece lives

| Piece | Package and path | Notes |
|---|---|---|
| Modifier, StatId, `getStat`, `explainStat` | `packages/sim/src/stats/` | Pure. `StatId` is a zod enum in `defs/schemas.ts`. |
| Condition and Effect schemas, `evaluateCondition`, `applyEffects`, `printCondition` | `packages/sim/src/conditions/` (extends the existing `evaluate.ts`) | `applyEffects` lives next to it. The only module that turns Effects into state changes. |
| Service definitions, `useService` handler, `requireAccess` | `packages/sim/src/commands/useService.ts`, schema in `defs/schemas.ts` | Services are fields of `BusinessDef`. |
| Command_Log types, `canonicalJson`, `stateHash`, `runLog` | `packages/sim/src/replay/` | Pure. Hash is FNV-1a 64 bit over the canonical JSON bytes, built from two 32-bit halves (no BigInt, no `Math.pow`). |
| Command recorder, rolling tail, bug-report export | `apps/web/src/loop/commandRecorder.ts` | Wraps `simBridge.submit`. Never imported by the sim. |
| Frontage derivation | `packages/sim/src/defs/frontage.ts` | Turns `streets` into Plots, fillers and Unloading_Zones at registry load. |
| Frontage model fitting | `apps/web/src/render/footprints.ts` (extended) | Scales a model to its slot width. |
| Layout anchors | `packages/content/data/layouts/<key>.json`, loaded into `reg.layouts`, helpers in `packages/sim/src/layout/anchors.ts` | The Renderer reads the same data through the registry. |
| Bar worker, tabs, vibe, seats, taps | `packages/sim/src/systems/staff.ts`, `customers.ts`, `pubCapacity.ts` | Same slots as Phase 1 systems. |
| License, Loan, fit-out, supply deals, candidates, quests, requests | Definitions in `packages/content/data/phase3/*.json`, handlers as domain Effects in `packages/sim/src/conditions/domainEffects.ts` | No office id appears in any system. |
| Gold buckets | `packages/sim/src/money/buckets.ts` | Used by `applyGold` and by the finance summary. |
| Phone apps registry | `packages/content/data/ui/apps.json`, schema in `defs/schemas.ts` | Reference checks (reveal feature, text keys) in `defs/registry.ts`. |
| Phone, Desk, HUD additions, Waypoint, selected Info_Layer | `apps/web/src/ui/phone/`, `ui/desk/`, `store/waypointStore.ts` | Waypoint and layer are web-only state and never enter `SimState` (73.5, 74.4). |
| Info_Layer values | `packages/sim/src/interaction/infoLayers.ts` | Pure derived selectors, not state. |
| Quirks, summary card | `packages/content/data/phase5/*.json`, `packages/sim/src/systems/summaryCard.ts` | Renderer effects are derived and never saved. |

### Modifiers and `getStat` (Phase 2, Requirement 50)

```ts
type StatId = 'demand' | 'premiumPrice' | 'repeatOrderChance'      // already wired in Phase 1 and 6
  | 'seats' | 'taps' | 'vibe' | 'drinkPrice' | 'workSpeed';        // read by Phase 3 to 5 systems
// A StatId is added to the enum in the same change that makes a system read it. Definitions with other stats are rejected (50.3, 50.4).

type SourceRef = { kind: 'trait' | 'brand' | 'recipe' | 'service' | 'quest' | 'consequence' | 'fitout' | 'quirk' | 'boost' | 'longWait'; id: string };
type TargetSelector = { kind: 'player' } | { kind: 'business' | 'human' | 'vehicle'; id: Id };

interface Modifier {
  id: Id;                       // `mod_0001`, from idCounters, so the order of the list is deterministic
  source: SourceRef; target: TargetSelector; stat: StatId;
  op: 'addBp' | 'addFlat'; value: number;    // integers
  untilTick?: Tick;
}
```

- Stored modifiers live in `state.modifiers: Modifier[]`, sorted by id. Static ones (Traits, Brands, Recipe Traits, Quirks) are not stored. `getStat` derives them from the Definitions of the target, so existing content keeps working with no state change.
- `getStat(state, reg, target, stat)`: `base` comes from the Definition or the runtime field named by the StatDef. `sumBp` is the sum of all `addBp` values, `sumFlat` the sum of all `addFlat` values (stored plus static). Result = `base + sumFlat + mulDivFloor(base, sumBp, 10000)` (`mulDivCeil` for stats whose StatDef says `rounding: 'ceil'`, which are the cost-like stats). Because only sums are used, the result does not depend on Modifier order (50.9).
- Trait data written as `addPct` is converted once at registry load to `addBp = addPct × 100` (the equivalence property 50.6 compares against the earlier direct computation).
- `modifiers` system (slot 0.5) deletes every Modifier with `untilTick <= tick`.
- `explainStat(state, reg, target, stat)` returns `{ base, entries: { source, op, value }[], total }` for the "why this number" Panel (50.7).
- Phase 6 effects (brand demand, recipe repeat chance, boosts, reputation demand modifier, synergy effects) are all written as Modifiers (80.1). The `boosts` section of Phase 6 stays as the saved form of `source.kind = 'boost'` Modifiers created by `completeMinigame`.

### Conditions and Effects (Phase 2, Requirement 52)

```ts
type Condition =                      // existing kinds stay as they are
  | ... // event, goldAtLeast, corporateResourceAtLeast, ownedBusinessCountAtLeast, all, any
  | { kind: 'not'; of: Condition }
  | { kind: 'revealed'; feature: string }
  | { kind: 'statAtLeast' | 'statBelow'; target: TargetSelector; stat: StatId; value: number }
  | { kind: 'loanActive' | 'licensed' | 'pubOpen' } | { kind: 'humanCountAtLeast'; jobId?: JobId; count: number }
  | { kind: 'serviceUsed'; serviceId: string } | { kind: 'questStepDone'; questId: string; step: number };

type Effect =                         // the closed vocabulary of 52.2
  | { kind: 'gold'; amount: Gold | { range: [Gold, Gold] }; category: FinanceCategory; source?: string }
  | { kind: 'addModifier'; target: TargetSelector; stat: StatId; op: 'addBp' | 'addFlat'; value: number | { range: [number, number] }; durationSeconds?: number }
  | { kind: 'reveal'; triggerId: DefId }
  | { kind: 'schedule'; event: ScheduledKind; delaySeconds: [number, number]; payload: Record<string, string | number> }
  | { kind: 'grantResource'; destination: 'serviceBusiness' | { businessId: Id }; resourceId: ResourceId; qty: number }
  | { kind: 'news'; textKey: TextKey; params?: Record<string, string | number> }
  | { kind: 'domain'; op: DomainOp; args: Record<string, string | number> };
type DomainOp = 'setLicense' | 'startLoan' | 'payOffLoan' | 'applyFitOut' | 'setSupplyDeal' | 'buyTap'
  | 'hireCandidate' | 'fireRibbon' | 'occupyStaff';
```

- `evaluateCondition(state, reg, events)` is the one evaluator for Reveal_Triggers, Achievements, Quests, Services and Consequences (52.1). It reads state and the Tick's events only. It never reads or writes `state.rng` (52.5).
- `printCondition` prints the canonical JSON (fixed key order). `parseCondition(print(c))` equals `c` after normalisation (52.7).
- `applyEffects(ctx, effects, scope)` applies each Effect in order. `gold` goes through `applyGold`, so `GOLD_LIMIT` holds (52.4). Ranges are the only RNG use and are drawn in effect order, so a replay draws the same values. This is the "randomised effect" of 79.2.
- The `domain` kind is a design extension. The six kinds of 52.2 cannot express starting a Loan, setting a License_Tier, applying a fit-out or hiring a candidate, because those write dedicated state. `DomainOp` is a closed enum and every op is a named function in `domainEffects.ts` that validates its arguments and writes through the same helpers as other code. Requirement 52.2 names it as the seventh kind.
- Unknown Condition or Effect kinds, unknown StatIds and unknown `DomainOp`s are rejected at registry load with the Definition name (50.4, 52.3, 73.7).

### Services and `useService` (Phase 2, Requirement 51)

```ts
interface ServiceDef {
  id: string; nameKey: TextKey; descriptionKey: TextKey;
  cost: Gold;                                   // integer, charged with mulDivCeil rules like other costs
  access: 'remote' | 'presence';                // Access_Tag
  conditions: { when: Condition; reason?: ReasonCode }[];   // reason defaults to 'conditions_not_met'
  effects: Effect[];
  once?: boolean;                               // second use rejected with 'already_done'
  params?: { kind: 'choice' | 'picks' };        // which ServiceParams shape the Desk must send
}
// BusinessDef gets:   services?: ServiceDef[];   office?: { clerkKey: TextKey; lineKeys: TextKey[] }   // marker for the Desk
```

`useService` validation order, all before any mutation (51.4 to 51.8):

1. Business and Service exist, else `unknown_entity`.
2. District unlocked, else `district_locked`.
3. `access === 'presence'` requires the CEO inside the Business or within `interactionRange` of its door, else `not_present`.
4. Conditions in listed order. The first failing one rejects with its `reason`. This is how `already_licensed`, `loan_active`, `deal_missing` and `limit_reached` are produced from data, without a handler per service.
5. `once` and `already_done`.
6. `requireGold(cost)`, else `insufficient_gold` with `missingGold`.
7. Deduct cost, `applyEffects`, record `state.servicesUsed[serviceId]`.

`state.servicesUsed: Record<string, Tick>` is used by `once` and by the `serviceUsed` Condition. Offices are plain Business Definitions (`owner: 'npc'`, `storage: {}`, `services`, `office`). No system names an Office (60.2). The Phone applies `remote` settings through their own Commands and shows "Drive there" for `presence` ones (71.10).

### Command_Log, replay and State_Hash (Phase 2, Requirement 53)

```ts
interface LogEntry { tick: Tick; issuer: Issuer; cmd: Command; repeat?: number }   // repeat: the same Command on `repeat` consecutive Ticks
interface CommandLog { baseTick: Tick; baseHash: string; entries: LogEntry[] }
function runLog(reg, base: SimState, log: CommandLog, untilTick: Tick): { state: SimState; hash: string };
function canonicalJson(state: SimState): string;     // keys sorted, numbers printed by the standard JSON rules
function stateHash(state: SimState): string;          // 16 hex characters, FNV-1a 64 over UTF-8 bytes of canonicalJson
```

- `canonicalJson` sorts object keys at every level, so insertion order differences do not change the hash.
- Recording: the web `commandRecorder` wraps `submit`. Runs of identical per-Tick Commands (`ceoMove`, joystick intents) are stored with `repeat`. Manual driving poses differ every Tick and are stored as they are (53.4). Replay feeds them back as Commands, so it never needs Rapier.
- Storage: the Save_Document envelope gets an optional `commandLog` holding only the tail since the previous Local_Store write, limited to `config.commandLogTailLimit` entries, plus `baseTick` and `baseHash`. A full log with its start snapshot is exported by the bug-report button and used by the golden test. The optional field needs no schema bump.
- The web loop computes `stateHash` every `config.stateHashEveryTicks` Ticks and keeps the latest `{ tick, hash }` for the debug overlay. The upload DTO gets optional `stateHash` and `tick` fields (53.7, 53.8). The server stores them and returns them in the meta response, so two devices at the same Tick can compare.
- Golden playthrough: `packages/sim/test/golden/ten-minutes.log.json` plus `ten-minutes.hash`. The test replays the log and asserts the hash. A `npm.cmd run golden:record` script rewrites the hash on purpose (53.5, 53.6).

### Frontage_Slots (Phase 2, Requirement 54)

```ts
interface StreetDef {
  id: string; districtId: DistrictId;
  edge: { a: NodeId; b: NodeId }; side: 'left' | 'right'; startOffset: number;
  slots: FrontageSlot[];                          // laid out shoulder to shoulder from startOffset
}
interface FrontageSlot {
  id: string; kind: 'filler' | 'business' | 'plot'; width: number;     // World_Units; narrow houses 6 to 8, landmarks double
  modelKey?: string; businessDefId?: DefId; plotId?: Id; price?: Gold; facing?: number;
}
```

- `DistrictDef` gets `streets: StreetDef[]` and a derived `fillers: { slotId; x; z; w; d; rotation; modelKey }[]`. The existing explicit `plots` array remains valid, so a District can be converted one street at a time.
- `defs/frontage.ts` derives, per slot: the position along the road edge from the cumulative widths, a `PlotDef` for kinds `business` and `plot` (id = `slot.plotId ?? slot.id`, so existing Plot ids do not change and saves need no id mapping), the `accessNode` (nearest road node), the Unloading_Zone on the road next to the slot, and the hitbox and walkable cut-out. A `filler` needs only a model key (54.3). Changing a slot from `filler` to `business` changes only `kind` and `businessDefId`, not the position or model (54.9).
- Registry checks: slots of one street do not overlap and lie within the edge length, every derived Plot lies inside the District bounds, `business` slots reference an existing Business Definition (54.11). If a layout change would rename an existing Plot id, a v3 migration step maps old to new ids (54.10). The converted Old Town keeps its ids, so that step is empty unless a later layout renames them.
- The Renderer draws slots without loose ground between them, leaves the curb strip in front, and scales each model to its slot width using the footprint code (54.2, 54.8). City hall becomes a double-width slot on its street. Off-street landmarks stay in `landmarks.json`.

### Bar_Worker and pub capacity (Phase 3, Requirements 55 to 57)

Layout anchors (55.5):

```ts
interface LayoutDef { key: string; door: P; mat: P; bar: P; till: P; cleanSpot: P; taps: P[]; seats: P[]; storage: P; exit: P }   // P = {x, z} in interior-local units
```

The Simulation reads anchors through `reg.layouts`. Distance is the straight-line distance (`Math.sqrt`) between two anchors, because an interior has no obstacles that the sim models. Step duration in Ticks = `ceil(distance / jobMovementSpeed × ticksPerSecond)`. The pub definition lists `layoutKey`, and the registry checks `seats.length >= pub.seats` and `taps.length >= pub.maxTaps`.

Worker state machine (one per working Bar_Worker or per headcount unit; the task cursor already exists as `StaffTask`):

```ts
type WorkerTask =
  | { step: 'walk'; to: AnchorRef; doneTick: Tick; then: WorkerTask['step'] }
  | { step: 'takeOrder' | 'pour' | 'handOver' | 'takePayment' | 'clean'; customerId?: Id; tapIndex?: number; doneTick: Tick };
```

Priority for an idle worker is data (`config.barWorkerPriority`, default `takePayment, handOver, pour, takeOrder, clean`). The worker picks the first step that has work and a free resource:

- `takePayment`: a Customer in `paying` state with a Tab. Ends with the Tab paid (see below).
- `handOver`: a poured drink on the bar. A walk to the seat is added, and handing over starts the drink.
- `pour`: an order taken and not poured, one beer in stock, and a free Tap. If every Tap is busy the worker waits (56.3). Taps are reserved per Tick by index, so two workers never use the same Tap.
- `takeOrder`: a seated Customer whose order has not been taken. The order is registered when the step ends (`orderQueue[i].taken`).
- `clean`: when nothing else has work. Finishing a clean step removes the oldest `longWait` Modifier of that Pub early, which is how idle workers help the Vibe recover.

The `staff` system keeps its pipeline slot and the existing order queue, bar entries and lot threading (55.3). Work speed is read as `getStat(worker, 'workSpeed')` and divides step durations. The Pace setting maps to a `workSpeed` Modifier (`relaxed` −10%, `normal` 0, `hustle` +15%; values in data), so Hustle and quirks use the same path.

Seats, Taps and Hands (56):

- `seats = player.license ? min(getStat(pub, 'seats'), license.maxSeats) : 0` (62.6), `taps = min(getStat(pub, 'taps'), def.maxTaps)`. Base values come from `PubRuntime.seatsBuilt` and `PubRuntime.tapsBuilt`, which the fit-out and the supplier tap purchase raise. The seat array of `PubRuntime` is sized to `seats`.
- `hands` is the sum over workers of `1 / averageCycleSeconds` per minute, measured from the worker steps of the last 60 seconds. While a worker has no measured cycle yet, its base is `60 / (pourSeconds + 2 × config.defaultWalkDistance / movementSpeed)` (56.8).
- The Panel bars show `capacity / demandLoad` for each of the three numbers, with `demandLoad` taken from the existing staffing formula inputs (arrivals per minute and stay length). The lowest ratio is the bottleneck. When `demandLoad` is 0, the ratio is defined as 0 and no bottleneck is shown, with no division (56.9). `metrics` computes the three ratios.
- The Supplier service `buy_tap` uses the `buyTap` domain op. It rejects with `limit_reached` when `tapsBuilt` is already at `def.maxTaps` (56.6).

Tabs, Walkouts and Vibe (57):

```ts
interface Customer { ...; typeId: string; tab: { amount: Gold; lines: number }; waitedLong: boolean; payDeadlineTick: Tick | null }
interface PubRuntime { ...; seatsBuilt: number; tapsBuilt: number; vibeBase: number; open: boolean; pace: 'relaxed' | 'normal' | 'hustle';
                       orderQueue: { customerId: Id; placedTick: Tick; taken: boolean; poured: boolean }[]; lostIncome: RingBuffer }
```

- Serving a drink adds the price at the serve Tick to `tab` (57.1).
- A Customer who finishes enters `paying` and waits for a `takePayment` step. If no worker has finished it within `config.payWaitSeconds`, the Customer leaves. If the walkout condition below holds (low Vibe or `waitedLong`), the walkout path applies. Otherwise the Customer pays the Tab automatically and no RNG value is drawn (57.9, consistent with Property 64).
- At the end of `takePayment` the Tab is paid through `applyGold(…, 'sales', pubId)`. For a Competitor Pub it is a no-op, as before.
- Walkout rule (57.4): when a Customer would leave `paying`, a Walkout is possible only if `getStat(pub, 'vibe') < config.walkoutVibeBelow` or `waitedLong` is true. Then `rngInt(0, 99) < config.walkoutPct` decides. Outside that condition no RNG value is drawn.
- A Walkout adds the Tab amount to `lostIncome` and pays nothing. After either outcome `tab` is zero, so no Tab remains once the Customer is gone (57.8).
- When a wait exceeds `config.longWaitSeconds`, the Customer gets `waitedLong = true` once and the Pub gets a `longWait` Modifier `{ stat: 'vibe', op: 'addFlat', value: −config.longWaitVibePenalty, untilTick: tick + config.longWaitVibeSeconds }` (57.6).
- Vibe is `clamp(getStat(pub, 'vibe'), 0, 100)`. Base is `vibeBase`, set by the fit-out decoration, so a pub without a decoration has the data default.
- Customer types (`customerTypes.json`) hold weights, patience and tab multipliers. A License_Tier lists the allowed types. Arrivals draw the type with `rngInt` over the allowed weights only when more than one type is allowed.

`pub_open` gating (61.6): `customerArrivals` returns immediately unless `isRevealed('pub_open')`. While the Pub is `open = false` (Pintly toggle, or before opening) no arrivals are generated either. Customers already inside finish normally.

### Kegs (Phase 3, Requirement 58)

The canonical Beer amount in every Stock, cargo, load, Order and limit stays in drinks. A Keg is a visual and pricing unit only, not a second unit of account (58.1).

```ts
interface ResourceDef { ...; container?: { id: string; drinks: number; modelKey: string } }   // beer: keg with `drinks` per keg
// player.supplyDeal.kegDrinks overrides container.drinks for the Player's Orders (small kegs or big kegs)
```

- Orders, loads and unloads stay in drinks. They are not rounded to whole Kegs.
- Helpers `toContainers(amount, size)` (a display count) and `fromContainers(count, size)` live in `storage/containers.ts`. Only the UI and the Renderer use them.
- The conservation ledger keeps working in drinks, so Property 3 is unchanged.
- Price per drink = `pricePerKeg / kegDrinks`. Every cost computed from it is rounded up to whole hundredths, using `costOf` rounding (58.6).
- The open Keg is the oldest lot at the Pub (FIFO), and each pour takes one drink from it. When it is empty the next lot is "opened" without any extra step (58.4).
- The Renderer shows kegs instead of crates by `modelKey` and count `ceil(amount / drinksPerContainer)` (58.3).
- Migration of crate-based Beer (58.5): amounts do not change, so the total number of drinks is identical by construction. The migration only sets `player.supplyDeal` for existing saves to the default small-keg deal and fires `supplier_deal`.

### Offices, license, loans, fit-out, supply deals, hiring (Phase 3, Requirements 60 to 66)

All of these are Definitions, Services and domain Effects.

| Data file (`packages/content/data/phase3/`) | Shape (short) | Used by |
|---|---|---|
| `licenseTiers.json` | `{ id, fee, minSeats, maxSeats, minTaps, customerTypes[] }` | Municipality service `take_license_<tier>` with `setLicense` |
| `loanOffers.json` | `{ id, principal, fitOutBudget, repaymentPerMinute, interestBp, termMinutes }` | Bank services with `startLoan` |
| `fitOutItems.json` | `{ id, kind: 'table' \| 'tap' \| 'decoration', price, seats?, taps?, vibe?, modelKey }` | Pub service `fit_out` with `applyFitOut` |
| `supplyDeals.json` | `{ id, pricePerKeg, kegDrinks, contractFeePerMinute? }` | Supplier services with `setSupplyDeal` |
| `candidates.json` | `{ id, name, jobId, quirkId, cvKey, salaryPerMinute }` | Job centre services with `hireCandidate` |
| `requests.json` | `{ id, businessRole, serviceId, deadlineSeconds, consequence: Effect[] }` | Municipality and bank requests (68) |

State additions:

```ts
interface PlayerState { ...; license: { tierId: string; minSeats: number; maxSeats: number; minTaps: number; customerTypes: string[] } | null;   // while null, seats = 0 (62.6)
                        supplyDeal: { dealId: string; kegDrinks: number; pricePerKeg: Gold; contractFeePerMinute: Gold; feeCarry: number } | null;
                        fitOutBudget: Gold }
interface Loan { id: Id; offerId: string; principal: Gold; remaining: Gold; repaymentPerMinute: Gold; carry: number; startTick: Tick }
// SimState: loans: Loan[]; requests?: Record<Id, { id: Id; defId: string; businessId: Id; expiresTick: Tick }>
```

- `startLoan`: rejects with `loan_active` when `loans` is not empty (done by the Service condition). Adds `principal − fitOutBudget` through `applyGold` (category `loan`, added to `FinanceCategory`; the fit-out budget is part of the principal, 63.2), sets `fitOutBudget` to the offer budget and creates the Loan with `remaining = principal + ceil(principal × interestBp / 10000)`. The loan chip and the Ledgr app read this record (63.8).
- Load-time validation (63.11): the registry rejects an offer unless both hold:
  - `fitOutBudget ≤ principal`
  - `repaymentPerMinute × termMinutes ≥ principal + ceil(principal × interestBp / 10000)`
- Repayment in `finance`: `carry += repaymentPerMinute; charge = floor(carry / ticksPerMinute); carry −= charge × ticksPerMinute; charge = min(charge, remaining)`. The charge is a Mandatory_Expense (category `loan`), so Gold may go negative (63.4). When `remaining` reaches 0 the record is removed (63.5). Early payoff pays `remaining` in full (63.7).
- `applyFitOut`: the Service `params.picks` lists item ids with counts. The op checks the total price against `fitOutBudget` (`insufficient_gold` with the missing amount), the table count against `license.maxSeats` (`limit_reached`), and the tap count against the pub maximum. It then raises `seatsBuilt`, `tapsBuilt` and `vibeBase`, lowers `fitOutBudget`, and fires `fit_out_done`. The budget is not Gold: it can only be spent here.
- `setLicense` rejects with `already_licensed` through the Service condition. It sets `player.license`, fires `license_granted`, and the Pub's `seatsBuilt` is capped at the tier maximum.
- `setSupplyDeal` sets `player.supplyDeal` and fires `supplier_deal`. Until it fires, `placeOrder` and auto-reorder are rejected with `deal_missing` (65.5). The dev start sets a default deal.
- Contract fees use the same exact-carry rule inside `finance` (65.6).
- `hireCandidate` creates a Human with the candidate's name and Quirk (the name does not go through the Name_Pool draw, but it still follows the uniqueness rule of 7.21), charges the Hiring_Cost, fires `first_hire` once, and refuses a second Bar_Worker until `hiring_option` has fired (66.5).
- `fireRibbon` (service "Cut the ribbon") requires `first_kegs` fired and every other checklist entry done, then fires `pub_open` (61.5).
- Reveal_Triggers added: `license_granted`, `loan_taken`, `fit_out_done`, `supplier_deal`, `first_hire`, `first_kegs`, `pub_open`, `first_news`, `first_permit_offer`. `first_kegs` fires on the `vehicleUnloaded` event at a Player Pub for the first time.
- Unlock menu (67): each Reveal_Trigger Definition gets `teaserKey`, `descriptionKey` and `gaveKey`. The registry rejects a Definition without the first two (67.5). The Panel lists all triggers, showing only the teaser until the id is in `reveals.fired`.

### Grand Opening and quests (Phase 3 engine, Phase 4 UI, Requirements 61 and 73)

```ts
interface QuestDef { id: string; nameKey: TextKey; steps: { id: string; textKey: TextKey; done: Condition; targetBusinessRole?: string; reward?: Effect[]; requires?: string[] }[] }
// SimState: quests: Record<string, { step: number; doneSteps: string[] }>
```

- The Grand Opening checklist is the quest `grand_opening`. Its steps are Municipality, Bank, Pub fit-out (`requires` a Loan and a License_Tier), Supplier, Job centre and Back at the pub (`requires` every other step) (61.4). Steps outside `requires` can be done in any order.
- `targetBusinessRole` is a role tag on a Business Definition (`municipality`, `bank`), not an id, so the Waypoint and HUD resolve the Business by tag and no system names a Business.
- The `quests` system (slot 20.5) checks the open steps each Tick, advances those whose Condition holds, and applies each step reward once (73.2). The quest chain after the Grand Opening is "First 100 pints" and "Second location".
- The engine lands in Phase 3, because the checklist needs it. The To-Do app, the tracker and the Waypoint land in Phase 4.
- Dev start: `newGame(..., { start: 'dev' })` fires all checklist triggers and sets the quest to completed (61.8).

### CEO outside jobs (Phase 3, Requirement 68)

- Emergency supply runs: `placeOrder` already works without a Driver. The runs exist as soon as an Order is waiting and no Driver is assigned, so the existing `awaiting_pickup` Alert covers it. No new code besides the quest text.
- Municipality and bank requests are `requests` records created by a scheduler event `spawnRequest` (a new member of `scheduledKindSchema`, along with `requestDeadline`). Each request is answered by a presence Service of the same Office. When the deadline Tick passes unanswered, the request's `consequence` Effects apply (68.4).
- Scouting is a Service with `access: 'presence'` on a Competitor Business or a Plot that reveals its details (a `reveal` Effect).
- Side deliveries are Quests with a `deliver` step Condition over the `vehicleUnloaded` event and a reward.
- Head of Errands (68.8): a Job with `maxHeadcountPerSlot ≥ 1` whose capacity lets the `errands` system (slot 2.5) apply due presence Services marked `delegable` without the CEO.

### Finance buckets and Gold per hour (Phase 4, Requirement 70, schema v4)

```ts
interface FinanceState { minutes: { minute: number; byKey: Record<string, Gold> }[] }   // ring of 60 entries, replaces the 300 second buckets
// byKey key = `${FinanceCategory}|${businessId}` (businessId '' for owner-level entries: salary, severance, loan, contract, license, service)
```

- `applyGold` adds to the bucket for `floor(tick / ticksPerMinute)` under the key `category|businessId`. At a minute boundary the ring rotates and the oldest bucket is cleared.
- Selectors:
  - `goldPerHour = Σ byKey over the 60 buckets`: the current partial minute plus the 59 before it.
  - `goldPerHourOf(businessId)` and `byCategory` sum the matching keys, so per-Business finance (8.2, 27.5) and the Money Info_Layer keep working.
  - The Finance Panel's 5-minute view sums the last 5 buckets (70.4).
- Runway in game minutes = `floor(gold / (−goldPerHour / 60))` when `goldPerHour < 0`, otherwise not shown (70.5). The sparkline is the running sum of buckets. These are pure selectors in `money/buckets.ts`.
- Migration (its own v3 → v4 step, 70.6): the 300-second buckets are folded into minute buckets by `floor(second / 60)`, keeping their `category|source` keys mapped to `category|businessId`. Older entries become zero buckets (70.3).

### Phone, Desk, HUD, Waypoint and Info_Layers (Phase 4, Requirements 69 to 74)

- The phone shell and its apps are designed in `.kiro/specs/ceo-phone/design.md`, which replaces tasks 56 and 59.
  - `ui/apps.json` has `{ id, nameKey, icon, colour, revealFeature, tabs, dock, order }`.
  - `revealFeature` is always a reveal **feature**, never a trigger id. App features are named `app_<id>`. An existing feature may be reused, as LinkedOut reuses `news_feed`.
  - The content test checks that every non-null feature is known and that every text key exists.
  - The Phone renders the installed apps sorted by `order` (71.3). Installing an app is the `revealFired` event, which also shows the "New app installed" toast (71.4).
- Phone placement: Q on PC, a button outside the joystick zone on touch, available while Manual_Driving only when the Vehicle is stopped. The Phone is web-only UI over `simBridge` selectors and Commands. It replaces `PubPanel`, the Human, Vehicle, Supplier and Finance panels app by app (71.13). The Business panel that auto-opened on entering a Pub becomes the Pintly card.
- Settings and their access tag come from `settings.json` (see the Commands notes). The Phone sends the Command for `remote` ones and shows "Drive there" for `presence` ones. The Simulation enforces the same rule.
- Desk (72): `ui/desk/Desk.tsx` replaces the normal Panel when the CEO enters an Office, or the Pub for a presence service. The service cards are built from `BusinessDef.services` and `office.lineKeys`. Selecting a card starts the stamp gesture (hold to confirm, keyboard: hold Enter). Only a completed gesture sends `useService`. Releasing early sends nothing (72.5). Sound and screen shake are web effects.
- HUD (69): money pill from `goldPerHour`, loan chip from `loans[0]`, quest tracker from `quests`, alert bell with a "Fix" button that carries a `fix` target (`{ app, screen }` or a Business role) in the Alert, and the Phone button. The existing rule "at most one Alert per type per object" stays.
- Waypoint (73.4 to 73.6): `store/waypointStore.ts` keeps `{ targetBusinessId }`. A renderer component draws road arrows along the path from `pathCacheFor` between the CEO's nearest road point and the target access node. It clears when the CEO is within `interactionRange` of the target or the Player dismisses it. It is never saved.
- Info_Layers (74): `interaction/infoLayers.ts` returns `Record<Id, number>` in 0..1 per layer: Demand (arrivals per minute over a data maximum), Stock (storage fill), Staff (working capacity over required), Routes (flow of the last 300 seconds), Money (net Gold per minute per Business, from the existing metrics). Wayfindr and the 3D tint call the same function, so they agree (74.2, 74.3). The selected layer is web state.

### Feel alive and satire content (Phase 5, Requirements 75 to 79)

- Readable customers (75): thought bubbles and coin pops are drawn from Customer state and the `customerPaid` event. Bubbles and sound follow the visibility rule (indoors only) and the existing aggregation rule above 20 figures. Icons come from `theme.json`. A mute flag is a web setting.
- Quirks (76): `quirks.json` `{ id, textKey, trigger: 'pour' | 'walk' | 'idle' | 'serve', modifiers?: Modifier-like[] }`. `Human.quirkId` is optional, set from the start state or the candidate. A quirk with `modifiers` is a static source for `getStat` on that Human (76.5). A Headcount_Fill has no quirk and no bubble (76.4), because there is no Human record.
- Street life (77): queue size, window glow and cheering are derived in the Renderer from waiting Customers, Seats and the popularity band. None of it is saved.
- Summary card (78): `state.summary: { nextCardTick: Tick; base: { served: number; lost: number; gold: Gold } }`. The `summaryCard` system emits a `summaryDue` event with the deltas and an Employee of the Month. The name is picked with `rngPick` over Humans with `kind: 'human'` fills only (78.3). Because the interval is `nextCardTick` in game time, it follows Game_Speed by construction (78.2). The web loop adds a `summaryCard` pause reason and restores the earlier speed on dismissal (78.4, 78.5).
- Satire hooks (79): all seven hooks are Services, Questionable_Opportunities, Competitor events or Consequences. The consultant uses the `range` Effects. Team-building uses the `occupyStaff` domain op plus a `schedule` Effect of kind `applyEffects` that applies an `addModifier` after the occupied time. Rival poaching is a Competitor event that opens a Service as a `request`. The health inspector is a Consequence with a `gold` Effect. Loyalty card and happy hour are `addModifier` Effects (`repeatOrderChance`, `demand`, `drinkPrice`). The LinkedIn-style news is `news` Effects with text keys.

### Phase 6 reuse of the foundations (Requirement 80)

- Traits, Brands, Recipe Traits, Reputation demand, Synergy and Boosts are read through `getStat` (80.1). The Phase 6 code that is not built yet is written against `getStat` from the start. The parts of the foundation step already built (trait schema, registry conversion) keep working through the load-time conversion above.
- Plot, building, acquisition and questionable actions keep their dedicated Commands but follow the cost and effect path (80.2). Reveals, Achievements, Consequences and Competitor event effects use `evaluateCondition` and `applyEffects` (80.3). New Business placements use Frontage_Slots (80.4). Phase 6 pub staffing uses `bar_worker` and Seats, Taps and Hands (80.5). Vehicles use `handling` data (80.6).

### Save schema and migrations

| Version | Lands in | Contents |
|---|---|---|
| v1 | Phase 1 | Built. |
| v2 | Phase 6 foundation step | Built. Market, acquisitions, questionable, chains, boosts, reputationPending, sourcing defaults, depot Plot and Business. |
| v3 | Start of Phase 3 | One migration for everything Phases 2 and 3 need (below). |
| v4 | Phase 4 | Gold minute buckets keyed by category and Business (Requirement 70), with its own v3 → v4 step. |

Rule: once v3 saves can exist, the v2 → v3 step is never edited again. Every later state change gets its own version and step (59.7).

The decision: one migration, version 3, for Phases 2 and 3, so existing playthroughs are migrated once for them. The Gold buckets are v4. Phase 2 ships before it without a bump, because everything Phase 2 adds is either optional and means "empty" when absent (`modifiers`, `servicesUsed`, `commandLog` in the envelope) or derived (frontage output, hash). The version bump to 3 happens in the first Phase 3 task that adds a required field. That task also writes the migration for the Phase 2 sections, which satisfies 50.8. Phase 5 additions (`Human.quirkId`, `summary`) are optional with defaults on read, so they need no new version. If a later change adds a required field, it becomes v4 with its own step.

Migration v2 to v3 (pure JSON function, local types, never imports current types):

1. Add `modifiers: []`, `servicesUsed: {}`, `loans: []`, `quests`, `requests: {}`, `summary`.
2. Jobs: map every `bartender` and `server` Job_Slot to `bar_worker`, merging per Pub. Keep the Humans, set `jobId` on their assignment, and keep one `bar_worker` slot per old slot (the Pub Definition lists the new slot counts, so no Human is lost; extra Humans stay unassigned if the new count is lower) (59.1).
3. Customers: add `tab = { amount: drinksConsumed × pubPrice at migration, lines: drinksConsumed }`, `typeId` default, `waitedLong: false`. Customers in `waiting` keep their order entry with `taken: true`. A drink carried by a Server (`carry` task) goes back to the bar entry list, and the Customer keeps waiting (59.2).
4. Pubs: `seatsBuilt = seats.length`, `tapsBuilt = def default`, `vibeBase = data default`, `open: true`, `pace: 'normal'`, `lostIncome` empty ring.
5. Player: `license` of the Pub tier, `supplyDeal` default small-keg deal, `fitOutBudget: 0`. Fired reveals gain `pub_open`, `license_granted`, `supplier_deal`, `first_hire`, `first_kegs` for existing saves (59.3).
6. Finance: unchanged in v3 (the minute buckets are the v3 → v4 step).
7. Insert the Office Businesses and their Plots as literal JSON, like the depot in v1 to v2, so existing saves have a town with a Municipality, Bank and Job_Centre. The new `plots` follow the frontage derivation, with ids that were not used before.
8. Plot id mapping step (54.10): empty unless the street conversion renamed ids.
9. Phase 6 sections (v2) stay as they are.

Fixtures for v1 and v2 are generated from the current code before the first schema change. A test migrates every fixture, then runs `simStateSchema`, `checkInvariants` and 300 Ticks (59.4). Because migrations run in order, v1 fixtures also pass through v2 to v3.

### Reason codes and Commands added

Commands: `useService`, `setWorkerPace`, `setPubOpen`. Reason codes: `not_present`, `conditions_not_met`, `already_licensed`, `loan_active`, `deal_missing`, `limit_reached`, `already_done`. All of them need `reason.<code>` text keys in `en.json` (the dynamic keys are not covered by the key test, so they are added by hand, as in `phase2-guide.md`). New scheduler kinds are added to `scheduledKindSchema` and to the dispatch switch together with their handlers:
- `spawnRequest`
- `requestDeadline`
- `applyEffects`, with payload `{ sourceRef, effectIndex }`, an index into a data Effect list such as a Service, Questionable_Opportunity or Consequence definition, so delayed Effects are expressible. Team-building ("work faster after the occupied time") and consultant follow-ups use it.

`applyEffects` replaces the earlier one-off `applyAfterOccupied` kind.

## Data Models

All types live in `packages/sim/src/state/types.ts` and `packages/sim/src/defs/schemas.ts` (zod schemas with `z.infer` types). Ids are prefixed strings (`biz_0001`, `hum_0004`, `veh_0001`, `cus_0123`) allocated from `state.idCounters`, so allocation is deterministic.

### Primitive types

```ts
type Id = string;
type DefId = string; type ResourceId = string; type JobId = string; type RecipeId = string;
type TraitId = string; type BrandId = string; type NodeId = string;   // NodeId namespaced `<districtId>:<node>`
type DistrictId = string; type TextKey = string;                    // TextKey narrowed to keyof en.json in apps/web
type Tick = number;                         // integer
type Gold = number;                         // integer hundredths of Gold
type OwnerId = 'player' | 'npc' | `cmp_${string}`;
type RngState = [number, number, number, number]; // uint32 x4 (xoshiro128**)
```

### Definitions (Definition_Registry)

```ts
interface DefinitionRegistry {
  resources: Record<ResourceId, ResourceDef>;
  businesses: Record<DefId, BusinessDef>;
  vehicles: Record<DefId, VehicleDef>;
  jobs: Record<JobId, JobDef>;
  humans: Record<DefId, HumanDef>;
  traits: Record<TraitId, TraitDef>;
  recipes: Record<RecipeId, RecipeDef>;
  brands: Record<BrandId, BrandDef>;
  achievements: Record<DefId, AchievementDef>;
  revealTriggers: Record<DefId, RevealTriggerDef>;
  text: TextTables;                          // business names, alerts, news, legal-status lines
  namePool: readonly string[];
  modelKeys: ReadonlySet<string>;            // from content/data/models.json
  config: SimConfig;
  map: WorldDef;                             // Districts + connectors with precomputed edge lengths;
                                             // shortest paths live in PathCache per unlocked set
  startState: StartStateDef;
}

interface ResourceDef {
  id: ResourceId; kind: 'storable' | 'corporate'; tradable: boolean;
  modelKey: string; nameKey: string; crateUnits: number;   // units per visible crate
}

interface BusinessDef {
  id: DefId;
  type: 'pub' | 'supplier' | 'brewery' | 'warehouse' | 'market_depot' | string;
  inputs: ResourceId[]; outputs: ResourceId[];
  storage: Record<ResourceId, number>;                      // capacity per Resource
  humanRequirements: { jobId: JobId; slots: number; requiredForProduction: number }[];
  productionRules: ProductionRule[];
  brand: BrandId | null; traits: TraitId[];
  locationConstraints: { plotTags: string[] };
  owner: 'any' | 'player' | 'competitor' | 'npc';
  automation: { autoReorderAvailable: boolean; defaultSourcing: SourcingPolicy };
  loadRatePerSecond: number; unstaffedLoadRatePerSecond?: number;   // warehouse reduced rate (28.2)
  modelKey: string; layoutKey: string;
  pub?: PubParams; supplier?: SupplierParams; warehouse?: WarehouseParams;
}

interface PubParams {
  venueType: string; seats: number;                        // >= 1
  baseDemandPerMinute: number; patienceSeconds: number; bartendingIntervalSeconds: number;
  minDrinkPrice: Gold; maxDrinkPrice: Gold; defaultDrinkPrice: Gold;  // 0 < min <= default <= max
  repeatOrderChance: number;                               // 0..1
  maxDrinksPerVisit: number;                               // default 3
  demand: DemandFormula; staffing: StaffingFormula;
}

type DemandFormula = {
  kind: 'piecewise';
  price: { points: [Gold, number][] };        // multiplier non-increasing in price (validated)
  reputation: { points: [number, number][] }; // reputation 0..100 -> multiplier
};
type StaffingFormula = { kind: 'throughput'; expectedDrinksPerVisit: number; serverRatio: number; headroom: number };

interface ProductionRule {
  id: string; inputs: Record<ResourceId, number>; outputs: Record<ResourceId, number>;
  cycleSeconds: number; requiredJob: JobId; requiredWorkers: number; recipeFromState: boolean;
}

interface VehicleDef {
  id: DefId; type: string; capacity: number; speed: number;          // World_Units / s
  driverRequirement: { jobId: JobId } | null;                         // null = automated later (46.4)
  allowedResources: ResourceId[];
  handling: { acceleration: number; steeringLooseness: number; bodyRoll: number; bounciness: number; mass: number;
              manualTopSpeed: number;                      // about 2x the route speed for the Delivery_Van (13.4)
              driftGrip: number; lowSpeedThreshold: number; suspension: { rest: number; stiffness: number; damping: number } };  // 13.18, 13.19, 13.21
  modelKey: string;
}

interface JobDef { id: JobId; requiredQualifications: string[]; movementSpeed: number;
  maxHeadcountPerSlot: number; }                             // default 1 (49.2)
interface HumanDef {
  id: DefId; qualifications: string[];                      // ["regular"]
  salaryPerMinute: Gold; severance: Gold; walkingSpeed: number;
  hiring: { factor: number; minutes: number };              // 0.05, 60
  modelKey: string;
}

interface TraitDef {
  id: TraitId; target: 'business' | 'recipe' | 'brand';
  modifiers: Modifier[];                                     // e.g. { stat: 'repeatOrderChance', addPct: 15 }
  liability?: { cost: Gold; penalty?: Modifier[] };
  revealDelaySeconds?: [number, number];
}
interface RecipeDef { id: RecipeId; product: ResourceId; traits: TraitId[]; secret: boolean; }
interface BrandDef { id: BrandId; category: 'mainstream' | 'traditional_local' | 'budget' | 'premium';
  perVenue: Record<string, { demandMul: number; priceMul: number }>; }
interface AchievementDef { id: DefId; nameKey: string; descriptionKey: string; condition: Condition; }
interface RevealTriggerDef { id: DefId; condition: Condition; reveals: string[]; phase: 1 | 2; }

interface WorldDef {                                        // maps/world.json + maps/districts/*.json
  districts: Record<DistrictId, DistrictDef>;
  connectors: { id: string; a: { district: DistrictId; node: NodeId }; b: { district: DistrictId; node: NodeId } }[];
}
interface DistrictDef {
  id: DistrictId; nameKey: TextKey;
  bounds: [number, number][];                               // polygon; every Plot lies inside (48.2)
  nodes: { id: NodeId; x: number; z: number }[];
  edges: { id: string; a: NodeId; b: NodeId }[];
  plots: PlotDef[];
  drivableBounds: [number, number][];                       // polygon
  walkableBounds: [number, number][];
  unlockCondition: Condition | null;                        // data only in Phase 1 (48.11)
}
interface PlotDef {
  id: Id; x: number; z: number; w: number; d: number; rotation: number; tags: string[];
  accessNode: NodeId; unloadingZone: { x: number; z: number; w: number; d: number };
  initial: { kind: 'empty' } | { kind: 'for_sale'; price: Gold } | { kind: 'business'; defId: DefId; owner: OwnerId };
}

interface SimConfig {
  tickMs: 100; ticksPerSecond: 10; maxTicksPerFrame: 10;   // base cap, multiplied by Game_Speed in the web loop
  gameSpeeds: [1, 2, 4];                                    // read by the web loop only
  interactionRange: 2; doorHintTolerance: 1.5; manualTipFactor: 0.05; stoppedSpeed: 0.5;
  lostAlertPct: 10; lostAlertMinArrivals: 10; bottleneckPct: 10; routeWaitSeconds: 10;
  repeatChanceMax: 0.9; reputationStart: 50; popularityBands: { low: number; high: number };
}
```

Registry validation (Requirement 1.5–1.7) runs in two passes and collects all errors:

1. Structural: zod `safeParse` per file; issues become `{ definition: '<file>#<id>', field, message }`.
2. Referential and semantic: every `ResourceId`, `TraitId`, `BrandId`, `RecipeId`, `JobId` and `modelKey` reference resolves; Pub `seats ≥ 1`, `minDrinkPrice > 0`, `minDrinkPrice ≤ maxDrinkPrice`; demand price multipliers non-increasing; Market bounds `min > 0`, `buy > sell` feasible; map edges reference existing nodes; Plot access nodes exist; District ids unique, connectors reference existing Districts and nodes, Plots inside their District's bounds (48.2); start state has exactly one unlocked District containing the starting Businesses and at most one locked neighbour (48.4); `maxHeadcountPerSlot ≥ 1`.

### Simulation state

```ts
interface SimState {
  tick: Tick;
  seed: number;
  rng: RngState;
  idCounters: Record<string, number>;
  districts: Record<DistrictId, { unlocked: boolean }>;   // 48.3; path cache derived, not saved
  player: PlayerState;
  competitors: Record<Id, CompetitorState>;
  plots: Record<Id, Plot>;
  businesses: Record<Id, Business>;
  humans: Record<Id, Human>;
  customers: Record<Id, Customer>;
  vehicles: Record<Id, Vehicle>;
  routes: Record<Id, Route>;
  orders: Record<Id, Order>;
  ceo: CeoState;
  scheduler: ScheduledEvent[];              // sorted by (fireTick, seq)
  schedulerSeq: number;
  metrics: MetricsState;
  finance: FinanceState;
  resourceTotals: Record<ResourceId, number>; // running world totals, checked by invariants
  alerts: Record<string, Alert>;
  reveals: { fired: string[] };
  achievements: string[];
  news: NewsItem[];                          // bounded to last 50
  // Phase 6 optional sections, added by migration v2 (Phase 2 to 5 additions are listed under "Phases 2 to 5 design")
  market?: MarketState;
  acquisitions?: { offers: Record<Id, AcquisitionOffer> };
  questionable?: { offers: Record<Id, QuestionableOffer>; running: Record<Id, RunningQuestionable> };
  chains?: { registered: Record<string, CorporateChain> };
  boosts?: ActiveBoost[];
  // Phase 2 (optional until v3; required from v3)
  modifiers?: Modifier[];
  servicesUsed?: Record<string, number>;           // serviceId|businessId → count, for `once` Services
  // Phase 3 (v3)
  loans?: Loan[];
  quests?: Record<string, { step: number; doneSteps: string[] }>;
  requests?: Record<Id, { id: Id; defId: string; businessId: Id; expiresTick: Tick }>;
  // PlayerState gains license, supplyDeal, fitOutBudget; PubRuntime gains seatsBuilt, tapsBuilt, vibeBase, open, pace, lostIncome
  // Phase 5 (optional, no version bump)
  summary?: { nextCardTick: Tick; base: { served: number; lost: number; gold: Gold } };
  // Human gains optional quirkId (Phase 5)
}

interface PlayerState {
  gold: Gold; reputation: number;            // integer 0..100
  corporateResources: Record<ResourceId, number>;
  availableBrands: BrandId[]; recipes: RecipeId[];
}
interface CompetitorState { id: Id; name: string; colorToken: string; nextEventTick?: Tick; }

interface Plot {
  id: Id; status: 'empty' | 'for_sale' | 'under_construction' | 'occupied';
  owner: OwnerId | null; businessId: Id | null; construction?: { defId: DefId; doneTick: Tick };
}

interface Business {
  id: Id; defId: DefId; owner: OwnerId; plotId: Id; name: string;
  storage: Record<ResourceId, Stock>;
  jobSlots: JobSlot[];
  brandId: BrandId | null;
  traits: { traitId: TraitId; hidden: boolean }[];
  sourcing: Record<ResourceId, SourcingPolicy>;          // Phase 1 default 'buy_external'
  autoReorder: Record<ResourceId, { enabled: boolean; threshold: number; failed: boolean }>;
  pub?: PubRuntime;
  production?: { ruleId: string; recipeId: RecipeId | null; progressTicks: number; running: boolean; missing: string[] }[];
  rental?: { feePerMinute: Gold; carry: number };
}
type SourcingPolicy = 'buy_external' | 'internal' | 'internal_first';

interface Stock { amount: number; lots: Lot[] }
interface Lot { qty: number; recipeId: RecipeId | null; arrivedTick: Tick; origin: LotOrigin }
type LotOrigin = 'start' | 'supplier' | 'market_depot' | 'brewery' | 'business' | 'reward';

interface JobSlot {
  slotId: string; jobId: JobId;
  filledBy: null
    | { kind: 'human'; humanId: Id }
    | { kind: 'headcount'; count: number; humanDefId: DefId };   // 1..maxHeadcountPerSlot (49.1, 49.2)
  headcountTasks?: (StaffTask | null)[];                         // one cursor per headcount unit
  headcountSalaryCarry?: number;
}
interface JobSlotRef { kind: 'business' | 'vehicle'; id: Id; slotId: string }

interface PubRuntime {
  drinkPrice: Gold;
  seats: (Id | null)[];                        // customer per seat
  orderQueue: { customerId: Id; placedTick: Tick; poured: boolean }[];
  bar: { customerId: Id; lot: Omit<Lot, 'qty'> }[];  // poured, undelivered drinks
  arrivalAcc: number;
}

interface Human {
  id: Id; defId: DefId; name: string; owner: OwnerId; qualifications: string[];
  assignment: JobSlotRef | null;
  status: 'unassigned' | 'en_route' | 'working' | 'occupied';
  location:
    | { kind: 'at'; x: number; z: number; insideBusinessId: Id | null }
    | { kind: 'walking'; path: PathCursor; targetX: number; targetZ: number }
    | { kind: 'onVehicle'; vehicleId: Id };
  task: StaffTask | null;
  salaryCarry: number;
}
type StaffTask =
  | { kind: 'pour'; customerId: Id; doneTick: Tick }
  | { kind: 'carry'; customerId: Id; doneTick: Tick }
  | { kind: 'produce'; doneTick: Tick }
  | { kind: 'questionable'; runId: Id };

interface Customer {
  id: Id; pubId: Id; seat: number | null;
  state: 'entering' | 'waiting' | 'drinking' | 'paying' | 'leaving';
  stateUntil: Tick; drinksConsumed: number; servedAny: boolean;
  currentLot: Omit<Lot, 'qty'> | null;           // recipe of the drink being consumed
  // Phase 3 (v3): tab and walkout fields (Req 57)
  typeId?: string;
  tab?: { amount: Gold; lines: number };
  waitedLong?: boolean;
  payDeadlineTick?: Tick | null;
}

interface Vehicle {
  id: Id; defId: DefId; owner: OwnerId; name: string;
  cargo: Record<ResourceId, Stock>;
  jobSlots: JobSlot[];                            // Driver slot
  driverOnBoard: boolean;
  control: 'auto' | 'manual' | 'parked';
  routeId: Id | null; routeSuspended: boolean;
  pose: { x: number; z: number; heading: number; speed: number };
  path: PathCursor | null;
  stopIndex: number;
  phase: 'driving' | 'loading' | 'unloading' | 'waiting' | 'idle';
  phaseUntil: Tick; retriedLoad: boolean;
}
interface PathCursor { nodes: NodeId[]; seg: number; along: number }

interface Route {
  id: Id; vehicleId: Id; owner: OwnerId;
  stops: { businessId: Id; action: 'pickup' | 'dropoff'; resources: ResourceId[] | 'all' }[];
  waitSeconds: number;
}

interface Order {
  id: Id; owner: OwnerId; sourceId: Id;            // Supplier or Market_Depot
  destinationId: Id | null;                         // null for Market purchases held for any pickup
  resourceId: ResourceId; remaining: number; placedTick: Tick;
}

interface CeoState { x: number; z: number; heading: number; insideBusinessId: Id | null; drivingVehicleId: Id | null }

interface ScheduledEvent {
  seq: number; fireTick: Tick;
  kind: 'constructionDone' | 'revealAttribute' | 'consequence' | 'questionableDone'   // Phase 1/6
      | 'spawnRequest' | 'requestDeadline' | 'applyEffects';                         // Phase 3 (scheduledKindSchema)
  payload: Record<string, string | number>;      // applyEffects: { sourceKind, sourceId, effectIndex }
}

interface RingBuffer { size: number; head: number; headSecond: number; values: number[]; sum: number }
interface MetricsState {
  pubs: Record<Id, { arrivals: RingBuffer; lost: Record<'no_seat' | 'out_of_beer' | 'patience_expired', RingBuffer>;
                      waitSum: RingBuffer; waitCount: RingBuffer; staff: RingBuffer }>;
  vehicles: Record<Id, { deliveries: RingBuffer; delivered: Record<ResourceId, RingBuffer>; picked: Record<ResourceId, RingBuffer> }>;
  businesses: Record<Id, { consumed: Record<ResourceId, RingBuffer>; produced: Record<ResourceId, RingBuffer>; inputCost: RingBuffer }>;
  routesBottleneck: Record<Id, boolean>;
}
interface FinanceState {
  buckets: { second: number; byKey: Record<string, Gold> }[];   // v1–v3: key = `${category}|${sourceId}`; last 300 seconds
  // v4 (Phase 4, Req 70) replaces it with: minutes: { minute: number; byKey: Record<string, Gold> }[]  // 60 entries, key = `${category}|${businessId}`
}
type FinanceCategory = 'sales' | 'tip' | 'salary' | 'hiring' | 'severance' | 'purchase' | 'rental'
  | 'construction' | 'acquisition' | 'liability' | 'fine' | 'market_sale' | 'other'
  | 'loan' | 'contract' | 'license' | 'service';                 // Phase 3 additions
interface NewsItem { tick: Tick; textKey: string; params: Record<string, string | number> }
```

### Domain events (Tick output, not saved)

```ts
type DomainEvent =
  | { type: 'customerArrived' | 'customerLost'; pubId: Id; owner: OwnerId; reason?: LostReason }
  | { type: 'drinkPoured' | 'drinkServed' | 'customerPaid'; pubId: Id; amount?: Gold }
  | { type: 'storageFull' | 'storageEmpty'; businessId: Id; owner: OwnerId; resourceId: ResourceId }
  | { type: 'vehicleLoaded' | 'vehicleUnloaded'; vehicleId: Id; businessId: Id; resourceId: ResourceId; qty: number }
  | { type: 'manualTip'; vehicleId: Id; amount: Gold }
  | { type: 'humanHired' | 'humanFired' | 'humanArrived'; humanId: Id }
  | { type: 'revealFired'; triggerId: DefId; reveals: string[] }
  | { type: 'uiManagementViewOpened' }
  | { type: 'news'; item: NewsItem }
  | { type: 'achievementAwarded'; achievementId: DefId }
  | { type: 'chainRegistered'; length: number; routeIds: Id[] }
  // Phases 2 to 5 additions
  | { type: 'serviceUsed'; businessId: Id; serviceId: string }
  | { type: 'walkout'; pubId: Id; amount: Gold }
  | { type: 'tabPaid'; pubId: Id; amount: Gold }
  | { type: 'loanStarted' | 'loanRepaid'; loanId: Id }
  | { type: 'questStepDone'; questId: string; stepId: string }
  | { type: 'requestSpawned' | 'requestExpired'; requestId: Id }
  | { type: 'summaryDue'; served: number; lost: number; gold: Gold; employeeOfTheMonth: Id | null };
```

### Save_Document and server records

```ts
// packages/shared
interface SaveDocument { schemaVersion: number; revision: number; syncedRevision: number;
  timestamp: string; profileId: string; slotId: string; state: unknown /* SimState of that version */ }

interface ProfileRecord { id: string; displayName: string;            // 1..20 chars, unique case-insensitive
  pin: { salt: string; iterations: number; hash: string } | null; createdAt: string }
interface SlotRecord { slotId: string; name: string;                  // 1..30 chars
  revision: number; schemaVersion: number; updatedAt: string; deleted: boolean }

// Local_Store meta
interface LocalMeta { fallbackWarned: boolean; pinLockouts: Record<string, number[]>; // failure timestamps
  lastWritten: Record<string, { tick: Tick; revision: number }> }
interface SyncQueueEntry { kind: 'deleteSlot'; profileId: string; slotId: string; queuedAt: string }
```

### Start state data (excerpt, running-pub dev start)

From Phase 3 the default start is the Grand Opening start in `start-state.json` (no Humans, closed pub, no Loan, offices present, checklist reveals unfired). The excerpt below is the dev start of 3.1a, kept as `start-state.dev.json` and chosen by `newGame(reg, seed, { start: 'grand_opening' | 'dev' })`. Both starts use the same `createBusiness` path.

```json
{
  "gold": 50000,
  "playerPub": { "plotId": "plot_home", "defId": "pub_cosy_local", "beerStockPct": 50 },
  "humans": [
    { "name": "Jan",    "job": { "business": "playerPub", "jobId": "bartender" } },
    { "name": "Julia",  "job": { "business": "playerPub", "jobId": "server" } },
    { "name": "Thomas", "job": { "vehicle": "playerVan",  "jobId": "driver" }, "onBoard": true }
  ],
  "playerVan": { "defId": "delivery_van", "route": [
    { "stop": "supplier", "action": "pickup" }, { "stop": "playerPub", "action": "dropoff" } ] },
  "initialOrderPctOfCapacity": 25,
  "supplier": { "plotId": "plot_supplier", "defId": "supplier_beer" },
  "competitor": { "id": "cmp_rival", "pub": { "plotId": "plot_rival", "defId": "pub_sports" },
                  "humans": [ { "job": "bartender" }, { "job": "server" }, { "job": "driver" } ],
                  "vehicle": { "defId": "delivery_van" } },
  "reputation": 50,
  "districts": { "old_town": { "unlocked": true }, "harbour": { "unlocked": false } }
}
```

`newGame` creates entities in a fixed order (plots, Supplier, Player Pub, Competitor Pub, Vehicles, Humans, Routes, Orders), so ids and RNG consumption are identical for equal seeds. The van's first Tick starts Automatic_Delivery because Thomas is on board with a non-suspended Route (3.7).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Unless stated otherwise, "any run" means: a generated valid Definition_Registry (base content plus generated extra Resources, Business Definitions and production rules), a random seed, a start state from `newGame`, and a generated sequence of Commands (mixing valid and invalid ones) scheduled at random Ticks, advanced for a generated number of Ticks.

### Property 1: Determinism

*For any* state, seed and Command schedule, two Simulation instances started from deep-equal states and fed the same Commands at the same Ticks produce deep-equal states, results and events after every Tick.

**Validates: Requirements 2.5, 2.6, 2.7, 37.5**

### Property 2: Storage and cargo capacity invariant

*For any* run, after every Tick every Stock amount is a non-negative integer equal to the sum of its lots, no Tick increases a Business Stock above its capacity, any Stock that starts the Tick above capacity does not increase, and every Vehicle's total cargo is at most its Vehicle Definition capacity.

**Validates: Requirements 2.10, 9.3, 9.5, 11.2, 34.2, 37.4**

### Property 3: Resource conservation

*For any* run and every Resource, the change in world quantity over a Tick (Business Storage + Vehicle cargo + open Orders and Market reservations) equals the sum of that Tick's ledger entries for explicit creators and removers (Order placement, Market trade, production, Customer consumption, Questionable_Opportunity reward). Ownership changes, loading, unloading, collisions and resets contribute zero, and a destination's Storage increases only through unload, production or reward.

**Validates: Requirements 2.11, 1.8, 4.6, 10.6, 11.1, 13.5, 30.4, 46.1**

### Property 4: Owner symmetry

*For any* run, replaying it with a Pub's Owner swapped between the Player and a Competitor (with Player Gold made sufficient for all discretionary Commands in both runs) yields identical Storage, Customer, staff and Vehicle evolution for that Pub and its Routes; only Gold tracking differs.

**Validates: Requirements 1.9, 17.1**

### Property 5: Invalid Commands are rejected without effect

*For any* state and any Command that violates its preconditions (non-positive or non-integer quantity, drink price ≤ 0 or outside the Pub bounds, reorder threshold not an integer in [0, capacity], Route with fewer than two distinct stops or a Competitor stop, assignment to a Competitor slot, firing an occupied Human, unknown ids), stepping with the Command produces the same state as stepping without it, and the result carries the matching Reason_Code. *For any* valid drink price within the bounds, the price Command is accepted and all subsequent payments use it.

**Validates: Requirements 2.8, 6.8, 6.9, 7.13, 7.14, 10.4, 10.11, 12.1, 12.2, 12.3**

### Property 6: Insufficient Gold rejection reports the exact shortfall

*For any* state and any Discretionary_Expense Command whose cost exceeds the Player's Gold, the Command is rejected with `insufficient_gold`, `missingGold = cost − gold`, and no state change; *for any* such Command whose cost is covered, Gold decreases by exactly the cost.

**Validates: Requirements 7.1, 7.2, 8.4, 10.3, 10.5, 32.5**

### Property 7: Gold ledger consistency

*For any* run, every Gold value in state is an integer, and the Player's Gold change over any window equals the sum of finance entries recorded in that window across all categories and Businesses; the Finance Panel totals per category equal the model sum of the last 5 one-minute buckets (from schema v4; before v4, the last 300 game seconds).

**Validates: Requirements 8.1, 8.2, 8.3**

### Property 8: Exact per-minute Mandatory_Expenses

*For any* salary or rental fee per Game_Minute and any starting carry, the amounts deducted over any 600 consecutive Ticks sum to exactly the per-minute amount, and the deduction is applied every Tick regardless of the Gold balance (including negative balances) and of whether the Human is assigned.

**Validates: Requirements 7.3, 8.5, 28.4**

### Property 9: Price monotonicity of arrivals

*For any* valid Pub Definition, Reputation and modifiers, and any drink prices p1 < p2 within bounds, the computed arrival rate at p2 is less than or equal to the rate at p1.

**Validates: Requirements 4.2**

### Property 10: Customer lifecycle and accounting

*For any* run, every Customer's state sequence follows the allowed transition graph (arrive → lost_no_seat, or enter → wait → (drink → wait)* → pay → leave), drinks consumed never exceed `maxDrinksPerVisit`, and per Pub the arrivals equal seated Customers plus Lost_Customers with reason no_seat.

**Validates: Requirements 4.3, 4.4, 4.5, 4.10**

### Property 11: Payment equals price times drinks

*For any* run, each Customer payment credits the Owner's Gold (Player only) by the Pub's drink price at the payment Tick multiplied by that Customer's drinks consumed, including payments after patience expiry.

**Validates: Requirements 4.7, 4.8**

### Property 12: Unstaffed work produces nothing

*For any* Pub state with no working Bartender (Phase 1–2) or no working Bar_Worker (after the Phase 3 migration), no Tick emits a pour for that Pub; *for any* Pub state with no working Server (Phase 1–2) or no working Bar_Worker (after Phase 3), no Tick emits a served drink for that Pub; and Humans with status `en_route` never hold a work task.

**Validates: Requirements 5.4, 5.5, 7.5**

### Property 13: Rolling-window metrics match a naive model

*For any* run, each Pub's arrivals per Game_Minute, working service Humans, average wait and Lost_Customer percentage equal a naive recomputation from the event log over the trailing 60 game seconds, with Lost_Customer percentage 0 when there were no arrivals; Vehicle deliveries and Route bottleneck flags equal the naive recomputation over the trailing 300 game seconds with the 10% margin.

**Validates: Requirements 6.1, 6.2, 11.6, 11.7, 11.8, 11.9**

### Property 14: Job_Slot assignment invariant

*For any* run, every Job_Slot holds at most one Human, every Human references at most one Job_Slot, the links are bidirectional, assigning to an occupied slot leaves the previous occupant unassigned, and any regular-qualified Human can be assigned to any Phase 1/Phase 2 Job.

**Validates: Requirements 7.4, 7.7, 7.8, 7.10**

### Property 15: Human_Name uniqueness and drawing

*For any* Name_Pool and any sequence of hires and acquisitions, every Human has a non-empty Human_Name, all Workforce names are unique, a drawn base name is an unused pool entry whenever one exists, and a colliding name receives the lowest numeric suffix k ≥ 2 that makes it unique.

**Validates: Requirements 7.17, 7.19, 7.20, 7.21, 7.22, 32.4**

### Property 16: Auto-reorder never overfills

*For any* run with automatic reordering enabled, after every automatic Order the Pub's amount plus Pending_Quantity is at most its capacity, the Order quantity equals `min(capacity − amount − pending, floor(gold / unitPrice))`, and no Order is placed when that quantity is zero.

**Validates: Requirements 10.8, 10.9, 10.10, 10.12**

### Property 17: Load and unload amounts

*For any* Vehicle, stop and Storage state, an automatic or manual load moves exactly `min(available reserved or owned stock, free cargo capacity[, next drop-off free capacity for automatic])`, and an unload moves exactly `min(cargo accepted by the Business, free capacity)` while the remainder stays on the Vehicle.

**Validates: Requirements 9.4, 12.6, 12.8, 13.7, 13.8**

### Property 18: Manual tip only for qualifying cargo

*For any* manual unload, the tip equals `floor(tipFactor × qualifyingQty × supplierUnitPrice)` where qualifying units are those whose most recent load origin is the Supplier, the Market_Depot or a Brewery; unloads of other units yield no tip.

**Validates: Requirements 13.9**

### Property 19: Vehicle movement rules

*For any* run, a Vehicle that requires a driver, has no Driver on board and is not under Manual_Driving keeps its position; an automatic Vehicle covering a road path of length L at speed v needs `ceil(L / (v × tickSeconds))` Ticks; and after resuming a suspended Route the next stop is the one with minimal road distance from the Vehicle's nearest road point.

**Validates: Requirements 11.4, 11.5, 13.12**

### Property 20: Manual speed cap

*For any* Vehicle Definition and any velocity, the clamped manual velocity magnitude is at most `handling.manualTopSpeed` and velocities below the cap are unchanged.

**Validates: Requirements 13.4**

### Property 21: Alerts match their conditions

*For any* run, after every Tick each Alert type except `lost_customers` is active on an object if and only if its condition holds for that object (out of Beer with open order, unstaffed Job, Storage full, Storage empty for consumed input, awaiting pickup without Route, reorder failed, no Route, no internal supply); `lost_customers` is active iff (it was active and lost% > 10) or (lost% > 10 and arrivals ≥ 10); and no object has two Alerts of the same type.

**Validates: Requirements 4.11, 4.12, 5.6, 6.5, 6.6, 9.8, 9.9, 10.7, 12.5, 18.10, 31.3**

### Property 22: Context action selection

*For any* CEO position, mode and interactable layout, `contextActionFor` returns the action of the nearest interactable within Interaction_Range according to its kind, Owner and `office` marker (Enter for owned Businesses and `office` Businesses, Inspect for rival Businesses, Drive, Help Serve), returns Leave only on the interior door mat, returns Load/Unload only when driving, stopped below 0.5 World_Units/s and inside an Unloading_Zone (Unload iff the Business accepts part of the cargo), and returns null when nothing is in range.

**Validates: Requirements 13.2, 13.6, 14.2, 14.3, 14.5, 39.1**

### Property 23: View mode hysteresis and camera clamp

*For any* sequence of camera distances, `nextViewMode` switches to Management_View only when distance exceeds the threshold, switches back only when distance falls below threshold × (1 − hysteresis), and never changes mode for distances inside the hysteresis band; while Manual_Driving, the clamped distance never exceeds the Business band maximum.

**Validates: Requirements 15.3, 15.4, 15.7**

### Property 24: Tick scheduling bounds

*For any* accumulator value, frame delta and Game_Speed s ∈ {1, 2, 4}, `ticksToRun` returns at most 10 × s Ticks, discards the backlog beyond 10 × s so the remaining accumulator is below one Tick length, and *for any* sequence of pause and resume intervals and speed changes the number of Ticks executed equals the sum of active (unpaused) real time × speed divided by the Tick length, up to the per-frame cap and remainder; while Manual_Driving the effective speed is 1.

**Validates: Requirements 2.2, 2.3, 21.3, 47.9, 47.10, 47.11**

### Property 25: Save round-trip

*For any* valid Simulation state reached by a run (including RNG state, scheduler, fired Reveal_Triggers, Achievements, Phase 2 sections), serialising to a Save_Document and deserialising yields a state deep-equal to the original and the envelope fields are preserved.

**Validates: Requirements 24.1, 24.2, 24.3, 19.3, 40.3**

### Property 26: Round-trip continuation equivalence

*For any* valid state and Command schedule, advancing N Ticks from the original and from its serialised-then-deserialised copy produces identical states.

**Validates: Requirements 24.4**

### Property 27: Migration validity

*For any* Save_Document fixture of a supported older schema version, and for generated documents of that version, the Migration_Pipeline applies each step in version order and the result passes current envelope and state validation.

**Validates: Requirements 24.5, 24.10**

### Property 28: Validation reports the first invalid field

*For any* valid Save_Document and any single field corrupted to an invalid value, loading is refused and the reported invalid field path equals the corrupted path.

**Validates: Requirements 24.9**

### Property 29: Local revision accounting

*For any* sequence of write requests (with Ticks advancing or not) and injected write failures, the stored Revision increases by exactly 1 per successful write whose Tick differs from the last successful write's Tick, and is unchanged for skipped and failed writes.

**Validates: Requirements 23.3, 23.4**

### Property 30: Server revision check

*For any* stored server Revision and upload with base revision b, the Save_API accepts the upload iff b equals the stored Revision (0 when absent) and the document Revision is greater than b, and on acceptance the stored Revision equals the document Revision.

**Validates: Requirements 25.2, 25.3**

### Property 31: Load decision table

*For any* local (Revision, Synced_Revision) with Revision ≥ Synced_Revision and any server Revision, `decideLoad` returns useServer iff local is clean and server is higher, useLocal iff local is clean and server is not higher, useLocalAndUpload iff local is dirty and server equals Synced_Revision, and conflict otherwise.

**Validates: Requirements 25.7, 25.8, 25.9**

### Property 32: Multi-device sync never silently loses progress

*For any* interleaving of two devices performing local writes, uploads, loads and conflict resolutions against a model Save_API, no device ever silently replaces a document containing revisions it has not seen; every such case surfaces as a Sync_Conflict.

**Validates: Requirements 25.1, 25.4, 25.6, 25.9**

### Property 33: Profile and slot name and PIN validation

*For any* string and existing Profile set, a display name is accepted iff its length is 1–20 and it is unique ignoring case; a PIN is accepted iff it is empty or 4–6 ASCII digits; a slot name is accepted iff its length is 1–30; rejections name the invalid field.

**Validates: Requirements 22.1, 22.3, 22.9**

### Property 34: PIN hash verification parity

*For any* PIN and salt, the browser (WebCrypto) and server (`node:crypto`) PBKDF2 implementations produce the same hash, and verification succeeds iff the entered PIN equals the original.

**Validates: Requirements 22.7, 26.2, 26.3**

### Property 35: PIN lockout

*For any* timestamped sequence of PIN attempts, the lockout function rejects attempts during the 5 minutes following the 5th failure within any 5-minute window, reports the remaining lockout time, and accepts attempts otherwise; the same function governs server and offline-device lockout.

**Validates: Requirements 26.4, 26.5, 26.6**

### Property 36: Reveal_Triggers and Achievements fire once

*For any* run, the fired Reveal_Trigger list and awarded Achievement list never contain duplicates and only grow, and an id is added in the first Tick its condition holds.

**Validates: Requirements 19.1, 19.4, 19.5, 40.2**

### Property 37: Market price bounds

*For any* Market configuration with valid bounds and any number of updates, every buy price is greater than the sell price and both lie within [min, max] with min > 0; the trend history holds the last min(10, updates) prices.

**Validates: Requirements 30.2, 30.3, 30.6**

### Property 38: Bounded scores and chances

*For any* run, Reputation is an integer in [0, 100] and stays at its start value when only Phase 1 systems run, every effective repeat-order chance lies in [0, 0.9], and Competitor drink prices set by events lie within their Pub bounds.

**Validates: Requirements 34.5, 36.1, 36.2, 38.3**

### Property 39: FIFO pouring

*For any* sequence of Beer lots with distinct Recipes arriving at a Pub, the sequence of Recipes poured equals the arrival order of units.

**Validates: Requirements 34.3**

### Property 40: Production gating

*For any* Brewery state, production advances iff all Recipe inputs are present, the required Brewers are working and output capacity is free; when it advances, inputs decrease and outputs increase by the exact rule ratios; when it does not, the missing-requirements list names every unmet requirement.

**Validates: Requirements 29.1, 29.2, 9.3**

### Property 41: Sourcing shortfall sizing

*For any* Business with "internal first, buy shortfall", the automatic external Order equals `max(0, reorderQuantity − internalAvailable)` where internal availability counts Player-owned producer and Warehouse stock on Routes to that Business.

**Validates: Requirements 31.2**

### Property 42: Corporate_Chain detection matches a naive model

*For any* generated flow history over Player-owned Businesses and Vehicles, the registered active chains and their lengths equal a naive path search over flows in the trailing 300 game seconds (length ≥ 3), and chains with no flow in the window are inactive.

**Validates: Requirements 35.1, 35.2**

### Property 43: Definition validation

*For any* valid generated registry, validation succeeds; *for any* single mutation that introduces an unknown Resource, Trait, Brand, Recipe, Job or model key reference, or sets Pub seats < 1, minimum price ≤ 0 or minimum > maximum, validation fails with an error naming the mutated Definition and field or identifier.

**Validates: Requirements 1.5, 1.6**

### Property 44: Adaptive render resolution stays in bounds

*For any* sequence of 10-second average FPS samples, the adaptive DPR controller keeps DPR within [0.75, 1] × device DPR, lowers it only when the average is below 30, and raises it only when the average is at least 36 at reduced resolution.

**Validates: Requirements 41.5, 41.6**

### Property 45: Gold display rounding

*For any* Gold amount in hundredths (including negative amounts), the HUD formatter shows the floor in whole Gold.

**Validates: Requirements 8.8**

### Property 46: Headcount capacity equivalence

*For any* Pub or Vehicle state, replacing a Job_Slot's individual Human (already working at the Job location) by a Headcount_Fill of count 1 with the same Human Definition yields the same pours, served drinks, Vehicle movement and Salary charges per Tick; a Headcount_Fill of count N produces the same Job output as N such working Humans; and assigning a Human to a headcount-filled slot is rejected with `slot_occupied` without effect.

**Validates: Requirements 49.3, 49.4, 49.5, 49.6**

### Property 47: Gold safe-integer limit

*For any* state, the invariant checker reports `gold_limit_exceeded` with the field path iff some Gold field has absolute value above 2^50 hundredths, and reports nothing for states whose Gold fields are all within the limit.

**Validates: Requirements 8.1, 8.10**

### Property 48: Paths stay inside unlocked Districts

*For any* generated world of Districts and connectors and any unlocked set, every path from `pathCacheFor` traverses only nodes of unlocked Districts, equals a naive shortest path on the union graph, and no path exists to nodes of locked Districts; after an unlock the cache equals a fresh build for the new set; and Commands targeting Businesses in locked Districts are rejected with `district_locked`.

**Validates: Requirements 48.5, 48.6, 48.7**

### Properties of Phases 2 to 5

### Property 49: getStat equivalence with the earlier direct computation

*For any* Trait, Brand or Recipe present in the Phase 1 and Phase 6 content, any target and any Reputation, `getStat` returns exactly the value the earlier direct computation (`premiumPrice`, repeat chance, brand demand and price) returned, before any stored Modifier exists.

**Validates: Requirements 50.2, 50.6**

### Property 50: getStat confluence

*For any* set of stored and static Modifiers and any permutation of their order, `getStat` returns the same value, and the value equals `base + Σ addFlat + mulDivFloor(base, Σ addBp, 10000)` (with the ceiling variant for cost-like stats).

**Validates: Requirements 50.1, 50.2, 50.9**

### Property 51: Modifier expiry

*For any* run, after the `modifiers` system of a Tick no stored Modifier has `untilTick` at or before the current Tick, and the stat of an affected target equals its value computed without the expired Modifier.

**Validates: Requirements 50.5**

### Property 52: Unknown stat, condition, effect or domain op is rejected

*For any* valid generated registry and any single mutation that introduces a StatId outside the enumeration, a Condition or Effect kind outside the vocabulary, or an unknown `DomainOp`, registry validation fails with an error naming the Definition and the unknown entry.

**Validates: Requirements 50.3, 50.4, 52.3, 73.7**

### Property 53: Condition evaluation is pure

*For any* generated Condition and valid Simulation state, `evaluateCondition` returns a boolean without throwing, leaves the state deep-equal to its earlier copy, and does not change `state.rng`.

**Validates: Requirements 52.1, 52.5**

### Property 54: Condition print and parse round trip

*For any* valid Condition, parsing its canonical JSON print yields a Condition equivalent to the original, and printing the parsed Condition gives the same text.

**Validates: Requirements 52.7**

### Property 55: Effects keep Gold within bounds

*For any* valid list of Effects (including `range` amounts) and any state whose Gold fields are within the limit, after `applyEffects` every Gold field is within `GOLD_LIMIT`, every Gold change was applied through `applyGold`, and two runs with the same state and RNG produce the same result.

**Validates: Requirements 52.2, 52.4, 52.6, 79.2**

### Property 56: useService validation and atomic rejection

*For any* state and `useService` Command, the Command is rejected without any state change in this priority order: unknown entity, locked District, `presence` without the CEO present, the first failing Condition (with its own reason), `once` already used, insufficient Gold. When all checks pass, Gold decreases by exactly the cost and the Effects are applied once.

**Validates: Requirements 51.3, 51.4, 51.5, 51.6, 51.7, 51.8**

### Property 57: Replay reproduces the recorded hash

*For any* run recorded as a Command_Log from a start snapshot (including runs with manual driving poses), replaying the log headless to the same Tick yields a state deep-equal to the recorded one and the same `stateHash`.

**Validates: Requirements 53.1, 53.3, 53.4**

### Property 58: Command_Log compression round trip

*For any* Command_Log, expanding the compressed form (runs of identical per-Tick Commands stored with `repeat`) gives the original entry sequence, and the stored tail never exceeds the configured limit.

**Validates: Requirements 53.2**

### Property 59: State_Hash is canonical

*For any* two deep-equal Simulation states whose object keys were inserted in different orders, `stateHash` is equal. *For any* two states that differ in one value, the canonical JSON differs, and the hash differs for all generated cases.

**Validates: Requirements 53.7, 53.8**

### Property 60: Frontage layout validity

*For any* generated street, the derived slot rectangles do not overlap, lie within the road edge length and the District bounds, every derived Plot lies inside its District, and changing a slot's kind from `filler` to `business` changes neither its rectangle nor its model key. *For any* street with an overlapping or out-of-bounds slot, registry validation fails and names the District and the slot.

**Validates: Requirements 54.1, 54.6, 54.9, 54.11**

### Property 61: Layout distance drives throughput

*For any* two layouts that are equal except that the anchors of one are scaled farther apart, and otherwise identical state, the Bar_Worker average cycle time at the farther layout is greater than or equal to that at the nearer layout, and strictly greater when any walking step exists.

**Validates: Requirements 55.4, 55.6**

### Property 62: Capacity limits hold

*For any* run, occupied seats never exceed `seats`, simultaneous pours never exceed `taps`, `seats` never exceeds the License_Tier maximum, `taps` never exceeds the Pub maximum, and buying a Tap at the maximum is rejected with `limit_reached` without any change.

**Validates: Requirements 56.1, 56.3, 56.4, 56.5, 56.6, 64.5**

### Property 63: Tab conservation

*For any* run, every Customer's Tab equals the sum of the drink prices recorded at the serve Ticks, and when the Customer is gone the Tab has been either paid in full to the Owner's Gold or written off in full into `lostIncome`, never partly, with a zero Tab left.

**Validates: Requirements 57.1, 57.2, 57.5, 57.8, 4.7**

### Property 64: Walkouts need a reason

*For any* run, every Walkout occurs for a Customer who left with Vibe below the Walkout threshold or with `waitedLong` set, and no RNG value is drawn for a leaving Customer when neither condition holds.

A Customer whose pay wait times out without either condition pays the Tab automatically (57.9).
**Validates: Requirements 57.3, 57.4, 57.6, 57.9**

### Property 65: Container helpers preserve drinks

*For any* drink amount and container size, `fromContainers(toContainers(amount))` plus the remainder equals the amount; every capacity, cargo, load and Order stays in drinks; the per-drink price `pricePerKeg / kegDrinks` gives costs rounded up to whole hundredths; and migrating a crate-based save leaves the total number of drinks unchanged.

**Validates: Requirements 58.2, 58.4, 58.5**

### Property 66: Migration to v3 is valid and removes old jobs

*For any* Save_Document fixture of schema versions 1 and 2 and any generated v2 state, migrating to v3 passes validation, leaves no `bartender` or `server` Job_Slot or assignment, keeps every Human, keeps each Customer's drinks on a Tab, and the pre-migration copy is kept as the backup.

**Validates: Requirements 59.1, 59.2, 59.3, 59.4, 59.5**

### Property 67: Loan repayment conservation

*For any* Loan offer and any Gold balance (including negative balances), the sum of all repayment charges over the Loan's life equals `principal + interest` exactly, no charge makes `remaining` negative, and the Loan record is removed in the Tick `remaining` reaches 0.

**Validates: Requirements 63.3, 63.4, 63.5, 63.10**

### Property 68: Loan rules

*For any* state, taking a Loan while another has a remaining balance is rejected with `loan_active` without any change, a taken Loan adds exactly `principal` through `applyGold` with category `loan`, and an early payoff deducts exactly `remaining` and removes the Loan.

**Validates: Requirements 63.2, 63.6, 63.7**

### Property 69: Grand Opening gating

*For any* run that starts in the Grand Opening start, no Customer arrives while `pub_open` has not fired, the "Pub fit-out" step is done only after a Loan and a License_Tier exist, and "Back at the pub" is done only after every other step.

**Validates: Requirements 61.4, 61.5, 61.6**

### Property 70: Fit-out budget

*For any* fit-out picks, the Command is accepted iff the total price is within `fitOutBudget` and the tables fit the License_Tier maximum; when accepted `fitOutBudget` decreases by exactly the total price and Seats, Taps and Vibe base rise by the chosen items; otherwise nothing changes and the reason is `insufficient_gold` or `limit_reached`.

**Validates: Requirements 64.2, 64.3, 64.4, 64.5**

### Property 71: Gold bucket consistency

*For any* sequence of Gold changes over any number of Ticks, the per-Business sums of the `category|businessId` buckets add up to the total, `goldPerHour` equals the sum of the recorded changes of the last 60 game minutes (current partial minute included), the 5-minute finance summary equals the sum of the last 5 buckets, and the runway is defined iff `goldPerHour` is negative.

**Validates: Requirements 70.1, 70.2, 70.4, 70.5, 70.7, 8.3**

### Property 72: Quest steps advance once

*For any* run and Quest, each step is marked done at most once, its reward Effects are applied exactly once, steps with `requires` are never done before the steps they require, and a done step is never undone.

**Validates: Requirements 73.1, 73.2, 61.4**

### Property 73: Visible apps match fired triggers

*For any* set of fired Reveal_Triggers, `visibleApps` returns exactly the apps whose `revealFeature` has fired, sorted by `order`, and returns no app twice.

**Validates: Requirements 71.3, 71.4**

### Property 74: Summary card interval and winner

*For any* run, the Summary_Card is due exactly every configured number of game minutes regardless of Game_Speed, the Employee of the Month is a working Human with a name (never a Headcount_Fill), and the shown deltas equal the differences of the counters since the last card.

**Validates: Requirements 78.1, 78.2, 78.3**

### Property 75: Quirks respect Headcount_Fills

*For any* Job_Slot holding a Headcount_Fill, no Quirk, speech bubble or quirk Modifier applies to that slot, and *for any* Human with a Quirk that has a behaviour Modifier, `getStat` for that Human includes it.

**Validates: Requirements 76.4, 76.5**

## Error Handling

| Area | Failure | Handling |
|---|---|---|
| Definition_Registry | zod or referential errors | All errors collected; Definition error screen lists `definition`, `field`, `message`; starting and loading are blocked (1.7). Content tests in CI catch these before release. |
| Commands | Precondition violated | Rejected with Reason_Code, no mutation (2.8). The UI maps codes to text-table messages; `insufficient_gold` shows the missing amount. Physics-issued Commands that are rejected (e.g. Vehicle no longer manual) are logged in dev only. |
| Simulation invariants | Bug produces invalid state | Dev and test builds run `invariants/check.ts` after every Tick and throw with a state dump and Command log. Production builds run the check every 100 Ticks; on failure they pause with a `fatalError` reason, write a diagnostic copy to `backups`, and show a "something broke, your last autosave is safe" screen. Autosaves are not written from a state that failed the check. |
| Simulation invariants | Gold value above 2^50 hundredths | Dev/test: invariant failure with field path. Production: developer warning in the console and debug overlay; play continues (8.10). |
| Game loop | Long frame or tab throttling | Backlog above 10 × Game_Speed Ticks is discarded (2.3). Exceptions in a Tick stop the loop with `fatalError`. |
| Text | Text_Key missing from `en.json` | Prevented by `TextKey` typing and the key-coverage test; at runtime the key itself is shown and a dev warning logged (46.8). |
| Renderer | WebGL context lost | Pause Ticks, show a restoring overlay, rebuild on `webglcontextrestored`. |
| Renderer | Unknown model key or glTF load failure | Fall back to the placeholder primitive for that key and log once; registry validation already guarantees the key exists. |
| Physics_Layer | Rapier init failure | Manual_Driving disabled with a toast; Automatic_Delivery continues (13.16). |
| Physics_Layer | Vehicle flipped or out of bounds | Reset upright onto nearest road point with cargo intact (13.14, 13.15). |
| Local_Store | IndexedDB unavailable | Fallback to localStorage with one-time warning (23.5, 23.6). |
| Local_Store | Write failure or quota exceeded | Save-failure Alert; retry at next interval; never delete the previous good copy (23.7). |
| Load | Older schema | Back up, migrate, validate (24.5, 24.6). |
| Load | Migration step throws | Refuse, keep stored copy, show step name (24.7). |
| Load | Newer schema | Refuse, keep stored copy, ask to update (24.8). |
| Load | Validation failure | Refuse, keep stored copy, show first invalid field path (24.9). |
| Sync | Unreachable / timeout (8 s) | Status "not synced", retry every 60 s, play continues (25.10). |
| Sync | 409 conflict | Pause Ticks, conflict dialog (25.4). |
| Sync | 410 slot deleted | Offer keeping the local copy as a new Save_Slot (25.15). |
| Sync | 413 / 422 / 426 | Show the named limit, or "update the Game" for client-outdated (25.11, 25.13). |
| Sync | Local doc > 5 MB | Skip upload, keep local, "Too large to sync" Alert (25.12). |
| Save_API | Invalid body | 400 with `{error, field}` from zod issue path. |
| Save_API | Storage not writable | Health 503; write routes 503 `storage_unavailable`; client treats as unreachable. |
| Save_API | Crash during write | Atomic temp-file + rename means the previous file stays intact. |
| Profiles | Wrong PIN / lockout | 401 with attempts left; 423 with `retryAfterSec`; UI shows remaining time (26.4–26.6). |
| PWA | Update available | Prompt; save before activation (42.3, 42.4). |
| PWA | Service worker unsupported or insecure context | Game still runs online; installability and offline play unavailable; a notice explains that HTTPS via Tailscale is required. |

### Error handling for Phases 2 to 5

| Area | Failure | Handling |
|---|---|---|
| Services | Any failed check of `useService` | Rejected with the Reason_Code of the first failing check and no state change. The Desk shows the matching `reason.*` text. `not_present` shows "Drive there" and sets a Waypoint. |
| Effects | Unknown kind, StatId or DomainOp in data | Registry error at startup naming the Definition. At runtime an unknown `DomainOp` throws in dev and test builds, because the registry has already blocked it. |
| Replay | Final hash differs from the recorded one | The replay helper reports the first Tick where the per-Tick hash differs (when per-Tick hashes were recorded) and fails the test. The golden test never re-records by itself. |
| Command_Log | Log longer than the tail limit | The oldest entries are dropped and `baseTick` and `baseHash` move up to the new start. The log then only supports replay from the stored base snapshot. |
| Frontage | Overlap or out-of-bounds slot | Registry error naming the District and the slot. The game does not start. |
| Layout | Pub with fewer seat or tap anchors than its limits | Registry error naming the Definition and the layout key. |
| Loans | Gold goes negative from repayment | Allowed. Repayment is a Mandatory_Expense. The HUD debt warning and the Ledgr runway show it. |
| Migration v3 | A Customer or Human state cannot be mapped | The step throws with its name, the stored copy stays unchanged and the error names the step (24.7). |
| Quests | Quest references an unknown Condition, Effect or role tag | Registry error naming the Quest. |
| Phone | An app references a missing text key or reveal feature | Registry error naming the app. The Phone never renders a hard-coded app. |
| Summary card | No named working Human | The card is shown without an Employee of the Month line. |

## Testing Strategy

### Tooling

- **Vitest** (`vitest run`, non-watch) as the single test runner across `packages/sim`, `packages/shared`, `apps/server` and `apps/web` via a workspace config. `npm.cmd test` runs everything (44.1).
- **fast-check** for property-based tests. Global configuration `fc.configureGlobal({ numRuns: 100 })` as the minimum; heavier simulation properties use `numRuns: 100` with bounded run lengths (≤ 3 000 Ticks) to keep CI under a few minutes. Failing seeds and paths are printed and can be replayed with `{ seed, path }`.
- `packages/sim` tests run in the `node` environment with no DOM or WebGL (44.3). `apps/web` logic tests (loop, input mapping, adaptive DPR, decideLoad, persistence with `fake-indexeddb`) run in `node` or `happy-dom`; React components that need visuals are not unit-tested beyond smoke rendering.
- `apps/server` tests use Fastify `inject` against a temp data directory.
- Playwright smoke test (optional, later): load app, create Profile, start slot, open Pause_Menu, reload offline.

### Property tests

Each correctness property is implemented by exactly one property-based test, tagged with a comment in the format:

```ts
// Feature: human-resource-mvp, Property 3: Resource conservation
```

Shared arbitraries live in `packages/sim/test/arbitraries/`:

- `arbRegistry()`: base content plus generated extra Resources, Business Definitions with random storage capacities and production rules, random Name_Pools; always valid by construction. `arbInvalidRegistryMutation()` for Property 43.
- `arbCommand(state)`: state-aware generator producing valid Commands (existing ids) and invalid ones (bad quantities, wrong owners, unknown ids) with a configurable mix.
- `arbRun()`: `{ registry, seed, schedule: Array<{ tick, cmd }>, ticks }`; the harness runs it and records per-Tick snapshots, events and ledger.
- `arbSimState()`: states obtained by running `arbRun()`, plus direct structural generators for Phase 2 sections, used by round-trip properties.
- Model implementations for metrics (Property 13), chains (Property 42) and the Save_API revision store (Properties 30, 32).

`arbWorld()` generates District sets with connectors and random unlocked subsets for Property 48; headcount states for Property 46 are constructed directly because no Phase 1 Command creates them.

Requirement 44.2 coverage: determinism (Property 1), storage invariant (2), conservation (3), price monotonicity (9), no-overfill (16), save round-trip (25, 26), migration (27), Human_Name uniqueness (15), Market price bounds (37).

### Unit and example tests

Focused on concrete behaviour and edge cases not worth randomising:

- Start state (3.1, 3.3, 3.7): exact Humans Jan/Julia/Thomas, 50% stock, 25% Order, Reputation 50, van starts its Route on Tick 1.
- Customer edge cases: patience expiry with empty storage → `out_of_beer`; with stock → `patience_expired` (4.9).
- Driver fired mid-route stops the Vehicle with cargo and Route kept (7.12); takeover and resume flow (13.10–13.13).
- Zero-load wait-and-retry (12.7); over-capacity after a lowered capacity shows "Over capacity" (9.5).
- Upright monitor and out-of-bounds reset with fake timers (13.14, 13.15).
- Game loop pause/resume with fake `visibilitychange`, `pagehide`, Pause_Menu (21.1–21.8); autosave timing with fake timers (23.1, 23.2).
- Local_Store fallback and one-time warning (23.5, 23.6); migration backup and failure paths (24.6–24.8).
- Save_API: profile creation errors per field, health endpoint, size/schema/outdated/deleted responses, overwrite backup, PIN-removal CLI (22.2, 25.6, 25.11, 25.13, 25.15, 26.7, 43.4).
- Game_Speed: `availableSpeeds` locked until the reveal or Dev_Mode (`?dev=1`, dev build, Testing toggle), reset to 1x on load, speed keys ignored while locked, speed pause writes a save (47.3–47.10).
- Text keys (46.8, required): every `t('…')` key in `apps/web/src` and every text-key field in Definitions exists in `en.json`. Gold limit (8.10, required): Property 47 plus an example at exactly 2^50 (accepted) and 2^50 + 1 (reported).
- Districts: base content has one unlocked District and at most one locked neighbour; locked-District Context_Actions are null; camera pan bounds equal the unlocked union (48.4, 48.9, 48.10).
- Input keymap defaults (18.6); touch target min size via computed style (18.3); every registry model key has an asset mapping (16.4); UI uses `displayName()` for Human labels (lint rule `no-restricted-syntax` on `.name` access in `ui/` for Human types, plus a test, 46.7).
- Phase 6 examples: construction completion, Warehouse end-rental rejection, Liability cost on reveal, Competitor "open location" skipped without free Plot, Questionable_Opportunity insufficient Humans.

### Integration, smoke and performance

- Determinism replay test: a recorded Command log from a scripted session replays to an identical final state hash.
- Tick benchmark (`vitest bench`) for the Phase 6 reference scenario; CI fails above 1 ms average per Tick on desktop. Phone-level checks (41.1–41.4) are manual using the debug overlay and Chrome remote debugging; they cannot be fully automated.
- Docker smoke: build image, start compose with a temp volume, hit `/api/health`, upload and fetch a save, restart container, fetch again (25.16, 43.1–43.4).
- PWA: manifest fields and precache manifest content checked after `vite build` (42.1, 42.2); offline launch verified manually or with Playwright later.

### Why PBT fits this feature

The Simulation is a deterministic state machine over plain data with large input spaces (Command sequences, prices, capacities, name pools, graph positions), which is the case PBT is designed for. Rendering, physics feel, layout and deployment are not property-tested; they are covered by example, smoke, benchmark and manual device tests.

### Testing Phases 2 to 5

- Properties 49 to 75 follow the same rules as the earlier ones: one property-based test each, at least 100 runs, tagged `// Feature: human-resource-mvp, Property N: <title>`. Arbitraries are added to `packages/sim/test/arbitraries/`: `arbCondition`, `arbEffects`, `arbModifierSet`, `arbStreet`, `arbLayoutPair`, `arbLoanOffer`, `arbFitOutPicks`, `arbCommandLog`. Phase 3 runs use a `grandOpeningSim(seed)` helper (Grand Opening start with all offices) and a `devSim(seed)` helper (running pub). Properties 1, 2, 3 and 6 run on both starts.
- Golden playthrough (53.5): a recorded ten-minute log of the dev start is replayed in CI and its hash asserted. It runs in the normal test command and fails on any balance or RNG-order change until `golden:record` is run on purpose.
- Equivalence first: before any Phase 1 stat is rewritten to `getStat`, a test records the old direct values for generated Traits and Brands. Property 49 compares against those recorded values, so the refactor cannot silently change a number.
- Migration fixtures: v1 and v2 fixtures are generated from the code before each schema change and committed. The v3 test migrates both, validates, runs 300 Ticks and checks the invariants. A v2 save with a Customer mid-order and a Customer mid-carry is part of the fixtures (59.2).
- Example tests (not properties): the municipality ticket-queue gag (60.5), the Desk stamp gesture needing the full hold (72.5), the Phone showing "Drive there" for a `presence` setting (71.10), the Waypoint clearing near the target (73.6), unlock menu teaser versus description (67.3, 67.4), Grand Opening dev start skipping the checklist (61.8), and the street-life and thought-bubble visibility rules as smoke renders.
- Not property tested: Desk and Phone layout, sounds, screen shake, speech bubble timing, street-life effects, and model fitting. These use example, snapshot and manual device checks.
- Content tests: every Service, Quest, app, quirk, license, loan, fit-out, deal and candidate text key exists in `en.json`; every `targetBusinessRole` resolves to a Business Definition role tag; every Reveal_Trigger has a teaser and a description key.
