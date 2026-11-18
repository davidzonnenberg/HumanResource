# Idea backlog (to review and replan as tasks)

These ideas are near-term candidates, not commitments. They become tasks in `.kiro/specs/human-resource-mvp/tasks.md` only after a full review and replan. Far-future ideas stay in `docs/wishlist.md`. Everything here must follow `.kiro/steering/architecture.md`: content lives in data, there is no id special-casing, player input arrives as Commands, and Gold is in integer hundredths.

Added by the user, Nov 2026.

## 1. The opening: "Grand Opening" pre-launch checklist (new game start)

The game no longer starts with a running pub. At the start you have no employees and the bar is not open yet. The pub is about to open, but first you have to arrange a few things.

The HUD shows a short "Grand Opening" checklist. Every item sends you to a building:

| Stop | What you do there | What it unlocks |
|---|---|---|
| Municipality | Get the liquor license and pick an opening time | The pub can open. Later on: permits, plots, terraces |
| Bank | Choose a starter loan (small and safe, or big and risky) | Starting Gold plus a repayment cost. Your first real decision |
| Supplier | Sign the first supply deal and load the first crates yourself | The supplier panel and ordering |
| Job centre / café notice board | Interview candidates. Jan, Julia and Thomas each have one visible quirk | Hiring and job slots |
| Back at the pub | Unload the crates and cut the ribbon | Customers start arriving |

Notes:
- Refined in section 7.4 by the bar redesign: license tiers, the loan as a fit-out budget, a new pub fit-out stop, and a keg deal. Section 7.4 wins where they differ.
- This replaces the current start state, where Jan, Julia and Thomas are already hired and the pub is already open. Requirement 3 (Game Start State) and `start-state.json` need to change.
- It fits the existing emergent-reveal idea: the checklist is a chain of reveals.

## 2. Unlock menu with vague hints

- Every unlock (reveal) is listed in a menu.
- An entry does not say exactly what to do. It shows a vague introduction or explanation, so you can sometimes guess what triggers it and sometimes not really.
- Already unlocked entries show what they gave you. Locked ones show only the teaser.
- Data: add a teaser text key and a description text key to each reveal definition (`reveal-triggers.json`). All text goes through `t()`.

## 3. After opening: the CEO keeps working outside

Staff run the pub, and you keep handling the jobs nobody else can do:

- **Emergency supply runs.** Thomas isn't hired yet, or he's busy, so you drive the beer yourself. Hiring a driver is the first relief, and it frees up the van for you.
- **Municipality requests.** "Noise complaint: come explain yourself", or "A terrace permit is available, apply in person." Turning up physically is the cost.
- **Bank meetings.** Loan repayments, refinancing, and later the money to buy plots and acquire businesses.
- **Scouting.** Drive past the rival pub and the for-sale plots and inspect them. That leads into acquisitions.
- **Deliveries for tips or contracts.** Side jobs for other businesses with your van while the pub runs itself.

The core tension is that you're the only one who can visit the municipality and the bank, and the only driver until you hire one. Delegating driving gives you time to make deals, so hiring stays a clear upgrade.

### Why this fits the architecture
- **New buildings are plain Business definitions.** The municipality, bank and job centre have owner `npc` and no storage, like `market_depot`. They get a marker field, for example `office: { services: [...] }`, and their ids stay out of system code.
- **Interactions are Commands given at the door.** They reuse the existing context action (Enter, then a panel with options). Examples: `applyLicense`, `takeLoan`, `interviewCandidate`.
- **The checklist is a set of reveals.** For example, `licenseGranted` reveals `pub_open`. Customer arrivals are gated on `isRevealed('pub_open')`, so it's all data.
- **Loans need new state.** That means a debt record plus repayment through finance, using the salary carry pattern. Plan a v3 save migration.
- **Municipality visits later reuse the scheduler.** Inspections, permits and the consequences of questionable choices can all land as "come to the town hall".

### Extra satire to go with it
- The municipality has a ticket-number queue. Pressing E repeatedly does nothing faster.
- The bank's loan options are named "Sensible", "Ambitious" and "Visionary™".
- At the job centre, candidates' CVs list "passionate about synergy".
- When automation arrives later, you can hire a "Head of Errands", who takes over the municipality runs. Even your CEO tasks become headcount.

## 4. Make it feel alive (cheap, big impact)

- **Make customers readable.**
  - Thought-bubble icons: 🍺 waiting, 😤 angry, 💰 paid.
  - A coin pop with a sound when someone pays. Players need to see money arriving.
- **Give named Humans personality.**
  - Each start Human gets one quirk in data, for example "Jan hums while pouring" or "Thomas takes the long route past the bakery".
  - Add tiny speech bubbles.
  - Headcount fills get no quirks, so automation literally drains the personality out. That's the satire, shown without words.
- **Let something happen outside.** Right now nothing is visible from the street, because work only shows in the interior view. Ideas:
  - a queue at the door when it's busy
  - a glow in the windows
  - cheering from the sports pub
  - the rival owner leaning in the doorway
- **End-of-day summary.**
  - Even without time of day, show a card every X minutes with served, lost and profit.
  - Add one stupid "employee of the month" award.
  - It's a natural pause point.

## 5. Satire hooks that reuse existing systems

| Idea | Reuses | Hook |
|---|---|---|
| Consultant visit | Questionable opportunity | Pay Gold for a "report" whose effect is random and sometimes negative |
| Team-building day | Questionable opportunity | Staff are unavailable for 2 minutes, then work slightly faster |
| Rival poaches staff | Competitor event | "Julia got an offer from Badger's. Counter-offer?" |
| Health inspector | Scheduled consequence | Shows up a while after you cut corners |
| Loyalty card | Trait `repeatOrderChance` | Small cost, more regulars |
| Happy hour button | Price setting plus a timer | Short demand spike that tests your staffing |
| LinkedIn-style news feed | `news_feed` | "Local pub CEO 'humbled' to announce second crate of beer" |

## 6. Foundation upgrades (for soon, before much more content)

These are engine changes, not features. Doing them before the Grand Opening, offices, permits and council features means those become mostly JSON.

### 6.1 One generic Modifier system
- **Problem.** Traits, brands, permits, boosts, morale and council policies all change stats, but each has its own wiring today (`brandMultiplier` / `premiumPrice` in `defs/formulas.ts`, `boosts` in state).
- **Shape.**
  ```ts
  Modifier = { source: SourceRef; target: TargetSelector; stat: StatId; op: 'addBp' | 'addFlat'; value: int; untilTick?: Tick }
  getStat(state, reg, targetId, stat) // base from def + sum of active modifiers, integer basis-point math
  ```
- **Rules.**
  - `StatId` is a closed enum of stats that a system actually reads. This matches the current rule that the schema rejects modifier stats no system reads.
  - Every new feature only adds modifiers, so systems never need to know about permits or policies.
- **Free extra.** A "why is this number this?" tooltip in the UI: list the base value and every modifier with its source. This helps debugging and helps players.
- **Cost.** Active modifiers with `untilTick` live in state, which means a save migration. Existing traits and brands must keep exactly the same numbers, and a property test should prove it.

### 6.2 Generic Interaction/Service definitions for buildings
- **Problem.** Writing a Command per building (`takeLoan`, `applyPermit`, `signContract`) means a new handler for every new service.
- **Shape.** Define services in data instead:
  ```json
  "services": [{ "id": "terrace_permit", "requiresPresence": true, "cost": 50000,
    "conditions": [...], "effects": [{ "kind": "addModifier", ... }, { "kind": "schedule", ... }] }]
  ```
- **One Command.** A single `useService { businessId, serviceId }` Command. `requiresPresence` checks that the CEO is at the door or inside, using the existing door logic.
- **Effects.** A small, closed vocabulary: `gold`, `addModifier`, `reveal`, `schedule`, `grantResource`, `news`.
- **Reuse.** Questionable opportunities, consequences, achievements and goals can all reuse it. New content then mostly means JSON, with no new handlers.
- **Fit with the planned offices.** The `office: { services: [...] }` marker idea in section 3 becomes exactly this.

### 6.3 Conditions and effects as a shared mini-DSL
- **Conditions.** `evaluateCondition` (`conditions/evaluate.ts`) already serves reveals and achievements. Make it the single place for conditions.
- **Effects.** Add an `applyEffects` twin.
- **One engine.** Reveals, achievements, goals, services, consequences and council votes then share one tested engine.
- **Property tests.**
  - Random conditions never throw and never consume RNG.
  - Effects always go through `applyGold`, and Gold stays inside `GOLD_LIMIT`.

### 6.4 Command log and replay
- **What.** Because the sim is deterministic, a save can also store the seed plus `commands[]`, or periodic snapshots plus a command tail.
- **Uses.**
  - **Bug reports:** when the girlfriend hits a bug, replay her exact session.
  - **Regression tests:** record a 10-minute "golden playthrough" and assert the final state hash in CI. This catches balance and RNG-order changes that unit tests miss. The golden hash has to be re-recorded on purpose when balance changes.
  - **Desync detection:** a state hash every N ticks (a cheap FNV hash over the canonical JSON) shows where PC and phone diverge.
- **Size.** Per-tick `ceoMove` and `manualVehicleUpdate` dominate the log, so compress runs of identical moves, or keep only a rolling command tail.
- **Determinism caveat.** Manual-driving poses come from Rapier in the browser. Replay feeds the recorded poses back as Commands, so it still reproduces exactly.

## 7. Bar system redesign (user, Nov 2026; to become new tasks or redesigns)

This replaces the current bartender + server split. It also refines the checklist table in section 1: where they differ, this section wins.

### 7.1 The Bar Worker job
- **One job, one loop per worker:** take order → pour → hand over or deliver → take payment → clean when idle.
- **No extra rules for throughput.** It comes from walking distance plus pour time, so layout and service style matter on their own.
- **Start candidates.** Jan and Julia are both Bar Worker candidates, and Thomas is the driver. You hire only one Bar Worker at the start, so the choice means something.

### 7.2 The three capacity numbers
The pub panel shows the bottleneck at a glance:
- **Seats:** how many customers can stay.
- **Taps:** how many drinks can be poured at the same time. You buy more taps at the supplier.
- **Hands:** bar worker throughput.

### 7.3 Tabs and walkouts
- Customers pay when they leave, not per drink.
- At low vibe or after a long wait, some walk out without paying.
- This needs a "vibe" stat. With the Modifier system (6.1), vibe is just a `StatId`.

### 7.4 The checklist, wired to these numbers

| Stop | Decision | Sets |
|---|---|---|
| Municipality | License tier: Café (few seats, cheap) / Pub (standard) / Late licence (expensive, more customer types) | Max seats, allowed customer types, fee |
| Bank | Loan: Sensible / Ambitious / Visionary™ | Fit-out budget and repayments |
| Pub fit-out (new, inside your own pub) | Spend the budget on tables, the number of taps and one decoration | Seats, taps, starting vibe |
| Supplier | Deal: small kegs and flexible, or big kegs on a fixed contract. Load the first kegs yourself | Stock rhythm and price |
| Job centre | Hire 1 Bar Worker (Jan or Julia, each with a quirk), optionally Thomas | Hands |
| Back at the pub | Unload the kegs and cut the ribbon | Counter service opens |

The fit-out stop turns the Bank decision into something you can see straight away, which makes the loan feel real.

### 7.5 Architecture notes
- **Jobs.**
  - Replace `bartender` and `server` with `bar_worker` in `jobs.json`.
  - The staff system keeps its pipeline slot, but becomes one worker state machine.
  - It uses the existing order queue and bar entries plus lot threading.
  - Customer and staff positions stay derived in the renderer (`render/layout.ts`), so walking distance needs bar, tap and seat anchors the sim can measure. Today the layout lives only in the web app, so the anchor distances must move to data or to the sim.
- **Save v3 migration.** Map existing `bartender` and `server` slots and Humans to `bar_worker`. Customers mid-order and mid-carry need a defined mapping. Combine this with the loan state into one v3 migration if both land together.
- **Data-driven.** `serviceStyles`, `customerTypes`, `licenseTiers`, `loanOffers` and `fitOutItems` go in JSON. Checklist items are reveals, and `pub_open` gates customer arrivals.
- **Bouncer and others later.** A new job whose `humanRequirements` takes over a step, for example walkout prevention. No special-casing.
- **Kegs vs. crates.** Beer currently moves as crates (`crateUnits`). Kegs could be a resource or unit change in data, plus a model swap.
- **Affected docs.** Requirements 4–7 (customer loop, visible staff work, staffing metrics, allocation) and the start state (requirement 3) change. The current start Humans (Jan the bartender, Julia the server) change too.

## 8. Street layout rework: rows of buildings instead of loose plots (user, Nov 2026)

- **Layout.** The map becomes road spaces with buildings standing shoulder to shoulder along them, like a real canal street. No big loose plots with grass between them.
- **Every slot along a street is one of three kinds.**
  - **Filler building:** decoration only. Varied canal houses with a hitbox, no interaction. These make the street feel full.
  - **Interactable building:** pub, supplier, city hall, bank, job centre and so on. It has a door, a context action and later services.
  - **Free plot:** allowed, and it is interactable too: inspect it, buy it, build on it.
- **Slot width follows the building.** Narrow canal houses are around 6–8 units wide. Landmarks like city hall take a double-width slot.
- **Workflow.** The user makes the building models first and links the actions afterwards. So a building must be placeable as "filler" with only a model, and get its services later without moving it.
- **First step, built Nov 2026.** `packages/content/data/maps/landmarks.json` places render-only buildings with a model, a box and a facing direction. City hall sits north of the north ring road, at x 0, z -43, on a 20 × 12 box. Old Town's bounds were extended to z -54 to make room. Its hitbox comes from the model (walking and driving), and it has no sim Business yet. This is the seed of the "filler building" kind.
- **Data idea.** A street is a list of frontage slots along a road edge: `{ kind: 'filler' | 'business' | 'plot', modelKey?, width }`. Plots and hitboxes are derived from the slots, and the unloading zone is the road in front of the slot. Filler buildings need no Business definition, only a model key.
- **Affects.**
  - the district map JSON (plots, `walkableBounds`, unloading zones)
  - `World.tsx` (plots, sidewalks)
  - the GLB auto-fit, so a model fills its slot's width
  - landmark size defaults (`maxHeight`, fill)
  - save data (plot ids), which needs a migration if existing plot ids change

## 9. UI revamp: the CEO's phone (user, Nov 2026)

Cities: Skylines gives you a toolbar of god-powers. The CEO isn't a god, so the phone shows everything and lets you change some things remotely. Everything else needs a "wet signature", so the phone gives you a **Drive there** button. The phone is how you manage the business, and driving is how you actually do things.

### 9.1 Three layers of UI

| Layer | When | What |
|---|---|---|
| HUD | Always | Money, time, alerts, current quest, context button |
| Phone (Q / phone button) | Always, also while driving (when stopped) | Overview and remote settings, organised as apps |
| Desk | Only inside a building | Things that need you there: license, loan, fit-out, contracts, interviews |

- **The rule.** Looking is free, small changes are remote, and big decisions happen in person.
- **Tagging.** Each action is tagged `remote` or `presence` in data. The sim rejects presence actions with `reason.not_present` when the CEO isn't there.

### 9.2 HUD layout

```
┌──────────────────────────────────────────────────────────┐
│ 💰 1.240 ▲ +86/h   🏦 -3.000   ⏸ 1x 2x 4x      🔔3      │
│                                                          │
│ 📋 Grand Opening 3/5                                     │
│  → Sign supply deal (Supplier)                           │
│                                                          │
│                        (world)                           │
│                                                          │
│ [📱]                                     [ E: Enter ]    │
└──────────────────────────────────────────────────────────┘
```

- **Money pill.** Shows Gold, an arrow and Gold per hour (rolling, in game time). It glows red when Gold per hour is negative. Tap it to open the Money app.
- **Loan chip.** Appears only after you take a loan.
- **Quest tracker.** Shows the active quest's next step. Tapping it puts a GPS arrow on the road.
- **Alert bell.** Opens a list. Each alert has a "Fix" button that deep-links into the right app or sets a waypoint.

### 9.3 Phone apps (reveal-gated)

Each reveal installs an app, with a toast: "New app installed: Staffly." That makes the emergent reveals visible and gives a Cities: Skylines-style toolbar that grows over time.

| App | Satirical name | Unlocked by | Contents |
|---|---|---|---|
| Quests | To-Do™ | Start | Checklist, goals, contracts, rewards |
| Map | Wayfindr | Start | Town, buildings, what each one offers, waypoint |
| Venues | Pintly | License granted | Bar settings per pub |
| Money | Ledgr | Loan taken | Gold per hour, categories, loan, runway |
| People | Staffly | First hire | Humans, quirks, morale, pay |
| Logistics | Vanly | First supply deal | Orders, routes, vans, stock |
| News | LinkedOut | First news event | Feed, newspaper |
| Town Hall | MijnGemeente | First permit offer | Permits, requests, council votes |

### 9.4 Key screens

**Venues (Pintly): bar settings.** One card per pub, with three sections:
- **Status:**
  - Seats / Taps / Hands as three bars, with the bottleneck in red (see 7.2).
  - An Open/Closed toggle (remote).
  - Waiting customers, lost per hour, vibe.
- **Dials (remote):**
  - Drink price (− / +), with a tolerance hint ("students are complaining").
  - Worker pace: Relaxed / Normal / Hustle.
  - Auto-reorder threshold.
- **Requires a visit** (presence, so it shows "Drive there"): service style, fit-out, decorations, license tier.

**Money (Ledgr):**
- The headline is Gold per hour, last hour versus the hour before.
- A sparkline of Gold over the last 60 game minutes.
- Top income and spending by category (sales, wages, supply, loan, fines), at most 8 rows.
- Runway: "At this rate, you're broke in 42 min". Shown only when it's negative, and very motivating.
- Loan card: remaining amount and next payment. "Pay off early" is presence (bank).

**Quests (To-Do™):**
- The main chain: Grand Opening, then "First 100 pints", then "Second location".
- Side jobs: event catering, town favours, deliveries. Each has a reward, a deadline and a Drive there button.
- Requests: noise complaints and similar. Ignoring them has a scheduled consequence.

**Map (Wayfindr):**
- Unlocking it also adds a minimap in the top right.
- A top-down mini town with building icons. Tap one to see its services ("Bank: loans, refinancing").
- Info layers, like Cities: Skylines: Demand, Stock, Staff, Routes, Money. The same layers also tint the Management View in 3D, so the phone and the world agree.

### 9.5 Desk screens (in person)

When you enter the bank or the municipality, a counter UI slides up instead of a normal panel:
- a clerk portrait with one satirical line
- 2–4 big "service cards" (Sensible / Ambitious / Visionary™ loan), each showing its cost and effect
- you sign with a hold-to-confirm button that "stamps" the document. That's a good place for juice: sound and screen shake.
- the municipality has a ticket-number gag on the first visit

This is the generic `useService {businessId, serviceId}` Command from 6.2, so new desks need only data.

### 9.6 Architecture
- **Gold-per-hour data stays in the sim**, so it's deterministic and saved.
  - Today `state.finance.buckets` holds one bucket per second, and `financeSummary()` reads 300 seconds of them (`config.financeWindowSeconds`).
  - The new version is a ring of 60 one-minute buckets per category with integer Gold. Ledgr, the HUD pill and runway all read it.
  - It's cheap and bounded, so it fits the save budget. This needs a schema bump.
- **Quests.** A `quests.json` file. Steps use the shared condition DSL (6.3) and rewards use the effects vocabulary. A step can carry a `target: businessId` for the waypoint.
- **Waypoint.** Web-only state, like game speed. It's a path from `pathCacheFor` drawn as road arrows, and it never enters `SimState`.
- **Apps registry.** A `ui/apps.json` file with `{id, nameKey, icon, revealFeature, order}`. The phone renders whatever is revealed, with no hard-coded app list.
- **Action tagging.** Each service and setting definition has `access: 'remote' | 'presence'`. The UI shows a 📍 icon and "Drive there". The sim enforces the rule, so the UI can't cheat.
- **Patterns kept.** Panels use Card/Row/Bar/PanelButton, at most 8 rows, throttled selectors, `t()` keys and `panelActions.ts`.

### 9.7 Theme touches
- The phone case is in your owner colour.
- Notifications buzz with tiny satirical previews ("Julia: can we talk about Hustle mode?").
- Later, once automation arrives, the apps get replaced by a single "Dashboard™" that shows only KPIs and no names. It's the satire as UI.

### 9.8 Notes for the replan
- **"Time" in the HUD.** There is no time of day (wishlist). This would be a game-time clock or session timer, or it could be left out.
- **Keys.** Q is free today (E context, V view toggle, P pause, Tab cycle). On touch, the phone button sits bottom-left, where the joystick zone starts, so it needs to stay outside the joystick area.
- **Panel size.** The phone must respect the touch rules: panels at most 40% of the screen and targets at least 44 px. A tall phone overlay on a landscape phone needs a compact layout.
- **Replaces today's panels.** The current panel framework (PanelHost, PubPanel, InfoPanels, Finance) becomes the apps. The Business panel that auto-opens when you enter a pub becomes the Desk for offices, and the Venues card for your own pub.
- **Management View.** The info layers (Demand/Stock/Staff/Routes/Money) give the Management View a clear purpose.
- **Built on other ideas.** Depends on 6.1 (modifiers for vibe), 6.2 (services with `access`), 6.3 (conditions/effects for quests), 7 (Seats/Taps/Hands, worker pace) and the Grand Opening (1, 7.4).

## Open points for the replan

- How much of the current start (hired staff, open pub) is kept as a dev/test shortcut once the Grand Opening exists? `?dev=1` could skip the checklist.
- What does the pub look like before opening: closed sign, empty interior, no customers? (With 7.4 the interior is literally empty until the fit-out.)
- Which new buildings need generated models: municipality, bank, job centre or café?
- Loan balancing: repayment schedule, interest, and what happens when you can't pay. Today, mandatory costs already go into debt.
- How the "end-of-day" interval relates to game speed (game minutes, not real time).
