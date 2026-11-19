# Implementation Plan: Human Resource MVP

## Overview

The plan builds the TypeScript npm-workspaces monorepo in place at `C:\Users\David\OneDrive\Laptop Python\Human Resource` (existing git repo, branch `main`, remote `https://github.com/davidzonnenberg/HumanResource.git`). The project is not moved. Vite, Vitest and TypeScript caches go outside OneDrive. All PowerShell commands use `npm.cmd`.

The work is split into six phases, matching `requirements.md` and the "Phase plan and dependencies" section of `design.md`. Each phase heading below starts with a short "How to do this phase" block (goal, what comes first, which model, verify commands). Task numbers of finished work never change, so the numbers are not in phase order: Phase 1 is tasks 1 to 23 and 34, Phase 2 is 35 to 40, Phase 3 is 41 to 53, Phase 4 is 54 to 61, Phase 5 is 62 to 67 and Phase 6 is the former "Phase 2" economy block, tasks 24 to 33.

| Phase | Content | Depends on |
|---|---|---|
| 1 Playable core | Pub, van, CEO, saves, sync, PWA, deployment, driving polish | none |
| 2 Foundations | Modifiers and `getStat`, conditions and effects, Services, replay and State_Hash, Frontage_Slots | Phase 1 |
| 3 Grand Opening and bar redesign | `bar_worker`, Seats/Taps/Hands, tabs, kegs, offices, loans, fit-out, quests, save v3 | Phase 2 |
| 4 Phone UI | Gold per hour, HUD, Phone and apps, Desk, Waypoint, Info_Layers | Phase 3 |
| 5 Feel alive and satire | Bubbles, quirks, street life, summary card, satire services | Phases 2 to 4 |
| 6 Economy expansion | Second pub, warehouse, brewery, market, acquisitions, chains, reputation | all earlier phases |

Phase 1 order of work (built; chosen so Phase 1 became playable as early as possible):

1. Repository scaffold and tooling
2. Content schemas and Definition_Registry
3. Pure Simulation core (RNG, Gold, stock, Commands, pipeline)
4. Phase 1 systems: humans and names, customers and staff, Supplier and Orders, logistics, finance, metrics, alerts, reveals, CEO and interaction helpers
5. Web loop, renderer with placeholder primitives, camera/zoom/mode switch
6. Input, HUD and Panels
7. Manual driving with Rapier
8. **Phase 1 playable checkpoint** (test on phone and PC)
9. Local persistence, then PWA shell, Save_API and sync, then Docker/Tailscale deployment docs
10. Phases 2 to 6, one block per phase (see the phase headings)

Test sub-tasks use Vitest + fast-check. Each property test carries the tag comment `// Feature: human-resource-mvp, Property N: <title>`. Following the workflow convention, test sub-tasks are optional (`*`), with one exception: the property tests that Requirement 44.2 explicitly mandates (Properties 1, 2, 3, 9, 15, 16, 25, 26, 27, 37) are required tasks, because the project must contain them.

Two further required (non-`*`) test tasks come from the foundation decisions: the Text_Key coverage test (10.8, criterion 46.8) and the Gold safe-integer limit test (3.14, criterion 8.10).

Foundation decisions integrated as new sub-tasks without renumbering: Game_Speed 1x/2x/4x plus speed pause (10.5, 10.6, 12.4, 13.8), Districts (2.6, 3.12, 6.12, 11.9), Headcount_Fill model (3.11, 7.16), `t()` text lookup (2.7, 10.7, 10.8), Gold limit invariant (3.13, 3.14), CI and steering (1.7, 1.8), fixed camera (11.5, 12.4).

Model hand-off: tasks 1–11, 14, 16 and 20 are built first by the stronger model as the foundation. All later tasks follow the patterns established there, the rules in `.kiro/steering/architecture.md` and the CI workflow (`.github/workflows/ci.yml` must stay green).

No task commits or pushes. Commit/push appears only as a clearly labelled, user-triggered option inside checkpoints.

## Tasks

## Phase 1 - Playable core (tasks 1 to 23 and 34)

**How to do this phase**
- Goal: a pub you can watch, zoom out of, staff and drive a van for, with saves, sync, PWA and deployment. Almost everything is built; what remains is the Panels (13.3 to 13.5), the playable checkpoint (15), furniture collision (34.6), the driving feel check (34.8), removing the TEMP driving logs (34.7) and the final checkpoint (23).
- Order: 13.3 before 13.4 and 13.5; 34.8 (user feel check) before 34.7; 15 is a manual check on PC and phone; 23 closes the phase. The optional unchecked test sub-tasks in this block can be done at any time.
- Model: all open Phase 1 tasks suit a cheaper model that follows the existing Panel and handler patterns.
- Verify: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`.

- [x] 1. Set up repository scaffold and tooling (in place, OneDrive-aware)
  - [x] 1.1 Create the root npm workspace and hygiene files
    - Root `package.json` with workspaces `packages/*`, `apps/*`; root scripts `test` (`vitest run`), `typecheck` (`tsc -b`), `lint`, `build`, `dev`; cross-platform scripts only (no `rm -rf`, use `rimraf` or Node scripts)
    - `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), `.gitignore` (node_modules, dist, build, .vite, .vitest, coverage, playwright-report, test-results, `*.tsbuildinfo`, `.env*` except `.env.example`, `data/`, `*.local`), `.gitattributes` (`* text=auto eol=lf`), `.editorconfig`
    - Pin all dependency versions exactly; run `npm.cmd install` to produce `package-lock.json` (to be committed later by the user)
    - Keep the existing git repo, branch `main` and remote unchanged
    - _Requirements: 44.1, 45.1, 45.3, 45.4_
  - [x] 1.2 Create package skeletons and move caches outside OneDrive
    - Empty skeletons for `packages/content`, `packages/sim`, `packages/shared`, `apps/web`, `apps/server` with `package.json` and `tsconfig.json` project references
    - Shared helper resolving the cache base from `process.env.HR_CACHE_DIR ?? path.join(os.tmpdir(), 'human-resource')`; use it for Vite `cacheDir`, the Vitest cache dir and `tsBuildInfoFile`
    - `packages/sim/tsconfig.json` uses `"lib": ["ES2022"]` and `"types": []`
    - _Requirements: 2.4, 45.2_
  - [x] 1.3 Configure ESLint flat config with Simulation restrictions
    - `no-restricted-imports` for react, three, `@react-three/*`, `@dimforge/*`, idb, zustand, `node:*` in `packages/sim/**`
    - `no-restricted-globals` (window, document, navigator, fetch, performance, setTimeout, setInterval) and `no-restricted-properties` (`Math.random`, `Date.now`, `Math.pow/exp/log/sin/cos/tan/atan2/hypot`)
    - Dependency rule: `apps/server` must not import `packages/sim` or `apps/web`
    - _Requirements: 2.4, 2.6_
  - [x] 1.4 Configure Vitest workspace and fast-check
    - `vitest.workspace.ts` with projects sim (node env), shared (node), server (node), web (node/happy-dom)
    - Global fast-check setup `fc.configureGlobal({ numRuns: 100 })`, failing seed/path printed for replay
    - `npm.cmd test` runs everything once, non-watch
    - _Requirements: 44.1, 44.3_
  - [x] 1.5 Write `docs/onedrive.md` and the README skeleton
    - Explain that OneDrive cannot exclude subfolders by name for personal accounts and that junctions are followed
    - Document the in-place workflow used here: caches outside OneDrive via `HR_CACHE_DIR`/temp dir; pause OneDrive sync while running `npm.cmd ci`/`npm.cmd install`; single hoisted root `node_modules`
    - Document the optional outside-OneDrive working copy (for example `C:\dev\HumanResource`, GitHub as transfer) as an alternative, without moving the project
    - README: PowerShell usage `npm.cmd ci`, `npm.cmd run dev`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`
    - _Requirements: 45.2_
  - [x]* 1.6 Write headless Simulation import smoke test
    - Import the `packages/sim` entry under the node environment with no DOM shims
    - _Requirements: 2.4, 44.3_
  - [x] 1.7 Add the GitHub Actions CI workflow
    - `.github/workflows/ci.yml` on `push` and `pull_request`: `ubuntu-latest`, `actions/setup-node` with Node 24 and npm cache, then `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; pinned action versions, no secrets, no deploy step
    - The workflow file is created only; it runs when the user pushes (no push by the agent)
    - _Requirements: 44.1, 45.3_
  - [x] 1.8 Track the architecture steering file
    - `.kiro/steering/architecture.md` is written separately; this task confirms it exists and is consistent with the design (package dependency rules, Simulation purity, integer Gold, `slotCapacity`, `pathCacheFor`, Game_Speed only in the web loop, `t()` for all user-facing text, fixed camera, property-test tag convention) and links it from the README
    - _Requirements: 2.4, 46.6, 46.8_

- [x] 2. Implement content schemas and the Definition_Registry
  - [x] 2.1 Define zod schemas for all Definitions
    - `packages/sim/src/defs/schemas.ts`: ResourceDef, BusinessDef (all fields incl. PubParams, loadRate), VehicleDef (handling, `driverRequirement` nullable), JobDef, HumanDef (qualification set, salary, severance, hiring factor/minutes), TraitDef, RecipeDef, BrandDef, AchievementDef, RevealTriggerDef, Condition DSL, WorldDef/DistrictDef/PlotDef (detailed in 2.6), SimConfig, StartStateDef, text tables, Name_Pool, model keys
    - Demand and staffing as parameterised formula kinds (piecewise tables, throughput), never code strings
    - _Requirements: 1.2, 1.3, 1.4, 4.1, 6.3, 46.2, 46.4_
  - [x] 2.2 Author Phase 1 content data in `packages/content/data`
    - `resources.json` (Beer), `businesses.json` (`pub_cosy_local`, `pub_sports`, `supplier_beer`), `vehicles.json` (`delivery_van`), `jobs.json` (bartender, server, driver, brewer, warehouse_worker), `humans.json` (`["regular"]`), `models.json`, `reveal-triggers.json` (storage_responses, hiring_option, first_management_view, game_speed with a data-tuned condition that is false at game start)
    - `text/en.json` (funny Business names, Alert texts, news lines), `name-pool.json`, `start-state.json` (Jan Bartender, Julia Server, Thomas Driver on board, 50% Beer, 25% initial Order, start Gold, Reputation 50, Competitor with Humans and van)
    - Map content is authored as Districts in task 2.6 (the starting District holds the Player Pub, Supplier, Competitor Pub, ≥2 empty Plots, ≥1 Plot for sale, unloading zones, drivable/walkable bounds); `config/sim.json` (incl. `gameSpeeds`), `config/camera.json`, `config/theme.json`; typed `index.ts` re-export
    - `text/en.json` also holds every UI label, button, dialog and error string by Text_Key (English only)
    - _Requirements: 1.1, 3.1, 3.3, 7.18, 7.22, 16.1, 16.2, 17.1, 19.4, 19.5, 19.6, 20.1, 20.2, 46.8, 47.4_
  - [x] 2.3 Implement the registry loader and validator
    - `loadRegistry(raw)` returns `Result<DefinitionRegistry, DefinitionError[]>`; two passes collecting all errors: structural (zod per file) and referential/semantic (unknown Resource/Trait/Brand/Recipe/Job/model key; seats ≥ 1; min price > 0; min ≤ max; non-increasing price multipliers; map edges/access nodes exist)
    - Errors name the Definition and the field or unknown identifier
    - Precompute edge lengths (`Math.sqrt`); freeze the registry (all-pairs shortest paths are built per unlocked District set in task 6.12)
    - _Requirements: 1.1, 1.5, 1.6, 4.2, 46.1_
  - [ ]* 2.4 Write property test for Definition validation
    - **Property 43: Definition validation**
    - Build `arbRegistry()` and `arbInvalidRegistryMutation()` in `packages/sim/test/arbitraries/`
    - **Validates: Requirements 1.5, 1.6**
  - [x]* 2.5 Write unit tests for base content
    - Base content loads with zero errors; road graph is connected between all Plots of the starting District; exactly one unlocked District and at most one locked neighbour
    - _Requirements: 1.1, 16.1, 48.4_
  - [x] 2.6 Author District map data and extend the registry for Districts
    - `maps/world.json` (District list with file and data-only `unlockCondition`, District_Connectors) and `maps/districts/old_town.json` (starting District) plus optional `maps/districts/harbour.json` (locked neighbour, visible only); start-state `districts` section
    - zod `WorldDef`/`DistrictDef`; node ids namespaced `<district>:<node>`; connector edges; validation of unique District ids, connector references, Plots inside District bounds, start state with exactly one unlocked District holding the starting Businesses; errors name District and field
    - Registry keeps per-District geometry and edge lengths; shortest paths move to the path cache of task 6.12
    - _Requirements: 16.1, 48.1, 48.2, 48.4, 48.11_
  - [x] 2.7 Validate Text_Key references in the registry
    - Every `nameKey`, `descriptionKey`, Alert/news text key and Business-name table in Definitions must exist in `text/en.json`; unknown keys are Definition errors naming the Definition and key
    - _Requirements: 1.5, 20.2, 46.8_

- [x] 3. Implement the deterministic Simulation core
  - [x] 3.1 Implement the seeded RNG
    - `rng/xoshiro128ss.ts` with 4 × uint32 state stored in `state.rng`; `rngNext`, `rngInt`, `rngChance`, `rngPick`
    - _Requirements: 2.6_
  - [x] 3.2 Implement Gold money helpers
    - `money/gold.ts`: integer hundredths, `mulDivFloor`, `percentOf`, cost rounding up / rewards rounding down, `requireGold` (returns `insufficient_gold` + `missingGold`), `applyGold(state, owner, delta, category, source)` writing finance buckets; no-op for Competitor owners
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.9_
  - [x] 3.3 Implement stock and lots
    - `storage/stock.ts`: `freeCapacity`, `addToStock` (accepts `min(qty, free)`, returns remainder, accepts nothing when over capacity), `takeFromStock` FIFO by `arrivedTick` returning lots with recipe and origin
    - _Requirements: 2.10, 9.1, 9.4, 9.5, 34.2, 34.3_
  - [x] 3.4 Define SimState types, zod state schema and id allocation
    - `state/types.ts` and `state/schema.ts` per the design data model (Phase 2 sections optional); prefixed string ids from `state.idCounters`
    - _Requirements: 2.5, 24.1_
  - [x] 3.5 Implement Commands, the Simulation class and the Tick pipeline
    - `commands/types.ts` (all Phase 1 and Phase 2 Command shapes), `reasons.ts`, a handler table (as built: `commands/dispatch.ts` dispatching to handlers in `systems/*.ts` and `systems/phase2/*.ts`, not a `commands/handlers/` folder)
    - `Simulation.submit`/`tick`, `stepPure`, command queue drained at Tick start in submission order; handlers validate fully before mutating and return a Reason_Code on rejection
    - `core/pipeline.ts` with all 22 system slots in design order (Phase 2 slots as no-ops that return when their state section is absent); `clock` system; `TickContext` with events and resource ledger
    - _Requirements: 2.1, 2.4, 2.7, 2.8_
  - [x] 3.6 Implement `newGame`
    - Create entities in fixed order (plots, Supplier, Player Pub, Competitor Pub, Vehicles, Humans, Routes, Orders) from start-state data: Jan/Julia/Thomas, 50% Beer stock, van at the Pub with Supplier→Pub Route and Thomas on board, 25% Beer Order, Competitor Pub with Competitor Humans and van on fixed Route, Reputation 50, seed stored and RNG initialised
    - Business names drawn from text tables via RNG
    - _Requirements: 3.1, 3.2, 3.3, 3.7, 7.17, 7.18, 16.2, 17.1, 17.3_
  - [x] 3.7 Implement the invariant checker and resource ledger
    - `invariants/check.ts`: stock sums equal lots, no stock above capacity growth, cargo ≤ capacity, bidirectional Job_Slot links, ids exist, `resourceTotals` consistent with ledger
    - _Requirements: 2.10, 2.11_
  - [x] 3.8 Build the shared test harness and arbitraries
    - `arbCommand(state)` (valid and invalid mix), `arbRun()` (`{registry, seed, schedule, ticks}`), run harness recording per-Tick snapshots, events and ledger, `arbSimState()`
    - _Requirements: 44.2_
  - [x]* 3.9 Write unit tests for RNG, money and stock helpers
    - Rounding rules, `missingGold`, FIFO order, remainder on full storage
    - _Requirements: 2.6, 8.1, 8.4, 9.4_
  - [x]* 3.10 Write unit tests for the start state
    - Exact Humans and names, 50% stock, 25% Order, Reputation 50, seed stored
    - _Requirements: 3.1, 3.2, 3.3, 7.18_
  - [x] 3.11 Implement the Job_Slot fill model with Headcount_Fill
    - In `state/types.ts`/`schema.ts` (extends 3.4): `JobSlot.filledBy: null | {kind:'human', humanId} | {kind:'headcount', count, humanDefId}`, optional `headcountTasks` and `headcountSalaryCarry`; `JobDef.maxHeadcountPerSlot` (default 1); schema rejects counts outside 1..max naming the field
    - `staffing/capacity.ts` `slotCapacity(slot, state)`; invariant checker verifies bidirectional links for human fills only; no Phase 1 Command or content creates a headcount fill
    - _Requirements: 49.1, 49.2, 49.7_
  - [x] 3.12 Add District state to SimState and `newGame`
    - `state.districts: Record<DistrictId, {unlocked}>` in types and schema; `newGame` sets it from start-state data; included in saves
    - _Requirements: 48.3, 48.4_
  - [x] 3.13 Add the Gold safe-integer invariant
    - `GOLD_LIMIT = 2 ** 50` hundredths; `invariants/check.ts` scans all Gold fields and reports `gold_limit_exceeded` with the field path; dev/test throw, production logs a developer warning without `fatalError`
    - _Requirements: 8.1, 8.10_
  - [x] 3.14 Write property test for the Gold safe-integer limit
    - **Property 47: Gold safe-integer limit**
    - Required (criterion 8.10); include examples at exactly 2^50 (accepted) and 2^50 + 1 and −(2^50 + 1) (reported)
    - **Validates: Requirements 8.1, 8.10**

- [x] 4. Implement Humans, names and allocation
  - [x] 4.1 Implement name drawing and the display-name function
    - `names/drawName.ts` (`drawHumanName`: unused pool entries first, `uniqueInWorkforce` lowest suffix k ≥ 2) and `names/displayName.ts` (single label function)
    - _Requirements: 7.17, 7.19, 7.20, 7.21, 7.22, 46.7_
  - [x] 4.2 Write property test for Human_Name uniqueness and drawing
    - **Property 15: Human_Name uniqueness and drawing**
    - Required by Requirement 44.2
    - **Validates: Requirements 7.17, 7.19, 7.20, 7.21, 7.22, 32.4**
  - [x] 4.3 Implement hire, assign and fire handlers and the `humans` system
    - Hire: Hiring_Cost from Human Definition, unassigned Human at first Pub with drawn name
    - Assign: clear previous slot at the boundary, displace occupant, `en_route`, path from current (mid-path) position; `not_owner` for Competitor slots; qualification check
    - Fire: `human_occupied` rejection, Severance as Mandatory_Expense; firing/reassigning a driving Human stops the Vehicle with cargo and Route kept
    - `humans` system: walking along graph paths at Human walking speed, arrival → `working`, Driver boarding sets `driverOnBoard`; unassigned Humans stay idle
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15, 46.3_
  - [ ]* 4.4 Write property test for the Job_Slot assignment invariant
    - **Property 14: Job_Slot assignment invariant**
    - **Validates: Requirements 7.4, 7.7, 7.8, 7.10**

- [x] 5. Implement the Pub customer loop and visible staff work
  - [x] 5.1 Implement demand and the `customerArrivals` system
    - `defs/formulas.ts` demand = base × piecewise price × piecewise reputation × brand multiplier; arrival accumulator; seat reservation or Lost_Customer `no_seat`; patience expiry cancels order, pays for consumed drinks, lost reason `out_of_beer` (stock 0) or `patience_expired`
    - _Requirements: 4.1, 4.3, 4.8, 4.9, 4.10_
  - [x] 5.2 Write property test for price monotonicity
    - **Property 9: Price monotonicity of arrivals**
    - Required by Requirement 44.2
    - **Validates: Requirements 4.2**
  - [x] 5.3 Implement the `staff` system
    - Bartenders pour independently per bartending interval when an unpoured order exists and stock ≥ 1, taking one Beer FIFO (ledger `consumed`); Servers carry oldest poured drink at Job movement speed; no Bartender → no pours; no Server → drinks stay at the bar
    - _Requirements: 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 34.3_
  - [x] 5.4 Implement the `customerVisits` system
    - Seat → register order; drinking; reorder roll with clamped effective repeat chance (0–90%) below max drinks per visit; pay price at payment Tick × drinks consumed via `applyGold('sales')`; leave
    - _Requirements: 4.4, 4.5, 4.7, 34.5_
  - [x] 5.5 Implement the `setDrinkPrice` handler
    - Accept prices within [min, max]; reject ≤ 0 or out of bounds with `invalid_price`
    - _Requirements: 6.8, 6.9_
  - [ ]* 5.6 Write property test for the Customer lifecycle
    - **Property 10: Customer lifecycle and accounting**
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.10**
  - [ ]* 5.7 Write property test for payments
    - **Property 11: Payment equals price times drinks**
    - **Validates: Requirements 4.7, 4.8**
  - [ ]* 5.8 Write property test for unstaffed work
    - **Property 12: Unstaffed work produces nothing**
    - **Validates: Requirements 5.4, 5.5, 7.5**
  - [ ]* 5.9 Write property test for FIFO pouring
    - **Property 39: FIFO pouring**
    - **Validates: Requirements 34.3**
  - [x]* 5.10 Write unit tests for patience expiry reasons
    - Empty storage → `out_of_beer`; stock present → `patience_expired`; partial drinks paid
    - _Requirements: 4.8, 4.9_

- [x] 6. Implement Supplier Orders, logistics and manual-driving Commands
  - [x] 6.1 Implement Orders and Pending_Quantity
    - `placeOrder` handler: positive whole quantity (`invalid_quantity`), Player-owned destination, `requireGold`, reservation at the unlimited Supplier (ledger `order_placed`); `pendingQuantity(dest, res)`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [x] 6.2 Implement auto-reorder in the `sourcing` system
    - `setAutoReorder` handler (`invalid_threshold` unless whole number in [0, capacity]); `qty = min(cap − amount − pending, floor(gold / unitPrice))`; `reorder_failed` flag and retry every Tick; Competitors use the same code with unbounded affordability
    - _Requirements: 10.8, 10.9, 10.10, 10.11, 10.12, 8.9_
  - [x] 6.3 Write property test for auto-reorder no-overfill
    - **Property 16: Auto-reorder never overfills**
    - Required by Requirement 44.2
    - **Validates: Requirements 10.8, 10.9, 10.10, 10.12**
  - [x]* 6.4 Write property test for insufficient Gold rejection
    - **Property 6: Insufficient Gold rejection reports the exact shortfall**
    - Cover hire and placeOrder now; extend generators when Phase 2 discretionary Commands land
    - **Validates: Requirements 7.1, 7.2, 8.4, 10.3, 10.5, 32.5**
  - [x] 6.5 Implement road-graph helpers
    - `logistics/roadGraph.ts`, `paths.ts` (`pathProvider` over precomputed shortest paths, `PathCursor` advance), `nearestRoadPoint.ts` (projection onto every edge)
    - _Requirements: 11.5, 13.12, 46.5_
  - [x] 6.6 Implement the `logistics` system and `setRoute` handler
    - `setRoute` validation (`invalid_route` for < 2 distinct stops, `not_owner` for Competitor stops)
    - Stop cycle driving → load/unload (duration from load rate) → wait-and-retry once on zero load → next stop; load = min(available reserved/owned stock, free cargo, next drop-off free capacity); unload via `addToStock` with remainder kept; lots get origin set at pickup
    - No Driver on board and not manual → stationary; Driver and no Route → parked; travel time = road distance ÷ speed; routes continue in all modes; first Tick starts Thomas's Route
    - _Requirements: 3.7, 11.1, 11.2, 11.4, 11.5, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.10, 13.16_
  - [x] 6.7 Implement manual-driving Commands
    - `startManualDriving` (suspend Route, displaced Driver stays assigned, idle at takeover), `manualVehicleUpdate` (clamp to drivable bounds, store pose/speed), `manualLoad`/`manualUnload` (manual, stopped < 0.5, inside Unloading_Zone; `nothing_to_load`/`nothing_to_unload`), Manual_Delivery_Tip for qualifying lot origins, `endManualDriving`, `resumeRoute` (Driver walks to Vehicle, resume at nearest stop by road distance), `resetVehicle` (cargo untouched)
    - _Requirements: 2.9, 13.1, 13.5, 13.7, 13.8, 13.9, 13.10, 13.12, 13.13, 13.14, 13.15_
  - [ ]* 6.8 Write property test for load and unload amounts
    - **Property 17: Load and unload amounts**
    - **Validates: Requirements 9.4, 12.6, 12.8, 13.7, 13.8**
  - [ ]* 6.9 Write property test for the manual tip
    - **Property 18: Manual tip only for qualifying cargo**
    - **Validates: Requirements 13.9**
  - [ ]* 6.10 Write property test for Vehicle movement rules
    - **Property 19: Vehicle movement rules**
    - **Validates: Requirements 11.4, 11.5, 13.12**
  - [ ]* 6.11 Write unit tests for logistics edge cases
    - Driver fired mid-route stops the van with cargo and Route kept; zero-load wait-and-retry; takeover → decline resume keeps Route suspended; over-capacity accepts no inflow
    - _Requirements: 7.12, 9.5, 12.7, 13.10, 13.13_
  - [x] 6.12 Implement the District-aware path cache and locked-District rules
    - `logistics/pathCache.ts` `pathCacheFor(reg, unlocked)`: union of unlocked District sub-graphs plus connectors with both ends unlocked; all-pairs shortest paths, memoised by sorted unlocked-id key, held by the Simulation instance and rebuilt on load (never saved); `pathProvider` and `nearestRoadPoint` use it
    - `unlockDistrict` handler (issuer `system` only, no Player UI) recomputes the cache before `humans`/`logistics` run in that Tick
    - `assign`, `setRoute`, `placeOrder` targeting Businesses in locked Districts → `district_locked`; walkable/drivable bounds = union of unlocked Districts; `contextActionFor` ignores interactables in locked Districts
    - _Requirements: 46.5, 48.5, 48.6, 48.7, 48.8, 48.9_
  - [ ]* 6.13 Write property test for District path union
    - **Property 48: Paths stay inside unlocked Districts**
    - Add `arbWorld()` to the arbitraries
    - **Validates: Requirements 48.5, 48.6, 48.7**

- [x] 7. Implement finance, metrics, alerts, reveals, CEO and Competitor wiring
  - [x] 7.1 Implement the `finance` system
    - Salary per Tick with exact `salaryCarry` for every Workforce Human (assigned or not), applied regardless of balance; operations continue while Gold is negative; finance buckets for the last 300 game seconds
    - _Requirements: 7.3, 8.2, 8.3, 8.5, 8.7_
  - [ ]* 7.2 Write property test for per-minute Mandatory_Expenses
    - **Property 8: Exact per-minute Mandatory_Expenses**
    - **Validates: Requirements 7.3, 8.5, 28.4**
  - [ ]* 7.3 Write property test for Gold ledger consistency
    - **Property 7: Gold ledger consistency**
    - **Validates: Requirements 8.1, 8.2, 8.3**
  - [x] 7.4 Implement the `metrics` system
    - Ring buffers by game second: Pub 60 s (arrivals, lost by reason, wait sum/count, working service Humans), recommended staff via throughput formula, Vehicle/Route 300 s deliveries and flows, bottleneck flags with 10% margin, Competitor popularity band
    - _Requirements: 6.1, 6.2, 6.3, 11.6, 11.7, 11.8, 11.9, 17.4_
  - [ ]* 7.5 Write property test for rolling-window metrics
    - **Property 13: Rolling-window metrics match a naive model**
    - **Validates: Requirements 6.1, 6.2, 11.6, 11.7, 11.8, 11.9**
  - [x] 7.6 Implement the `alerts` system
    - Keyed `Record<type@object>` Alerts: out_of_beer, lost_customers (hysteresis, variant = most frequent reason), unstaffed:<Job>, storage_full, storage_empty, awaiting_pickup_no_route, reorder_failed, no_route; Player-owned objects only where specified
    - _Requirements: 4.11, 4.12, 5.6, 6.5, 6.6, 9.8, 9.9, 10.7, 10.10, 12.5, 18.10_
  - [ ]* 7.7 Write property test for Alerts
    - **Property 21: Alerts match their conditions**
    - **Validates: Requirements 4.11, 4.12, 5.6, 6.5, 6.6, 9.8, 9.9, 10.7, 12.5, 18.10, 31.3**
  - [x] 7.8 Implement the condition DSL and the `reveals` system
    - `conditions/evaluate.ts` (event, goldAtLeast, corporateResourceAtLeast, ownedBusinessCountAtLeast, all/any); `reveals` records first firing in `state.reveals.fired` and emits `revealFired`; `uiEvent` handler (`managementViewOpened`); `isRevealed` helper; no levels or XP
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_
  - [ ]* 7.9 Write property test for one-time reveals
    - **Property 36: Reveal_Triggers and Achievements fire once**
    - Cover Reveal_Triggers now; extended to Achievements in task 30.3
    - **Validates: Requirements 19.1, 19.4, 19.5, 40.2**
  - [x] 7.10 Implement CEO Commands and pure interaction helpers
    - `ceoMove` (walking speed, walkable bounds), `ceoEnter`/`ceoExit`; CEO stays idle in Management_View
    - `interaction/contextAction.ts` (`contextActionFor`: Enter, Inspect, Drive, Load/Unload, Exit; Help Serve reserved for Phase 2) and `interaction/viewMode.ts` (`nextViewMode` with 5% hysteresis, manual-driving distance clamp)
    - _Requirements: 13.1, 13.2, 13.6, 14.1, 14.2, 14.3, 14.5, 14.7, 15.3, 15.4, 15.6, 15.7_
  - [x]* 7.11 Write property test for context action selection
    - **Property 22: Context action selection**
    - **Validates: Requirements 13.2, 13.6, 14.2, 14.3, 14.5, 39.1**
  - [x]* 7.12 Write property test for view mode hysteresis
    - **Property 23: View mode hysteresis and camera clamp**
    - **Validates: Requirements 15.3, 15.4, 15.7**
  - [x] 7.13 Wire the passive Competitor through the shared rules
    - Verify the Competitor Pub, Humans and van run through the same systems with no Gold tracking; Competitor price, name and popularity band exposed via selectors
    - _Requirements: 1.9, 8.9, 17.1, 17.3, 17.4_
  - [ ]* 7.14 Write property test for owner symmetry
    - **Property 4: Owner symmetry**
    - **Validates: Requirements 1.9, 17.1**
  - [ ]* 7.15 Write property test for invalid Command rejection
    - **Property 5: Invalid Commands are rejected without effect**
    - **Validates: Requirements 2.8, 6.8, 6.9, 7.13, 7.14, 10.4, 10.11, 12.1, 12.2, 12.3**
  - [x] 7.16 Treat Headcount_Fill as working capacity in all systems
    - `staff` (one task cursor per headcount unit), `logistics` (Driver headcount = Driver on board), `finance` (`count × salaryPerMinute` with `headcountSalaryCarry`, category `salary`), `metrics` and `alerts` (sum `slotCapacity`), production requirements; `assign` to a headcount-filled slot → `slot_occupied`
    - All Job_Slot reads go through `slotCapacity`; no UI is added
    - _Requirements: 49.3, 49.4, 49.5, 49.6, 49.7_
  - [ ]* 7.17 Write property test for headcount capacity equivalence
    - **Property 46: Headcount capacity equivalence**
    - States with headcount fills are constructed directly (no Phase 1 Command creates them)
    - **Validates: Requirements 49.3, 49.4, 49.5, 49.6**

- [x] 8. Prove the core Simulation invariants
  - [x] 8.1 Write property test for determinism
    - **Property 1: Determinism**
    - Required by Requirement 44.2
    - **Validates: Requirements 2.5, 2.6, 2.7, 37.5**
  - [x] 8.2 Write property test for the storage and cargo invariant
    - **Property 2: Storage and cargo capacity invariant**
    - Required by Requirement 44.2
    - **Validates: Requirements 2.10, 9.3, 9.5, 11.2, 34.2, 37.4**
  - [x] 8.3 Write property test for resource conservation
    - **Property 3: Resource conservation**
    - Required by Requirement 44.2; `arbRegistry()` includes generated extra Resources to cover 1.8
    - **Validates: Requirements 2.11, 1.8, 4.6, 10.6, 11.1, 13.5, 30.4, 46.1**
  - [x]* 8.4 Write determinism replay integration test
    - Scripted Command log replays to an identical final state hash
    - _Requirements: 2.5_

- [x] 9. Checkpoint - Simulation core
  - Run `npm.cmd test`, `npm.cmd run typecheck` and `npm.cmd run lint`. Ensure all tests pass, ask the user if questions arise.

- [x] 10. Build the web app shell and game loop
  - [x] 10.1 Scaffold `apps/web`
    - Vite + React + React Three Fiber, `vite.config.ts` with `cacheDir` from the shared cache helper, `index.html`, `main.tsx`, `App.tsx`, routes
    - Load the registry at startup; Definition error screen lists every error and blocks starting/loading
    - Temporary dev "Quick start" route that calls `newGame` with a `crypto.getRandomValues` seed (replaced by the slot list in task 16.12)
    - _Requirements: 1.1, 1.7, 3.2_
  - [x] 10.2 Implement the GameLoop
    - `loop/GameLoop.ts` with pause reasons (hidden, pauseMenu, syncConflict, fatalError, loading), pure `ticksToRun` (max 10 per frame, backlog dropped), `last = null` while paused; `visibilitychange` handling (hidden stops before next Tick; visible resumes only if Pause_Menu closed); save hooks left as callbacks for task 16.10
    - Dev builds run the invariant checker every Tick; production every 100 Ticks with `fatalError` pause
    - _Requirements: 2.1, 2.2, 2.3, 21.1, 21.3, 21.4, 21.7_
  - [x]* 10.3 Write property test for Tick scheduling
    - **Property 24: Tick scheduling bounds**
    - Covers Game_Speed 1/2/4 (cap 10 × speed), speed changes, speed pause and the 1x clamp during Manual_Driving once task 10.5 lands
    - **Validates: Requirements 2.2, 2.3, 21.3, 47.9, 47.10, 47.11**
  - [x] 10.4 Implement the state bridge and stores
    - `simBridge` (Simulation instance, `useSimSelector` throttled to 5 Hz), `hudStore`, `uiStore`, `sessionStore` (incl. `gameSpeed`, `speedPaused`, `devMode`); prev/curr pose snapshots and `interpolation.ts`
    - _Requirements: 2.7, 18.9, 47.2_
  - [x] 10.5 Add Game_Speed to the GameLoop
    - `loop/gameSpeed.ts` pure helpers `availableSpeeds(revealed, devMode)`, `stepSpeed`, `effectiveSpeed(selected, manualDriving)`; loop uses `acc += dt × speed` and `ticksToRun(acc, dt, speed)` with cap `10 × speed`
    - `speedPause` pause reason (stops Ticks and physics, triggers the save hook, no Pause_Menu); resume only when no other reason remains; Game_Speed reset to 1x on new/loaded slot; 1x forced during Manual_Driving and restored after; speed never enters `SimState`
    - _Requirements: 2.2, 2.3, 21.3, 47.1, 47.2, 47.3, 47.4, 47.5, 47.9, 47.10, 47.11_
  - [x] 10.6 Implement Dev_Mode
    - `dev/devMode.ts`: on for `?dev=1`, `import.meta.env.DEV`, or the Pause_Menu "Testing" toggle (stored per device in Local_Store `meta.devTesting`; until task 16.9 exists, kept in memory); only affects `availableSpeeds` and the debug overlay; never submits Commands or fires reveals
    - _Requirements: 47.5, 47.6_
  - [x] 10.7 Implement the `t()` text lookup
    - `apps/web/src/text/t.ts`: `t(key: TextKey, params?)` over `packages/content/data/text/en.json`, `TextKey = keyof` the imported JSON, `{param}` interpolation, missing key at runtime renders the key and logs a dev warning; ESLint `react/jsx-no-literals` (allow-list punctuation/numbers) for `apps/web/src/ui/**` and `render/**`; Definition error screen and all later UI use `t()`
    - _Requirements: 20.2, 46.8_
  - [x] 10.8 Write the Text_Key coverage test
    - Required (criterion 46.8): scan `apps/web/src/**` for `t('…')` keys and all Definition text-key fields; assert each exists in `en.json`; fail with the file and key
    - _Requirements: 46.8_

- [x] 11. Build the renderer with placeholder primitives and the camera
  - [x] 11.1 Implement the theme and asset mapping
    - `assets/modelMap.ts` mapping every model key to a primitive (capsule Humans/Customers, box Businesses, box-with-wheels Vehicles, crate boxes) or a glTF entry; palette and Vehicle/crate scales from `theme.json`
    - _Requirements: 16.3, 16.4, 20.1_
  - [x]* 11.2 Write unit test for model key coverage
    - Every model key referenced in the registry has a mapping
    - _Requirements: 16.4_
  - [x] 11.3 Build the world scene
    - Merged ground/road/plot geometry, Business boxes with removable roof/front walls for interior view (`ceo.insideBusinessId`), Business names from text tables, Owner colours, Competitor rival branding
    - _Requirements: 3.6, 14.4, 15.1, 16.1, 16.2, 17.2_
  - [x] 11.4 Render animated figures, cargo and indicators
    - Instanced Humans, Customers and crates updated in `useFrame`; Customers and staff animate between layout anchors; cargo crates scale with cargo; full/empty storage indicators for Player-owned Businesses; Vehicles drive along roads with interpolation; Human name labels via `displayName()` in CEO_Mode at Person/Business bands (12 nearest)
    - _Requirements: 3.6, 4.13, 5.7, 7.24, 9.6, 9.7, 11.3, 12.9, 17.2_
  - [x] 11.5 Implement the Camera_Controller
    - Tilted perspective camera with one constant yaw and no rotation input at any band, bands from `camera.json`, smoothed continuous distance, `nextViewMode` switching, 0.4 s recentre on CEO, manual-driving clamp, new-slot start at Person band next to the Pub
    - _Requirements: 3.4, 15.1, 15.2, 15.3, 15.4, 15.5, 15.7, 15.12_
  - [x] 11.6 Implement Management_View overlays
    - Owner-coloured markers for Businesses, Vehicles and Plots, Route polylines, bottleneck colour, first-view 10 s highlight of Supplier/Competitor Pub/Plot for sale (dismiss on tap), Customer aggregation above 20 visible figures
    - _Requirements: 11.7, 15.8, 15.11, 19.6_
  - [x] 11.7 Implement adaptive render resolution
    - 10 s rolling FPS, lower DPR in 0.05 steps below 30 FPS to 0.75×, raise at ≥ 36 FPS up to 1×, 3 s cooldown; no post-processing, no shadow maps
    - _Requirements: 41.1, 41.2, 41.5, 41.6_
  - [x]* 11.8 Write property test for adaptive DPR
    - **Property 44: Adaptive render resolution stays in bounds**
    - **Validates: Requirements 41.5, 41.6**
  - [x] 11.9 Render Districts and District-aware camera bounds
    - Static geometry built per District; locked neighbour drawn desaturated with a marker at each District_Connector, not selectable; Management_View pan clamped to the unlocked-District union and City band max distance fitted to it, recomputed on unlock; no figures for Headcount_Fills
    - _Requirements: 15.8, 48.9, 48.10, 49.8_

- [x] 12. Implement the Input_System
  - [x] 12.1 Implement intents, keyboard bindings and gestures
    - `input/InputSystem.ts`, `keyboard.ts`, `gestures.ts`: WASD/arrows movement and panning, mouse click select, mouse drag pan, wheel and +/- zoom, E Context_Action, Tab cycle by screen distance, Enter select, Esc close Panel, P Pause_Menu; pinch zoom and one-finger drag pan on touch
    - _Requirements: 14.1, 14.6, 15.2, 15.9, 18.5, 18.6_
  - [x] 12.2 Implement the joystick and Context_Action button
    - Floating left-thumb joystick (left 40%), right-side Context_Action button (≥ 72 px, min 44 px) showing `contextActionFor` result or hidden; one `ceoMove` per Tick; tap outside joystick selects objects
    - _Requirements: 14.1, 14.2, 14.3, 14.6, 18.3, 18.4_
  - [x]* 12.3 Write unit tests for input mapping
    - Default keymap, joystick vector normalisation, Tab ordering
    - _Requirements: 18.6, 14.1_
  - [x] 12.4 Add Game_Speed keys and fixed screen-aligned axes
    - Keys `1`/`2`/`3` → 1x/2x/4x, `]`/`[` → faster/slower, `0` → speed pause, ignored while `availableSpeeds` is `[1]`
    - Joystick and WASD/arrow vectors mapped to the two constant screen-aligned ground axes derived once from the fixed camera yaw; no rotation gesture or key
    - _Requirements: 15.12, 18.6, 47.8_

- [ ] 13. Build the HUD and Panels
  - [x] 13.1 Implement the HUD
    - Gold floored to whole Gold, debt warning when negative, Alert stack merged with client Alerts (one per type per object, tap selects object, out_of_beer rows merged), pause button, landscape-first layout and portrait rotate prompt; Gold is the only counter until a reveal adds others
    - _Requirements: 3.5, 8.6, 8.8, 18.1, 18.2, 18.9, 18.10_
  - [x]* 13.2 Write property test for Gold display rounding
    - **Property 45: Gold display rounding**
    - **Validates: Requirements 8.8**
  - [ ] 13.3 Implement the Panel framework
    - Side sheet ≤ 40% width (bottom sheet ≤ 40% height fallback), `Card` with ≤ 8 values per section, no tables, shared `TouchTarget` (≥ 44 × 44 CSS px), native buttons/inputs with focus rings
    - _Requirements: 18.3, 18.4, 18.5, 18.7, 18.8_
  - [ ] 13.4 Implement Pub, Job_Slot picker and Human Panels
    - Pub: storage cards ("Beer 480/500", "Over capacity"), staffing, metrics, recommended staff, Job_Slots, "Change drink price", "Add Human" (gated by hiring_option reveal), auto-reorder toggle and threshold, place Order; storage response options gated by storage_responses reveal
    - Job_Slot picker lists every Workforce Human with `displayName` and state; Human Panel with Job, state, Salary, fire with Severance shown
    - Rejected Commands show text-table messages incl. missing Gold
    - _Requirements: 6.4, 6.7, 7.16, 7.23, 9.2, 9.5, 10.3, 10.8, 15.10, 19.4, 19.5_
  - [ ] 13.5 Implement Vehicle, Supplier, Competitor, Plot, Customer and Finance Panels
    - Vehicle: capacity, cargo, Route, Driver, deliveries/min, Route editor, "Resume Route" when suspended; Supplier: unit price, reserved Orders, Order form; Competitor Pub: name, popularity band, drink price; Plot: status, price; Customer: state, drinks, wait; Finance: income/expenses per category over 5 Game_Minutes
    - _Requirements: 8.3, 10.1, 10.3, 11.6, 12.1, 13.13, 14.5, 14.6, 17.4_
  - [x] 13.6 Implement the Pause_Menu and the "Resume Route?" dialog
    - Pause_Menu adds/removes the `pauseMenu` reason (save hook wired in 16.10); dialog after exiting manual driving with a suspended Route submits `resumeRoute` or keeps it suspended
    - _Requirements: 13.11, 13.12, 13.13, 21.6, 21.7_
  - [ ]* 13.7 Write unit tests for UI rules
    - Lint rule plus test that Human labels in `ui/` use `displayName()`; computed touch target size ≥ 44 px
    - _Requirements: 18.3, 46.7_
  - [x] 13.8 Implement the HUD Game_Speed control and the Pause_Menu "Testing" toggle
    - Segmented pause / 1x / 2x / 4x touch control (≥ 44 × 44 CSS px per segment) shown only while speeds are available, current speed highlighted; Pause_Menu "Testing" toggle wired to Dev_Mode; all labels via `t()`
    - _Requirements: 18.3, 18.9, 47.4, 47.5, 47.6, 47.7, 47.9_
  - [x]* 13.9 Write unit tests for Game_Speed rules
    - Locked until the `game_speed` reveal or Dev_Mode (`?dev=1`, dev build, Testing toggle); Dev_Mode leaves `SimState` unchanged; reset to 1x on load; speed keys ignored while locked; speed pause triggers a save
    - _Requirements: 47.3, 47.4, 47.5, 47.6, 47.8, 47.9_

- [x] 14. Implement manual driving with Rapier
  - [x] 14.1 Implement the lazy-loaded Physics_Layer
    - `physics/ManualDriving.tsx` loaded via `import()` only during Manual_Driving; static colliders from map data, kinematic bodies for other Vehicles, dynamic van body with handling values; pure `clampManualVelocity` at `handling.manualTopSpeed` (originally `speed × (1 + manualSpeedBonus)`; replaced by the Nov 2026 driving overhaul, 34.5); `<Physics paused>` while Ticks are stopped
    - _Requirements: 13.3, 13.4, 21.8, 41.4_
  - [x]* 14.2 Write property test for the manual speed cap
    - **Property 20: Manual speed cap**
    - **Validates: Requirements 13.4**
  - [x] 14.3 Wire driving input, pose submission, camera and comedy effects
    - "Drive" Context_Action submits `startManualDriving`; touch joystick heading/throttle with reverse beyond 120°, W/S/A/D on PC; one `manualVehicleUpdate` per Tick; Load/Unload/Exit Context_Actions; camera follows the van within Person/Business bands; squash-and-wobble bounce and crate jiggle on impacts
    - _Requirements: 2.9, 13.1, 13.6, 13.7, 13.8, 13.11, 15.7, 20.3_
  - [x] 14.4 Implement upright, out-of-bounds and init-failure handling
    - `uprightMonitor.ts`: > 90° tilt for 2 s real time → `resetVehicle` at `nearestRoadPoint`; out of drivable polygon → reset after 0.5 s fade; Rapier init failure disables Manual_Driving with a toast
    - _Requirements: 13.14, 13.15, 13.16_
  - [x]* 14.5 Write unit tests for the upright monitor
    - Fake timers for tilt and out-of-bounds resets with cargo intact
    - _Requirements: 13.14, 13.15_

- [ ] 15. **Phase 1 playable checkpoint - test on phone and PC**
  - Run `npm.cmd test` and `npm.cmd run build`; ensure all tests pass.
  - The user starts the dev server manually in their own terminal: `npm.cmd run dev -- --host`. On PC open the local URL; on the phone (same Wi-Fi or Tailscale) open `http://<pc-ip>:5173`. Saves and PWA install are not available yet, so a reload starts a new game.
  - Check the Phase 1 question: watch the pub, zoom out to the city, allocate Jan/Julia/Thomas, drive the van between Supplier and Pub while things keep running.
  - Optional, user-triggered only: the user may ask for a commit of the scaffold at this point. Do not commit or push otherwise.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement saves and local persistence
  - [x] 16.1 Implement the shared Save_Document envelope and validators
    - `packages/shared/src/saveDocument.ts` (`CURRENT_SCHEMA_VERSION = 1`, envelope zod schema), `migrations/index.ts` pipeline skeleton, `validation.ts` (display name 1–20 unique ignoring case, PIN empty or 4–6 digits, slot name 1–30), `api.ts` DTO schemas
    - _Requirements: 22.1, 22.3, 22.9, 24.1, 24.5_
  - [x] 16.2 Implement the Save_Serializer
    - Serialise complete state (seed, RNG, Tick, reveals, achievements, scheduler) with envelope fields; deserialise: parse → envelope → version check → migrations → state schema → semantic invariants; report the first invalid field path
    - _Requirements: 19.3, 24.1, 24.2, 24.9_
  - [x] 16.3 Write property test for save round-trip
    - **Property 25: Save round-trip**
    - Required by Requirement 44.2
    - **Validates: Requirements 24.1, 24.2, 24.3, 19.3, 40.3**
  - [x] 16.4 Write property test for round-trip continuation
    - **Property 26: Round-trip continuation equivalence**
    - Required by Requirement 44.2
    - **Validates: Requirements 24.4**
  - [ ]* 16.5 Write property test for first-invalid-field reporting
    - **Property 28: Validation reports the first invalid field**
    - **Validates: Requirements 24.9**
  - [x] 16.6 Implement the migration load flow
    - Store pre-migration document as the slot backup (replacing older backup), apply steps in order, abort on a throwing step with its name, refuse newer schema versions with an update message, never modify the stored copy on failure
    - _Requirements: 24.5, 24.6, 24.7, 24.8_
  - [x] 16.7 Write the migration property test harness
    - **Property 27: Migration validity**
    - Required by Requirement 44.2; iterates `packages/shared/test/fixtures/v*/` and generated older documents (no older versions exist until task 24.2 adds v1 fixtures)
    - **Validates: Requirements 24.5, 24.10**
  - [x]* 16.8 Write property test for name and PIN validation
    - **Property 33: Profile and slot name and PIN validation**
    - **Validates: Requirements 22.1, 22.3, 22.9**
  - [x] 16.9 Implement the Local_Store
    - `KeyValueStore` interface, `idbStore` (idb, database `human-resource`, stores saves/backups/profiles/slots/meta/syncQueue), `lsStore` (`hr:` prefix), `openLocalStore()` with fallback and one-time warning
    - _Requirements: 23.5, 23.6_
  - [x] 16.10 Implement autosave and wire loop save hooks
    - `writeSave`: skip when Tick unchanged, Revision +1 on success, save-failure Alert and retry next interval; triggers: 30 s real-time interval while Ticks advance, visibility hidden, pagehide, Pause_Menu open
    - _Requirements: 21.2, 21.6, 23.1, 23.2, 23.3, 23.4, 23.7_
  - [ ]* 16.11 Write property test for local revision accounting
    - **Property 29: Local revision accounting**
    - **Validates: Requirements 23.3, 23.4**
  - [x] 16.12 Implement local Profiles and the Save_Slot list
    - Local-only Profile list (server integration in 20.5), slot list with create/load/rename/delete (confirmation prompt), new slot seeded via `crypto.getRandomValues`, loading resumes from stored Tick without offline progress; replace the dev Quick start route
    - _Requirements: 3.2, 21.5, 22.9, 22.10_
  - [ ]* 16.13 Write unit tests for loop pause and persistence paths
    - Fake `visibilitychange`, `pagehide`, Pause_Menu; autosave timing with fake timers; `fake-indexeddb` fallback warning; migration backup, failure and newer-version paths
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.6, 23.1, 23.5, 23.6, 24.6, 24.7, 24.8_

- [x] 17. Implement the PWA_Shell
  - [x] 17.1 Configure vite-plugin-pwa and the manifest
    - `registerType: 'prompt'`, `generateSW`; manifest name, short name, 192/512/maskable icons in `public/icons/`, standalone, landscape, theme colours from `theme.json`; Workbox `globPatterns` incl. js, css, html, svg, png, webp, woff2, glb, gltf, json; `navigateFallbackDenylist` and `NetworkOnly` for `/api`
    - _Requirements: 42.1, 42.2_
  - [x] 17.2 Implement the update prompt
    - `pwa/registerSW.ts` and `UpdatePrompt.tsx`: notify on `onNeedRefresh`, write Save_Document then `updateSW(true)` on confirm, otherwise activate at next launch
    - _Requirements: 42.3, 42.4_
  - [x] 17.3 Optimise startup and offline play
    - Profile picker as first route without importing three/R3F; preload the game chunk in the background; Rapier chunk lazy but precached; Local_Store slots playable offline
    - The game chunk (`GameScreen-*.js`) and the Rapier chunk (`ManualDriving-*.js`) now split out of the entry bundle (verified in `vite build` output); `App.tsx` lazy-loads `GameScreen` and warms it in the background after boot
    - _Requirements: 41.4, 42.2, 42.5_
  - [x]* 17.4 Write build-output checks for the PWA
    - After `vite build`, assert manifest fields and that the precache manifest contains the game and Rapier chunks
    - _Requirements: 42.1, 42.2_

- [x] 18. Checkpoint - Local persistence and PWA
  - Run `npm.cmd test` and `npm.cmd run build`. Ensure all tests pass, ask the user if questions arise.
  - Verified: `npm run typecheck` exit 0, `npm test` 41/41 passing, `npm run build` exit 0 with the PWA service worker and precache (16 entries) generated and the game/Rapier chunks split out.

- [x] 19. Implement the Save_API server
  - [x] 19.1 Scaffold `apps/server` with storage and health
    - Fastify with `fastify-type-provider-zod`, `@fastify/static` serving the web build with SPA fallback; `storage/fileStore.ts`, `atomicWrite.ts` (tmp + rename), `locks.ts` (per-file mutex) on `DATA_DIR`; `GET /api/health` with write/delete probe (503 otherwise)
    - _Requirements: 25.16, 43.1, 43.4_
  - [x] 19.2 Implement PIN hashing and lockout in `packages/shared`
    - PBKDF2-SHA256 (16-byte salt, 210 000 iterations, 32-byte hash) with node:crypto and WebCrypto adapters; pure lockout function (5 failures in 5 min → 5 min lock, remaining time)
    - _Requirements: 22.7, 26.2, 26.3, 26.4, 26.5, 26.6_
  - [x]* 19.3 Write property test for PIN hash parity
    - **Property 34: PIN hash verification parity**
    - **Validates: Requirements 22.7, 26.2, 26.3**
  - [x]* 19.4 Write property test for PIN lockout
    - **Property 35: PIN lockout**
    - **Validates: Requirements 26.4, 26.5, 26.6**
  - [x] 19.5 Implement Profile routes and the access guard
    - `GET/POST/PATCH /api/profiles`, `POST /pin/verify` with 400/401/409/423 responses naming fields; PIN change/removal requires current PIN; `accessGuard` onRequest hook that currently allows all (tailnet trust)
    - _Requirements: 22.1, 22.2, 22.3, 22.8, 26.2, 26.4_
  - [x] 19.6 Implement slot and save routes
    - Slots list/create-or-rename/delete (tombstone); save meta/get; `PUT …/save` accepted iff `baseRevision` equals stored (0 if absent) and `document.revision > baseRevision`; 409/410/413 (5 MB from `MAX_SAVE_BYTES`)/422/426; envelope ids must match path; `POST …/save/overwrite` moves current to server backup
    - _Requirements: 22.9, 25.2, 25.3, 25.6, 25.11, 25.13, 25.15_
  - [ ]* 19.7 Write property test for the server revision check
    - **Property 30: Server revision check**
    - **Validates: Requirements 25.2, 25.3**
  - [x] 19.8 Implement the PIN-removal CLI
    - `cli.ts remove-pin "<displayName>"` operating on `profiles.json`
    - _Requirements: 26.7_
  - [x]* 19.9 Write route tests with Fastify inject
    - Temp data dir; profile field errors, health, size/schema/outdated/deleted responses, overwrite backup, CLI
    - _Requirements: 22.2, 25.6, 25.11, 25.13, 25.15, 26.7, 43.4_

- [x] 20. Implement the Sync_Service and server-backed Profiles
  - [x] 20.1 Implement the API client and load decision
    - `sync/apiClient.ts` (8 s timeout, typed DTOs), pure `loadDecision.ts` (`decideLoad`); Vite dev proxy for `/api` to the server dev process
    - _Requirements: 25.7, 25.8, 25.9_
  - [x]* 20.2 Write property test for the load decision table
    - **Property 31: Load decision table**
    - **Validates: Requirements 25.7, 25.8, 25.9**
  - [x] 20.3 Implement the Sync_Service
    - Upload after each successful local write with `baseRevision = syncedRevision`; set `syncedRevision` on 200; > 5 MB → "Too large to sync" Alert; 409 → `syncConflict` pause and dialog (keep server with local backup / overwrite server with rebased Revision); 410 → offer keep as new slot; 426 → update prompt; offline → "not synced" badge and 60 s retry; `deletionQueue.ts` for offline deletes; load flow per decision
    - _Requirements: 25.1, 25.2, 25.4, 25.5, 25.6, 25.7, 25.8, 25.9, 25.10, 25.12, 25.13, 25.14, 25.15_
  - [ ]* 20.4 Write property test for multi-device sync safety
    - **Property 32: Multi-device sync never silently loses progress**
    - Model Save_API from task 19.6 semantics
    - **Validates: Requirements 25.1, 25.4, 25.6, 25.9**
  - [x] 20.5 Connect the Profile picker and PIN pad to the Save_API
    - Profile picker from the API with cached fallback, Profile creation errors per field, PIN pad verifying online or against cached salted hash offline, per-device lockout in `meta` with countdown, PIN change/remove with current PIN; slot list synced with server slots
    - _Requirements: 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8, 26.3, 26.5, 26.6_
  - [ ]* 20.6 Write unit tests for the Sync_Service
    - Mocked API: conflict pause, keep-server backup, overwrite rebase, offline retry, deletion queue flush
    - _Requirements: 25.4, 25.5, 25.6, 25.10, 25.14_

- [x] 21. Checkpoint - Save_API and sync
  - Run `npm.cmd test` and `npm.cmd run build`. Ensure all tests pass, ask the user if questions arise.
  - Verified: `npm test` 41/41 passing and `npm run build` exit 0. The Save_API is deployed and serving in production (Ubuntu + Tailscale).

- [x] 22. Add Docker and Tailscale deployment
  - [x] 22.1 Write the Dockerfile and docker-compose file
    - Multi-stage build (`npm ci && npm run build`), runtime as `node` user, `/data` volume, healthcheck; compose with `127.0.0.1:8787:8080`, `MAX_SAVE_BYTES`, named volume `hr-data`; static headers (`sw.js`, `index.html`, manifest no-cache; hashed assets immutable, set in `apps/server/src/app.ts`)
    - Implemented deviations from the original note (both working in production): `node:24-alpine` instead of `node:22-alpine`, and the server bundled with esbuild instead of tsup
    - _Requirements: 25.16, 26.1, 43.1, 43.2, 43.3_
  - [x] 22.2 Write deployment and content documentation
    - `docs/deployment.md`: build/run on Ubuntu, `sudo tailscale serve --bg --https=8443 http://127.0.0.1:8787`, existing Tailscale-only reverse proxy alternative, HTTPS requirement for service workers, PIN-removal command (`docker compose exec human-resource node dist/cli.js remove-pin "<name>"`), statement that Profile picker and PIN are convenience only and Tailscale membership is the only access control
    - `docs/content-authoring.md` (adding Definitions, names, text); README links
    - _Requirements: 26.8, 26.9, 43.2, 43.3_
  - [x]* 22.3 Write a Docker smoke test script
    - Build image, run compose with temp volume, hit `/api/health`, upload and fetch a save, restart, fetch again (runs on the Ubuntu host or where Docker is available)
    - _Requirements: 25.16, 43.1, 43.2, 43.4_

- [ ] 34. Playability polish (user requests, Nov 2026)
  - [x] 34.1 Fix manual driving not moving
    - Throttle was applied as an impulse and then erased by a `setLinvel` built from the stale velocity; it is now part of the written velocity (`physics/ManualDriving.tsx`). Remove the TEMP `driveDebug` logging once the user confirms in-game.
  - [x] 34.2 Stardew-style building interiors
    - E / "Enter" at the drawn model's front door teleports the CEO inside; only that interior is drawn (dark backdrop, camera clamped to the room, zoom unchanged); "Leave" only at the interior door mat. Interior walls (incl. the front wall) are solid. Staff, Customers, crates and labels inside a building are only drawn in its interior view; Customers walk up to the door outside and "teleport" in, and the other way round when leaving.
  - [x] 34.3 Building hitboxes from the drawn models
    - `render/footprints.ts` holds each building's world bounding box (fitted, scaled GLB; plot rectangle for placeholder boxes), so changing `scale` / `offset` in `modelMap.ts` moves the hitbox. Walking is shaped in `input/walkCollision.ts` before `ceoMove` is submitted; driving uses the same boxes as Rapier colliders. `ceoEnter` / `ceoExit` accept the model's door point (validated against the plot entrance).
  - [x] 34.4 Raised sidewalks are physical
    - Figures step up onto the curb (render only); curbs are Rapier colliders and the van has per-wheel ray-cast suspension, so one wheel on a curb lifts that corner.
  - [x] 34.5 Driving overhaul (built Nov 2026; needs an in-game feel check)
    - Design rule: everything is per Vehicle Definition in `packages/content/data/vehicles.json`, never hard-coded, because more vehicle types are coming (bigger capacity, faster, longer range on fuel). A new type feels different just by its JSON.
    - User answers: about 2x as fast; fast driving is free fun for now (no penalties); no style tip yet; separate touch drift button is fine; S keeps brake-then-reverse.
    - Handling fields (schema `vehicleDefSchema.handling`): `manualTopSpeed` (15.4, about 2x the route `speed` of 7; routes and delivery timing are unchanged), `reverseTopSpeed`, `brakeDecel`, `driftGrip`, `driftTurnBoost`, `driftDrag`, `donutTurnRate`; `acceleration` raised to 30. The global `config.manualSpeedBonus` was removed: Property 20 now caps manual velocity at `handling.manualTopSpeed`.
    - Pure handling in `apps/web/src/physics/handling.ts` (`driveStep`), tested in `apps/web/test/handling.test.ts` (top speed, Property 20 cap, brake then reverse, drift grip/turn, donuts, coasting stop).
    - Controls: Space = handbrake drift (only while driving, so Space keeps working for buttons otherwise); touch "Drift" button (hold) next to the context button, hidden on mouse/keyboard devices. Donuts: W + S together, or gas + handbrake, below 4 u/s; A/D (or the stick) picks the direction.
    - Feedback: fading tyre marks from the rear wheels while drifting or spinning, stronger body roll while sliding.
    - Not built yet: dust puffs, a looser camera while sliding.
    - Rules that stay: physics is web-only; the sim only receives `manualVehicleUpdate` poses. Cargo is never lost. Upright/out-of-bounds resets still apply.
    - Later (wishlist): fuel/range per vehicle type, crash damage that breaks load, style points for a perfect drift.
  - [ ] 34.6 Furniture collision inside (bar, tables)
    - CEO and Humans cannot walk through the bar, tables and taps in an Interior_View; read furniture boxes from the layout data (`layoutKey`) so Phase 3 layouts (task 42.1) reuse the same colliders
    - _Requirements: 14.8_
  - [ ] 34.7 Remove the TEMP `[drive]` debug logging
    - Delete the `driveDebug` / `[drive]` console logging in `apps/web/src/physics/ManualDriving.tsx` and `apps/web/src/loop/simBridge.ts`, but only after the user confirms driving works in task 34.8
    - _Requirements: 13.3_
  - [ ] 34.8 In-game feel check of the driving overhaul (user)
    - The user drives the van on PC and phone and checks top speed, brake then reverse, handbrake drift, donuts, curbs and tyre marks; tuning changes go into `vehicles.json` only
    - _Requirements: 13.3, 13.4, 13.17, 13.18, 13.19, 13.21_

- [ ] 23. **Checkpoint - Phase 1 complete**
  - Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build`. Ensure all tests pass, ask the user if questions arise.
  - Optional, user-triggered only: on the user's explicit request, stage specific files, commit on `main` and push to `origin`. Do not do this automatically.

## Phase 2 - Foundations (Requirements 50 to 54; tasks 35 to 40)

**How to do this phase**
- Goal: engine upgrades so Phases 3 to 6 are mostly JSON. No new gameplay, and every Phase 1 number must stay identical (Property 49 and the golden playthrough prove it).
- Order: record the old direct values (35.1) before touching any formula. Then 35 (modifiers) and 36 (conditions and effects), then 37 (Services, needs both). 38 (replay) and 39 (frontage) are independent and can run in parallel with them. No schema version bump here: new state sections are optional and empty when absent.
- Strong model: 35.2, 35.3, 36.1, 36.2, 37.2, 38.1, 39.1 (contracts and refactors). Cheaper model: tests, content conversion, UI cards, docs, 38.2, 38.3, 39.2, 39.3. If a cheaper model fails the same test twice, escalate.
- Verify: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`.

- [x] 35. Implement the generic Modifier system and `getStat`
  - [x] 35.1 Record the baseline of the old direct stat computations
    - Test fixture in `packages/sim/test/baseline/` that stores today's outputs of the brand multiplier, premium price, repeat-order chance, Recipe Trait modifiers, boosts and Reputation demand modifier for generated Traits, Brands and Recipes; it must pass before and after task 35.3
    - _Requirements: 50.6_
  - [x] 35.2 Add StatId, Modifier types, `getStat` and the `modifiers` system
    - `StatId` closed zod enum in `defs/schemas.ts` (only stats a system reads: `demand`, `premiumPrice`, `repeatOrderChance`); `Modifier`, `SourceRef`, `TargetSelector` types; optional `state.modifiers` (sorted by id) in `state/types.ts` and `state/schema.ts`
    - `stats/getStat.ts`: base + sum of `addFlat` + `mulDivFloor(base, sum of addBp, 10000)` (ceil variant per StatDef); `explainStat` returns base and entries; `modifiers` system in pipeline slot 0.5 removes entries with `untilTick` reached
    - _Requirements: 50.1, 50.2, 50.3, 50.5_
  - [x] 35.3 Port the existing stat reads to `getStat`
    - Convert Trait `addPct` to `addBp` once at registry load; static Trait, Brand and Recipe Trait modifiers are derived from Definitions, not stored; `boosts` become `source.kind = 'boost'` Modifiers; Reputation demand modifier read through `getStat`; delete the duplicated direct computations in `defs/formulas.ts`
    - _Requirements: 50.2, 50.6, 80.1_
    - Built Nov 2026: before this task no system read Brand, Trait or Recipe modifiers at all, so the baseline (35.1) is a frozen reference (	est/baseline/legacyStats.ts) of the earlier direct computations and the grid in stat-baseline.json. The Phase 1 start state is bit-identical before and after (checked with an end-state hash over 8 scripted runs). The Reputation demand modifier is a derived Modifier (basis points, rounded once). state.boosts is read through BOOST_STAT; serviceSpeed has no StatId yet (task 43.1 adds workSpeed), so boosts convert to nothing until then.
  - [x] 35.4 Write property test for getStat equivalence
    - **Property 49: getStat equivalence with the earlier direct computation**
    - Required: compares against the baseline of task 35.1
    - **Validates: Requirements 50.2, 50.6**
  - [x] 35.5 Add the "why this number" breakdown
    - Selector over `explainStat` and a `Card` in the Panel framework listing base value and each Modifier with source and value (moves into the Pintly and Staffly apps in Phase 4)
    - _Requirements: 50.7_
  - [x]* 35.6 Write property test for getStat confluence
    - **Property 50: getStat confluence**
    - **Validates: Requirements 50.1, 50.2, 50.9**
  - [x]* 35.7 Write property test for Modifier expiry
    - **Property 51: Modifier expiry**
    - **Validates: Requirements 50.5**
  - [x] 35.8 Cover `modifiers` in the save round-trip generators
    - Extend `arbSimState()` and the serializer tests so Properties 25 and 26 include stored Modifiers; the version migration for old saves is part of task 52.1
    - _Requirements: 50.8, 24.3_

- [x] 36. Implement the shared Condition and Effect engine
  - [x] 36.1 Extend the Condition DSL and the evaluator
    - Add kinds `not`, `revealed`, `statAtLeast`, `statBelow`, `loanActive`, `licensed`, `pubOpen`, `humanCountAtLeast`, `serviceUsed`, `questStepDone` in `conditions/`; `evaluateCondition` reads state and the Tick's events only and never touches `state.rng`; `printCondition` and `parseCondition` use canonical key order
    - _Requirements: 52.1, 52.5, 52.7_
  - [x] 36.2 Implement Effects and `applyEffects`
    - Effect schema with `gold`, `addModifier`, `reveal`, `schedule`, `grantResource`, `news` and `domain`; `range` amounts draw from the RNG in effect order; `gold` always goes through `applyGold`
    - `DomainOp` closed enum with one stub file per op under `conditions/domainOps/` (`setLicense`, `startLoan`, `payOffLoan`, `applyFitOut`, `setSupplyDeal`, `buyTap`, `hireCandidate`, `fireRibbon`, `occupyStaff`) so later tasks fill separate files
    - _Requirements: 52.2, 52.4_
  - [x] 36.3 Validate vocabulary in the registry
    - Reject unknown Condition kinds, Effect kinds, StatIds and unregistered DomainOps with an error naming the Definition and the entry
    - _Requirements: 50.4, 52.3, 73.7_
  - [x] 36.4 Write property test for unknown entries
    - **Property 52: Unknown stat, condition, effect or domain op is rejected**
    - **Validates: Requirements 50.3, 50.4, 52.3, 73.7**
  - [x] 36.5 Move Reveal_Triggers and Achievements onto the shared evaluator
    - `reveals` and `achievements` systems call `evaluateCondition`; no behaviour change (existing Property 36 stays green)
    - _Requirements: 52.1_
  - [x] 36.6 Write property test for condition purity
    - **Property 53: Condition evaluation is pure**
    - Required: add `arbCondition` to the arbitraries
    - **Validates: Requirements 52.1, 52.5**
  - [x]* 36.7 Write property test for the Condition round trip
    - **Property 54: Condition print and parse round trip**
    - **Validates: Requirements 52.7**
  - [x] 36.8 Write property test for Gold bounds of Effects
    - **Property 55: Effects keep Gold within bounds**
    - Required: add `arbEffects` to the arbitraries
    - **Validates: Requirements 52.2, 52.4, 52.6, 79.2**

- [x] 37. Implement data-defined Services and `useService`
  - [x] 37.1 Define Service schemas and settings data
    - `ServiceDef` (id, cost, `access`, `conditions` with optional `reason`, `effects`, `once`, `params`) and `BusinessDef.services` / `office` marker in `defs/schemas.ts`; `settings.json` listing `commandType` and `access` per setting; registry checks for Conditions, Effects and text keys
    - _Requirements: 51.1, 51.2_
  - [x] 37.2 Implement the `useService` Command
    - `commands/useService.ts` with the validation order unknown entity, locked District, `requireAccess` (`not_present`), Conditions in order, `once` (`already_done`), `requireGold`, then cost, `applyEffects` and `state.servicesUsed`; invalid `params` give `conditions_not_met`; add the new Reason_Codes and their `reason.*` text keys
    - A `requireAccess` check for settings tagged `presence` is shared with the setting handlers
    - _Requirements: 51.3, 51.4, 51.5, 51.6, 51.7, 51.8, 51.12_
  - [x] 37.3 Show Services in the Business Panel
    - List each Service with cost, a location icon for `presence` and a "Drive there" action (a hint only until the Waypoint exists in task 57.1); text via `t()`
    - _Requirements: 51.9_
  - [x]* 37.4 Write property test for `useService`
    - **Property 56: useService validation and atomic rejection**
    - **Validates: Requirements 51.3, 51.4, 51.5, 51.6, 51.7, 51.8**
  - [x]* 37.5 Write unit tests for Service edge cases
    - Reject order, `once`, bad `params`, locked District, `presence` without the CEO
    - _Requirements: 51.5, 51.7, 51.12_

- [x] 38. Implement the Command_Log, replay and State_Hash
  - [x] 38.1 Implement canonical JSON, `stateHash` and `runLog`
    - `packages/sim/src/replay/`: `canonicalJson` (sorted keys), `stateHash` (FNV-1a 64 bit from two 32-bit halves, no BigInt), `CommandLog` with `repeat`, `runLog(reg, base, log, untilTick)`
    - _Requirements: 53.1, 53.3, 53.7_
  - [x] 38.2 Record Commands in the web loop
    - `apps/web/src/loop/commandRecorder.ts` wraps `simBridge.submit`; compresses runs of identical per-Tick Commands; keeps a rolling tail of `config.commandLogTailLimit`; optional `commandLog` in the Save_Document envelope
    - _Requirements: 53.1, 53.2, 53.4_
  - [x] 38.3 Compute the State_Hash in the loop and send it with uploads
    - Hash every `config.stateHashEveryTicks` Ticks; show Tick and hash in the debug overlay; optional `stateHash` and `tick` in the upload DTO (`packages/shared/src/api.ts`); the server stores and returns them in the save meta
    - _Requirements: 53.7, 53.8_
  - [x] 38.4 Add the golden playthrough test
    - Recorded ten-minute log of the dev start in `packages/sim/test/golden/`, a CI test that replays it and asserts the hash, and an `npm.cmd run golden:record` script that rewrites the hash on purpose
    - Required: runs in the normal `npm.cmd test`
    - _Requirements: 53.5, 53.6_
  - [x] 38.5 Write property test for replay
    - **Property 57: Replay reproduces the recorded hash**
    - Required; includes runs with `manualVehicleUpdate` poses
    - **Validates: Requirements 53.1, 53.3, 53.4**
  - [x]* 38.6 Write property test for log compression
    - **Property 58: Command_Log compression round trip**
    - **Validates: Requirements 53.2**
  - [x]* 38.7 Write property test for State_Hash
    - **Property 59: State_Hash is canonical**
    - **Validates: Requirements 53.7, 53.8**
  - [x] 38.8 Add bug-report export
    - Pause_Menu action that downloads the start snapshot, full Command_Log and latest hash as one JSON file
    - _Requirements: 53.1, 53.7_

- [x] 39. Implement Frontage_Slots street layout
  - [x] 39.1 Define street schemas and derivation
    - `StreetDef` and `FrontageSlot` schemas; `defs/frontage.ts` derives Plots (id = `plotId ?? slot.id`), access node, Unloading_Zone on the road next to the slot, hitbox and walkable cut-out, and `fillers`; keep explicit `plots` valid; registry rejects overlapping or out-of-bounds slots naming the District and the slot
    - _Requirements: 54.1, 54.6, 54.11_
  - [x] 39.2 Convert Old Town to streets and migrate landmarks
    - Rewrite `maps/districts/old_town.json` as streets with `filler`, `business` and `plot` slots keeping every existing Plot id; turn the city hall in `maps/landmarks.json` into a double-width slot; keep `landmarks.json` for off-street landmarks only
    - _Requirements: 54.3, 54.4, 54.5, 54.7, 54.9, 16.7_
    - Built Nov 2026: Old Town is now seven streets (both sides of the main road in three segments around the crossing roads, plus the north street with the town hall). Every old Plot keeps its id, rectangle, zone, tags and access node (	est/fixtures/plots-before-frontage.json); the only state difference is the insertion order of state.plots. New filler slots add generated houses along the main road. Not seen in a browser yet: please check the look and the hitboxes in game.
  - [x] 39.3 Render frontage slots
    - Draw slots shoulder to shoulder, leave the curb strip free in front, fit each model to its slot width with `render/footprints.ts`, and feed hitboxes to the CEO collision and Rapier colliders
    - _Requirements: 54.2, 54.8, 16.5, 16.6_
  - [x] 39.4 Check Plot ids against existing saves
    - Test that every Plot id of the old layout still exists; if any id had to change, write the old to new mapping to a data file that the v3 migration (task 52.1) consumes
    - _Requirements: 54.10_
  - [x]* 39.5 Write property test for frontage layout
    - **Property 60: Frontage layout validity**
    - **Validates: Requirements 54.1, 54.6, 54.9, 54.11**
  - [x] 39.6 Document street authoring
    - Extend `docs/content-authoring.md` with how to add a filler, business or plot slot and turn a filler into a business
    - _Requirements: 54.9_

- [x] 40. **Checkpoint - Phase 2 complete**
  - [x] 40.1 Update the steering files
    - Update `.kiro/steering/architecture.md` and `phase2-guide.md` (which describes the Phase 6 economy) to name `getStat`, Services, the effect engine and Frontage_Slots as the only way to add stats, actions and buildings
    - _Requirements: 46.6_
  - Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build`. Confirm the golden playthrough and Property 49 pass. Ensure all tests pass, ask the user if questions arise.

## Phase 3 - Grand Opening and bar redesign (Requirements 55 to 68; tasks 41 to 53)

**How to do this phase**
- Goal: a new game starts as the Grand Opening (offices, license, loan, fit-out, supplier deal, hiring, ribbon) with the single `bar_worker` job, Seats/Taps/Hands, tabs and kegs. `?dev=1` and the dev start option keep the running pub.
- Order: task 41 first (generate v2 fixtures from the current code, then the contracts and the v3 skeleton). Then bar worker (42) before capacity (43) and tabs (44); quests (46) before offices (47) and services content (48); the v3 migration is completed in 52 once the content exists. Do not deploy a build to the server between 41.3 and 52.1, because the v3 migration is not complete until 52.1; playing locally is fine. After 52.1 the v2 to v3 step is frozen: later state changes (Gold buckets in 54.2) get their own version.
- Strong model: 41, 42.3, 44.1, 44.2, 46.1, 48.1, 52.1. Cheaper model: content JSON, text keys, renderer and Panel work, tests, 50, 51.2 to 51.6.
- Verify: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`; then play the Grand Opening (task 53).

- [ ] 41. Define the Phase 3 contracts and the v3 skeleton
  - [ ] 41.1 Generate the v2 fixtures
    - Commit v2 Save_Document fixtures under `packages/shared/test/fixtures/v2/` from the current code before any schema change, including a Customer mid-order and one mid-carry; keep the v1 fixtures
    - _Requirements: 59.4_
  - [ ] 41.2 Add Phase 3 content schemas and data files
    - zod schemas and starter JSON in `packages/content/data/phase3/` for `licenseTiers`, `loanOffers`, `fitOutItems`, `supplyDeals`, `candidates`, `requests`, `customerTypes`, `quests`, `layouts` and extended `reveal-triggers` (teaser and description keys); extend `FinanceCategory` with `loan`; text keys in `en.json`
    - _Requirements: 62.5, 63.1, 64.2, 65.1, 66.1, 67.1, 73.1_
  - [ ] 41.3 Add the v3 state shape and migration skeleton
    - `CURRENT_SCHEMA_VERSION = 3`; state fields `loans`, `servicesUsed`, `quests`, `requests`, `player.license`, `player.supplyDeal`, `player.fitOutBudget`, pub runtime (`seatsBuilt`, `tapsBuilt`, `vibeBase`, `open`, `pace`, `lostIncome`, order queue `taken`), Customer `tab`, `typeId`, `waitedLong`; `migrations/v2_to_v3.ts` skeleton that adds empty values; later tasks extend it
    - _Requirements: 59.1, 59.3, 59.6_

- [ ] 42. Implement the Bar_Worker job
  - [ ] 42.1 Add layout anchors to data and the registry
    - `packages/content/data/layouts/<key>.json` with door, mat, bar, till, clean spot, taps, seats, storage, exit; `reg.layouts` and `layout/anchors.ts` distance helpers (straight line, `Math.sqrt`); registry checks seat and tap anchor counts against the Pub Definition; the Renderer reads the same data
    - _Requirements: 55.5, 14.8_
  - [ ] 42.2 Replace `bartender` and `server` by `bar_worker` in content
    - `jobs.json`, Pub Definitions (slot counts), `start-state.dev.json` (Jan and Julia as Bar_Workers) and text keys; no Job id special-casing in code
    - _Requirements: 55.1, 55.7, 3.1a_
  - [ ] 42.3 Implement the worker state machine
    - In `systems/staff.ts` keep the pipeline slot, order queue and bar entries; one `WorkerTask` cursor per working Bar_Worker or headcount unit; steps take order, pour, hand over or deliver, take payment, clean; priority from `config.barWorkerPriority`; Tap reservation per Tick; step duration from anchor distance, pour time and `getStat(worker, 'workSpeed')`
    - _Requirements: 55.2, 55.3, 55.4, 5.1, 5.2, 5.3, 5.4_
  - [ ] 42.4 Animate workers from anchors
    - Renderer drives worker and Customer movement from `reg.layouts` anchors and `WorkerTask`; indoor-only visibility rule stays
    - _Requirements: 5.7, 14.10_
  - [ ]* 42.5 Write property test for layout distance
    - **Property 61: Layout distance drives throughput**
    - **Validates: Requirements 55.4, 55.6**
  - [ ]* 42.6 Write unit tests for the worker loop
    - Idle worker cleans, no worker means no pours, two workers share Taps, payment step ends the Tab
    - _Requirements: 55.2, 56.3_

- [ ] 43. Implement Seats, Taps, Hands and pub settings
  - [ ] 43.1 Compute Seats, Taps and Hands
    - `systems/pubCapacity.ts`: `seats = license ? min(getStat seats, license maxSeats) : 0`; Hands base from pour time + default walk until a cycle is measured; bottleneck ratio 0 when demandLoad = 0 (56.8, 56.9), `taps = min(getStat taps, def.maxTaps)`, `hands` from the measured worker cycle; add `seats`, `taps`, `vibe`, `drinkPrice`, `workSpeed` to `StatId`; metrics expose three ratios and the bottleneck
    - _Requirements: 56.1, 56.4, 56.7_
  - [ ] 43.2 Add `setWorkerPace` and `setPubOpen`
    - Commands with `remote` access in `settings.json`; Pace maps to `workSpeed` Modifiers from data; `open = false` stops arrivals but lets seated Customers finish
    - _Requirements: 56.1, 71.6, 71.10_
  - [ ] 43.3 Show the three capacity bars
    - Pub Panel shows Seats, Taps and Hands as bars with the lowest ratio coloured as bottleneck, plus pace and open toggle
    - _Requirements: 56.2_
  - [ ] 43.4 Add tap purchase at the Supplier
    - Service `buy_tap` using the `buyTap` domain op; `limit_reached` at the Pub maximum
    - _Requirements: 56.5, 56.6_
  - [ ]* 43.5 Write property test for capacity limits
    - **Property 62: Capacity limits hold**
    - **Validates: Requirements 56.1, 56.3, 56.4, 56.5, 56.6, 64.5**

- [ ] 44. Implement tabs, Walkouts and Vibe
  - [ ] 44.1 Add Tabs and Customer types
    - Customer `tab` grows at each serve; Customers in `paying` wait for a `takePayment` step; `customerTypes.json` weights drawn only when more than one type is allowed; payment through `applyGold('sales')`
    - _Requirements: 57.1, 57.2, 4.7_
  - [ ] 44.2 Implement Walkouts, long waits and Vibe
    - Vibe via `getStat`; `longWait` Modifier on waits above the limit; Walkout roll only when Vibe is below the threshold or `waitedLong` (no RNG otherwise); unpaid Tab goes to `lostIncome`; a pay timeout (`payWaitSeconds`) without low Vibe or `waitedLong` pays the Tab automatically (57.9)
    - _Requirements: 57.3, 57.4, 57.5, 57.6_
  - [ ] 44.3 Show Vibe, Walkouts and open Tabs
    - Pub Panel cards for Vibe, Walkouts per Game_Minute and open Tabs
    - _Requirements: 57.7_
  - [ ] 44.4 Write property test for Tab conservation
    - **Property 63: Tab conservation**
    - Required
    - **Validates: Requirements 57.1, 57.2, 57.5, 57.8, 4.7**
  - [ ]* 44.5 Write property test for Walkouts
    - **Property 64: Walkouts need a reason**
    - **Validates: Requirements 57.3, 57.4, 57.6**

- [ ] 45. Implement Kegs
  - [ ] 45.1 Add container sizes to Resources
    - `ResourceDef.container`; `storage/containers.ts` (`toContainers`, `fromContainers`); Kegs are visual and pricing units only: Orders, loads, unloads, capacity and limits stay in drinks (not rounded to whole kegs); unit price per drink = `pricePerKeg / kegDrinks`, cost rounded up; `supplyDeal.kegDrinks` overrides the display size
    - _Requirements: 58.1, 58.2, 58.4_
  - [ ] 45.2 Render Kegs
    - Model swap in `modelMap.ts`; keg count = `ceil(amount / drinksPerContainer)` on Vehicles and in Storage
    - _Requirements: 58.3_
  - [ ]* 45.3 Write property test for containers
    - **Property 65: Container helpers preserve drinks**
    - **Validates: Requirements 58.2, 58.4, 58.5**

- [ ] 46. Implement the quest engine
  - [ ] 46.1 Implement `quests.json` and the `quests` system
    - `QuestDef` schema, `state.quests`, system in slot 20.5 advancing steps once and applying rewards once, `requires` ordering, `targetBusinessRole` role tags
    - _Requirements: 73.1, 73.2, 73.7, 61.2_
  - [ ] 46.2 Author the quest chain
    - `grand_opening` (Municipality, Bank, Pub fit-out, Supplier, Job centre, Back at the pub), "First 100 pints" and "Second location"
    - _Requirements: 61.1, 61.4, 73.3_
  - [ ]* 46.3 Write property test for quest steps
    - **Property 72: Quest steps advance once**
    - **Validates: Requirements 73.1, 73.2, 61.4**

- [ ] 47. Add the offices to the town
  - [ ] 47.1 Define the office Businesses
    - Municipality, Bank and Job_Centre as Business Definitions (`owner: 'npc'`, no Storage, `role` tag, `office`, `services`) with placeholder models in `models.json` and `modelMap.ts`
    - _Requirements: 60.1, 60.2_
  - [ ] 47.2 Place the offices as frontage slots
    - Business slots in the Old Town streets; the Grand Opening start creates them; the dev start keeps them too
    - _Requirements: 60.4, 54.4_
  - [ ] 47.3 Show a simple counter screen
    - `contextActionFor` offers Enter at Businesses with an `office` marker (and at the Player Pub for presence Services); entering an office opens a plain Panel with service cards (full Desk in task 60); municipality ticket queue on the first visit that repeated presses do not shorten
    - _Requirements: 60.3, 60.5_

- [ ] 48. Implement the Grand Opening services
  - [ ] 48.1 Loans
    - `startLoan` and `payOffLoan` domain ops, Loan record (Gold += principal − fitOutBudget; the fit-out budget is part of the principal), repayment with exact carry in `finance`, category `loan`, Bank services; Gold may go negative; load-time validation of `loanOffers` (`fitOutBudget ≤ principal`, `repaymentPerMinute × termMinutes ≥ principal + interest`)
    - _Requirements: 63.1, 63.2, 63.3, 63.4, 63.5, 63.6, 63.7, 63.9_
  - [ ] 48.2 License tiers
    - `setLicense` domain op, Municipality services, seat cap, `minSeats`/`minTaps` per tier (no opening time), seats = 0 while `player.license` is null, `already_licensed`, `license_granted` reveal
    - _Requirements: 62.1, 62.2, 62.3, 62.4_
  - [ ] 48.3 Pub fit-out
    - `applyFitOut` domain op and the "Fit-out" Service at the Player Pub; budget, seat and tap limits; Interior_View shows the chosen items
    - _Requirements: 64.1, 64.3, 64.4, 64.5, 64.6_
  - [ ] 48.4 Supplier keg deal
    - `setSupplyDeal` domain op, `deal_missing` for Orders and auto-reorder, contract fee with exact carry, `supplier_deal` reveal
    - _Requirements: 65.1, 65.2, 65.5, 65.6_
  - [ ] 48.5 First load and `first_kegs`
    - After the deal the CEO loads the first Kegs with the Context_Action "Load"; `first_kegs` fires on the first unload at the Player Pub
    - _Requirements: 65.3, 65.4_
  - [ ] 48.6 Job centre hiring
    - `candidates.json`, `hireCandidate` domain op with Quirk (`Human.quirkId`, optional), Hiring_Cost, `first_hire`, a second Bar_Worker gated by `hiring_option` (a Driver can always be hired); Jan and Julia as Bar_Worker candidates and Thomas as Driver
    - _Requirements: 66.1, 66.2, 66.3, 66.4, 66.5, 66.6, 55.8_
  - [ ] 48.7 Cut the ribbon and gate arrivals
    - `fireRibbon` Service firing `pub_open`; `customerArrivals` returns early until `pub_open` has fired; closed sign and empty interior before opening
    - _Requirements: 61.5, 61.6, 61.7_
  - [ ] 48.8 Add Reveal_Triggers and text keys
    - `license_granted`, `loan_taken`, `fit_out_done`, `supplier_deal`, `first_hire`, `first_kegs`, `pub_open`, `first_news`, `first_permit_offer` with teaser, description and gave keys; all `reason.*` and Service text keys
    - _Requirements: 67.1, 62.3, 65.2_
  - [ ] 48.9 Write property test for loan conservation
    - **Property 67: Loan repayment conservation**
    - Required
    - **Validates: Requirements 63.3, 63.4, 63.5, 63.10**
  - [ ]* 48.10 Write property test for loan rules
    - **Property 68: Loan rules**
    - **Validates: Requirements 63.2, 63.6, 63.7**
  - [ ]* 48.11 Write property test for fit-out budget
    - **Property 70: Fit-out budget**
    - **Validates: Requirements 64.2, 64.3, 64.4, 64.5**

- [ ] 49. Implement the start states and the checklist HUD
  - [ ] 49.1 Add both start states
    - `newGame(reg, seed, { start: 'grand_opening' | 'dev' })`; `start-state.json` is the Grand Opening, `start-state.dev.json` the running pub with `pub_open` fired and the quest completed; dev start chosen by `?dev=1` or an option when creating a slot
    - _Requirements: 3.1, 3.1a, 3.1b, 61.8_
  - [ ] 49.2 Show a minimal Grand Opening checklist
    - HUD list of the six entries with ticks and the next recommended entry highlighted (replaced by the quest tracker and Waypoint in Phase 4); CEO starts next to the Pub
    - _Requirements: 3.8, 61.1, 61.3_
  - [ ]* 49.3 Write property test for Grand Opening gating
    - **Property 69: Grand Opening gating**
    - **Validates: Requirements 61.4, 61.5, 61.6**

- [ ] 50. Implement the unlock menu
  - [ ] 50.1 Require teaser and description keys
    - Registry rejects a Reveal_Trigger without both keys
    - _Requirements: 67.1, 67.5_
  - [ ] 50.2 Build the unlock menu Panel
    - Pause_Menu entry listing every trigger; teaser while locked, description and what it gave once fired; text via `t()`
    - _Requirements: 67.2, 67.3, 67.4, 67.6_
  - [ ]* 50.3 Write unit tests for the unlock menu
    - Teaser versus description, missing key rejection
    - _Requirements: 67.3, 67.4, 67.5_

- [ ] 51. Implement the CEO's outside jobs
  - [ ] 51.1 Add requests and scheduler kinds
    - `spawnRequest`, `requestDeadline` and `applyEffects` (payload = index into a data Effect list, for delayed Effects such as team-building and consultant follow-ups) in `scheduledKindSchema`, `requests.json`, `state.requests`
    - _Requirements: 68.3, 68.4_
  - [ ] 51.2 Municipality requests and bank meetings
    - Presence Services that answer a request before its deadline; ignored requests apply the data Consequence; bank meetings for repayment and refinancing
    - _Requirements: 68.3, 68.4, 68.5_
  - [ ] 51.3 Scouting
    - Presence Services on the Competitor Pub and Plots for sale that reveal their details
    - _Requirements: 68.6_
  - [ ] 51.4 Side deliveries
    - Quest steps with a deliver Condition on the `vehicleUnloaded` event, reward and deadline
    - _Requirements: 68.7, 68.9_
  - [ ] 51.5 Head of Errands
    - Job with headcount capacity and the `errands` system in slot 2.5 that applies due `delegable` presence Services without the CEO
    - _Requirements: 68.8, 49.3_
  - [ ] 51.6 Emergency supply runs
    - Test and quest text that an Order without a Driver is carried out by the CEO and that hiring Thomas hands it to Automatic_Delivery
    - _Requirements: 68.1, 68.2_

- [ ] 52. Complete the v3 migration
  - [ ] 52.1 Implement `v2_to_v3`
    - Map `bartender` and `server` slots and Humans to `bar_worker`; map Customers mid-order and mid-carry to open bar orders with the drink on the Tab; add pub fields, `license`, default `supplyDeal`, `fitOutBudget: 0`, `modifiers: []`, `loans: []`, quests, requests; fire `pub_open`, `license_granted`, `supplier_deal`, `first_hire`, `first_kegs` for existing saves; insert the office Businesses and Plots as literal JSON; apply the Plot id mapping of task 39.4; never import current types; keep the pre-migration backup
    - _Requirements: 59.1, 59.2, 59.3, 59.5, 59.6, 50.8, 54.10, 58.5_
  - [ ] 52.2 Add fixtures for the migration
    - A v2 save with a Customer mid-order and one mid-carry, and a v1 save, both as committed fixtures
    - _Requirements: 59.2, 59.4_
  - [ ] 52.3 Write property test for the v3 migration
    - **Property 66: Migration to v3 is valid and removes old jobs**
    - Required; extends the Property 27 harness
    - **Validates: Requirements 59.1, 59.2, 59.3, 59.4, 59.5**
  - [ ]* 52.4 Run migrated saves for 300 Ticks
    - Migrate every fixture, validate, run 300 Ticks and check the invariants
    - _Requirements: 59.4_

- [ ] 53. **Checkpoint - Phase 3 complete (play the Grand Opening)**
  - Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build`. Re-record the golden hash on purpose only if the dev-start balance changed.
  - The user plays a Grand Opening start on PC and phone (start the dev server manually: `npm.cmd run dev -- --host`) and a `?dev=1` start, and loads an old v2 save to check the migration.
  - Ensure all tests pass, ask the user if questions arise.

## Phase 4 - Phone UI (Requirements 69 to 74; tasks 54 to 61)

> **Tasks 56 and 59 moved to `.kiro/specs/ceo-phone`** (it follows `.kiro/steering/phone-ui.md`). They are not built twice.
> - **Priority:** only the phone **shell** (ceo-phone tasks 1 and 2) is top priority.
> - **Stay here:** 54, 55, 57, 58 and 60 stay in this spec. ceo-phone lists their Simulation parts as S1 to S4.

**How to do this phase**
- Goal: the HUD, Phone, apps and Desk as views over the services, quests, loans and finance data of Phase 3, plus the Waypoint and Info_Layers. Panels become apps one by one.
- Order: 54 (Gold buckets, schema v4 with its own migration step) first, because the HUD and Ledgr read it. Never edit the v2 to v3 step. Then 55 and 56, then Waypoint (57) and Info_Layers (58), then the apps (59) and the Desk (60).
- Model: mostly a cheaper model following `PubPanel`, Card/Row/Bar/PanelButton, at most 8 rows per section, `t()` keys and `panelActions.ts`; use the strong model for 54.1 and 57.1.
- Verify: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`; touch targets stay at least 44 px and panels at most 40% of the screen.

- [ ] 54. Implement Gold per hour buckets
  - [ ] 54.1 Replace the second buckets by minute buckets
    - `money/buckets.ts`: ring of 60 one-minute buckets keyed by `category|businessId` in `state.finance` (per-Business sums for 8.2, 27.5 and the Money Info_Layer); `applyGold` writes to the current minute; the 5 minute finance summary reads the last 5 buckets
    - _Requirements: 70.1, 70.2, 70.4_
  - [ ] 54.2 Add the v4 migration and fixtures
    - Add schema version 4 with its own `v3_to_v4` step. It folds the 300-second buckets into minute buckets keyed by `category|businessId`; older entries become zero buckets.
    - Never edit `v2_to_v3`.
    - Add a v3 fixture and migrate it.
    - _Requirements: 70.3, 70.6_
  - [ ] 54.3 Add the selectors
    - `goldPerHour`, previous hour, sparkline and runway (only when `goldPerHour` is negative)
    - _Requirements: 70.2, 70.5_
  - [ ]* 54.4 Write property test for bucket consistency
    - **Property 71: Gold bucket consistency**
    - **Validates: Requirements 70.1, 70.2, 70.4, 70.5, 70.7, 8.3**

- [ ] 55. Build the HUD layer
  - [ ] 55.1 Money pill and loan chip
    - Pill with Gold, arrow and Gold per hour, red when negative, tap opens Ledgr; loan chip while a Loan exists
    - _Requirements: 69.1, 69.2, 69.3_
  - [ ] 55.2 Quest tracker
    - Shows the quest name, progress and next step; a tap sets a Waypoint (task 57.1)
    - _Requirements: 69.4, 69.5_
  - [ ] 55.3 Alert bell with Fix
    - Bell with the Alert count and a list; Alerts carry an optional fix target (app and screen, or Business role) and show a "Fix" button
    - _Requirements: 69.6, 69.7_
  - [ ] 55.4 Apply the HUD rule
    - HUD shows only these elements, the joystick, the Context_Action button, the Phone button and the speed control; remove the minimal checklist of task 49.2
    - _Requirements: 69.8, 69.9_
  - [ ]* 55.5 Write unit tests for the HUD
    - Pill colour, chip visibility, one Alert per type per object, touch target size
    - _Requirements: 69.1, 69.3, 69.9_

- [ ] 56. Build the Phone shell: **moved to `.kiro/specs/ceo-phone`** (tasks 1 and 2 there; do not build it here)
  - Covers the apps registry, the Phone component, install toasts, layout and the access rule, and Property 73 (as ceo-phone Property 3).
  - _Requirements: 71.1, 71.2, 71.3, 71.4, 71.10, 71.11, 71.12_

- [ ] 57. Implement the Waypoint
  - [ ] 57.1 Implement the web-only Waypoint
    - `store/waypointStore.ts`; road arrows drawn from `pathCacheFor` between the CEO's nearest road point and the target access node; cleared near the target or on dismiss; never in `SimState`
    - _Requirements: 73.4, 73.5, 73.6_
  - [ ] 57.2 Wire "Drive there"
    - Services, quest steps and Alert Fix buttons set the Waypoint
    - _Requirements: 51.9, 69.7, 71.8_

- [ ] 58. Implement Info_Layers
  - [ ] 58.1 Implement the layer selectors
    - `interaction/infoLayers.ts` returns 0 to 1 per Business for Demand, Stock, Staff, Routes and Money
    - _Requirements: 74.1_
  - [ ] 58.2 Tint the world and the map
    - Management_View tints buildings by the selected layer (web state); owner colours when off; Wayfindr reads the same values
    - _Requirements: 74.2, 74.3, 74.4, 74.5_

- [ ] 59. Build the Phone apps: **moved to `.kiro/specs/ceo-phone`** (tasks 3 to 6 there; do not build them here)
  - Pintly, Staffly and Vanly may wrap the existing Phase 1 panels and Commands.
  - To-Do™, Ledgr and MijnGemeente stay blocked until their sim tasks exist: quests (46), Gold buckets (54) and Services/permits (37, 47, 68).
  - _Requirements: 71.5 to 71.9, 71.13, 50.7, 63.7, 68.3, 79.8_

- [ ] 60. Build the Desk counter screens
  - [ ] 60.1 Implement the Desk component
    - `ui/desk/Desk.tsx`: clerk portrait and line, two to four service cards built from `BusinessDef.services` and `office`, hold-to-confirm stamp (keyboard: hold Enter) that sends `useService`; releasing early sends nothing
    - _Requirements: 72.1, 72.2, 72.3, 72.5, 72.6, 72.7_
  - [ ] 60.2 Replace the simple counter screen
    - Entering an office or the Player Pub for a presence Service shows the Desk instead of the plain Panel of task 47.3
    - _Requirements: 72.1_
  - [ ]* 60.3 Add stamp feedback and tests
    - Stamp sound and screen shake on completion; unit test that an early release sends no Command
    - _Requirements: 72.4, 72.5_

- [ ] 61. **Checkpoint - Phase 4 complete**
  - Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build`.
  - The user plays on PC and phone: money pill, quest tracker, Phone apps, Desk stamp, Waypoint arrows and Info_Layers.
  - Ensure all tests pass, ask the user if questions arise.

## Phase 5 - Feel alive and satire content (Requirements 75 to 79; tasks 62 to 67)

**How to do this phase**
- Goal: make the pub readable and funny with effects derived from existing state, and add the satire events as data on top of the Phase 2 foundations.
- Order: Renderer effects (62 to 64) and the summary card (65) are independent; satire hooks (66) need Services, Modifiers and the scheduler kinds from Phase 3. Put each hook in its own JSON file to avoid merge conflicts.
- Model: a cheaper model for the whole phase; escalate only if a test fails twice. Nothing here changes saved state except optional fields (`Human.quirkId`, `summary`).
- Verify: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`.

- [ ] 62. Make Customers readable
  - [ ] 62.1 Thought bubbles
    - Beer icon while waiting, angry icon after half the patience limit; icons from `theme.json`; indoors only, dropped above 20 visible figures
    - _Requirements: 75.1, 75.2, 75.4, 75.5_
  - [ ] 62.2 Coin pop and sound
    - Coin pop and sound on the `customerPaid` event; a web mute setting disables the sound
    - _Requirements: 75.3_
  - [ ]* 62.3 Write unit tests for visibility rules
    - Bubble thresholds, aggregation above 20 figures, mute
    - _Requirements: 75.2, 75.3, 75.5_

- [ ] 63. Implement Quirks
  - [ ] 63.1 Add Quirk data
    - `phase5/quirks.json` (`id`, `textKey`, `trigger`, optional modifiers); optional `Human.quirkId` set from start state, candidates or the Human Definition
    - _Requirements: 76.1, 76.2_
  - [ ] 63.2 Show speech bubbles
    - Bubble with the Quirk text when the Human performs the named task; none for Headcount_Fills
    - _Requirements: 76.3, 76.4_
  - [ ] 63.3 Apply Quirk behaviour Modifiers
    - Static source in `getStat` for that Human
    - _Requirements: 76.5_
  - [ ]* 63.4 Write property test for Quirks and Headcount_Fills
    - **Property 75: Quirks respect Headcount_Fills**
    - **Validates: Requirements 76.4, 76.5**

- [ ] 64. Add street life
  - [ ] 64.1 Door queue and window glow
    - Queue at the door when waiting Customers exceed free Seats; glow while the Pub is open and busy; derived from state, never saved
    - _Requirements: 77.1, 77.2, 77.5_
  - [ ] 64.2 Rival effects
    - Cheering at the Competitor Pub in the High popularity band; rival owner in the doorway
    - _Requirements: 77.3, 77.4_
  - [ ]* 64.3 Write unit tests for street life
    - Effects depend only on state
    - _Requirements: 77.5_

- [ ] 65. Add the Summary_Card
  - [ ] 65.1 Implement the `summaryCard` system
    - Optional `state.summary`; system in slot 18.5 emitting `summaryDue` every configured number of game minutes with served, lost and profit deltas; Employee of the Month by `rngPick` over named working Humans
    - _Requirements: 78.1, 78.2, 78.3_
  - [ ] 65.2 Show the card
    - `summaryCard` pause reason; dismissing restores the previous Game_Speed
    - _Requirements: 78.4, 78.5_
  - [ ]* 65.3 Write property test for the summary interval
    - **Property 74: Summary card interval and winner**
    - **Validates: Requirements 78.1, 78.2, 78.3**

- [ ] 66. Add satire content
  - [ ] 66.1 Consultant visit
    - Service with `range` Effects that may be negative
    - _Requirements: 79.1, 79.2_
  - [ ] 66.2 Team-building day
    - `occupyStaff` domain op plus a scheduled `addModifier` on `workSpeed`
    - _Requirements: 79.3_
  - [ ] 66.3 Rival poaching
    - Competitor event that opens a counter-offer request and applies the outcome through Effects
    - _Requirements: 79.4_
  - [ ] 66.4 Health inspector
    - Scheduled Consequence with a `gold` fine and a `news` Effect after a shortcut
    - _Requirements: 79.5_
  - [ ] 66.5 Loyalty card and happy hour
    - Modifiers on `repeatOrderChance` (within the 90% clamp), and on `demand` and `drinkPrice` for a limited time
    - _Requirements: 79.6, 79.7_
  - [ ] 66.6 LinkedIn-style news
    - `news` Effects with text keys; first one fires `first_news`
    - _Requirements: 79.8_
  - [ ]* 66.7 Write content tests
    - Every hook uses only Services, Questionable_Opportunities, Competitor events, Modifiers or Consequences; all text keys exist
    - _Requirements: 79.1_

- [ ] 67. **Checkpoint - Phase 5 complete**
  - Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build`. Ensure all tests pass, ask the user if questions arise.

## Phase 6 - Economy expansion (Requirements 27 to 40 and 80; tasks 24 to 33)

**How to do this phase**
- Goal: the second Pub, Warehouse, Brewery, Market, acquisitions, chains, Reputation, questionable opportunities, Competitor events, minigames and Achievements, built on the foundations instead of special cases. Follow `.kiro/steering/phase2-guide.md` (it describes this phase under its old name "Phase 2").
- Order: tasks 24.1 to 24.3 and 25.1 to 25.2 are already built and stay valid; start with 24.4, then 25, 26, 27, 28, 29, 30, 31, 32. Read stats through `getStat`, use `applyEffects`, put new buildings on Frontage_Slots, and build panels as Phone apps (31.4).
- Strong model: 28.1 (acquisition transfer) and 29.1 (chains). Cheaper model: everything else.
- Verify: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`; the Tick benchmark of 32.1 stays under its limit.

- [ ] 24. Add the Phase 6 definitions pack and save migration
  - [x] 24.1 Extend schemas and author `packages/content/data/phase2/`
    - Resources Hops, Malt; Synergy as Corporate_Resource; Business Definitions brewery, warehouse (buy/rent, reduced unstaffed load rate), market_depot, extra Pub Venue_Types; Recipes incl. Secret_Recipe BADGER'S BITE; Traits and Liabilities with reveal delays; Brands per category with per-Venue modifiers; Market config (base, bounds min > 0, spread, interval); Plot prices, construction cost/time; Acquisition, Competitor event and Questionable_Opportunity tables; Achievements ("Synergy"); Phase 2 Reveal_Triggers and Help Serve threshold
    - _Requirements: 1.8, 19.1, 30.1, 33.1, 34.1, 34.6, 35.5, 37.1, 38.1, 40.1, 46.1_
  - [x] 24.2 Add Phase 2 state sections and the v1 → v2 migration
    - `CURRENT_SCHEMA_VERSION = 2`; `migrations/v1_to_v2.ts` inserts empty market, acquisitions, questionable, chains, boosts sections and default Sourcing_Policies; commit v1 fixtures under `packages/shared/test/fixtures/v1/`
    - _Requirements: 24.5, 24.10_
  - [x] 24.3 Extend the required save property tests to Phase 2
    - Add v1 fixtures and generated v1 documents to Property 27; extend `arbSimState()` with Phase 2 sections for Properties 25 and 26
    - _Requirements: 24.3, 24.4, 24.10, 44.2_

  - [ ] 24.4 Align the Phase 6 pack with the foundations
    - Author Trait, Brand and Recipe modifiers as `addBp` / `addFlat` entries read through `getStat` (task 35.3 converts the loader); give Business Definitions a `role` tag and, where fitting, a `services` list; validate the pack in the registry
    - _Requirements: 50.2, 80.1, 80.4_

- [ ] 25. Implement the Market and Sourcing_Policies
  - [x] 25.1 Implement the `market` system and trades
    - Bounded random walk at interval via RNG, clamp sell and buy with spread, history of last 10; `marketBuy` handler reserving at Market_Depot (Order with null destination); unload at Market_Depot credits sell price with `market_sale`
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6_
  - [x] 25.2 Write property test for Market price bounds
    - **Property 37: Market price bounds**
    - Required by Requirement 44.2
    - **Validates: Requirements 30.2, 30.3, 30.6**
  - [ ] 25.3 Implement Sourcing_Policies
    - `setSourcingPolicy` handler; "internal first" shortfall sizing from Player-owned producer and Warehouse stock on Routes; `no_internal_supply` Alert; simultaneous produce/buy/sell allowed
    - _Requirements: 31.1, 31.2, 31.3, 31.4_
  - [ ]* 25.4 Write property test for sourcing shortfall sizing
    - **Property 41: Sourcing shortfall sizing**
    - **Validates: Requirements 31.2**

  - [ ] 25.5 Place the Market_Depot as a Frontage_Slot
    - Put the Market_Depot (and any Phase 6 Plots for sale) in the street data of task 39.1 with an Unloading_Zone derived from the slot
    - _Requirements: 54.4, 54.5, 80.4_

- [ ] 26. Implement Plots, the second Pub and the Warehouse
  - [ ] 26.1 Implement Plot purchase and construction
    - `buyPlot`, `construct` handlers with `requireGold`; `constructionDone` scheduler event creates a Player-owned Pub with own Storage, Job_Slots, price, metrics and Sourcing_Policy
    - _Requirements: 27.1, 27.2, 27.3, 27.4_
  - [ ] 26.2 Implement the Warehouse
    - `acquireWarehouse` (buy or rent with first fee), rental fee per Game_Minute via finance carry, `endRental` rejected with `storage_not_empty`; reduced load/unload rate without a Warehouse_Worker; Warehouse as pickup/drop-off stop
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_
  - [ ]* 26.3 Write unit tests for construction and Warehouse rules
    - Construction completion after defined time; end-rental rejection; reduced unstaffed rate
    - _Requirements: 27.3, 28.2, 28.5_

  - [ ] 26.4 Place the Warehouse far from every Pub
    - Add `minWarehouseDistance` to `config/sim.json`; registry check rejects a map whose Warehouse Plot is closer by road than that distance to any Pub Plot, naming the Plot and the Pub; place the Warehouse Plot at the far end of the ring road or in the locked neighbour District once unlocked
    - Unit test the rejection and the accepted base map
    - _Requirements: 28.6, 28.7, 48.2_
  - [ ] 26.5 Run the second Pub on the Phase 3 pub rules
    - New Pubs use `bar_worker`, a `layoutKey` with anchors, Seats/Taps/Hands, License_Tier limits, fit-out defaults and the `open` flag; the Management_View summary cards read the same metrics
    - _Requirements: 27.4, 27.5, 80.5_

- [ ] 27. Implement Brewery production
  - [ ] 27.1 Implement the generic `production` system
    - Run production rules when inputs, required Brewers and output capacity are available; pause and list missing requirements; `setProductionRecipe`; output lots tagged with Recipe id and origin `brewery`; effective unit cost over 300 s ("n/a" when none produced)
    - _Requirements: 9.3, 29.1, 29.2, 29.4, 29.5, 34.2_
  - [ ]* 27.2 Write property test for production gating
    - **Property 40: Production gating**
    - **Validates: Requirements 29.1, 29.2, 9.3**

- [ ] 28. Implement acquisitions, hidden attributes, Brands and Secret_Recipes
  - [ ] 28.1 Implement Acquisition_Offers and acceptance
    - `acquisitions` system generates and expires offers per data; `acceptAcquisition` (`insufficient_gold` with missing amount, `offer_expired`) transfers ownership, employees (names made unique via `uniqueInWorkforce`), Customers present, Brand, Storage and Recipes
    - _Requirements: 7.21, 32.1, 32.2, 32.4, 32.5_
  - [ ] 28.2 Implement hidden attribute reveals and Liabilities
    - Schedule `revealAttribute` events per attribute delay; News_Feed announcement; Liability cost as Mandatory_Expense (`liability`) or penalty
    - _Requirements: 32.6, 32.7, 32.8_
  - [ ] 28.3 Apply Brand and Recipe Trait modifiers
    - Brand demand/price modifiers per Venue_Type in demand and payment; acquired Brands added to available Brands; Recipe Trait modifiers (e.g. +15 pp repeat chance) from the poured lot, clamped to 0–90%; Secret_Recipes only via Acquisition
    - _Requirements: 33.2, 33.3, 34.4, 34.5, 34.6_
  - [ ]* 28.4 Write unit tests for acquisitions
    - Liability cost on reveal, Secret_Recipe unobtainable otherwise, name suffixing on acquired staff
    - _Requirements: 32.8, 34.6, 7.21_

  - [ ] 28.5 Port reveals and Liabilities onto the effect engine
    - Hidden attribute reveals and Liability costs run through `applyEffects` (`gold` with category `liability`, `reveal`, `news`) and scheduler events; conditions use the shared evaluator
    - _Requirements: 32.6, 32.7, 32.8, 80.3_

- [ ] 29. Implement chains, Reputation, questionable opportunities and Competitor events
  - [ ] 29.1 Implement the `chains` system
    - Flow graph from 300 s transfer ledger; register chains of length ≥ 3, mark inactive without flow; Synergy per chain length into `player.corporateResources`; `chainRegistered` event
    - _Requirements: 35.1, 35.2, 35.3, 35.5_
  - [ ]* 29.2 Write property test for chain detection
    - **Property 42: Corporate_Chain detection matches a naive model**
    - **Validates: Requirements 35.1, 35.2**
  - [ ] 29.3 Implement the `reputation` system
    - Integer clamp 0–100, demand modifier refresh for Player Pubs from next Tick, News_Feed with cause; stays at start value with only Phase 1 content
    - _Requirements: 36.1, 36.2, 36.3, 36.4_
  - [ ] 29.4 Implement Questionable_Opportunities
    - `startQuestionable` (`insufficient_humans`, `requireGold`, Humans removed from Jobs and `occupied`); `questionableDone` grants reward via `addToStock` (excess discarded), releases Humans, rolls Consequences into the scheduler; Consequence effects (Reputation, fines as Mandatory_Expense) and headlines
    - _Requirements: 7.13, 37.1, 37.2, 37.3, 37.4, 37.5, 37.6, 37.7_
  - [ ] 29.5 Implement Competitor events
    - Weighted event table at RNG intervals: open location (skipped without free Plot), change price within bounds, change popularity, offer Business for sale (creates Acquisition_Offer); News_Feed with Competitor name; no Competitor economics
    - _Requirements: 38.1, 38.2, 38.3, 38.4, 38.5, 38.6_
  - [ ]* 29.6 Write property test for bounded scores and chances
    - **Property 38: Bounded scores and chances**
    - **Validates: Requirements 34.5, 36.1, 36.2, 38.3**
  - [ ]* 29.7 Write unit tests for Phase 6 edge cases
    - Questionable_Opportunity with too few Humans; "open location" skipped without free Plot; firing an occupied Human rejected
    - _Requirements: 7.13, 37.3, 38.2_
  - [ ] 29.8 Run Questionable_Opportunity costs and consequences through the effect engine
    - `startQuestionable` keeps its own Command but uses `requireGold`, the `occupyStaff` domain op and `schedule` Effects; Consequences are Effect lists in data (Reputation as Modifiers, fines as `gold`); offers that fit the Service model are Service definitions
    - _Requirements: 37.2, 37.5, 37.6, 51.10, 80.2, 80.3_
  - [ ] 29.9 Run Competitor events and Reputation through the foundations
    - Competitor event effects are data Effect lists; Reputation demand effect is a `demand` Modifier read via `getStat`; News_Feed items via `news` Effects
    - _Requirements: 36.3, 38.1, 80.1, 80.3_

- [ ] 30. Implement minigames and Achievements
  - [ ] 30.1 Implement the Help Serve minigame logic
    - `minigames` system with boosts bounded to ≤ 15% for ≤ 60 s; `completeMinigame` rewards per data; `contextActionFor` offers Help Serve above the waiting threshold; Businesses remain fully operable without minigames
    - _Requirements: 39.1, 39.2, 39.3_
  - [ ] 30.2 Implement the `achievements` system
    - Evaluate Achievement conditions once per Save_Slot, append to `state.achievements`, emit `achievementAwarded`
    - _Requirements: 40.1, 40.2, 40.3_
  - [ ]* 30.3 Extend the one-time firing property test to Achievements
    - **Property 36: Reveal_Triggers and Achievements fire once**
    - **Validates: Requirements 19.1, 19.4, 19.5, 40.2**
  - [ ] 30.4 Extend the required invariant property tests to Phase 6 Commands
    - Add all Phase 2 Commands to `arbCommand` so Properties 1, 2 and 3 cover Market trades, production, Acquisitions and Questionable_Opportunity rewards; extend Property 6 generators to Phase 2 discretionary Commands
    - _Requirements: 2.5, 2.10, 2.11, 44.2_

  - [ ] 30.5 Evaluate Achievements through the shared engine
    - Achievement conditions use `evaluateCondition`; the award toast is a `news` Effect with the Achievement text keys
    - _Requirements: 40.1, 40.2, 80.3_

- [ ] 31. Build the Phase 6 UI and renderer additions
  - [ ] 31.1 Implement Phase 6 Panels
    - Market (prices + trend), Brewery (missing requirements, unit cost), Acquisition offer (known Traits, "?" markers), Questionable_Opportunity (reward, cost, duration, legal-status text, no probabilities), multi-Pub summary cards, input sourcing comparison, Plot buy/construct, Warehouse buy/rent/end rental
    - _Requirements: 27.1, 27.2, 27.5, 28.1, 29.2, 29.5, 30.6, 31.5, 32.3, 37.8_
  - [ ] 31.2 Implement News_Feed, toasts, banners and Phase 6 visuals
    - News_Feed ticker, revealed HUD counters, Achievement toast, "CORPORATE CHAIN x<n> + Synergy" banner and Route highlight, Brewer animation and accumulating crates, Phase 6 Business primitives
    - _Requirements: 3.5, 29.3, 32.7, 35.4, 36.4, 37.7, 38.4, 40.2_
  - [ ] 31.3 Implement the Help Serve minigame UI
    - Touch and keyboard operable minigame inside the Pub submitting `completeMinigame`
    - _Requirements: 18.4, 18.5, 39.1, 39.2_

  - [ ] 31.4 Host the Phase 6 screens in the Phone apps
    - Market, Brewery stats and sourcing comparison go into Vanly; Plot and Acquisition offers into the Wayfindr building card; Questionable_Opportunities into To-Do™ side jobs; multi-Pub summary cards into Pintly; remove the stand-alone Phase 6 Panels once the apps cover them
    - _Requirements: 27.5, 29.5, 30.6, 31.5, 32.3, 37.8, 71.5, 71.13_

- [ ] 32. Add performance tooling
  - [ ]* 32.1 Write the Tick benchmark for the Phase 6 reference scenario
    - `vitest bench` with 3 Pubs, 1 Brewery, 1 Warehouse, 4 Vehicles, 60 Customers; fail above 1 ms average per Tick on desktop
    - _Requirements: 41.3_
  - [ ] 32.2 Add the in-game debug overlay
    - Average and p95 Tick time, FPS and current DPR, toggled in dev or via a hidden setting
    - _Requirements: 41.1, 41.2, 41.3_

- [ ] 33. **Final checkpoint - Phase 6 complete**
  - Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build`. Ensure all tests pass, ask the user if questions arise.
  - Optional, user-triggered only: on the user's explicit request, commit and push. Do not do this automatically.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. The property tests mandated by Requirement 44.2 (tasks 4.2, 5.2, 6.3, 8.1, 8.2, 8.3, 16.3, 16.4, 16.7, 24.3, 25.2, 30.4) are deliberately not optional, and neither are the Gold-limit test (3.14) and the Text_Key coverage test (10.8). The replanned phases add these mandatory tests: getStat equivalence (35.4, Property 49), condition purity (36.6, Property 53), Gold bounds of Effects (36.8, Property 55), replay determinism (38.5, Property 57) and the golden playthrough (38.4), Tab conservation (44.4, Property 63), loan conservation (48.9, Property 67) and the v3 migration (52.3, Property 66).
- Phase order: Phase 1 (1 to 23, 34), Phase 2 (35 to 40), Phase 3 (41 to 53), Phase 4 (54 to 61), Phase 5 (62 to 67), Phase 6 (24 to 33). Each phase ends with a checkpoint. The v3 save migration is started in 41.3 and completed (then frozen) in 52.1; deploy only after 52.1. The Gold buckets are schema v4 with their own step in 54.2.
- Model hand-off: tasks 1–11, 14, 16 and 20 are the foundation built first by the stronger model; each phase heading says which of its tasks need the stronger model. Later tasks reuse the patterns found there (handler-per-Command, systems via `TickContext`, `slotCapacity`, `pathCacheFor`, `t()`), follow `.kiro/steering/architecture.md`, and keep CI green.
- Not built and not planned here: time of day, multiplayer/shared cities, other languages, District unlock gameplay, Headcount_Fill UI. These live in `docs/wishlist.md` (written separately) or in later phases.
- The project stays in the OneDrive folder. Pause OneDrive sync while running `npm.cmd ci` or `npm.cmd install`; caches live under `HR_CACHE_DIR` or the system temp dir.
- Dev servers and watchers (`npm.cmd run dev`) are started manually by the user, never by the agent. Tests run with `vitest run` (non-watch).
- No task commits or pushes; checkpoints 15, 23 and 33 offer this only on explicit user request.
- Phone frame-rate and startup targets (41.1, 41.2, 41.4) need manual checks on real devices using the debug overlay.
- Each task references requirement clauses for traceability; property tests carry the `Feature: human-resource-mvp, Property N` tag.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.4", "4.4", "5.6", "5.7", "5.8", "5.9", "13.3", "34.6", "34.8", "35.1", "36.1", "38.1", "39.1"] },
    { "id": 1, "tasks": ["6.8", "6.9", "6.10", "6.11", "6.13", "13.4", "13.5", "34.7", "35.2", "36.2", "38.2", "39.2"] },
    { "id": 2, "tasks": ["7.2", "7.3", "7.5", "7.7", "7.9", "13.7", "35.3", "36.3", "36.5", "38.3", "39.3"] },
    { "id": 3, "tasks": ["7.14", "7.15", "7.17", "16.5", "16.11", "16.13", "19.7", "20.4", "20.6", "35.4", "35.5", "35.8", "36.4", "36.6", "36.8", "37.1", "38.4", "39.4", "39.6"] },
    { "id": 4, "tasks": ["35.6", "35.7", "36.7", "37.2", "38.5", "38.6", "38.7", "38.8", "39.5"] },
    { "id": 5, "tasks": ["37.3", "37.4", "37.5", "40.1"] },
    { "id": 6, "tasks": ["41.1"] },
    { "id": 7, "tasks": ["41.2"] },
    { "id": 8, "tasks": ["41.3", "42.1"] },
    { "id": 9, "tasks": ["42.2", "43.1"] },
    { "id": 10, "tasks": ["42.3", "43.2", "44.1", "45.1", "46.1"] },
    { "id": 11, "tasks": ["42.4", "42.5", "43.3", "43.4", "44.2", "45.2", "46.2", "47.1"] },
    { "id": 12, "tasks": ["42.6", "43.5", "44.3", "44.4", "44.5", "45.3", "46.3", "47.2", "48.1", "48.2", "48.3"] },
    { "id": 13, "tasks": ["47.3", "48.4", "48.6", "48.8", "48.9", "48.10", "48.11", "50.1"] },
    { "id": 14, "tasks": ["48.5", "48.7", "49.1", "50.2", "51.1"] },
    { "id": 15, "tasks": ["49.2", "49.3", "50.3", "51.2", "51.3", "51.4", "51.5", "51.6"] },
    { "id": 16, "tasks": ["52.1"] },
    { "id": 17, "tasks": ["52.2", "52.4"] },
    { "id": 18, "tasks": ["52.3"] },
    { "id": 19, "tasks": ["54.1", "56.1", "57.1", "58.1"] },
    { "id": 20, "tasks": ["54.2", "54.3", "56.2", "56.3", "56.4", "57.2", "58.2", "60.1"] },
    { "id": 21, "tasks": ["54.4", "55.1", "55.2", "56.5", "59.1", "60.2"] },
    { "id": 22, "tasks": ["55.3", "59.2", "59.3", "59.4", "59.5"] },
    { "id": 23, "tasks": ["55.4", "59.6", "59.7", "59.8", "60.3"] },
    { "id": 24, "tasks": ["55.5", "59.9"] },
    { "id": 25, "tasks": ["62.1", "63.1", "64.1", "65.1", "66.1"] },
    { "id": 26, "tasks": ["62.2", "63.2", "63.3", "64.2", "65.2", "66.2", "66.3", "66.4", "66.5", "66.6"] },
    { "id": 27, "tasks": ["62.3", "63.4", "64.3", "65.3", "66.7"] },
    { "id": 28, "tasks": ["24.4", "25.3"] },
    { "id": 29, "tasks": ["25.4", "25.5", "26.1", "27.1"] },
    { "id": 30, "tasks": ["26.2", "26.4", "26.5", "27.2", "28.1", "29.3"] },
    { "id": 31, "tasks": ["26.3", "28.2", "28.3", "29.1", "29.5"] },
    { "id": 32, "tasks": ["28.4", "28.5", "29.2", "29.4", "29.6", "30.1"] },
    { "id": 33, "tasks": ["29.7", "29.8", "29.9", "30.2"] },
    { "id": 34, "tasks": ["30.3", "30.4", "30.5", "31.1"] },
    { "id": 35, "tasks": ["31.2", "31.3", "31.4", "32.1"] },
    { "id": 36, "tasks": ["32.2"] }
  ]
}
```

## Foundation hand-off notes (written after the foundation build)

Built and verified (typecheck, lint, all tests, `vite build`): tasks 1–11, 14, 16 and 20, plus parts of 12, 13 and 19 that the foundation needed to be testable.

- **Also done early:** 12 (keyboard, joystick, gestures, speed keys, fixed axes); 13.1 HUD, 13.6 Pause_Menu and "Resume Route?", 13.8 speed control and Testing toggle; 19 Save_API routes, PIN hashing/lockout, remove-pin CLI and route tests (so Sync_Service can be exercised).
- **Still open for the next model:** 13.3–13.5 Panels (Pub with Job_Slot picker, Human, Vehicle with Route editor, Supplier, Competitor, Plot, Customer, Finance). The selection state exists in `uiStore.selection`; derived numbers come from `pubMetricsView`, `vehicleDeliveriesPerMinute`, `financeSummary` and `slotCapacity` in `@hr/sim`. Then 15 (checkpoint), 17 (PWA shell), 18, 21 and 22 (Docker/Tailscale) are done; Phases 2 to 6 follow the phase headings.
- **Where to plug in:** UI subscribes with `useSimVersion` / `useSimSelector` (5 Hz); Commands go through `bridge.loop.sim.submit(...)`; rejected Commands already show a `reason.*` toast. All text via `t()`; the lint rule rejects letters in JSX text.
- **Small deviations from the design, on purpose:**
  - Paths are stored as point polylines (`Path.pts`) instead of node lists, so walking from a mid-path position needs no special case.
  - The Simulation never computes headings for automatic Vehicles (no `atan2` in the sim); the renderer derives them from movement. Manual-driving heading comes from physics.
  - Customer arrivals are a seeded Bernoulli draw per Tick at the data-driven rate (no fixed spacing), so pubs look natural.
  - Start state enables auto-reorder at 50% for both pubs, so Thomas has something to fetch.
  - Camera yaw is 0° (looking north) in `camera.json`; change the number there if you prefer a diagonal view. It never rotates at runtime.
