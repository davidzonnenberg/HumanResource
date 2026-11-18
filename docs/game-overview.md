# Human Resource: game overview (status snapshot, 18 Nov 2026)

A single summary of what the game is, how it plays today, what is built, and what is still open. It is written so it can be pasted into another AI (or read by a new teammate) to brainstorm features and implementation approaches. The detailed sources are `.kiro/specs/human-resource-mvp/` (requirements, design, tasks), `.kiro/steering/architecture.md`, `.kiro/steering/phase2-guide.md` and `docs/wishlist.md`.

## 1. The idea

- A toy-like, colourful, satirical business game. You start as the owner of one tiny pub ("Cosy Local") in a small Dutch-looking city block and grow into a corporation.
- The theme is "Human Resource": people are your limited operating capacity. Early on every Human has a name (Jan the bartender, Julia the server, Thomas the driver). A later automation phase can turn people into anonymous headcount numbers. That model already exists in the data (Headcount_Fill).
- Complexity is emergent, not level-gated: new mechanics appear ("reveals") because your business creates a problem. For example, storage overflowing reveals storage options, a busy pub reveals hiring, and a smoothly running business reveals game speed.
- Resources never teleport. Beer moves as crates in little vans on real roads, so logistics bottlenecks are visible.
- You are physically present as the CEO. You walk around, enter your buildings and jump into the van to drive it yourself with goofy arcade physics. Zooming out turns CEO mode into a management view of the city.
- It is not an idle game. It pauses when closed, with no offline progress.
- Planned start (idea, not built; see `docs/ideas.md`): the pub is about to open, but you have no staff and no bar yet. A "Grand Opening" checklist sends you around town:
  - Municipality: liquor license and opening time.
  - Bank: a starter loan, "Sensible", "Ambitious" or "Visionary™".
  - Supplier: the first deal, and you load the first crates yourself.
  - Job centre: interview Jan, Julia and Thomas, each with a visible quirk.
  - Back at the pub: unload and cut the ribbon, then customers start arriving.
- Every unlock is listed in a menu with only a vague teaser, so you can sometimes guess the trigger and sometimes not.
- Planned CEO role after opening: staff run the pub while you do what nobody else can.
  - Emergency supply runs, until you hire a driver.
  - Municipality requests, such as complaints and permits, and bank meetings for loans and money to buy plots.
  - Scouting rivals and plots, and side deliveries.
  - Hiring a driver frees your time for deals. Later, a "Head of Errands" turns even the CEO's chores into headcount.
- The players are the developer and his girlfriend. Each has a profile and save slots, and saves sync across PC and phone over a private Tailscale network.

## 2. Tech and hard constraints (anything new must respect these)

- TypeScript monorepo:
  - `packages/content`: JSON game data.
  - `packages/sim`: a pure, deterministic simulation and the single source of truth.
  - `packages/shared`: saves and migrations.
  - `apps/web`: Vite + React + React Three Fiber PWA.
  - `apps/server`: Fastify Save_API.
- Deployed as one Docker container on an Ubuntu server, reached over HTTPS through `tailscale serve`.
- Simulation rules:
  - Fixed ticks at 10/s.
  - Seeded RNG only. No `Math.random`, no wall clock and no trig/exp in the sim.
  - State is plain JSON.
  - Every outside influence (player input, physics pose, UI) enters as a Command that is validated at the next tick.
- Data-driven content: businesses, resources, vehicles, jobs, traits, recipes, brands, reveals, achievements and districts are JSON validated by zod. Never special-case an id in code. Every numeric tunable lives in data.
- Gold is an integer number of hundredths. Costs round up and rewards round down. Every Gold change goes through one function.
- Competitors run through exactly the same systems as the player.
- Fixed camera yaw with no rotation ever. Touch first: every mechanic works with touch alone and with keyboard alone, touch targets are at least 44 px and panels take at most 40% of the screen.
- All text comes from `t('key')` keys. English only for now.
- Saves are versioned (currently v2) with pure JSON migrations. Changing saved state needs a schema bump and a migration.
- Physics (Rapier) is only used for manual driving and is lazy-loaded. The sim only receives the van's pose.
- No shadows and no post-processing. The art is matte, chunky and toy-like, with buildings tinted by owner colour.

## 3. How it plays right now

### Controls
- PC:
  - WASD/arrows walk.
  - E is the context action (Enter, Leave, Drive, Load, Unload, Get out, Inspect).
  - `V` toggles the CEO and Management views.
  - +/- zoom, Tab cycles the selection and Esc closes.
  - P pauses, 1/2/3 set speed, [ ] step speed and 0 is speed pause.
  - While driving: W/S gas and brake-then-reverse, A/D steer, Space handbrake drift, W + S together at low speed spins donuts.
- Phone: a virtual joystick, a context-action button, pinch zoom and tap to select. While driving, a held "Drift" button does the handbrake.

### Walking and buildings
- The CEO walks on the street.
- Buildings are solid. The hitbox is the drawn model's exact bounding box, so it follows the model's scale.
- Raised sidewalks lift the CEO and other figures onto the curb.
- At the door of an owned building, E or "Enter" teleports you inside, Stardew-Valley style:
  - Only that room is drawn: walls, bar, tables, staff, customers and storage crates.
  - The walls are solid.
  - "Leave" appears on the door mat.
- From outside you do not see work happening inside. Customers walk up to the door and disappear in.
- Rival buildings can only be inspected.

### The pub loop
- Customers arrive (a seeded rate), sit, wait to be served, drink, pay and leave.
- The bartender pours and the server carries drinks to the tables, both visibly.
- Understaffing shows up as waits and lost customers. Alerts and metrics show bottlenecks.

### Staff
- You can hire, assign, reassign and fire Humans through job slots, with salary and severance.
- Humans walk to their workplace.

### Supply and logistics
- Beer comes from an external supplier.
- You place orders or use auto-reorder.
- Thomas drives the van on a route automatically: supplier, pub, back.
- You can take over the van yourself: E at the van, drive, stop in the unloading zone, then Load or Unload. Manual deliveries can earn a tip.

### The rest
- Finance: income and expenses per category in a Finance panel.
- A passive rival pub sits across the street.
- The map is split into Districts. Old Town is unlocked and Harbour exists but is locked.
- Game speed is 1x/2x/4x after a reveal, and always available in dev mode.

## 4. Done (built and tested)

Verified with typecheck, lint, unit and property tests and `vite build`. "Playable" means it can be reached in the UI.

### Foundation
- Deterministic sim core, ordered system pipeline, scheduler, seeded RNG and invariant checks.
- Definitions registry with zod schemas and reference checks.
- District-aware path cache.

### Phase 1 sim
- Humans, names and allocation.
- The pub customer loop with visible staff.
- Demand and staffing metrics, finite storage.
- Supplier orders, vans and routes, plus the manual-driving commands.
- Finance, alerts and reveals, the CEO, the passive competitor.
- Game speed, Districts, the headcount model.

### Web
- Game loop with interpolation.
- Renderer: textured ground, herringbone brick roads, raised sidewalks, GLB buildings, figures and crates.
- Camera: fixed yaw, continuous zoom with bands, CEO/Management toggle.
- Input: keyboard, joystick and gestures.
- HUD: Gold, alerts, context button, speed control, toasts.
- Pause menu and the "Resume route?" dialog.

### Panels (playable)
- Pub: drink price, staffing, job slots, auto-reorder, orders.
- Human, Vehicle (route editor, driver slot, resume/drive again), Supplier, Competitor, Customer, Finance.
- Plot (read-only).

### Saves, sync and deployment
- Local autosave in IndexedDB, profiles and save slots, an optional PIN.
- Save_API with server sync and conflict dialog.
- PWA install and offline play.
- Docker + Tailscale deployment, live on the server.

### Manual driving
- Rapier physics with per-wheel ray-cast suspension, so it rides over curbs.
- Upright and out-of-bounds resets, impact squash and wobble.
- A crash-safe exit.
- The "van does not move" bug is fixed in code but still needs an in-game check.

### CEO Phone shell (Nov 2026, `.kiro/specs/ceo-phone` task 1)
- Q, or the 📱 HUD button, opens the phone as a right-docked side panel, at most 40% of the screen width.
- Home has elapsed game time, money and a quest placeholder, plus the app grid and dock. Navigation covers Back/Home/Recents and keyboard focus. While the phone has focus, the CEO doesn't move.
- Apps: Settings (dark mode, text size, reduced motion, Do Not Disturb, quest pings; stored per device) and a minimal LinkedOut, installed by `news_feed`.
- The app registry is `packages/content/data/ui/apps.json`. The notification shade, badges and the other apps are next (ceo-phone tasks 2–6).

### Recent polish (Nov 2026, task 34)
- Stardew-style interiors.
- Model-exact hitboxes for walking and driving.
- Physical curbs.
- Interior-only visibility of staff, customers and crates.

### Phase 2 groundwork
- Phase 2 definitions pack and the v1 to v2 save migration, with property tests.
- Market system with fluctuating prices, with tests.
- Sim handlers exist for:
  - market buy, sourcing policy
  - buy plot, construct
  - acquire warehouse, end rental
  - set production recipe
  - the production system and the achievements system
- None of these have UI panels or buttons yet, so the player cannot reach them.

## 5. Outstanding (six-phase plan)

The plan lives in `.kiro/specs/human-resource-mvp/tasks.md`. Each phase heading there says what to do first, which model fits, and how to verify.

### Phase 1: Playable core (finish)
- 13.3 to 13.5: the remaining Panel work (framework polish, Pub/Human/Vehicle/Supplier/Competitor/Plot/Customer/Finance panel gaps, reveal-gated "Add Human" and storage responses).
- 15: playable checkpoint on phone and PC. 23: Phase 1 complete.
- 34.6 solid furniture inside; 34.8 in-game feel check of the driving overhaul (about 2x speed, handbrake drift, donuts, tyre marks, all tuned per vehicle in `vehicles.json`); 34.7 remove the temporary `[drive]` debug logging after that check.
- Not yet: dust puffs and a looser camera while sliding. Later: fuel/range, crash damage, style points (see wishlist).

### Phase 2: Foundations (requirements 50 to 54)
- Generic Modifier system with `getStat` and a "why this number" breakdown. Existing traits, brands and boosts move onto it with an equivalence test.
- One shared Condition and Effect engine for reveals, achievements, quests, services and consequences.
- Data-defined building Services and one `useService` Command (remote versus presence access).
- Command log, replay, a golden-playthrough hash test in CI, and a state hash sent with sync.
- Street layout from frontage slots (filler, business, plot); city hall becomes a double-width slot.

### Phase 3: Grand Opening and bar redesign (requirements 55 to 68)
- New game starts as the Grand Opening: municipality (license tier), bank (loan), pub fit-out, supplier keg deal and first load, job centre hiring with quirks, ribbon cutting. `?dev=1` keeps the running-pub start.
- One `bar_worker` job replaces bartender and server; Seats / Taps / Hands; tabs, walkouts and vibe; kegs (drinks stay the unit).
- Quest engine, unlock menu with teasers, the CEO's outside jobs (emergency runs, municipality requests, bank meetings, scouting, side deliveries, Head of Errands).
- One v3 save migration with fixtures.

### Phase 4: Phone UI (requirements 69 to 74)
- HUD: money pill with Gold per hour, loan chip, quest tracker, alert bell with "Fix".
- The Phone and its reveal-gated apps (To-Do™, Wayfindr with minimap, Pintly, Ledgr, Staffly, Vanly, LinkedOut, MijnGemeente) replace the old panels.
- Desk counter screens with hold-to-stamp, a web-only Waypoint with road arrows, and Info_Layers shared with the Management View.

### Phase 5: Feel alive and satire content (requirements 75 to 79)
- Thought bubbles and coin pops with sound, quirks and speech bubbles (none for headcount), street life, the periodic summary card with an employee of the month.
- Satire as data: consultant, team-building, rival poaching, health inspector, loyalty card, happy hour, LinkedIn-style news.

### Phase 6: Economy expansion (requirements 27 to 40 and 80; old tasks 24 to 33)
- Built already: definitions pack, v1 to v2 migration, Market system. Still to do: sourcing policies, plots and construction, second pub, Warehouse (placed far from the pubs), Brewery, acquisitions with hidden attributes, brands and secret recipes, chains and synergy, Reputation, questionable opportunities, competitor events, minigames, achievements, their screens (as Phone apps), and performance tooling.
- All of it is built on `getStat`, the effect engine, Services and frontage slots.

## 6. Content inventory (what exists in data today)

- Businesses: `pub_cosy_local`, `pub_sports` (rival), `supplier_beer`. Phase 2 adds `brewery`, `warehouse`, `market_depot`, `pub_student`.
- Jobs: bartender, server, driver, brewer, warehouse_worker.
- Reveals:
  - Phase 1: storage_responses, hiring_option, first_management_view, game_speed.
  - Phase 2: expansion, second_pub, questionable_offers, first_news, first_chain, first_reputation_change.
- Phase 2 traits: friendly_regulars, hidden_gem, cellar_repairs, badgers_charm, smooth_finish.
- Questionable opportunities: gray_barrels, midnight_hops.
- Achievement: synergy.
- Minigame: help_serve.
- Map: Old Town with an east-west main street.
  - Plots: player pub, rival pub, supplier, market depot, two empty plots, one for sale.
  - A ring road to the north and south.
  - Harbour district (locked).
- Art: one generated GLB for the player pub (ComfyUI, image to 3D with Hunyuan/Trellis, then `npm run models:optimize`). The other buildings are placeholder boxes. Ground and road textures are generated tiles.

## 7. Known issues and design notes

- "Ticked" spec tasks are not proof of playability. Always check what the UI exposes.
- Interiors stay at the building's world position. The camera just hides everything else.
- Building hitboxes come from the renderer, because the GLB bounding box is only known there. The sim keeps the CEO inside interior walls, and the web input layer blocks walking into buildings.
- Automatic vans and NPC Humans ignore physics. They follow road paths.
- Customer and staff positions inside a pub are derived by the renderer from sim state. The sim has no coordinates for them.

## 7b. Idea backlog (docs/ideas.md; replanned into the six phases above)

Near-term ideas. They have been replanned into the phases of section 5; `docs/ideas.md` keeps the original text with a "Moved to spec" line per section:
- The Grand Opening checklist start, with new office buildings (Municipality, Bank, Job centre). These are plain npc Business definitions with an `office.services` marker, and interactions are door Commands.
- An unlock menu with vague teasers.
- The CEO's outside jobs after opening.
- Loans, which need a v3 save migration.
- "Make it feel alive": customer thought bubbles, coin pops with sound, Human quirks and speech bubbles (none for headcount), street life outside busy pubs, and a periodic summary card with an "employee of the month".
- Satire hooks on existing systems: consultant visit, team-building day, rival poaching staff, health inspector, loyalty card, happy hour, LinkedIn-style news feed.
- Bar system redesign:
  - one `bar_worker` job replaces bartender and server (take order, pour, deliver, take payment, clean)
  - the pub panel shows Seats / Taps / Hands
  - tabs paid on leaving, with walkouts at low vibe
  - at the start you hire one Bar Worker (Jan or Julia)
  - the Grand Opening checklist sets these numbers: license tier, loan, a new pub fit-out stop, keg deal
  - needs a v3 save migration
- UI revamp around the CEO's phone, in three layers:
  - HUD: money pill with Gold/hour, loan chip, quest tracker, alert bell with "Fix" buttons
  - Phone: reveal-gated apps (To-Do™, Wayfindr, Pintly, Ledgr, Staffly, Vanly, LinkedOut, MijnGemeente) with remote settings
  - Desk: in-person counter screens with hold-to-stamp
  - the rule: looking is free, small changes are remote, big decisions need you there ("Drive there")
- Foundation upgrades to do before more content:
  - one generic Modifier system with `getStat` and a "why this number" tooltip
  - data-defined building Services with one `useService` Command
  - a shared conditions/effects mini-DSL
  - a command log with replay, a golden-playthrough hash test in CI, and a state hash for desync checks

## 8. Far-future ideas already parked (docs/wishlist.md)

- Time of day, weather, multiple cities.
- Specialists, commuting, numbers mode.
- Farms, forestry, construction, property, supermarkets, food, marketing.
- Headquarters, designing your own beers, buying rival companies, supplier evolution, contracts, a stock market.
- Self-built and electric vehicles, autonomous delivery.
- Traffic and congestion, satirical logistics R&D.
- Multiplayer, other languages, proper accounts.
- Town and politics: a permit board, council votes with lobbying, road works that force van detours.

## 9. Prompt ideas for brainstorming

- "Given the constraints in section 2, propose 15 fun, satirical additions that reuse existing systems (reveals, job slots, vans, traits). For each: player-facing hook, data needed in JSON, which sim system or Command it touches, and UI on touch + keyboard."
- "Design the driving overhaul (34.5): handling model for drift and donuts on top of a Rapier dynamic body with ray-cast suspension and arcade velocity control. Keep the sim's speed cap meaningful and keep the tuning values in data."
- "How should the Phase 2 progression be paced through reveals so it stays emergent? Sketch the problem-to-reveal chain from one pub to a vertically integrated chain."
- "Suggest Stardew-style interior interactions (help behind the bar, restock shelves, fix things) that become minigames without breaking determinism. Player input must enter as Commands."
