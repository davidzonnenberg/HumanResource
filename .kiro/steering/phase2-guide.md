---
inclusion: auto
name: phase2-guide
description: Read before implementing any Phase 2 task (tasks 24-33 in tasks.md) of Human Resource - market, plots, warehouse, brewery, acquisitions, chains, reputation, questionable opportunities, competitor events, minigames, achievements, Phase 2 UI.
---

# Phase 2 implementation guide

Written by the foundation model so a cheaper model can build Phase 2. It **adds to** `architecture.md`, `requirements.md` and `design.md`; it does not replace them. Where the design leaves a choice open, this guide makes the choice. Follow it, and do not reinvent the decisions below. If something here contradicts a requirement, the requirement wins: stop and tell the user.

## 0. Ground rules for every Phase 2 task

1. **Read before writing.** The real code differs from the design in places (see §1). Open the file you're changing and the closest Phase 1 equivalent, and copy its pattern.
2. **Never change Phase 1 behaviour to make Phase 2 easier.** Systems stay in their reserved pipeline slots in `core/pipeline.ts`, and existing slots are never reordered.
3. **Gate every RNG-consuming Phase 2 system behind a reveal** (`isRevealed(state, reg, '<feature>')`). Until a Phase 2 reveal fires, a new game consumes exactly the same RNG stream as Phase 1. That keeps existing tests and the early game unchanged. Before the reveal, the system returns immediately.
4. **Conservation is the easiest rule to break.** Every unit that is created or destroyed calls `ledgerChange(ctx, res, ±n, cause)`. Moving units (load, unload, ownership transfer) never touches the ledger. Ledger causes:

   | Cause | Sign | Where |
   |---|---|---|
   | `order_placed` | + | existing |
   | `consumed` | − | existing pour |
   | `market_buy` | + | marketBuy reservation |
   | `market_sale` | − | unload at Market_Depot |
   | `production_input` | − | production cycle start |
   | `produced` | + | production cycle end (accepted part only) |
   | `reward` | + | Questionable reward (accepted part only) |

   Corporate resources (Synergy) live in `player.corporateResources`. They never go through the ledger and are not in `physicalTotals`.
5. **Gold.** Integer hundredths, always via `gold(ctx, ...)` / `applyGold`. Discretionary costs (plot, construction, warehouse buy or first rent, marketBuy, acquisition, questionable cost) first do `const c = requireGold(...); if (!c.ok) return { reason: c.reason, missingGold: c.missingGold };`. Mandatory costs (rental, liability, fines) apply unconditionally. Data multipliers (`priceMul`, `demandMul`) are converted to integer basis points **once at registry load** and applied with `mulDivFloor` (rewards) or `mulDivCeil` (costs).
6. **Probabilities and chances in data are integer percent (0–100)**, rolled with `rngInt(state, 0, 99) < pct`. This is easier to validate and to show without ever exposing the number.
7. **Handlers live where Phase 1 put them**: the switch in `commands/dispatch.ts` calls `handleX(ctx, cmd): Rejection | null` functions. Put Phase 2 handlers and systems in `packages/sim/src/systems/phase2/<area>.ts` (design folder layout). There is no `commands/handlers/` folder and no `reasons.ts`; `ReasonCode` lives in `commands/types.ts`.
8. **Validate fully, then mutate.** A rejected Command leaves the state byte-identical (Property 5).
9. **Text.** The sim emits only Text_Keys and params. Every new `reason.<code>`, `alert.<type>`, `news.<x>`, `toast.reveal.<feature>`, `panel.*` and `achievement.*` key goes into `packages/content/data/text/en.json`. Dynamic keys (`reason.${r}`, `alert.${t}`) are **not** checked by the coverage test, so add them by hand. Add `news|market|achievement` to regex (b) in `apps/web/test/content.test.ts` so they are checked too.
10. **Model keys.** Each new `models.json` key also needs a `MODEL_MAP` entry in `apps/web/src/render/assets/modelMap.ts` (primitive placeholder is fine). The coverage test enforces this.
11. **Verify before you say done:** typecheck, lint, the full test suite and build, from the repo root (see §9 for how to run them reliably on this PC).

## 1. Facts about the current code (differences from the spec)

- The scheduler (`core/pipeline.ts` `schedulerSystem`) **drops** due events without dispatching them, and it doesn't sort. There is no `schedule()` helper. That gets fixed in Step A.
- `newGame` creates Businesses inline. There is no reusable "create Business from def" helper yet. That gets fixed in Step A.
- **Recipe identity is lost when pouring:** `staffSystem` discards the lots returned by `takeFromStock`, `bar.push` hardcodes `recipeId: null`, and `deliverDrink` sets `currentLot.recipeId = null`. That gets fixed in Step A.
- `loadAt` only picks up Orders whose `destinationId` matches the next drop-off, so null-destination (Market) Orders are only taken by manual load. `unloadAt` requires `b.owner === v.owner` and storage. Both change in task 25.
- `originFor` checks `def.supplier`, then `type === 'brewery'` / `'market_depot'`. It will switch to def fields (Step A).
- `customerArrivalsSystem` doesn't pass `brandMultiplier`. Payment ignores `priceMul`. The repeat chance has no lower clamp.
- None of `arbCommand`, `arbSimState`, `arbRegistry` or `arbRun` exist. Test generation is `CommandChoice` + `arbChoice` + `resolveChoice` + `run()` in `packages/sim/test/helpers.ts`. **Extend those**; do not invent a parallel generator family.
- The save property tests (25/26/27) are in `apps/web/test/saves.properties.test.ts`, not in `packages/shared`. Property 27 uses a synthetic v0→v1 step that has to be rewritten (task 24.3).
- `CURRENT_SCHEMA_VERSION = 1` in `packages/shared/src/saveDocument.ts`. `MIGRATIONS = []` in `packages/shared/src/migrations/index.ts`.
- `PanelHost.tsx` routes Business panels by **def fields** (`def.supplier`, `def.pub`). Add Phase 2 branches the same way, before the fallback.
- The renderer draws every Business as a box from `def.modelKey`, with no switch on type. Crates are drawn in a single colour.
- There's no news UI and no `newsTail` in `useHud`, although `state.news` is already filled from `news` events.

## 2. Work order and model assignment

Build in this order. Each step must leave CI green. Chosen mainly on credit price (Nov 2026 model list).

| Step | Tasks | Model | Why |
|---|---|---|---|
| **A** | 24.1, 24.2 + the foundation fixes in §3 | **Sonnet 5.5** (1.3x) | Contracts: schemas, state shapes, migration, scheduler, createBusiness, lot threading. Everything else builds on these; mistakes here spread. |
| B | 24.3, 25.1, 25.2, 30.2 | Haiku 5.5 (0.06x) | Save tests, Market, Achievements. **Trial step for Haiku 5.5**: if it handles B cleanly, it keeps the rest. |
| C | 26.1–26.3 | Haiku 5.5 | Plots, construction, Warehouse |
| D | 27.1–27.2, 25.3–25.4 | Haiku 5.5 | Production, Sourcing_Policies |
| E | 28.1–28.4 | **Sonnet 5.5** (or Haiku 5.5 first to save credits) | Ownership transfer touches routes, humans, names, scheduler |
| F | 29.1–29.2 | **Sonnet 5.5** | Chain detection + naive model (Property 42) |
| G | 29.3–29.7 | Haiku 5.5 | Reputation, questionable, competitor events |
| H | 30.1, 30.3, 30.4 | Haiku 5.5 | Minigame logic, property-test extensions |
| I | 31.1–31.3 | Haiku 5.5, follow §7 strictly | Panels follow the PubPanel pattern |
| J | 32.1, 32.2, 33 | Haiku 5.5 | Bench, overlay, final checkpoint |

- Fallback: if Sonnet 5.5 gets stuck on A or F, switch to **Opus 5.5** (2x).
- Escalation: if Haiku 5.5 fails the same test twice on a task, stop and ask the user to move that task to Sonnet 5.5. Do not keep retrying.
- Not used: Auto (unpredictable cost), Opus 5 / Opus 4.5 (pricier than Opus 5.5), GPT 5.6 Sol/Terra/Luna, Haiku 4.5, MiniMax, Qwen3 (pricier or experimental).

### Session protocol (read this first in every Phase 2 session)

A session cannot switch its own model, so Phase 2 runs as a series of sessions, one model per session:

1. Find the current step: the first step in the table above whose tasks are not all ticked `[x]` in `tasks.md`.
2. Check the session's current model against that step's model.
   - **Match:** execute that step, then continue with the next steps **as long as they are assigned to the same model**.
   - **Mismatch:** tell the user which model the next step needs, and stop. A more expensive model may do a cheaper step only if the user explicitly says so.
3. After each step: verify (§9), tick the tasks in `tasks.md`, and give a one-line status.
4. When the next step needs a different model, stop and tell the user exactly which model to open, plus the prompt to paste: `Continue Phase 2 per .kiro/steering/phase2-guide.md`.

Expected sequence: Sonnet (A) → Haiku (B, C, D) → Sonnet (E, F) → Haiku (G, H, I, J).
(If E goes to Haiku: Sonnet (A) → Haiku (B–D) → Haiku (E) → Sonnet (F) → Haiku (G–J).)

## 3. Step A – foundation (strong model)

### A1. Generate v1 fixtures FIRST

Before touching any schema, write 3 v1 save fixtures from the **current** code into `packages/shared/test/fixtures/v1/`:

- `new-game.json`: `newGame(reg, 1)`
- `played.json`: seed 7, a few hires, 1,200 Ticks
- `in-debt.json`: a state with negative Gold and an open Order

Wrap each one with `buildSaveDocument(...)`. Use a one-off test script and delete it afterwards. **If you change the schema first, you can no longer produce genuine v1 documents.**

### A2. Definition schema additions (`defs/schemas.ts` + `defs/registry.ts`)

Add the fields to `businessDefSchema`. All are optional, so Phase 1 defs stay valid:

```ts
construction?: { cost: Gold; seconds: number }              // buildable via `construct`
warehouse?: { buyPrice: Gold; rentPerMinute: Gold }         // acquirable via `acquireWarehouse`
unstaffedLoadRatePerSecond?: number                         // 28.2, must be < loadRatePerSecond
marketDepot?: Record<string, never>                         // marker: Market pickup/sale point (use `{}` in JSON)
recipes?: RecipeId[]                                        // Recipes held (Secret_Recipes travel via Acquisition)
acquisition?: { askingPrice: Gold }                         // makes Businesses of this def acquirable
```

`traitDefSchema.modifiers[].stat` becomes an enum of **wired stats only**: `'repeatOrderChance' | 'premiumPrice' | 'demand'`. Do not allow stats that no code reads. Unwired ideas from 34.1 (consumption speed, production cost, brand engagement) go to `docs/wishlist.md`.

Add new top-level tables. Each gets a `RawContentInput` key, a `DefinitionRegistry` key, a JSON file in `packages/content/data/phase2/` and an import in `packages/content/index.ts` (no auto-glob):

```ts
market: {
  intervalSeconds: number;
  resources: Record<ResourceId, { base: Gold; min: Gold; max: Gold; minSpread: Gold; step: Gold }>;
}
// validate: min > 0, minSpread >= 1, min + minSpread <= base <= max, step >= 1, resource tradable

acquisitions: { intervalSeconds: [number, number]; expirySeconds: number; maxOpenOffers: number }

questionables: {
  id; nameKey; legalKey; humans: int>=1; durationSeconds; cost: Gold;
  reward: { resourceId; qty: int>0 };
  consequences: { chancePct: 0..100; delaySeconds: [number, number];
                  reputationDelta: int; fine: Gold; headlineKey }[];
}[]
questionableConfig: { refreshSeconds: number; maxOffers: int }

competitorEvents: {
  intervalSeconds: [number, number];
  events: (
    | { kind: 'openLocation'; weight; businessDefId }
    | { kind: 'changePrice'; weight; maxStep: Gold }
    | { kind: 'changePopularity'; weight; stepBp: int; minBp: int; maxBp: int }
    | { kind: 'offerForSale'; weight }
  )[];
}

minigames: {
  id; nameKey; waitingThreshold: int>=1; passScore: int>=0;
  reward: { kind: 'boost'; stat: 'serviceSpeed'; pct: 1..15; seconds: 1..60 };   // 39.2 bounds IN THE SCHEMA
}[]

chains: { windowSeconds: number; minLength: 3; synergyPerMinuteByLength: [number, number][] }  // piecewise
```

Registry pass: convert `brand.perVenue[*].demandMul/priceMul` to `demandBp/priceBp` integers. Check references: `construct` targets, `questionables[].reward.resourceId`, `competitorEvents.openLocation.businessDefId` (must have `pub`), and the `minigames` text keys.

### A3. Content pack (`packages/content/data/phase2/`)

- Resources `hops`, `malt` (storable, tradable), `synergy` (kind `corporate`, not tradable). Add model keys `crate_hops` and `crate_malt`.
- Businesses:
  - `brewery`: `construction`; inputs hops+malt, output beer; Brewer slots; one production rule with `recipeFromState: true`.
  - `warehouse`: `warehouse` block; storage for beer/hops/malt; Warehouse_Worker slot; `unstaffedLoadRatePerSecond`.
  - `market_depot`: `marketDepot: {}`, owner `npc`, no storage.
  - Pub defs get `construction` and `acquisition`, plus one extra Venue_Type pub.
- Add `hops` and `malt` to the Supplier's `sells`, so auto-reorder plus Sourcing_Policies work for Brewery inputs.
- Recipes:
  - `house_lager`: the Brewery default.
  - `badgers_bite`: `secret: true`, trait `repeatOrderChance +15`. Put it in the Competitor Pub def's `recipes`.
- Traits, including one Liability (`cellar_repairs`, cost `160000` = 1,600 Gold, `revealDelaySeconds`). **Rule: a trait or recipe with `revealDelaySeconds` (recipes: `secret`) is a hidden attribute until revealed.**
- One Brand per category, with per-Venue modifiers. Achievement "Synergy" (`corporateResourceAtLeast synergy 100`).
- Phase 2 reveal triggers (numbers are data, tune freely):

  | Feature | Suggested condition | Unlocks |
  |---|---|---|
  | `warehouse`, `market` | existing `storage_responses` trigger (19.4), extended to phase 2 | Warehouse buy/rent, Market panel, market system |
  | `expansion` | `goldAtLeast` | Plot buy / construct |
  | `brewery` | `ownedBusinessCountAtLeast pub 2` | Brewery construction |
  | `acquisitions`, `competitor_events` | `ownedBusinessCountAtLeast pub 2` | offers + competitor events |
  | `questionable` | `tickAtLeast` | questionable offers |
  | `news_feed` | first `news` event | HUD ticker |
  | `synergy_counter` | `event chainRegistered` | HUD Synergy counter |
  | `reputation_counter` | first reputation change | HUD Reputation counter |

  Each feature needs `toast.reveal.<feature>` in en.json.
- **The Market_Depot needs a plot.** Add a `reserved` plot to `maps/districts/old_town.json` and put the depot in `start-state.json`.

### A4. State additions (`state/types.ts`, `state/schema.ts`, `newGame.ts`)

Sections are optional in zod (`.optional()`), but `newGame` always creates them. Systems return early when a section is absent. No `undefined` values: omit the key instead.

```ts
market?: { prices: Record<ResourceId, { buy: Gold; sell: Gold; history: Gold[] /* sell prices, last 10 */ }>; nextUpdateTick: Tick }
acquisitions?: { offers: Record<Id, AcquisitionOffer>; nextOfferTick: Tick }
  AcquisitionOffer = { id; businessId; askingPrice: Gold; expiresTick: Tick;
                       knownTraits: TraitId[]; hidden: { kind: 'trait' | 'recipe'; id: string }[] }
questionable?: { offers: Record<Id, { id; defId; expiresTick }>; running: Record<Id, RunningQuestionable>; nextRefreshTick }
  RunningQuestionable = { id; defId; humanIds: Id[]; destinationId: Id; doneTick: Tick }
chains?: { edges: Record<string /* "fromId>toId" */, number /* last game second with flow */>;
           registered: Record<string /* nodes joined by ">" */, CorporateChain>; synergyCarry: number }
  CorporateChain = { key; nodes: Id[]; length; active: boolean; lastFlowSecond }
boosts?: { businessId; stat: 'serviceSpeed'; pct: int; untilTick: Tick }[]
reputationPending?: { delta: int; causeKey: string }[]
// on existing records:
Business.production?: { ruleId; recipeId: RecipeId | null; progressTicks; running; started: boolean; missing: string[] }[]
Business.rental?: { feePerMinute: Gold; carry: number }
Business.recipes?: RecipeId[]
Plot.construction?: { defId; doneTick }
competitors[*].nextEventTick?: Tick;  competitors[*].popularityBp?: int   // default 10000
```

Extend `checkGoldLimit` to the new Gold fields (offer prices, market prices, rental fee, rental carry). New id prefixes: `off`, `qo`, `run`.

### A5. Migration v1 → v2 (`packages/shared/src/migrations/v1_to_v2.ts`)

- It is a pure JSON function. Old shapes are typed **locally** in the file; it never imports from `@hr/sim`.
- It inserts empty `market` (prices at data base values **copied as literals** into the migration), `acquisitions`, `questionable`, `chains`, `boosts: []`, `reputationPending: []`, and default `sourcing` entries for any input that lacks one.
- It inserts the depot plot and the Market_Depot Business as literal JSON (id from `idCounters.biz + 1`, then bumps the counter, with a fixed literal name). Migrations freeze knowledge from their own time. That's intended.
- Register it in `MIGRATIONS` and bump `CURRENT_SCHEMA_VERSION` to 2.
- Done when all three A1 fixtures migrate, then pass `simStateSchema` **and** `checkInvariants`.

### A6. Scheduler and createBusiness (`core/`)

- Add `schedule(ctx, kind, fireTick, payload)` with `seq = ++state.schedulerSeq`.
- `schedulerSystem` sorts the due events by `(fireTick, seq)` and dispatches each through a `switch(kind)` to functions registered per area: `constructionDone`, `revealAttribute`, `questionableDone`, `consequence`. An unknown kind throws in dev and test.
- Extract `createBusiness(ctx | state+reg, defId, plotId, owner): Business` from `newGame`. It covers storage, job slots, sourcing defaults, brand, traits (with `hidden` per the A3 rule), recipes, production entries, the pub runtime and the name from `nameTable` via RNG.
- **Before refactoring, snapshot `newGame(reg, s)` for 5 seeds in a test; afterwards they must be deep-equal.** The RNG draw order must not change.
- `newGame`, `construct`, `acquireWarehouse` and Competitor `openLocation` all use `createBusiness`. There is one code path for every Business type.

### A7. Lot threading (fixes the recipe-identity loss)

- Pour keeps the lot returned by `takeFromStock(stock, 1)`. Store `{recipeId, origin}` on the order-queue entry, then on the bar entry, then `deliverDrink` copies it to `customer.currentLot`.
- `originFor(def)`: `def.supplier` → `'supplier'`, `def.marketDepot` → `'market_depot'`, `def.productionRules.length > 0` → `'brewery'`, else `'business'`.
- Phase 1 behaviour is unchanged (all start lots have `recipeId: null`). Property 39 (FIFO pouring) becomes testable.

## 4. Steps B–D (cheap model)

### Market (25.1, 25.2)

- `market` system: return unless `isRevealed('market')` and the section exists. At `nextUpdateTick`, for each resource in data order:
  1. `sell += rngInt(-step, step)`
  2. clamp `sell` to `[min, max - minSpread]`
  3. `buy = sell + minSpread`
  4. push `sell` to `history` and keep the last 10
  5. reschedule.
  No transcendental maths.
- `marketBuy`:
  - Reject `invalid_quantity` unless the quantity is a positive integer, `not_available` unless revealed.
  - Cost = `buy * qty`. Call `requireGold`.
  - Create an Order `{sourceId: <depot id>, destinationId: null}`, `ledgerChange(+qty, 'market_buy')`, `gold(-cost, 'purchase', depotId)`.
- `loadAt` at a source: also accept the owner's Orders with `destinationId === null`. The amount stays bounded by cargo space and the next drop-off's free capacity.
- `unloadAt` at a `marketDepot` Business:
  - Sell all cargo of tradable resources the stop allows, with no capacity limit. Credit `sell * qty` via `gold(+, 'market_sale', depotId)` and record `ledgerChange(-qty, 'market_sale')`.
  - Skip the owner check for depots only.
  - In `loadAt`, treat the depot's free capacity as unlimited when it is the next drop-off.
- Manual unload in the depot zone sells the same way.
- **Property 37** (required): run many updates with arbitrary data-valid bounds. Assert `buy > sell`, both in `[min, max]`, and history length `min(10, updates)`.

### Achievements (30.2)

`achievements` system: for each def not yet in `state.achievements`, evaluate `condition` with `evaluateCondition`. When true, append it and emit `achievementAwarded`. No RNG.

### Plots and construction (26.1)

- `buyPlot`: the plot must be `for_sale` in an unlocked District (`district_locked`) and the feature revealed. Cost `plot.price`. Then `status: 'empty', owner: 'player', price: null`.
- `construct`:
  - The plot must be player-owned and `empty` (else `slot_occupied`). The def needs `construction` and owner `any|player`, and its `locationConstraints.plotTags` must fit the plot tags (else `not_allowed`).
  - Cost `construction.cost`, category `construction`.
  - Set `status: 'under_construction'`, set `construction`, and schedule `constructionDone`.
- `constructionDone`: `createBusiness(defId, plotId, 'player')`, then `status: 'occupied'`, `businessId`, and emit news.
- Renderer: an `under_construction` plot shows a low scaffold box (new model key `plot_construction`).

### Warehouse (26.2)

- `acquireWarehouse {plotId, mode}`: the plot is `empty` and either unowned or player-owned; the def is the first one with a `warehouse` block that fits the plot tags.
  - `buy`: cost `buyPrice`, category `purchase`.
  - `rent`: first fee = `rentPerMinute`, category `rental`, charged now; then `rental: {feePerMinute, carry: 0}`.
  - Create the Business immediately (no construction).
- Rent in `finance`: the same carry pattern as salary (`carry += feePerMinute; charge = floor(carry / (60*tps)); carry -= charge*60*tps`), category `rental`. It applies even in debt.
- `endRental`:
  - Reject `storage_not_empty` if any stock > 0 **or** any open Order has this destination.
  - Otherwise: unassign its Humans; remove it from every Route's stops (a Route with fewer than 2 distinct stops is deleted and its Vehicle parks); delete the Business; the plot goes back to `empty`, owner `null`.
- Load rate: when no working Warehouse_Worker (`slotCapacity` over the def's warehouse job slots) is present, use `unstaffedLoadRatePerSecond`.

### Production (27.1, 27.2)

Per Business with `production` entries, for each rule:

1. **Not started.** Compute `missing`:
   - `input:<res>` for each input with `stock < rule.inputs[res]`
   - `workers:<job>` if working capacity (`slotCapacity` of working fills of `requiredJob`) < `requiredWorkers`
   - `output:<res>` if free capacity < `rule.outputs[res]`

   If `missing` is empty, take the inputs (`takeFromStock`, `ledgerChange(-q, 'production_input')`), set `started: true, progressTicks: 0, running: true`.
2. **Started.** Advance `progressTicks` only while the workers are present (otherwise `running: false`, `missing` = `workers:<job>`). At `cycleSeconds`, add outputs with `addToStock` as lots `{recipeId: entry.recipeId, origin: 'brewery'}`, then `ledgerChange(+accepted, 'produced')`. If output space is now short, keep the remainder in progress (don't discard it). Stay completed-but-blocked with `missing = output:<res>` and retry each Tick, adding the remainder as space frees up.

`setProductionRecipe`: the recipe must be in `player.recipes` (or the Business's recipes) and have `product` equal to the rule output. Unit cost metric (29.4): over a 300 s ring buffer, input cost = consumed input qty × the **current** Supplier unit price for that input (Market buy price if no Supplier sells it), plus Brewer salary per second. Divide by Beer produced; show `n/a` if 0. This simplification is deliberate: no per-lot cost tracking.

**Property 40** is defined against this start-consume model.

### Sourcing_Policies (25.3, 25.4)

- `setSourcingPolicy`: owned Business; the resource must be one of the def's `inputs`.
- In `sourcing` (auto-reorder only; manual `placeOrder` is unaffected):
  - `buy_external`: unchanged.
  - `internal`: never auto-orders externally.
  - `internal_first`: `qty = min(max(0, want − internalAvailable), affordable)`.

  `internalAvailable` = the sum of stock of `res` at Player Businesses that are producers (`productionRules.length > 0`) or have a `warehouse` block, **and** appear as a pickup stop on a Player Route that also has this Business as a drop-off allowing `res`.
- `no_internal_supply` Alert (type string, key `no_internal_supply@<businessId>`): policy `internal` and no such Route exists.

## 5. Steps E–G

### Acquisitions (28) – strong model preferred

- System, gated on `acquisitions`: at `nextOfferTick` (interval drawn with `rngInt`), if open offers < `maxOpenOffers`, pick a random non-player Business whose def has `acquisition` and that has no open offer.
  - Offer: `askingPrice` from the def; `knownTraits` = the non-hidden traits; `hidden` = the hidden traits + secret recipes; `expiresTick`.
  - Expired offers are deleted.
  - Emit news.
- `acceptAcquisition`:
  - Reject `offer_expired` if the offer is missing or past expiry. Cost via `requireGold`, category `acquisition`.
  - Then, in one handler:
    1. `owner = 'player'`.
    2. Every Human in its job slots: `owner = 'player'`, name via `uniqueInWorkforce`. Headcount fills stay headcount.
    3. Customers present stay (they belong to `pubId`).
    4. Brand: add `brandId` to `player.availableBrands` if new.
    5. Recipes: add to `player.recipes` only **when revealed** (secret ones), otherwise immediately.
    6. Storage stays as is (no ledger entry).
    7. Remove this Business from every Competitor Route (same "fewer than 2 stops → delete Route" rule as `endRental`).
    8. For each hidden attribute, `schedule('revealAttribute', tick + rngInt(delay), {businessId, kind, id})`.
    9. Delete the offer and emit news.
- `revealAttribute`: set `hidden: false` (trait) or add the recipe to `player.recipes`, then news. If the trait has a `liability`, `gold(-cost, 'liability', businessId)` once.
- Brand and Recipe modifiers (28.3):
  - Arrivals pass `brandMultiplier = demandBp/10000` for `b.brandId` at the Pub's `venueType`, times `popularityBp` for Competitors.
  - Payment per drink = `mulDivFloor(price, priceBp, 10000)`, plus the `premiumPrice` trait of the drink's recipe.
  - Repeat chance = `clamp(base + Σ repeatOrderChance addPct / 100 of currentLot.recipeId, 0, cfg.repeatChanceMax)`.

### Chains (29.1, 29.2) – strong model

- **Recording:** in `loadAt` / `unloadAt`, when qty > 0 and both ends are Player-owned, set `chains.edges["<from>><to>"] = currentGameSecond`. Load records Business→Vehicle, unload Vehicle→Business.
- **Detection, once per game second:**
  1. Active edges are those with `second − last ≤ windowSeconds`.
  2. Build the adjacency, sorted by key for determinism.
  3. Enumerate maximal simple paths by DFS from every node with no active in-edge. Nodes that are only in cycles start from their lowest id.
  4. Keep the paths with `length ≥ minLength` that are not a strict sub-path of another kept path.
  5. Each one is registered or updated in `registered[key]` as active. Registered chains not found this second become `active: false`.
- Emit `chainRegistered {length, routeIds}` on a new key or a longer length.
- **Synergy:** per Tick, `synergyCarry += Σ rate(length)` of active chains (piecewise, per minute). Then `whole = floor(synergyCarry / (60*tps))`, add `whole` to `corporateResources.synergy` and subtract it from the carry.
- **Property 42:** the test writes its own **brute-force** model (enumerate every simple path over the active edges, filter by length and maximality) and compares it to the system on random flow histories. Don't reuse the production DFS in the test.

### Reputation (29.3)

- `changeReputation(state, delta, causeKey)` only pushes to `reputationPending`.
- The `reputation` system (slot 17) applies the pending entries in order: integer, clamped 0–100. It emits news `news.reputation` with the cause, then clears the queue.
- Because arrivals (slot 8) already ran this Tick, "from the next Tick" (36.3) holds automatically.
- With Phase 1 content nothing pushes, so reputation stays 50 (36.2).

### Questionable_Opportunities (29.4)

- System, gated on `questionable`: refresh offers at `nextRefreshTick` up to `maxOffers` (`rngPick` over the defs) and drop expired ones.
- `startQuestionable`:
  - Reject `unknown_entity` / `offer_expired`. Reject `insufficient_humans` if fewer than `def.humans` **distinct** player Humans that are not `occupied`. The destination must be a Player Business with storage for the reward resource (else `not_allowed`). Then `requireGold`.
  - On success, for each Human:
    - clear its Job_Slot (both sides of the link)
    - `status: 'occupied'`, `task: {kind: 'questionable', runId}`, `assignment: null`
  - Create `running`, schedule `questionableDone`, delete the offer, `gold(-cost, 'other', ...)`.
- `questionableDone`:
  1. `addToStock` the reward as a lot with origin `reward`; `ledgerChange(+accepted, 'reward')`. Discard the excess **without** a ledger entry, since it was never created.
  2. Humans: `status: 'unassigned'`, `task: null`.
  3. For each consequence in data order, roll `rngInt(0, 99) < chancePct`. On a hit, schedule `consequence` at `tick + rngInt(delay)`.
- `consequence`: `changeReputation(delta, headlineKey)`, `gold(-fine, 'fine', 'corporate')`, news `headlineKey`.
- **The UI never shows `chancePct`** (37.8).

### Competitor events (29.5)

- System, gated on `competitor_events`. Per competitor at `nextEventTick` (interval via `rngInt`), make a weighted pick: `r = rngInt(0, totalWeight − 1)`, walk the cumulative weights.
  - `openLocation`:
    - Pick a free plot (`empty`, owner null, unlocked District, tags fit) via `rngPick`. If there is none, **skip** (38.2).
    - `createBusiness(def, plot, competitorId)`. Fill each job slot with a **headcount** fill (`count: 1`): no walking figures, no economics.
    - Append it as a drop-off to that Competitor's existing van Route.
  - `changePrice`: pick a Competitor Pub. `price += rngInt(-maxStep, maxStep)`, clamped to the def's `[minDrinkPrice, maxDrinkPrice]`.
  - `changePopularity`: `popularityBp += ±stepBp`, clamped to `[minBp, maxBp]`.
  - `offerForSale`: create an Acquisition_Offer for a random Competitor Business (it reuses the acquisitions offer builder).
- Every event emits news with `{competitor: nameKey}`. No Gold, revenue or valuation for Competitors, ever (38.6).

## 6. Step H – minigames and test extensions

- `completeMinigame`:
  - Reject `not_available` unless the CEO is inside that Player Pub and waiting Customers > `waitingThreshold`. `score < passScore` is accepted and has no effect.
  - Otherwise replace any existing boost for that Business with `{pct, untilTick}`.
  - The UI score is trusted only as pass/fail.
- `minigames` system: delete expired boosts.
- `staff`: bartending ticks = `ceil(interval * 100 / (100 + pct))` while a boost is active.
- `contextActionFor` returns `HelpServe` in exactly that condition (Property 22).
- **30.4:** extend `CommandChoice`, `arbChoice` and `resolveChoice` in `packages/sim/test/helpers.ts` with every Phase 2 Command.
  - Add a `phase2Sim(seed)` helper: lots of Gold, all Phase 2 reveals fired, plus a Brewery, a Warehouse and a second Pub built via Commands.
  - Properties 1, 2, 3 and 6 then run on both `freshSim` and `phase2Sim`.

## 7. Step I – UI (follow these patterns exactly)

- **Panels:**
  - One file per panel in `apps/web/src/ui/panels/`, with the signature `({reg, state, b, onClose})` like `PubPanel`.
  - Use only `Panel`, `Card`, `Row`, `Bar` and `PanelButton` from `ui/components/Card.tsx`.
  - At most 8 rows per card, no tables, 44 px targets, keyboard-focusable buttons.
  - Commands go through new helpers in `panelActions.ts`. Panels never handle rejections: `simBridge` already toasts `reason.*`.
  - Route in `PanelHost.tsx` by def field: `def.marketDepot` → `MarketPanel`; `def.productionRules.length` → `BreweryPanel`; `def.warehouse` → `WarehousePanel`. Plot buy/construct/rent go into the existing `PlotPanel`.
  - Gate each panel and button with `isRevealed`.
- **Specific panels:**
  - Acquisition: one "?" row per hidden attribute; never the hidden names.
  - Questionable: reward, cost, duration, legal text; **no probabilities**.
  - Multi-Pub summary cards in Management_View, only when the player owns more than 1 Pub.
  - Input sourcing comparison: external unit price vs. Brewery unit cost.
- **News_Feed:** add `newsTail` (last 5) to `useHud`, filled in `simBridge.publish`. A ticker component goes in `Hud.tsx`, shown only when `news_feed` is revealed. It uses `aria-live="polite"`.
- **Toasts and banners:** in the existing `onDomainEvents` effect in `Hud.tsx`, add `achievementAwarded` → toast `achievement.<id>.name` + description, and `chainRegistered` → banner `banner.chain {length}` plus highlight of `routeIds` in `ManagementOverlay`.
- **Renderer:**
  - New Business types render through `modelKey` automatically.
  - Brewer animation: inside `Building`, next to the `pub` layout branch, add a `productionRules.length` branch that bobs Brewer figures while `production[0].running`.
  - Per-resource crate colours: give `crate_hops` / `crate_malt` their own InstancedMesh or instance colour.
- **Help Serve UI** (31.3): a modal overlay for 10 real seconds. Glasses appear, the player taps or presses Space/Enter to serve, score = served count. Submit `completeMinigame` at the end. While open it pauses no simulation; the sim keeps running.

## 8. Step J

- **Bench** (32.1): `packages/sim/bench/tick.bench.ts` with `vitest bench`, built from `phase2Sim` plus 60 Customers, failing above 1 ms average. Keep it out of `npm test`.
- **Debug overlay** (32.2): time `runTick` in `GameLoop.ts` with `performance.now()` into a 300-sample ring (avg, p95). Expose FPS/DPR from `AdaptiveDpr` refs. Shown when `isDevMode(...)` is true.

## 9. Verification on this PC

- Run from the repo root: `npm.cmd run typecheck`, `npx.cmd eslint .`, `npm.cmd run build`, then tests.
- `execute_pwsh` output is unreliable here: it reports exit −1 even on success and often ignores `cwd`. For tests, start a **background** process at the repo root with `node .\node_modules\vitest\vitest.mjs run` and poll its output until the `Test Files` summary appears.
- Don't run vitest from `apps/web`.
- Don't commit or push unless the user asks.

## 10. Definition of done per task

- Behaviour matches every acceptance criterion the task cites (re-read them in `requirements.md`).
- Required property tests pass: 24.3, 25.2, 30.4, plus all Phase 1 ones, especially 1, 2, 3, 25, 26, 27.
- New text and model keys are covered (content test green).
- No Phase 1 test expectation was changed to make Phase 2 pass. If one must change, explain why to the user.
- Tick the task checkbox in `tasks.md`.

## 11. Step A – completed (notes for the next sessions)

Step A (24.1, 24.2 and the foundation fixes) is done and verified (typecheck, lint, 160 tests, build). What the cheaper model needs to know:

- **v1 fixtures** are in `packages/shared/test/fixtures/v1/` (`new-game`, `played`, `in-debt`). `apps/web/test/migrations.test.ts` migrates all three, then runs `simStateSchema` + `checkInvariants` + 300 Ticks. Task 24.3 should reuse these.
- **Golden Phase 1 state:** `packages/sim/test/newgame-golden.test.ts` compares `newGame(reg, 1..5)` (minus the documented Phase 2 additions) with `fixtures/newgame-phase1-golden.json`. If it fails, you changed the RNG draw order or a Phase 1 default. Do not regenerate the golden to make it pass.
- **Content** lives in `packages/content/data/phase2/` and is appended after Phase 1 data in `packages/content/index.ts`. Existing Phase 1 files changed only where noted: `vehicles.json` (van carries hops and malt), `businesses.json` (`construction`/`acquisition` on both Pubs, `recipes: ["badgers_bite"]` on `pub_sports`, hops and malt sold by the Supplier), `reveal-triggers.json` (`storage_responses` now also reveals `warehouse` and `market`), `models.json`, `start-state.json` and `old_town.json` (`plot_depot` and the Market_Depot, created last so ids and RNG are unchanged).
- **Reveal feature names** (use exactly these in `isRevealed`): `warehouse`, `market`, `expansion`, `brewery`, `acquisitions`, `competitor_events`, `questionable`, `news_feed`, `synergy_counter`, `reputation_counter`. `acquisitions` and `competitor_events` and `brewery` all come from the `second_pub` trigger (2 owned Pubs).
- **Market `base` is the starting BUY price**, the starting sell price is `base - minSpread`. A walk clamps `sell` to `[min, max - minSpread]` and sets `buy = sell + minSpread`. `history` starts empty, so its length is `min(10, updates)`.
- **`createBusiness(state, reg, defId, plotId, owner, opts?)`** is in `packages/sim/src/state/createBusiness.ts`. It registers the Business and links the Plot (`occupied`, owner, `businessId`, price null, clears `construction`). Use it everywhere; never build a Business by hand. A name table with exactly one entry uses no RNG (the depot relies on that).
- **Hidden attributes:** `createBusiness` marks a trait `hidden: true` when it has `revealDelaySeconds` **and the owner is not the Player**. `pub_student` (owner `competitor`, acquisition only, no `construction`) carries `hidden_gem` and the `cellar_repairs` Liability. Secret recipes are tracked on `Business.recipes`; the offer's `hidden` list is built from `recipe.secret`.
- **Scheduler:** `schedule(ctx, kind, fireTick, payload)` and `schedulerSystem` are in `packages/sim/src/core/scheduler.ts`. The four kinds are `constructionDone`, `revealAttribute`, `questionableDone`, `consequence`. Their handlers are **stubs that throw** in `systems/phase2/construction.ts`, `acquisitions.ts` and `questionable.ts`; the task that first schedules a kind must replace its stub. The state schema only accepts those four kinds, so add a new kind in `scheduledKindSchema` and in the `switch`.
- **Lot threading:** `order.lot` is set when pouring starts; `systems/lots.ts` (`drinkLotFor`, `barEntryFor`) reads it. `deliverDrink` now copies the real `{recipeId, origin}` to `customer.currentLot` (origin is `start` or `supplier` instead of the old hardcoded `business`).
- **State:** new sections (`market`, `acquisitions`, `questionable`, `chains`, `boosts`, `reputationPending`) exist in every new game. `Business.production` is created by `createBusiness` for Definitions with production rules (default recipe = first of `def.recipes`). `competitors[*].nextEventTick` is **absent** until the competitor system sets it lazily after its reveal.
- **Corporate resources** (`synergy`) are excluded from `resourceTotals`.
- **Domain events** `chainRegistered` and `reputationChanged` exist in `core/events.ts`; the reveal triggers read them by name.
- `content.test.ts` now also checks string literals starting with `news.`, `market.` and `achievement.`.
- New ReasonCodes were not needed. Keys for `reason.not_allowed`, `reason.not_available` and `alert.no_internal_supply` already exist in `en.json`.
