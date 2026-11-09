# Implementation Plan: Human Resource MVP

## Overview

The plan builds the TypeScript npm-workspaces monorepo in place at `C:\Users\David\OneDrive\Laptop Python\Human Resource` (existing git repo, branch `main`, remote `https://github.com/davidzonnenberg/HumanResource.git`). The project is not moved. Vite, Vitest and TypeScript caches go outside OneDrive. All PowerShell commands use `npm.cmd`.

Order of work, chosen so Phase 1 becomes playable as early as possible:

1. Repository scaffold and tooling
2. Content schemas and Definition_Registry
3. Pure Simulation core (RNG, Gold, stock, Commands, pipeline)
4. Phase 1 systems: humans and names, customers and staff, Supplier and Orders, logistics, finance, metrics, alerts, reveals, CEO and interaction helpers
5. Web loop, renderer with placeholder primitives, camera/zoom/mode switch
6. Input, HUD and Panels
7. Manual driving with Rapier
8. **Phase 1 playable checkpoint** (test on phone and PC)
9. Local persistence, then PWA shell, Save_API and sync, then Docker/Tailscale deployment docs
10. Phase 2 as an additive block

Test sub-tasks use Vitest + fast-check. Each property test carries the tag comment `// Feature: human-resource-mvp, Property N: <title>`. Following the workflow convention, test sub-tasks are optional (`*`), with one exception: the property tests that Requirement 44.2 explicitly mandates (Properties 1, 2, 3, 9, 15, 16, 25, 26, 27, 37) are required tasks, because the project must contain them.

Two further required (non-`*`) test tasks come from the foundation decisions: the Text_Key coverage test (10.8, criterion 46.8) and the Gold safe-integer limit test (3.14, criterion 8.10).

Foundation decisions integrated as new sub-tasks without renumbering: Game_Speed 1x/2x/4x plus speed pause (10.5, 10.6, 12.4, 13.8), Districts (2.6, 3.12, 6.12, 11.9), Headcount_Fill model (3.11, 7.16), `t()` text lookup (2.7, 10.7, 10.8), Gold limit invariant (3.13, 3.14), CI and steering (1.7, 1.8), fixed camera (11.5, 12.4).

Model hand-off: tasks 1–11, 14, 16 and 20 are built first by the stronger model as the foundation. All later tasks follow the patterns established there, the rules in `.kiro/steering/architecture.md` and the CI workflow (`.github/workflows/ci.yml` must stay green).

No task commits or pushes. Commit/push appears only as a clearly labelled, user-triggered option inside checkpoints.

## Tasks

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
    - `commands/types.ts` (all Phase 1 and Phase 2 Command shapes), `reasons.ts`, a handler table in `commands/registry.ts` with one file per handler under `commands/handlers/` (Phase 2 handlers stubbed)
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
  - [ ]* 5.10 Write unit tests for patience expiry reasons
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
  - [ ]* 6.4 Write property test for insufficient Gold rejection
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
  - [ ]* 7.11 Write property test for context action selection
    - **Property 22: Context action selection**
    - **Validates: Requirements 13.2, 13.6, 14.2, 14.3, 14.5, 39.1**
  - [ ]* 7.12 Write property test for view mode hysteresis
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
  - [ ]* 8.4 Write determinism replay integration test
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
    - `physics/ManualDriving.tsx` loaded via `import()` only during Manual_Driving; static colliders from map data, kinematic bodies for other Vehicles, dynamic van body with handling values; pure `clampManualVelocity` at `speed × (1 + manualSpeedBonus)`; `<Physics paused>` while Ticks are stopped
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
  - [ ]* 22.3 Write a Docker smoke test script
    - Build image, run compose with temp volume, hit `/api/health`, upload and fetch a save, restart, fetch again (runs on the Ubuntu host or where Docker is available)
    - _Requirements: 25.16, 43.1, 43.2, 43.4_

- [ ] 23. **Checkpoint - Phase 1 complete**
  - Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build`. Ensure all tests pass, ask the user if questions arise.
  - Optional, user-triggered only: on the user's explicit request, stage specific files, commit on `main` and push to `origin`. Do not do this automatically.

- [ ] 24. Add the Phase 2 definitions pack and save migration
  - [ ] 24.1 Extend schemas and author `packages/content/data/phase2/`
    - Resources Hops, Malt; Synergy as Corporate_Resource; Business Definitions brewery, warehouse (buy/rent, reduced unstaffed load rate), market_depot, extra Pub Venue_Types; Recipes incl. Secret_Recipe BADGER'S BITE; Traits and Liabilities with reveal delays; Brands per category with per-Venue modifiers; Market config (base, bounds min > 0, spread, interval); Plot prices, construction cost/time; Acquisition, Competitor event and Questionable_Opportunity tables; Achievements ("Synergy"); Phase 2 Reveal_Triggers and Help Serve threshold
    - _Requirements: 1.8, 19.1, 30.1, 33.1, 34.1, 34.6, 35.5, 37.1, 38.1, 40.1, 46.1_
  - [ ] 24.2 Add Phase 2 state sections and the v1 → v2 migration
    - `CURRENT_SCHEMA_VERSION = 2`; `migrations/v1_to_v2.ts` inserts empty market, acquisitions, questionable, chains, boosts sections and default Sourcing_Policies; commit v1 fixtures under `packages/shared/test/fixtures/v1/`
    - _Requirements: 24.5, 24.10_
  - [ ] 24.3 Extend the required save property tests to Phase 2
    - Add v1 fixtures and generated v1 documents to Property 27; extend `arbSimState()` with Phase 2 sections for Properties 25 and 26
    - _Requirements: 24.3, 24.4, 24.10, 44.2_

- [ ] 25. Implement the Market and Sourcing_Policies
  - [ ] 25.1 Implement the `market` system and trades
    - Bounded random walk at interval via RNG, clamp sell and buy with spread, history of last 10; `marketBuy` handler reserving at Market_Depot (Order with null destination); unload at Market_Depot credits sell price with `market_sale`
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6_
  - [ ] 25.2 Write property test for Market price bounds
    - **Property 37: Market price bounds**
    - Required by Requirement 44.2
    - **Validates: Requirements 30.2, 30.3, 30.6**
  - [ ] 25.3 Implement Sourcing_Policies
    - `setSourcingPolicy` handler; "internal first" shortfall sizing from Player-owned producer and Warehouse stock on Routes; `no_internal_supply` Alert; simultaneous produce/buy/sell allowed
    - _Requirements: 31.1, 31.2, 31.3, 31.4_
  - [ ]* 25.4 Write property test for sourcing shortfall sizing
    - **Property 41: Sourcing shortfall sizing**
    - **Validates: Requirements 31.2**

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
  - [ ]* 29.7 Write unit tests for Phase 2 edge cases
    - Questionable_Opportunity with too few Humans; "open location" skipped without free Plot; firing an occupied Human rejected
    - _Requirements: 7.13, 37.3, 38.2_

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
  - [ ] 30.4 Extend the required invariant property tests to Phase 2 Commands
    - Add all Phase 2 Commands to `arbCommand` so Properties 1, 2 and 3 cover Market trades, production, Acquisitions and Questionable_Opportunity rewards; extend Property 6 generators to Phase 2 discretionary Commands
    - _Requirements: 2.5, 2.10, 2.11, 44.2_

- [ ] 31. Build the Phase 2 UI and renderer additions
  - [ ] 31.1 Implement Phase 2 Panels
    - Market (prices + trend), Brewery (missing requirements, unit cost), Acquisition offer (known Traits, "?" markers), Questionable_Opportunity (reward, cost, duration, legal-status text, no probabilities), multi-Pub summary cards, input sourcing comparison, Plot buy/construct, Warehouse buy/rent/end rental
    - _Requirements: 27.1, 27.2, 27.5, 28.1, 29.2, 29.5, 30.6, 31.5, 32.3, 37.8_
  - [ ] 31.2 Implement News_Feed, toasts, banners and Phase 2 visuals
    - News_Feed ticker, revealed HUD counters, Achievement toast, "CORPORATE CHAIN x<n> + Synergy" banner and Route highlight, Brewer animation and accumulating crates, Phase 2 Business primitives
    - _Requirements: 3.5, 29.3, 32.7, 35.4, 36.4, 37.7, 38.4, 40.2_
  - [ ] 31.3 Implement the Help Serve minigame UI
    - Touch and keyboard operable minigame inside the Pub submitting `completeMinigame`
    - _Requirements: 18.4, 18.5, 39.1, 39.2_

- [ ] 32. Add performance tooling
  - [ ]* 32.1 Write the Tick benchmark for the Phase 2 reference scenario
    - `vitest bench` with 3 Pubs, 1 Brewery, 1 Warehouse, 4 Vehicles, 60 Customers; fail above 1 ms average per Tick on desktop
    - _Requirements: 41.3_
  - [ ] 32.2 Add the in-game debug overlay
    - Average and p95 Tick time, FPS and current DPR, toggled in dev or via a hidden setting
    - _Requirements: 41.1, 41.2, 41.3_

- [ ] 33. **Final checkpoint - Phase 2 complete**
  - Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build`. Ensure all tests pass, ask the user if questions arise.
  - Optional, user-triggered only: on the user's explicit request, commit and push. Do not do this automatically.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. The property tests mandated by Requirement 44.2 (tasks 4.2, 5.2, 6.3, 8.1, 8.2, 8.3, 16.3, 16.4, 16.7, 24.3, 25.2, 30.4) are deliberately not optional, and neither are the Gold-limit test (3.14) and the Text_Key coverage test (10.8).
- Model hand-off: tasks 1–11, 14, 16 and 20 are the foundation built first by the stronger model. Later tasks reuse the patterns found there (handler-per-Command, systems via `TickContext`, `slotCapacity`, `pathCacheFor`, `t()`), follow `.kiro/steering/architecture.md`, and keep CI green.
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
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.5"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["1.6", "1.7", "1.8", "2.1", "3.1"] },
    { "id": 4, "tasks": ["2.2", "2.6", "3.2", "3.3"] },
    { "id": 5, "tasks": ["2.3", "3.4", "3.9"] },
    { "id": 6, "tasks": ["2.4", "2.5", "2.7", "3.5", "3.11", "3.12"] },
    { "id": 7, "tasks": ["3.6", "3.7", "4.1"] },
    { "id": 8, "tasks": ["3.8", "3.10", "3.13", "4.2"] },
    { "id": 9, "tasks": ["3.14", "4.3", "5.1", "6.5"] },
    { "id": 10, "tasks": ["4.4", "5.2", "5.3", "6.1", "6.12"] },
    { "id": 11, "tasks": ["5.4", "6.2", "6.13"] },
    { "id": 12, "tasks": ["5.5", "6.6"] },
    { "id": 13, "tasks": ["5.6", "5.7", "5.8", "5.9", "5.10", "6.3", "6.4", "6.7"] },
    { "id": 14, "tasks": ["6.8", "6.9", "6.10", "6.11", "7.1"] },
    { "id": 15, "tasks": ["7.2", "7.3", "7.4", "7.16"] },
    { "id": 16, "tasks": ["7.5", "7.6", "7.17"] },
    { "id": 17, "tasks": ["7.7", "7.8"] },
    { "id": 18, "tasks": ["7.9", "7.10"] },
    { "id": 19, "tasks": ["7.11", "7.12", "7.13"] },
    { "id": 20, "tasks": ["7.14", "7.15", "8.1", "8.2", "8.3"] },
    { "id": 21, "tasks": ["8.4", "10.1"] },
    { "id": 22, "tasks": ["10.2", "10.6", "10.7", "11.1"] },
    { "id": 23, "tasks": ["10.4", "10.5", "10.8", "11.2"] },
    { "id": 24, "tasks": ["10.3", "11.3", "12.1"] },
    { "id": 25, "tasks": ["11.4", "11.5", "12.2", "12.4"] },
    { "id": 26, "tasks": ["11.6", "11.7", "11.9", "12.3", "13.3"] },
    { "id": 27, "tasks": ["11.8", "13.1", "13.4"] },
    { "id": 28, "tasks": ["13.2", "13.5"] },
    { "id": 29, "tasks": ["13.6", "14.1"] },
    { "id": 30, "tasks": ["13.7", "13.8", "14.2", "14.3"] },
    { "id": 31, "tasks": ["13.9", "14.4"] },
    { "id": 32, "tasks": ["14.5", "16.1"] },
    { "id": 33, "tasks": ["16.2", "16.8", "16.9"] },
    { "id": 34, "tasks": ["16.3", "16.4", "16.5", "16.6", "16.10"] },
    { "id": 35, "tasks": ["16.7", "16.11", "16.12", "17.1"] },
    { "id": 36, "tasks": ["16.13", "17.2", "19.1", "19.2"] },
    { "id": 37, "tasks": ["17.3", "19.3", "19.4", "19.5"] },
    { "id": 38, "tasks": ["17.4", "19.6", "19.8", "20.1"] },
    { "id": 39, "tasks": ["19.7", "19.9", "20.2", "20.3"] },
    { "id": 40, "tasks": ["20.4", "20.5", "22.1"] },
    { "id": 41, "tasks": ["20.6", "22.2"] },
    { "id": 42, "tasks": ["22.3", "24.1"] },
    { "id": 43, "tasks": ["24.2"] },
    { "id": 44, "tasks": ["24.3", "25.1", "26.1"] },
    { "id": 45, "tasks": ["25.2", "25.3", "27.1"] },
    { "id": 46, "tasks": ["25.4", "26.2", "27.2", "28.1"] },
    { "id": 47, "tasks": ["26.3", "28.2", "29.1"] },
    { "id": 48, "tasks": ["28.3", "29.2", "29.3"] },
    { "id": 49, "tasks": ["28.4", "29.4"] },
    { "id": 50, "tasks": ["29.5", "30.1"] },
    { "id": 51, "tasks": ["29.6", "29.7", "30.2"] },
    { "id": 52, "tasks": ["30.3", "30.4", "31.1"] },
    { "id": 53, "tasks": ["31.2", "32.1"] },
    { "id": 54, "tasks": ["31.3", "32.2"] }
  ]
}
```

## Foundation hand-off notes (written after the foundation build)

Built and verified (typecheck, lint, all tests, `vite build`): tasks 1–11, 14, 16 and 20, plus parts of 12, 13 and 19 that the foundation needed to be testable.

- **Also done early:** 12 (keyboard, joystick, gestures, speed keys, fixed axes); 13.1 HUD, 13.6 Pause_Menu and "Resume Route?", 13.8 speed control and Testing toggle; 19 Save_API routes, PIN hashing/lockout, remove-pin CLI and route tests (so Sync_Service can be exercised).
- **Still open for the next model:** 13.3–13.5 Panels (Pub with Job_Slot picker, Human, Vehicle with Route editor, Supplier, Competitor, Plot, Customer, Finance). The selection state exists in `uiStore.selection`; derived numbers come from `pubMetricsView`, `vehicleDeliveriesPerMinute`, `financeSummary` and `slotCapacity` in `@hr/sim`. Then 15 (checkpoint), 17 (PWA shell), 18, 21, 22 (Docker/Tailscale) and Phase 2.
- **Where to plug in:** UI subscribes with `useSimVersion` / `useSimSelector` (5 Hz); Commands go through `bridge.loop.sim.submit(...)`; rejected Commands already show a `reason.*` toast. All text via `t()`; the lint rule rejects letters in JSX text.
- **Small deviations from the design, on purpose:**
  - Paths are stored as point polylines (`Path.pts`) instead of node lists, so walking from a mid-path position needs no special case.
  - The Simulation never computes headings for automatic Vehicles (no `atan2` in the sim); the renderer derives them from movement. Manual-driving heading comes from physics.
  - Customer arrivals are a seeded Bernoulli draw per Tick at the data-driven rate (no fixed spacing), so pubs look natural.
  - Start state enables auto-reorder at 50% for both pubs, so Thomas has something to fetch.
  - Camera yaw is 0° (looking north) in `camera.json`; change the number there if you prefer a diagonal view. It never rotates at runtime.
