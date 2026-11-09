# Requirements Document

## Introduction

"Human Resource" is a mobile-first, PC-compatible, real-time business expansion game delivered as an installable Progressive Web App. The player starts as a "CEO" running one tiny pub and grows into a funny, toy-like city economy by allocating Humans, moving physical goods with goofy vehicles, and choosing between buying, producing, acquiring and taking questionable shortcuts. At the start the game must genuinely look like a small pub-management game; complexity appears only when the business itself creates the problem.

The game is real-time but not an idler: the simulation runs only while the app is visible, and there is no offline progress. Playthroughs are stored in profile-based save slots, autosaved locally and synced to a small self-hosted save API so a playthrough can be continued on another device.

Architectural decision – no multiplayer: each device runs its own Simulation, and the Save_API only stores Profiles and Save_Documents. There are no shared cities, no server-side simulation and no real-time synchronisation between players. A shared city or multiplayer mode is listed only in the far-future wishlist.

Foundation decisions built into Phase 1 so later growth needs no rework: Game_Speed multipliers (Requirement 47), a map divided into Districts (Requirement 48), a Job_Slot model that also accepts an anonymous Headcount_Fill (Requirement 49), a fixed-angle camera (criterion 15.12) and English-only user-facing text looked up by key (criterion 46.8).

Requirements are grouped into three blocks and each requirement is tagged with its phase:

- **Phase 1 – Playable Prototype**: one pub, customer loop, bartender and server, Gold, finite beer storage, external beer supply, one delivery van, CEO Mode, Management View, automatic versus manual delivery, one passive visible competitor pub, basic Human allocation (named Humans, hire, salary, assign, reassign, fire with severance), plus saves and platform foundations. Phase 1 answers one question: *Is it fun to physically watch a tiny pub operate, zoom out into the city, allocate Humans, and personally drive a silly delivery van between two businesses while those businesses keep operating?*
- **Phase 2 – First Business Expansion Layer**: second pub, warehouse, brewery (Hops + Malt → Beer), acquisitions with hidden traits, secret recipes and liabilities, own versus outsource, fluctuating buy/sell market, basic brands, synergy chains, reputation, questionable opportunities with delayed probabilistic consequences, and competitors that occasionally act.
- **Non-Functional (all phases)**: performance, PWA/offline behaviour, deployment, testability, repository hygiene and extensibility.

Explicitly out of scope (the architecture must not block them, but no speculative functionality is built): educated Humans and R&D; additional industries, HQ, product creation, larger supply networks, alternative starts; commuting staff, traffic and routing simulation, competitor economics, supplier evolution, contracts, satirical logistics or hacking R&D, vehicle manufacturing; deep HR simulation, personalities, sickness, farming or forestry gameplay, stock market, multiple cities, international play, complex construction, legal system, detailed crime and late-game industries; a display-name mode that depersonalises Humans into numbers for later automation or AI phases (only the extension point of criterion 46.7 and the Headcount_Fill data model of Requirement 49 are built); a time-of-day or day/night cycle; District unlocking gameplay beyond the data model of Requirement 48; a shared city or multiplayer mode; languages other than English. Ideas that are nowhere near implementation are collected in the far-future wishlist `docs/wishlist.md`, which is not part of this specification.

Security is explicitly deferred. For the foreseeable future the Game is played only by the user and his girlfriend over Tailscale, so the optional Profile PIN and its lockout (Requirement 26) are convenience features and no strong authentication exists beyond Tailscale network membership. Hardened security (real authentication, user accounts, rate limiting beyond the PIN lockout, encryption at rest) is a later concern. The Save_API should be structured so that authentication can be added later without changing the Save_Document format; no further security requirements are part of this document.

Technology decisions already made: TypeScript, Vite, React with React Three Fiber (Three.js), Rapier physics for arcade driving, vite-plugin-pwa, and a Docker container on the user's Ubuntu server reached over Tailscale.

Conventions used in all requirements:

- Durations are game time unless explicitly marked "real time". While Ticks advance, game time passes at Game_Speed times real time (at 1x one game second equals one real second; at 2x two game seconds pass per real second; see Requirement 47); while Ticks are stopped, game time does not advance.
- Every numeric value marked "default" is a data-tunable default stored in the Definition_Registry or start-state data, not a hard-coded constant. Changing a default requires no code change.
- Gold amounts in criteria are whole Gold; the Simulation stores Gold in hundredths (see Requirement 8).

## Glossary

- **Game**: The complete Human Resource application as experienced by the Player.
- **Project**: The source repository of the Game, including code, tests, build configuration and Project_Documentation.
- **Project_Documentation**: The README and docs files committed in the Project.
- **Simulation**: The pure TypeScript game-state engine that advances in discrete Ticks, with no dependency on rendering, DOM, physics or network code.
- **Tick**: One fixed-length simulation step (default 100 ms of game time).
- **Game_Minute**: 60 seconds of game time (600 Ticks at the default Tick length).
- **Rolling_Window**: A trailing interval of game time ending at the current Tick, over which a metric is computed.
- **Seed**: The value used to initialise the Simulation's deterministic random number generator.
- **Command**: A serialisable Player or system intent (for example hire, assign, fire, order, buy, sell, dispatch, vehicle input) submitted to the Simulation and applied at a Tick boundary.
- **Reason_Code**: A machine-readable identifier returned with a rejected Command (for example insufficient_gold, slot_occupied, invalid_price).
- **Renderer**: The React Three Fiber layer that draws the Simulation state in 3D and forwards Player input as Commands.
- **Physics_Layer**: The Rapier-based layer that simulates arcade driving for a manually driven Vehicle.
- **World_Unit**: The map distance unit; 1 World_Unit equals 1 metre at the Person Zoom_Level.
- **Definition_Registry**: The data-driven catalogue of Resource, Business, Vehicle, Job, Human, Recipe, Trait, Brand, Achievement, Reveal_Trigger, District and text-table Definitions loaded at startup.
- **Definition**: One data record in the Definition_Registry describing a type (for example the "Pub" Business type or the "Beer" Resource).
- **Owner**: The entity owning a Business or Vehicle; either the Player or a specific Competitor.
- **Player**: The person playing the Game, represented in the world by the CEO.
- **CEO**: The Player's in-world character, controllable in CEO_Mode.
- **Human**: A unit of general-purpose operating capacity that can perform any ordinary Job. Humans walk between Job locations on the map; Humans do not commute to homes. Every Human has a Human_Name.
- **Human_Name**: The personal first name of a Human (for example "Jan"), stored in the Simulation state and shown in the Game to make Humans feel personal.
- **Name_Pool**: The Definition_Registry text table of first names from which Human_Names for hired Humans are drawn; editable as data without code changes.
- **Workforce**: The set of Humans employed by the Player.
- **Job**: A role at a Business or Vehicle that one assigned Human or one Headcount_Fill fills (Bartender, Server, Driver, Brewer, Warehouse_Worker).
- **Job_Slot**: One fillable position for a Job at a specific Business or Vehicle; the number of Job_Slots per Job is defined in the Business or Vehicle Definition.
- **Headcount_Fill**: A Job_Slot fill by an anonymous count of Humans (a Staff_Pool entry) with a Human Definition for Salary and capacity, but no Human_Name, no position and no walking; exists in the data model from Phase 1 and is created by no Phase 1 content or UI (Requirement 49).
- **Salary**: The Gold cost per Game_Minute of one employed Human, defined in the Human Definition.
- **Hiring_Cost**: The one-off Gold cost of hiring a Human; default 5% of the Human's Salary for 60 Game_Minutes.
- **Severance**: The one-off Gold cost paid when firing a Human, defined in the Human Definition.
- **Gold**: The primary currency and the only Resource counter visible to the Player at game start.
- **Discretionary_Expense**: A Gold cost the Player chooses to incur: hiring, Orders (manual and automatic), Market purchases, Plot purchases, construction, Warehouse purchase or rental start, Acquisitions and Questionable_Opportunity costs.
- **Mandatory_Expense**: A Gold cost the Simulation applies regardless of balance: Salary, Severance, rental fees, revealed Liability costs and Consequence fines.
- **Resource**: Any tradable or storable good defined in the Definition_Registry (Phase 1: Beer; Phase 2 adds Hops and Malt).
- **Corporate_Resource**: A Player-level Resource that is not held in any Storage and has no capacity limit (Phase 2: Synergy).
- **Business**: An instance of a Business Definition placed on a Plot, with type, inputs, outputs, storage, human_requirements, production_rules, brand, traits, location, owner and automation fields.
- **Pub**: A Business that converts Beer and Customer visits into Gold.
- **Venue_Type**: A Pub Definition category (for example sports pub, cosy local) used by Brand demand modifiers (Phase 2).
- **Brewery**: A Business that converts Hops and Malt into Beer (Phase 2).
- **Warehouse**: A Business whose primary function is storing Resources (Phase 2).
- **Supplier**: A non-player Business that sells Resources to the Player at a defined unit price and holds ordered Resources for physical pickup.
- **Order**: A paid Player purchase of a Resource quantity from the Supplier, reserved at the Supplier for a named Player-owned destination Business.
- **Pending_Quantity**: For a destination Business and Resource, the quantity reserved in open Orders plus the quantity loaded on Player-owned Vehicles whose next drop-off stop is that Business.
- **Competitor**: A non-player Owner of rival Businesses and Vehicles.
- **Customer**: A simulated visitor who enters a Pub, takes a seat, waits, is served, drinks, may reorder, pays and leaves.
- **Lost_Customer**: A Customer who leaves a Pub without having been served any drink, with a lost reason of no_seat, out_of_beer or patience_expired.
- **Storage**: The finite per-Resource capacity and current amount of a Business (for example Beer 480/500).
- **Vehicle**: A movable carrier of Resources with capacity, speed, driver requirement and Route.
- **Delivery_Van**: The Phase 1 Vehicle type used to carry Resources between Businesses.
- **Route**: An ordered list of at least two pickup and drop-off stops at distinct Businesses, assigned to one Vehicle.
- **Automatic_Delivery**: Delivery performed by a Vehicle driven by an assigned Human along the Vehicle's Route without Player control.
- **Manual_Driving**: The Player personally driving a Player-owned Vehicle with arcade physics.
- **Manual_Speed_Bonus**: The top-speed multiplier applied to a Vehicle under Manual_Driving relative to the Vehicle's Automatic_Delivery speed; default +10%.
- **Manual_Delivery_Tip**: The Gold bonus for a completed manual delivery; default 5% of the delivered cargo value at the Supplier unit price.
- **Unloading_Zone**: The marked area next to a Business in which a stopped Vehicle can load and unload.
- **Interaction_Range**: The maximum distance between the CEO and an object for a Context_Action to be offered; default 2 World_Units.
- **CEO_Mode**: The close physical view in which the Player controls the CEO, walks, enters Businesses and drives Vehicles.
- **Management_View**: The zoomed-out view (Street, Block, Neighbourhood, City Zoom_Levels) for selecting Businesses, inspecting properties, viewing Routes and assigning Humans.
- **Zoom_Level**: One of the consecutive camera distance bands Person, Business, Street, Block, Neighbourhood and City, with band boundaries defined in data.
- **Mode_Switch_Threshold**: The camera distance at the boundary between the Business and Street Zoom_Levels.
- **Camera_Controller**: The component that moves the tilted top-down camera continuously between Zoom_Levels.
- **Input_System**: The component that maps touch, keyboard, mouse and wheel input to camera actions, CEO movement and Commands.
- **Context_Action**: The single primary action offered by the right-thumb button for the nearest interactable object within Interaction_Range (for example Enter, Inspect, Drive, Load, Unload).
- **HUD**: The minimal persistent on-screen overlay (Gold, Alerts, Context_Action button, joystick).
- **Alert**: A HUD notification of a defined type attached to one object, raised when its condition starts to hold and cleared when the condition stops holding.
- **Panel**: A side or bottom sheet showing details of a selected object.
- **Pause_Menu**: The in-game menu that stops Ticks while open.
- **Game_Speed**: The client-side multiplier (1x, 2x or 4x) of game time per real time, plus a speed pause; stored outside the Simulation state (Requirement 47).
- **Dev_Mode**: A per-device testing setting, enabled by the `dev=1` URL parameter, by development builds or by the "Testing" option in the Pause_Menu, that unlocks all Game_Speed settings without changing the Simulation state.
- **District**: A data-defined chunk of the map with its own bounds, road sub-graph, Plots, Unloading_Zones and drivable and walkable bounds, and a locked or unlocked state stored in the Simulation state (Requirement 48).
- **District_Connector**: A data-defined link between a boundary road node of one District and a boundary road node of an adjacent District, through which the road graphs of the two Districts join.
- **Text_Key**: The identifier of one user-facing string in `packages/content/data/text/en.json`, resolved through the single lookup function t().
- **Plot**: A map location that is empty, for sale, under construction, or occupied by a Business.
- **Market**: The Phase 2 system offering fluctuating buy and sell prices per Resource.
- **Market_Depot**: The map location where Market purchases are picked up and Market sales are delivered (Phase 2).
- **Sourcing_Policy**: The per-Business, per-input rule that decides how an input Resource is obtained (buy externally, internal supply, or internal first with external shortfall).
- **Acquisition_Offer**: A Business offered for sale with an asking price, known attributes, hidden attributes and an expiry time.
- **Acquisition**: The completed purchase of a Business through an Acquisition_Offer.
- **Trait**: A Definition-backed modifier attached to a Business, Recipe or Brand; may be hidden until revealed.
- **Liability**: A negative hidden Trait that applies a cost or penalty when revealed (for example cellar repairs 1,600 Gold).
- **Recipe**: A Definition specifying how a product is made and its product Traits (appeal, premium price, consumption speed, repeat-order chance, production cost, brand engagement).
- **Secret_Recipe**: A Recipe obtainable only through an Acquisition.
- **Brand**: A Definition-backed label (mainstream, traditional local, budget, premium) applied to products and Businesses that changes demand per Venue_Type.
- **Corporate_Chain**: A sequence of Player-owned Businesses and Vehicles connected by actual Resource flow from producer to consumer.
- **Synergy**: The Corporate_Resource generated by active Corporate_Chains.
- **Reputation**: A Player-wide integer score from 0 to 100 affecting Customer demand and Acquisition_Offers.
- **Questionable_Opportunity**: A short Human-assignment job with an immediate reward and a delayed, probabilistic Consequence.
- **Consequence**: A delayed event (for example News_Feed item, Reputation change, fine) scheduled by a Questionable_Opportunity.
- **News_Feed**: The in-game ticker that announces events such as Consequences, reveals and Competitor actions.
- **Minigame**: An optional hands-on activity the CEO performs inside a Business for a data-defined reward (Phase 2: Help Serve).
- **Achievement**: A satirical milestone award (for example "Synergy").
- **Reveal_Trigger**: A data-defined game-state condition that, on first becoming true in a Save_Slot, reveals a UI element or mechanic.
- **Profile**: A named player identity on the shared server (for example the user and his girlfriend), optionally protected by a PIN.
- **Save_Slot**: One playthrough belonging to a Profile.
- **Save_Document**: The serialised Simulation state of a Save_Slot including schema version, Revision, Synced_Revision and timestamp.
- **Revision**: An integer per Save_Slot that increases by exactly 1 on every successful Local_Store write of that Save_Slot.
- **Synced_Revision**: The Revision of the Save_Slot most recently acknowledged as stored by the Save_API, recorded in the local Save_Document.
- **Sync_Conflict**: The state in which the Save_API holds a Revision of a Save_Slot that is not the Synced_Revision of the local copy while the local copy has unsynced changes.
- **Save_Serializer**: The component that converts Simulation state to a Save_Document and back.
- **Migration_Pipeline**: The ordered set of functions that upgrade a Save_Document from an older schema version to the current one.
- **Local_Store**: The browser-side save storage (IndexedDB with localStorage fallback).
- **Save_API**: The small HTTP backend on the Ubuntu server that stores Profiles and Save_Documents.
- **Sync_Service**: The client component that uploads and downloads Save_Documents between Local_Store and Save_API.
- **PWA_Shell**: The service worker, manifest and cached application assets that make the Game installable and playable offline.
- **Deployment_Container**: The Docker image serving the static frontend and the Save_API.
- **Mid_Range_Phone**: Reference devices: a Samsung Galaxy A5x-series Android phone (2022 or newer) and an iPhone 12 or newer.

## Requirements

### Requirement 1: Data-Driven Definitions (Phase 1)

**User Story:** As the developer, I want businesses, resources, vehicles, recipes, traits and brands to be data definitions, so that new content and industries can be added without rewriting the economy.

#### Acceptance Criteria

1. WHEN the Game starts, THE Definition_Registry SHALL load all Definitions before the Simulation creates any Business.
2. THE Definition_Registry SHALL represent each Business Definition with the fields type, inputs, outputs, storage, human_requirements, production_rules, brand, traits, location constraints, owner and automation.
3. THE Definition_Registry SHALL represent each Pub Definition additionally with seat count, base demand, patience limit, bartending interval, minimum drink price, maximum drink price, default drink price, repeat-order chance, maximum drinks per visit and Job_Slot counts per Job.
4. THE Definition_Registry SHALL represent each Vehicle Definition with type, capacity, speed, driver requirement, allowed Resources and arcade-handling tuning values.
5. IF a Definition references an unknown Resource, Trait, Brand, Recipe, Job or model key identifier, THEN THE Definition_Registry SHALL reject the Definition with an error naming the Definition and the unknown identifier.
6. IF a Pub Definition has a seat count below 1, a minimum drink price of 0 or less, or a minimum drink price above its maximum drink price, THEN THE Definition_Registry SHALL reject the Definition with an error naming the Definition and the invalid field.
7. IF any Definition is rejected at startup, THEN THE Game SHALL show the Definition errors and block starting or loading a Save_Slot.
8. WHEN a new Resource Definition is added to the Definition_Registry data, THE Simulation SHALL store, transport, trade and consume the new Resource using the same code paths as Beer.
9. THE Simulation SHALL apply identical production, storage, staffing and logistics rules to a Business regardless of whether the Owner is the Player or a Competitor.

### Requirement 2: Deterministic Simulation Core (Phase 1)

**User Story:** As the developer, I want a deterministic, rendering-independent simulation, so that the economy can be unit- and property-tested and reproduced exactly.

#### Acceptance Criteria

1. THE Simulation SHALL advance game state only in fixed Ticks of 100 ms game time (default).
2. WHILE Ticks are advancing, THE Game SHALL advance Game_Speed seconds of game time per 1 second of real time (1 second at 1x, 2 seconds at 2x, 4 seconds at 4x; Requirement 47).
3. IF more than 10 × Game_Speed Ticks are due within one rendered frame, THEN THE Game SHALL advance 10 × Game_Speed Ticks in that frame and discard the remaining Tick backlog.
4. THE Simulation SHALL execute without importing rendering, DOM, physics or network modules.
5. WHEN two Simulation instances start from the same state and Seed and receive the same Commands at the same Ticks, THE Simulation SHALL produce identical states after every Tick (determinism property).
6. THE Simulation SHALL draw all randomness from the seeded random number generator stored in the Simulation state.
7. WHEN the Renderer or Physics_Layer submits a Command, THE Simulation SHALL apply the Command at the next Tick boundary.
8. IF a Command is invalid for the current state, THEN THE Simulation SHALL reject the Command, leave the state unchanged and return a Reason_Code.
9. WHILE Manual_Driving is active, THE Physics_Layer SHALL submit the manually driven Vehicle's position, heading and load/unload actions to the Simulation as Commands once per Tick.
10. FOR ALL sequences of Commands, THE Simulation SHALL keep every Storage amount at 0 or above and SHALL apply no Tick or Command that raises a Storage amount above its capacity (storage invariant).
11. FOR ALL sequences of Commands, THE Simulation SHALL keep the total quantity of each Resource unchanged except where a production rule, Supplier Order, Market trade, Customer consumption, Questionable_Opportunity reward or Acquisition explicitly creates or removes the quantity (conservation invariant).

### Requirement 3: Game Start State (Phase 1)

**User Story:** As a player, I want to start as a tiny pub owner, so that the game initially feels like a small, approachable pub-management game.

#### Acceptance Criteria

1. WHEN the Player starts a new Save_Slot, THE Simulation SHALL create the start state defined in start-state data: one Player-owned Pub; three Humans in the Workforce, namely "Jan" working as Bartender and "Julia" working as Server at that Pub and "Thomas" assigned as Driver of the Delivery_Van and on board; a Beer Storage stock of 50% of capacity (default); a starting Gold balance; one Delivery_Van at the Pub with a default Route of a pickup stop at the Supplier followed by a drop-off stop at the Player's Pub; a reserved Order of Beer at the Supplier for the Player's Pub of 25% of the Pub's Beer capacity (default); one Supplier; and one Competitor Pub with one Competitor Vehicle.
2. WHEN the Player starts a new Save_Slot, THE Simulation SHALL generate a new Seed and store the Seed in the Simulation state.
3. WHEN the Player starts a new Save_Slot, THE Simulation SHALL set Reputation to 50 (default).
4. WHEN a new Save_Slot starts, THE Camera_Controller SHALL place the camera in CEO_Mode at the Person Zoom_Level next to the Player's Pub.
5. WHILE no Reveal_Trigger for an additional counter has fired in the Save_Slot, THE HUD SHALL show Gold as the only Resource counter.
6. THE Renderer SHALL present the starting Pub as an animated miniature diorama in which Customers and Humans are visible.
7. WHEN the first Tick of a new Save_Slot is applied, THE Simulation SHALL start Automatic_Delivery of the start-state Delivery_Van along the default Route with the Driver "Thomas".

### Requirement 4: Pub Customer Loop (Phase 1)

**User Story:** As a player, I want to watch customers enter, drink, pay and leave, so that the pub feels alive and generates revenue I can see.

#### Acceptance Criteria

1. THE Simulation SHALL spawn arriving Customers at each Pub at a rate computed from the Pub Definition's base demand, the Pub's current drink price and Reputation using the demand formula defined in data.
2. FOR ALL pairs of drink prices p1 < p2 at the same Pub with all other state equal, THE Simulation SHALL compute an arrival rate at p2 that is less than or equal to the arrival rate at p1 (price monotonicity property).
3. WHEN a Customer arrives and a seat is free, THE Simulation SHALL move the Customer through the states enter, seat, wait, served, drink, optional reorder, pay and leave.
4. WHEN a Customer takes a seat, THE Simulation SHALL register one drink order for the Customer.
5. WHEN a Customer finishes a drink and has consumed fewer drinks than the Pub Definition's maximum drinks per visit (default 3), THE Simulation SHALL register a reorder with the probability given by the effective repeat-order chance, using the seeded random number generator.
6. WHEN a Bartender pours a drink, THE Simulation SHALL remove one Beer from the Pub's Storage.
7. WHEN a Customer pays, THE Simulation SHALL add the Pub's drink price at the payment Tick multiplied by the number of drinks the Customer consumed to the Owner's Gold.
8. IF a Customer's wait time for an open drink order exceeds the Pub Definition's patience limit in game seconds, THEN THE Simulation SHALL cancel the order and make the Customer pay for drinks already consumed and leave.
9. IF a Customer leaves after a patience expiry without having been served any drink, THEN THE Simulation SHALL count the Customer as a Lost_Customer with reason patience_expired, or with reason out_of_beer when the Pub's Beer Storage was empty at the moment of expiry.
10. IF a Customer arrives while all seats are occupied, THEN THE Simulation SHALL make the Customer leave immediately and count the Customer as a Lost_Customer with reason no_seat.
11. IF the Pub's Beer Storage is empty while a drink order is open, THEN THE Simulation SHALL keep the Customer waiting and raise an "Out of Beer" Alert on the Pub.
12. WHEN the Pub's Beer Storage amount rises above 0, THE HUD SHALL clear the "Out of Beer" Alert on that Pub.
13. THE Renderer SHALL display each Customer as a visible figure moving between entrance, seat, bar and exit.

### Requirement 5: Visible Staff Work (Phase 1)

**User Story:** As a player, I want to see my bartender and server physically work, so that staffing decisions have visible results.

#### Acceptance Criteria

1. WHILE a Human is working as Bartender at a Pub and the Pub has an open drink order and at least 1 Beer in Storage, THE Simulation SHALL let the Bartender pour one drink per bartending interval defined in the Pub Definition.
2. WHILE a Pub has more than one working Bartender, THE Simulation SHALL let each Bartender pour independently.
3. WHILE a Human is working as Server at a Pub, THE Simulation SHALL let the Server carry poured drinks to waiting Customers at the movement speed defined in the Job Definition.
4. WHILE a Pub has no working Bartender, THE Simulation SHALL pour zero drinks at that Pub.
5. WHILE a Pub has no working Server, THE Simulation SHALL keep poured drinks at the bar undelivered.
6. WHILE a Player-owned Pub has an empty Bartender or Server Job_Slot and no working Human in that Job, THE HUD SHALL show an "Unstaffed: <Job>" Alert on that Pub.
7. THE Renderer SHALL animate each working Human at the location of the Human's current task (bar, table, storage).

### Requirement 6: Demand and Staffing Metrics (Phase 1)

**User Story:** As a player, I want to see whether my pub is understaffed, so that I can decide where my limited Humans are most valuable.

#### Acceptance Criteria

1. THE Simulation SHALL compute per Pub, over a 60-second game-time Rolling_Window, arriving Customers per Game_Minute, working service Humans (Bartenders plus Servers), average wait time from seating to first drink served, and Lost_Customer percentage.
2. THE Simulation SHALL compute the Lost_Customer percentage as Lost_Customers divided by arriving Customers in the Rolling_Window, and as 0% when no Customer arrived in the Rolling_Window.
3. THE Simulation SHALL compute recommended service Humans per Pub from arriving Customers per Game_Minute and the bartending interval using the staffing formula defined in data.
4. WHEN the Player selects a Pub, THE Panel SHALL display the metrics of criteria 6.1 and 6.3.
5. WHEN the Lost_Customer percentage at a Player-owned Pub exceeds 10% (default) and at least 10 Customers (default) arrived in the Rolling_Window, THE HUD SHALL raise an Alert on that Pub whose type matches the most frequent lost reason: "Understaffed" for patience_expired, "Out of seats" for no_seat, or "Out of Beer" for out_of_beer.
6. WHEN the Lost_Customer percentage at a Pub falls to 10% or below, THE HUD SHALL clear the Alert raised under criterion 6.5.
7. WHEN the Player selects a Player-owned Pub, THE Panel SHALL offer the responses "Add Human" and "Change drink price" next to the metrics.
8. WHEN the Player sets a Pub's drink price within the Pub Definition's minimum and maximum drink price, THE Simulation SHALL apply the new price to all payments from the next Tick.
9. IF the Player sets a drink price of 0 or less, below the Pub Definition's minimum, or above the Pub Definition's maximum, THEN THE Simulation SHALL reject the Command with Reason_Code invalid_price and keep the current price.

### Requirement 7: Human Allocation (Phase 1)

**User Story:** As a player, I want to hire, assign, reassign and fire Humans, so that allocating limited operating capacity is the central decision.

#### Acceptance Criteria

1. WHEN the Player hires a Human and the Player's Gold is at least the Hiring_Cost, THE Simulation SHALL deduct the Hiring_Cost (default 5% of 60 Game_Minutes of Salary) and add one unassigned Human to the Workforce at the Player's first Pub.
2. IF the Player's Gold is lower than the Hiring_Cost, THEN THE Simulation SHALL reject the hire Command with Reason_Code insufficient_gold and the missing Gold amount.
3. WHILE a Human is in the Workforce, THE Simulation SHALL deduct the Human's Salary divided by the number of Ticks per Game_Minute from the Player's Gold every Tick as a Mandatory_Expense, whether the Human is assigned or unassigned.
4. WHEN the Player assigns a Human to a free Job_Slot at a Player-owned Business or Vehicle, THE Simulation SHALL mark the Human as assigned to that Job_Slot and start the Human walking to the Job location at the walking speed defined in the Human Definition.
5. WHILE an assigned Human is travelling to the Job location, THE Simulation SHALL count the Human as assigned, perform no Job work for that Human, and mark the Job_Slot as "en route".
6. WHEN an assigned Human arrives at the Job location, THE Simulation SHALL start the Human performing the Job.
7. WHEN the Player assigns a Human to a Job_Slot that another Human occupies, THE Simulation SHALL make the occupying Human unassigned at the Job location and assign the selected Human to the Job_Slot.
8. WHEN the Player reassigns an assigned Human to another Job_Slot, THE Simulation SHALL remove the Human from the first Job_Slot at the next Tick boundary and start the Human's travel from the Human's current position.
9. WHEN the Player reassigns a Human who is travelling to a Job location, THE Simulation SHALL redirect the Human from the Human's current position to the new Job location.
10. THE Simulation SHALL allow any Human with the "regular" qualification to fill any Job defined in Phase 1 and Phase 2 (Bartender, Server, Driver, Brewer, Warehouse_Worker).
11. WHEN the Player fires a Human, THE Simulation SHALL remove the Human from the Workforce and deduct the Severance defined in the Human Definition from the Player's Gold as a Mandatory_Expense.
12. WHEN a Human who is driving a Vehicle under Automatic_Delivery is fired or reassigned, THE Simulation SHALL stop the Vehicle at its current road position with its cargo and Route unchanged.
13. IF the Player fires or reassigns a Human who is occupied by a running Questionable_Opportunity, THEN THE Simulation SHALL reject the Command with Reason_Code human_occupied.
14. IF the Player assigns a Human to a Job_Slot at a Competitor-owned Business or Vehicle, THEN THE Simulation SHALL reject the Command with Reason_Code not_owner.
15. WHILE a Human is unassigned, THE Simulation SHALL keep the Human idle at the Human's last position.
16. WHEN the Player selects a Job_Slot in Management_View, THE Panel SHALL list every Human in the Workforce with the Human's current state (unassigned, en route, working, occupied) and assign the Human the Player taps.
17. THE Simulation SHALL store a Human_Name for every Human in the Simulation state.
18. WHEN the Player starts a new Save_Slot, THE Simulation SHALL give the start-state Humans the Human_Names defined in start-state data (default "Jan" for the Bartender, "Julia" for the Server and "Thomas" for the Driver).
19. WHEN the Simulation creates a Human other than the named start-state Humans of criterion 7.18 (a hired Human, a Competitor Human or an employee of a non-player Business), THE Simulation SHALL give the Human a Human_Name drawn from the Name_Pool using the seeded random number generator.
20. WHEN the Simulation draws a Human_Name for a Human joining the Workforce and at least one Name_Pool entry is not used by a Human in the Workforce, THE Simulation SHALL draw only from the unused Name_Pool entries.
21. IF a Human joining the Workforce by hire or Acquisition would receive a Human_Name already used by a Human in the Workforce, THEN THE Simulation SHALL append the lowest numeric suffix, starting at 2, that makes the Human_Name unique in the Workforce (for example "Jan 2").
22. WHEN a name is added to the Name_Pool data, THE Simulation SHALL include the name in subsequent Human_Name draws without a code change.
23. THE Panel SHALL show each Human's Human_Name in the Human's details and in the Job_Slot assignment list of criterion 7.16.
24. WHILE CEO_Mode is active at the Person or Business Zoom_Level, THE Renderer SHALL show each visible Human's Human_Name above the Human.

### Requirement 8: Gold and Basic Finances (Phase 1)

**User Story:** As a player, I want clear income and expenses in Gold, so that I understand whether my business is profitable.

#### Acceptance Criteria

1. THE Simulation SHALL store every Gold amount as an integer number of hundredths of Gold.
2. THE Simulation SHALL record every change to the Player's Gold with a category (sales, tip, salary, hiring, severance, purchase, rental, construction, acquisition, liability, fine, market_sale, other) and the source Business or Vehicle, or "corporate" when no single source applies.
3. WHEN the Player opens the finance Panel, THE Panel SHALL show Gold income and expenses per category over the last 5 Game_Minutes.
4. IF the Player's Gold is lower than the cost of a Discretionary_Expense, THEN THE Simulation SHALL reject the Command with Reason_Code insufficient_gold and the missing Gold amount.
5. THE Simulation SHALL apply every Mandatory_Expense in full, including when the resulting Gold balance is negative.
6. WHILE the Player's Gold is negative, THE HUD SHALL show a debt warning.
7. WHILE the Player's Gold is negative, THE Simulation SHALL continue operating all Player-owned Businesses, Vehicles and Humans.
8. THE HUD SHALL display the Player's current Gold balance, rounded down to whole Gold, at all Zoom_Levels.
9. THE Simulation SHALL track no Gold balance for Competitors.
10. IF any Gold value in the Simulation state exceeds 2^50 hundredths of Gold (1,125,899,906,842,624) in absolute value, THEN THE Simulation SHALL report an invariant failure in development and test builds and log a developer warning in production builds, so that Gold stays within the safe-integer range.

### Requirement 9: Finite Storage (Phase 1)

**User Story:** As a player, I want every business to have limited storage, so that surpluses and shortages create meaningful logistics decisions.

#### Acceptance Criteria

1. THE Simulation SHALL give every Business a finite Storage capacity per Resource as defined in the Business Definition.
2. WHEN a Business is selected, THE Panel SHALL display each stored Resource as current amount over capacity (for example "Beer 480/500").
3. IF an output Resource's Storage at a Business is full, THEN THE Simulation SHALL pause the production rule producing that Resource until free capacity exists.
4. IF an unload would exceed a destination Storage capacity, THEN THE Simulation SHALL unload only the amount that fits and keep the remainder on the Vehicle.
5. IF a Storage capacity becomes lower than the current amount (for example after a Definition update applied by a migration), THEN THE Simulation SHALL keep the current amount, accept no inflow of that Resource until the amount is below capacity, and show "Over capacity" on the Business Panel.
6. WHEN a Player-owned Business's Storage for a Resource reaches 100% of capacity, THE Renderer SHALL show a full-storage indicator on the Business in the world (for example stacked crates).
7. WHEN a Player-owned Business's Storage for a Resource reaches 0, THE Renderer SHALL show an empty-storage indicator on the Business in the world (for example an empty shelf).
8. WHEN a Player-owned Business's Storage for a Resource reaches 100% of capacity, THE HUD SHALL raise a "Storage full" Alert on that Business until the amount falls below capacity.
9. WHEN a Player-owned Business's Storage for a consumed input Resource reaches 0, THE HUD SHALL raise a "Storage empty" Alert on that Business until the amount rises above 0.

### Requirement 10: External Beer Supply (Phase 1)

**User Story:** As a player, I want to buy beer from an external supplier, so that my pub can operate before I own any production.

#### Acceptance Criteria

1. THE Supplier SHALL offer Beer at the unit price defined in the Supplier Definition.
2. THE Supplier SHALL hold an unlimited Beer stock (default) for Player and Competitor Orders.
3. WHEN the Player places an Order with a positive whole quantity and a Player-owned destination Business and the Player's Gold is at least the Order cost, THE Simulation SHALL deduct the Order cost and reserve the ordered Beer at the Supplier for that destination.
4. IF the Player places an Order with a quantity that is not a positive whole number, THEN THE Simulation SHALL reject the Command with Reason_Code invalid_quantity.
5. IF the Player's Gold is lower than the Order cost, THEN THE Simulation SHALL reject the Order with Reason_Code insufficient_gold and the missing Gold amount.
6. THE Simulation SHALL move reserved Beer from the Supplier to the destination Business only by a Player-owned Vehicle physically travelling from the Supplier to the destination.
7. WHILE reserved Beer is waiting at the Supplier and no Player-owned Vehicle has a Route with a pickup stop at the Supplier, THE HUD SHALL show an "Awaiting pickup: no Route" Alert on the Supplier.
8. WHERE automatic reordering is enabled for a Pub, WHEN the Pub's Beer Storage amount plus Pending_Quantity falls below the Player-set reorder threshold, THE Simulation SHALL place an Order sized to the Pub's Beer capacity minus the current amount minus Pending_Quantity.
9. WHERE automatic reordering is enabled for a Pub, IF the Player's Gold is lower than the cost of the automatic Order, THEN THE Simulation SHALL reduce the Order to the largest whole quantity the Player's Gold covers.
10. WHERE automatic reordering is enabled for a Pub, IF the Player's Gold covers zero units, THEN THE Simulation SHALL place no Order, raise a "Reorder failed: insufficient Gold" Alert on the Pub and re-evaluate the reorder condition every Tick.
11. IF the Player sets a reorder threshold that is not a whole number between 0 and the Pub's Beer capacity, THEN THE Simulation SHALL reject the Command with Reason_Code invalid_threshold.
12. FOR ALL Ticks with automatic reordering enabled, THE Simulation SHALL keep the Pub's Beer amount plus Pending_Quantity at or below the Pub's Beer capacity after every automatic Order (no-overfill property).

### Requirement 11: Physical Logistics and Vehicles (Phase 1)

**User Story:** As a player, I want resources to physically travel in little vehicles, so that the economy is visible and logistics creates real bottlenecks.

#### Acceptance Criteria

1. THE Simulation SHALL transfer Resources between Businesses at different locations only by loading the Resources onto a Vehicle, moving the Vehicle, and unloading at the destination.
2. THE Simulation SHALL limit each Vehicle's cargo to the capacity defined in the Vehicle Definition.
3. WHILE a Vehicle carries cargo, THE Renderer SHALL show the cargo on the Vehicle as visible crates whose count scales with the cargo amount.
4. WHILE a Vehicle whose Definition requires a driver has no Driver on board and is not under Manual_Driving, THE Simulation SHALL keep the Vehicle stationary.
5. WHILE a Vehicle is under Automatic_Delivery, THE Simulation SHALL compute the Vehicle's travel time between stops as road-network distance divided by the Vehicle Definition's speed.
6. WHEN the Player selects a Vehicle, THE Panel SHALL show capacity, current cargo, Route, assigned Driver and deliveries per Game_Minute over a 5-Game_Minute Rolling_Window.
7. WHEN, over a 5-Game_Minute Rolling_Window, the consumption of a Resource at a Route's drop-off Business exceeds the quantity of that Resource the Route delivered by more than 10% (default), THE Management_View SHALL mark the Route as a bottleneck.
8. WHEN, over a 5-Game_Minute Rolling_Window, the production of a Resource at a Route's pickup Business exceeds the quantity of that Resource the Route picked up by more than 10% (default), THE Management_View SHALL mark the Route as a bottleneck.
9. WHEN neither bottleneck condition of criteria 11.7 and 11.8 holds for a Route, THE Management_View SHALL remove the bottleneck mark from the Route.

### Requirement 12: Automatic Delivery (Phase 1)

**User Story:** As a player, I want an employee to drive the van automatically, so that deliveries continue without my attention.

#### Acceptance Criteria

1. WHEN the Player creates a Route with at least two stops at distinct Businesses, each marked as pickup or drop-off, THE Simulation SHALL assign the Route to the selected Player-owned Vehicle.
2. IF the Player creates a Route with fewer than two distinct stops, THEN THE Simulation SHALL reject the Command with Reason_Code invalid_route.
3. IF the Player creates a Route with a stop at a Competitor-owned Business, THEN THE Simulation SHALL reject the Command with Reason_Code not_owner.
4. WHILE a Vehicle has a Route that is not suspended and a Driver on board, THE Simulation SHALL repeat the Route's stop cycle automatically.
5. WHILE a Vehicle has a Driver on board and no Route, THE Simulation SHALL keep the Vehicle parked and THE HUD SHALL show a "No Route" Alert on the Vehicle.
6. WHEN a Vehicle under Automatic_Delivery arrives at a pickup stop, THE Simulation SHALL load the smallest of the stop's available Player-owned or Player-reserved stock, the Vehicle's free capacity and the next drop-off Business's free Storage capacity.
7. IF the load amount at a pickup stop is zero, THEN THE Simulation SHALL make the Vehicle wait at the stop for the Route's wait time (default 10 game seconds), load the amount then available under criterion 12.6, and continue to the next stop.
8. WHEN a Vehicle under Automatic_Delivery arrives at a drop-off stop, THE Simulation SHALL unload the Vehicle's cargo of Resources accepted by that Business under criterion 9.4.
9. WHILE Automatic_Delivery is active, THE Renderer SHALL show the Vehicle driving along the road between stops.
10. THE Simulation SHALL continue all Automatic_Delivery Routes while the Player is in CEO_Mode, in Management_View or under Manual_Driving of a different Vehicle.

### Requirement 13: Manual Goofy Driving (Phase 1)

**User Story:** As a player, I want to jump into the van and drive it myself with silly arcade physics, so that I can personally help and have fun.

#### Acceptance Criteria

1. WHEN the CEO is within Interaction_Range of a Player-owned Vehicle and the Player triggers the "Drive" Context_Action, THE Game SHALL place the CEO in the Vehicle and switch the Vehicle to Manual_Driving.
2. WHILE the CEO is within Interaction_Range of a Competitor-owned Vehicle, THE HUD SHALL offer "Inspect" as the Context_Action for that Vehicle.
3. WHILE Manual_Driving is active, THE Physics_Layer SHALL simulate the Vehicle with the acceleration, steering looseness, body roll and collision bounciness values defined in the Vehicle Definition.
4. WHILE Manual_Driving is active, THE Physics_Layer SHALL cap the Vehicle's top speed at the Vehicle Definition's speed multiplied by 1 plus the Manual_Speed_Bonus (default +10%).
5. WHEN a manually driven Vehicle collides with any object, THE Simulation SHALL keep the full cargo quantity on the Vehicle.
6. WHEN a manually driven Vehicle's speed falls below 0.5 World_Units per second inside the Unloading_Zone of a Player-owned Business, the Supplier or the Market_Depot, THE HUD SHALL offer "Unload" as the Context_Action if that Business accepts part of the cargo, and "Load" otherwise.
7. WHEN the Player triggers "Load", THE Simulation SHALL load the smaller of the Business's available Player-owned or Player-reserved stock and the Vehicle's free capacity.
8. WHEN the Player triggers "Unload", THE Simulation SHALL unload the smaller of the cargo accepted by that Business and the Business's free Storage capacity.
9. WHEN a manual unload at a Player-owned Business completes, THE Simulation SHALL add a Manual_Delivery_Tip (default 5% of the unloaded quantity's value at the Supplier unit price) to the Player's Gold, counting only units whose most recent load was at the Supplier, the Market_Depot or a Brewery.
10. WHEN the Player takes over a Vehicle that was under Automatic_Delivery, THE Simulation SHALL suspend the Vehicle's Route and keep the displaced Driver assigned to the Vehicle, idle at the takeover location.
11. WHEN the Player exits Manual_Driving of a Vehicle with a suspended Route, THE Game SHALL ask the Player whether to resume the Route.
12. WHEN the Player confirms resuming a suspended Route, THE Simulation SHALL send the Vehicle's assigned Driver walking to the Vehicle and resume Automatic_Delivery from the Route stop nearest by road distance after the Driver boards.
13. IF the Player declines resuming a suspended Route, THEN THE Simulation SHALL keep the Route suspended and the Vehicle stationary, and THE Panel SHALL show a "Resume Route" action for the Vehicle.
14. IF a manually driven Vehicle stays tilted more than 90° from upright for 2 seconds of real time, THEN THE Game SHALL reset the Vehicle upright onto the nearest road point with its cargo intact.
15. IF a manually driven Vehicle leaves the drivable map area, THEN THE Game SHALL reset the Vehicle upright onto the nearest road point within 2 seconds of real time with its cargo intact.
16. THE Simulation SHALL keep every Phase 1 and Phase 2 delivery achievable through Automatic_Delivery without Manual_Driving.

### Requirement 14: CEO Mode (Phase 1)

**User Story:** As a player, I want to walk around as my CEO and interact with the world up close, so that I feel physically present in my business.

#### Acceptance Criteria

1. WHILE CEO_Mode is active, THE Input_System SHALL move the CEO using the left-thumb virtual joystick on touch devices and WASD or arrow keys on PC.
2. WHILE CEO_Mode is active and at least one interactable object is within Interaction_Range, THE HUD SHALL show one Context_Action button on the right side for the nearest such object.
3. WHILE CEO_Mode is active and no interactable object is within Interaction_Range, THE HUD SHALL hide the Context_Action button.
4. WHEN the Player triggers the "Enter" Context_Action at a Player-owned Business, THE Renderer SHALL show the Business interior with Customers and Humans visible.
5. WHILE the CEO is within Interaction_Range of the Competitor Pub, the Supplier or a Plot for sale, THE HUD SHALL offer "Inspect" as the Context_Action and THE Panel SHALL show the object's details when the Player triggers "Inspect".
6. WHEN the Player taps or clicks a Business, Vehicle, Human or Customer outside the joystick area, THE Panel SHALL show that object's details.
7. THE Simulation SHALL keep all Businesses, Vehicles and Humans operating while the Player is in CEO_Mode.

### Requirement 15: Management View and Continuous Zoom (Phase 1)

**User Story:** As a player, I want to zoom smoothly out from my CEO to the city, so that growing responsibilities feel like literally zooming out.

#### Acceptance Criteria

1. THE Camera_Controller SHALL move the tilted top-down camera continuously through the Zoom_Levels Person, Business, Street, Block, Neighbourhood and City without loading screens or separate menu scenes.
2. WHEN the Player pinches on touch devices or uses the mouse wheel or the +/- keys on PC, THE Camera_Controller SHALL change the camera distance continuously.
3. WHEN the camera distance increases past the Mode_Switch_Threshold, THE Game SHALL switch from CEO_Mode to Management_View.
4. WHEN the camera distance decreases below the Mode_Switch_Threshold minus a hysteresis of 5% of the threshold distance (default), THE Game SHALL switch from Management_View to CEO_Mode.
5. WHEN the Game switches from Management_View to CEO_Mode, THE Camera_Controller SHALL recentre the camera on the CEO within 0.5 seconds of real time.
6. WHILE Management_View is active, THE Simulation SHALL keep the CEO idle at the CEO's last position.
7. WHILE Manual_Driving is active, THE Camera_Controller SHALL limit the camera distance to the Person and Business Zoom_Levels.
8. WHILE Management_View is active, THE Renderer SHALL show owned Businesses, the Competitor Pub, the Supplier, empty Plots, Plots for sale, roads, Vehicles and active Routes, each with a marker in the Owner's colour.
9. WHILE Management_View is active, THE Input_System SHALL pan the camera by touch drag, by mouse drag and by WASD or arrow keys.
10. WHEN the Player selects a Business in Management_View, THE Panel SHALL show Storage, staffing, metrics and Job_Slots for assigning Humans.
11. WHILE more than 20 Customer figures (default) would be visible in the camera view, THE Renderer SHALL replace individual Customer figures with aggregated activity indicators per Business.
12. THE Camera_Controller SHALL keep one fixed camera yaw at every Zoom_Level and offer no camera rotation, and THE Input_System SHALL map joystick and WASD or arrow-key directions to fixed screen-aligned world axes.

### Requirement 16: Phase 1 World (Phase 1)

**User Story:** As a player, I want a small, colourful city block, so that my prototype business has a physical place to live.

#### Acceptance Criteria

1. THE Game SHALL provide a Phase 1 map whose unlocked starting District (Requirement 48) contains the Player's Pub (interior and exterior), the Supplier, one Competitor Pub, a road network connecting them, at least two empty Plots and at least one Plot for sale.
2. THE Game SHALL give every Business on the map a funny name drawn from data text tables.
3. THE Renderer SHALL draw Humans and Customers as capsules, Businesses as boxes and Vehicles as boxes with wheels as placeholder primitives.
4. THE Renderer SHALL load each model through the model key in the Definition, so that replacing a placeholder with a CC0 low-poly model (for example Kenney or KayKit) requires changing only the asset mapping.

### Requirement 17: Passive Competitor (Phase 1)

**User Story:** As a player, I want to see a rival pub from the start, so that the city feels competitive and alive.

#### Acceptance Criteria

1. THE Simulation SHALL operate the Competitor Pub using the same Pub Definition rules and customer loop as the Player's Pub, with the Competitor as Owner and Competitor Humans assigned per start-state data.
2. THE Renderer SHALL show the Competitor Pub with rival branding colours and visible Customer activity.
3. THE Simulation SHALL operate one Competitor Vehicle delivering Beer from the Supplier to the Competitor Pub along a fixed Route.
4. WHEN the Player selects the Competitor Pub, THE Panel SHALL show its name, its popularity band (Low, Medium or High, from arriving Customers per Game_Minute thresholds defined in data) and its drink price.

### Requirement 18: Touch-First and PC Controls (Phase 1)

**User Story:** As a player on a phone or PC, I want controls that fit my device, so that every mechanic is playable on both.

#### Acceptance Criteria

1. THE Game SHALL use a landscape-first layout.
2. WHILE a phone is in portrait orientation, THE Game SHALL show a rotate-device prompt.
3. THE HUD SHALL render every touch target with a minimum size of 44 × 44 CSS pixels (default).
4. THE Input_System SHALL make every mechanic operable using touch alone.
5. THE Input_System SHALL make every mechanic operable using keyboard alone.
6. WHERE the Game runs on PC, THE Input_System SHALL provide the default bindings WASD or arrow keys for movement and panning, mouse click for selection, mouse drag for panning, wheel and +/- keys for zoom, E for the Context_Action, Tab to cycle selectable objects in view, Enter to select, Esc to close the open Panel, P to open the Pause_Menu and the Game_Speed keys of criterion 47.8.
7. THE Game SHALL present details in side or bottom Panels covering at most 40% (default) of the landscape screen width for side Panels or height for bottom Panels.
8. THE Game SHALL show numeric data as compact cards with at most 8 values per Panel section, without spreadsheet-style tables.
9. WHILE no Panel is open, THE HUD SHALL show only Gold, active Alerts, the joystick on touch devices, the Context_Action button and, once available under Requirement 47, the Game_Speed control.
10. THE HUD SHALL show at most one Alert per Alert type per object.

### Requirement 19: Emergent Progression (Phase 1 and Phase 2)

**User Story:** As a player, I want new mechanics to appear because my business creates a problem, so that complexity feels earned instead of level-gated.

#### Acceptance Criteria

1. THE Game SHALL reveal each gated UI element or mechanic only through a Reveal_Trigger defined in data.
2. THE Game SHALL use no player level and no experience points.
3. THE Save_Serializer SHALL store the set of fired Reveal_Triggers in the Save_Document.
4. WHEN a Player-owned Storage first reaches 100% of capacity in a Save_Slot, THE Game SHALL reveal the storage response options defined in data for the current phase.
5. WHEN the first Lost_Customer with reason patience_expired occurs at a Player-owned Pub in a Save_Slot, THE Game SHALL reveal the hiring option on the Pub Panel.
6. WHEN the Player first opens Management_View in a Save_Slot, THE Renderer SHALL highlight the Supplier, the Competitor Pub and the Plot for sale for 10 seconds of real time (default) or until the Player taps the screen.

### Requirement 20: Tone and Presentation (Phase 1)

**User Story:** As a player, I want a colourful, toy-like, satirical world, so that the game is funny and pleasant to watch.

#### Acceptance Criteria

1. THE Renderer SHALL take all colours and the Vehicle and crate proportion scales from a single theme configuration that defines a saturated, toy-like palette.
2. THE Game SHALL source all Business names, Alert texts and News_Feed messages from data text tables, so that satirical corporate copy is editable without code changes.
3. WHEN a manually driven Vehicle collides, THE Renderer SHALL play a comedic bounce and wobble effect.

### Requirement 21: Pause on Background, No Offline Progress (Phase 1)

**User Story:** As a player, I want the game to pause when I leave, so that nothing happens to my business while I am away.

#### Acceptance Criteria

1. WHEN the document visibility state changes to hidden, THE Game SHALL stop advancing Ticks before the next Tick boundary.
2. WHEN Ticks stop because the document became hidden, THE Game SHALL write the Save_Document of the stopped state to Local_Store.
3. WHEN the document visibility state changes to visible, the Pause_Menu is closed and the Game_Speed speed pause is off, THE Game SHALL resume advancing Ticks from the in-memory state at which Ticks stopped, without simulating the elapsed real time.
4. WHEN the document visibility state changes to visible and the Pause_Menu is open, THE Game SHALL keep Ticks stopped.
5. WHEN a Save_Slot is loaded, THE Simulation SHALL resume from the stored Tick count without applying offline progress.
6. WHEN the Player opens the Pause_Menu, THE Game SHALL stop advancing Ticks and write the Save_Document to Local_Store.
7. WHEN the Player closes the Pause_Menu, THE Game SHALL resume advancing Ticks.
8. WHILE Ticks are stopped, THE Physics_Layer SHALL suspend physics stepping.

### Requirement 22: Profiles and Save Slots (Phase 1)

**User Story:** As a player sharing the server with my girlfriend, I want separate profiles and save slots, so that we each have our own playthroughs.

#### Acceptance Criteria

1. THE Save_API SHALL store multiple Profiles, each with a display name of 1 to 20 characters, unique ignoring letter case, and an optional PIN of 4 to 6 digits.
2. WHEN the Player creates a Profile with a valid display name and a valid or empty PIN, THE Save_API SHALL store the new Profile.
3. IF the Player creates a Profile with a display name that is empty, longer than 20 characters or already used, or a PIN that is not 4 to 6 digits, THEN THE Game SHALL reject the Profile and name the invalid field.
4. WHEN the Game starts, THE Game SHALL show a Profile picker listing all Profiles from the Save_API.
5. IF the Save_API is unreachable when the Game starts, THEN THE Game SHALL list the Profiles cached in Local_Store.
6. WHERE a Profile has a PIN, THE Game SHALL require the correct PIN before listing or loading that Profile's Save_Slots.
7. WHILE the Save_API is unreachable, THE Game SHALL verify a Profile PIN against the salted PIN hash cached in Local_Store.
8. WHERE a Profile has a PIN, THE Game SHALL require the current PIN before changing or removing the PIN.
9. THE Game SHALL allow each Profile to create, load, rename and delete Save_Slots with names of 1 to 30 characters.
10. WHEN the Player requests deletion of a Save_Slot, THE Game SHALL delete the Save_Slot only after the Player confirms a confirmation prompt.

### Requirement 23: Local Autosave (Phase 1)

**User Story:** As a player, I want automatic local saves, so that I never lose progress when my phone closes the app.

#### Acceptance Criteria

1. WHILE Ticks are advancing in a Save_Slot, THE Game SHALL write the Save_Document to Local_Store every 30 seconds of real time (default).
2. WHEN the page emits pagehide, THE Game SHALL write the Save_Document to Local_Store.
3. WHEN a Local_Store write is requested and the Tick count equals the Tick count of the last successful write of that Save_Slot, THE Game SHALL skip the write.
4. WHEN a Local_Store write succeeds, THE Game SHALL increase the Save_Slot's Revision by exactly 1.
5. IF IndexedDB is unavailable, THEN THE Local_Store SHALL fall back to localStorage.
6. WHEN the Local_Store first falls back to localStorage on a device, THE Game SHALL show a one-time warning.
7. IF a Local_Store write fails, THEN THE Game SHALL show a save-failure Alert and retry at the next autosave interval.

### Requirement 24: Save Serialization and Versioning (Phase 1)

**User Story:** As the developer, I want versioned saves with migrations, so that the game can evolve without breaking existing playthroughs.

#### Acceptance Criteria

1. THE Save_Serializer SHALL serialise the complete Simulation state, including Seed, random number generator state, Tick count, fired Reveal_Triggers, awarded Achievements and scheduled Consequences, into a Save_Document containing schema version, Revision, Synced_Revision, Profile identifier, Save_Slot identifier and timestamp.
2. THE Save_Serializer SHALL deserialise a Save_Document of the current schema version into a Simulation state.
3. FOR ALL valid Simulation states, serialising then deserialising SHALL produce a state equal to the original (round-trip property).
4. FOR ALL valid Simulation states, advancing N Ticks from the original state and advancing N Ticks from its serialised-then-deserialised copy with the same Commands SHALL produce identical states.
5. WHEN a Save_Document with an older schema version is loaded, THE Migration_Pipeline SHALL apply each migration step in version order up to the current schema version.
6. WHEN a migration is applied, THE Game SHALL keep the pre-migration Save_Document in Local_Store as the backup copy for that Save_Slot, replacing any older backup copy.
7. IF a migration step fails, THEN THE Game SHALL refuse to load the Save_Document, keep the stored copy unchanged and show an error naming the failed migration step.
8. IF a Save_Document has a newer schema version than the Game supports, THEN THE Game SHALL refuse to load the Save_Document, keep the stored copy unchanged and show a message asking the Player to update the Game.
9. IF a Save_Document fails validation, THEN THE Game SHALL refuse to load the Save_Document, keep the stored copy unchanged and show an error naming the first invalid field.
10. FOR ALL Save_Document fixtures of each supported older schema version, migrating to the current schema version SHALL produce a Save_Document that passes validation (migration property).

### Requirement 25: Server Save Sync and Cross-Device Continuation (Phase 1)

**User Story:** As a player, I want to continue the same playthrough on my PC and my phone, so that I can play wherever I am on my Tailscale network.

#### Acceptance Criteria

1. WHEN a Local_Store write succeeds and the Save_API is reachable, THE Sync_Service SHALL upload the Save_Document with the local Synced_Revision as its base revision.
2. WHEN the Save_API accepts an upload whose base revision equals the server's current Revision for that Save_Slot, THE Save_API SHALL store the Save_Document and THE Sync_Service SHALL set the local Synced_Revision to the uploaded Revision.
3. IF an upload's base revision differs from the server's current Revision for that Save_Slot, THEN THE Save_API SHALL reject the upload with a conflict response.
4. WHEN the Sync_Service detects a Sync_Conflict, THE Game SHALL stop advancing Ticks and ask the Player to choose between keeping the server version and overwriting the server with the local version.
5. WHEN the Player chooses to keep the server version, THE Game SHALL load the server Save_Document and keep the local version in Local_Store as the backup copy for that Save_Slot.
6. WHEN the Player chooses to overwrite the server version, THE Save_API SHALL replace the stored Save_Document with the local version and keep the replaced server version as the server backup copy for that Save_Slot.
7. WHEN the Player loads a Save_Slot, the Save_API is reachable and the local Revision equals the local Synced_Revision, THE Sync_Service SHALL load the server Save_Document if the server Revision is higher and the local Save_Document otherwise.
8. WHEN the Player loads a Save_Slot, the Save_API is reachable, the local Revision is higher than the local Synced_Revision and the server Revision equals the local Synced_Revision, THE Sync_Service SHALL load the local Save_Document and upload the local Save_Document.
9. WHEN the Player loads a Save_Slot, the Save_API is reachable, the local Revision is higher than the local Synced_Revision and the server Revision differs from the local Synced_Revision, THE Sync_Service SHALL treat the Save_Slot as a Sync_Conflict.
10. IF the Save_API is unreachable, THEN THE Sync_Service SHALL let play continue on Local_Store, mark the Save_Slot as "not synced" and retry the upload every 60 seconds of real time (default).
11. THE Save_API SHALL reject an uploaded Save_Document larger than 5 MB (default) or with an unsupported schema version, with an error naming the violated limit.
12. IF a local Save_Document is larger than 5 MB (default), THEN THE Sync_Service SHALL skip the upload, keep the local copy and show a "Too large to sync" Alert.
13. IF an uploaded Save_Document has a lower schema version than the stored Save_Document for that Save_Slot, THEN THE Save_API SHALL reject the upload with a client-outdated response and THE Game SHALL ask the Player to update the Game.
14. WHEN the Player deletes a Save_Slot while the Save_API is unreachable, THE Sync_Service SHALL queue the deletion and send the deletion at the next successful connection.
15. IF an upload targets a Save_Slot that the Save_API has marked as deleted, THEN THE Save_API SHALL reject the upload with a slot-deleted response and THE Game SHALL offer to keep the local copy as a new Save_Slot.
16. THE Save_API SHALL persist Profiles and Save_Documents on a Docker volume so that saves survive container restarts and image updates.

### Requirement 26: Lightweight Access Model (Phase 1)

**User Story:** As the server owner, I want simple access without accounts, so that playing stays easy on my private network.

#### Acceptance Criteria

1. THE Deployment_Container SHALL expose the Game and Save_API only on the Tailscale network interface or behind the user's existing Tailscale-only reverse proxy.
2. THE Save_API SHALL store Profile PINs only as salted hashes.
3. THE Local_Store SHALL cache Profile PINs only as the salted hashes received from the Save_API.
4. IF an incorrect PIN is entered 5 times (default) within 5 minutes of real time for a Profile, THEN THE Save_API SHALL reject further PIN attempts for that Profile for 5 minutes of real time (default).
5. IF an incorrect PIN is entered 5 times (default) within 5 minutes of real time for a Profile while the Save_API is unreachable, THEN THE Game SHALL reject further PIN attempts for that Profile on that device for 5 minutes of real time (default).
6. WHILE PIN attempts for a Profile are locked, THE Game SHALL show the remaining lockout time.
7. THE Save_API SHALL provide a server-side command, run inside the Deployment_Container, that removes the PIN of a named Profile.
8. THE Project_Documentation SHALL describe the PIN-removal command for forgotten PINs.
9. THE Project_Documentation SHALL state that the Profile picker and PIN are convenience features only and that no strong authentication exists beyond Tailscale network membership.

### Requirement 27: Second Pub (Phase 2)

**User Story:** As a player, I want to open or acquire a second pub, so that I can expand beyond my first location.

#### Acceptance Criteria

1. WHEN the Player buys a Plot for sale and the Player's Gold is at least the Plot price defined in data, THE Simulation SHALL deduct the Plot price and make the Plot a Player-owned empty Plot.
2. WHEN the Player confirms construction of a Pub on a Player-owned empty Plot and the Player's Gold is at least the construction cost defined in data, THE Simulation SHALL deduct the construction cost and mark the Plot as under construction.
3. WHEN the construction time defined in data has elapsed for a Plot under construction, THE Simulation SHALL create a new Player-owned Pub on that Plot.
4. THE Simulation SHALL operate each Player-owned Pub with its own Storage, Job_Slots, drink price, metrics and Sourcing_Policy.
5. WHILE the Player owns more than one Pub, THE Management_View SHALL show a summary card per Pub with Gold per Game_Minute, staffing state and Beer Storage level.

### Requirement 28: Warehouse (Phase 2)

**User Story:** As a player, I want a warehouse, so that I can buffer surpluses and supply several businesses.

#### Acceptance Criteria

1. WHEN the Player buys or starts renting a Warehouse and the Player's Gold is at least the purchase price or first rental fee defined in data, THE Simulation SHALL add a Player-owned Business with the Storage capacities per Resource defined in the Warehouse Definition.
2. WHILE a Warehouse has no working Warehouse_Worker, THE Simulation SHALL load and unload Vehicles at the Warehouse at the reduced rate defined in the Warehouse Definition.
3. THE Simulation SHALL allow Routes with a Warehouse as a pickup stop or drop-off stop.
4. WHILE the Player rents a Warehouse, THE Simulation SHALL deduct the rental fee per Game_Minute defined in data as a Mandatory_Expense.
5. IF the Player ends a Warehouse rental while the Warehouse Storage holds any Resource, THEN THE Simulation SHALL reject the Command with Reason_Code storage_not_empty.

### Requirement 29: Brewery Production (Phase 2)

**User Story:** As a player, I want to own a brewery that turns hops and malt into beer, so that I can produce my own supply.

#### Acceptance Criteria

1. WHILE a Brewery holds the Hops and Malt required by its Recipe in Storage, has the required Brewers working and has free Beer Storage, THE Simulation SHALL convert inputs into Beer at the rate defined in the production rule.
2. IF a Brewery lacks any required input or Brewer, THEN THE Simulation SHALL pause production and show each missing requirement on the Brewery Panel.
3. WHILE production is running, THE Renderer SHALL animate Brewers working and show Beer crates accumulating in the Brewery's storage area.
4. THE Simulation SHALL compute the Brewery's effective unit cost per Beer as input costs plus Brewer Salaries divided by Beer produced over a 5-Game_Minute Rolling_Window.
5. WHEN the Player selects a Brewery, THE Panel SHALL show the effective unit cost, or "n/a" when no Beer was produced in the Rolling_Window.

### Requirement 30: Market with Fluctuating Prices (Phase 2)

**User Story:** As a player, I want to buy and sell basic resources at changing prices, so that producing, consuming or selling are real trade-offs.

#### Acceptance Criteria

1. THE Market SHALL offer a buy price and a sell price for each tradable Resource (Phase 2: Beer, Hops, Malt).
2. THE Market SHALL update prices at the interval defined in data using a bounded random walk around each Resource's base price, driven by the seeded random number generator.
3. FOR ALL Market updates, THE Market SHALL keep each buy price greater than the corresponding sell price and both prices within the minimum and maximum bounds defined in data, with a minimum bound greater than 0 (price-bounds property).
4. WHEN the Player buys from the Market a positive whole quantity and the Player's Gold is at least the cost at the current buy price, THE Simulation SHALL deduct the cost and reserve the Resources at the Market_Depot for physical pickup.
5. WHEN a Player-owned Vehicle unloads a Resource at the Market_Depot, THE Simulation SHALL credit Gold at the sell price current at the unload Tick, with category market_sale.
6. WHEN the Player opens the Market Panel, THE Panel SHALL show current prices and a price trend of the last 10 updates per Resource, or of all updates when fewer than 10 exist.

### Requirement 31: Own versus Outsource (Phase 2)

**User Story:** As a player, I want to choose per business whether to buy externally, use internal production or both, so that I can balance cost, flexibility and complexity.

#### Acceptance Criteria

1. THE Simulation SHALL give each input of a Player-owned Business a Sourcing_Policy of "buy externally", "internal supply" or "internal first, buy shortfall".
2. WHILE a Sourcing_Policy is "internal first, buy shortfall", THE Simulation SHALL size automatic external Orders to the reorder quantity of criterion 10.8 minus the quantity available at Player-owned producer and Warehouse Businesses on Routes to that Business.
3. WHILE a Sourcing_Policy is "internal supply" and no Player-owned Route delivers that input to the Business, THE HUD SHALL show a "No internal supply" Alert on the Business.
4. THE Simulation SHALL allow the Player to produce Beer internally, buy Beer externally and sell surplus Beer at the same time.
5. WHEN the Player selects a Business input, THE Panel SHALL compare the current external unit price with the internal effective unit cost of criterion 29.4.

### Requirement 32: Acquisitions with Hidden Attributes (Phase 2)

**User Story:** As a player, I want to acquire existing businesses with surprises inside, so that expansion feels like discovery.

#### Acceptance Criteria

1. THE Simulation SHALL generate Acquisition_Offers for existing non-player Businesses at the intervals and conditions defined in data.
2. WHEN an Acquisition_Offer reaches its expiry time defined in data without being accepted, THE Simulation SHALL withdraw the Acquisition_Offer.
3. WHEN the Player inspects an Acquisition_Offer, THE Panel SHALL show name, asking price, employee count, capacity, popularity band, known Traits and one "?" marker per hidden attribute.
4. WHEN the Player accepts an Acquisition_Offer and the Player's Gold is at least the asking price, THE Simulation SHALL deduct the asking price, set the Player as Owner and transfer the Business's employees into the Workforce and its Customers present, Brand, equipment, Storage contents and Recipes to the Player.
5. IF the Player's Gold is lower than the asking price, THEN THE Simulation SHALL reject the Acquisition with Reason_Code insufficient_gold and show the missing Gold amount.
6. WHEN an Acquisition completes, THE Simulation SHALL schedule the reveal of each hidden Trait, Secret_Recipe or Liability at the reveal delay defined per attribute in data.
7. WHEN a hidden attribute is revealed, THE News_Feed SHALL announce the reveal.
8. WHEN a Liability is revealed, THE Simulation SHALL apply its defined cost as a Mandatory_Expense or its defined penalty (for example deduct 1,600 Gold for cellar repairs).

### Requirement 33: Brands (Phase 2)

**User Story:** As a player, I want products and businesses to carry brands, so that the same beer performs differently in different venues.

#### Acceptance Criteria

1. THE Definition_Registry SHALL define each Brand with a category (mainstream, traditional local, budget, premium) and demand and price modifiers per Venue_Type.
2. WHEN a Pub serves a branded product, THE Simulation SHALL apply the Brand's demand and price modifiers for that Pub's Venue_Type.
3. WHEN the Player acquires a Business with a Brand, THE Simulation SHALL add the Brand to the Player's available Brands.

### Requirement 34: Secret Recipes (Phase 2)

**User Story:** As a player, I want special recipes that only come from acquisitions, so that buying a business can unlock unique advantages.

#### Acceptance Criteria

1. THE Definition_Registry SHALL define Recipe product Traits from the set appeal, premium price, consumption speed, repeat-order chance, production cost and brand engagement.
2. WHEN a Player-owned Brewery produces Beer with a Recipe, THE Simulation SHALL track the produced Beer under that Recipe's identifier within the shared Beer Storage capacity.
3. WHEN a Bartender pours Beer at a Pub that holds Beer of more than one Recipe, THE Simulation SHALL pour the Beer that arrived earliest (first in, first out).
4. WHEN a Pub serves Beer with a Recipe Trait, THE Simulation SHALL apply the Trait's modifier (for example BADGER'S BITE adds 15 percentage points to repeat-order chance).
5. THE Simulation SHALL clamp every effective repeat-order chance to the range 0% to 90% (default).
6. THE Simulation SHALL make each Secret_Recipe obtainable only through an Acquisition.

### Requirement 35: Corporate Chains and Synergy (Phase 2)

**User Story:** As a player, I want vertically integrated chains to be recognised and rewarded, so that owning the whole supply line feels meaningful.

#### Acceptance Criteria

1. WHEN, within a 5-Game_Minute Rolling_Window, Resources flow through a sequence of at least 3 Player-owned Businesses or Vehicles from producer to consumer, THE Simulation SHALL register a Corporate_Chain with its length.
2. WHEN no Resource has flowed through a registered Corporate_Chain within the 5-Game_Minute Rolling_Window, THE Simulation SHALL mark the Corporate_Chain as inactive.
3. WHILE a Corporate_Chain is active, THE Simulation SHALL generate Synergy at the rate per chain length defined in data.
4. WHEN a Corporate_Chain is registered or its length increases, THE Renderer SHALL show a "CORPORATE CHAIN x<length> + Synergy" banner and highlight the chain's Routes in Management_View.
5. THE Definition_Registry SHALL define Synergy as a Corporate_Resource, so that later abilities can consume Synergy.

### Requirement 36: Reputation (Phase 2)

**User Story:** As a player, I want a reputation score, so that my choices, including shady ones, affect demand.

#### Acceptance Criteria

1. THE Simulation SHALL keep the Player's Reputation as an integer clamped to the range 0 to 100.
2. WHILE only Phase 1 content is active, THE Simulation SHALL keep Reputation at its start value.
3. WHEN Reputation changes, THE Simulation SHALL apply the demand modifier defined in data to every Player-owned Pub from the next Tick.
4. WHEN Reputation changes, THE News_Feed SHALL announce the change and its cause.

### Requirement 37: Questionable Opportunities (Phase 2)

**User Story:** As a player, I want tempting shady shortcuts with delayed consequences, so that I face funny moral and business gambles.

#### Acceptance Criteria

1. THE Simulation SHALL offer Questionable_Opportunities defined in data with required Human count, duration, reward, Gold cost and a satirical legal-status text (for example BACK-ALLEY BARRELS: 2 Humans, 45 seconds, 60 Beer, "Legal status: Let's not worry about that.").
2. WHEN the Player starts a Questionable_Opportunity with the required number of selected Humans, a Player-owned reward destination Business and Gold at least the cost, THE Simulation SHALL deduct the cost, remove the selected Humans from their Jobs and mark the selected Humans as occupied for the defined duration.
3. IF the Player starts a Questionable_Opportunity with fewer selected Humans than required, THEN THE Simulation SHALL reject the Command with Reason_Code insufficient_humans.
4. WHEN a Questionable_Opportunity's duration elapses, THE Simulation SHALL grant the reward to the destination Business, release the occupied Humans as unassigned and discard the reward quantity exceeding free Storage capacity.
5. WHEN a Questionable_Opportunity completes, THE Simulation SHALL roll each possible Consequence with its defined probability using the seeded random number generator and schedule each triggered Consequence at a delay sampled from its defined range.
6. WHEN a scheduled Consequence fires, THE Simulation SHALL apply its effects (for example Reputation −12 and a 300 Gold fine as a Mandatory_Expense).
7. WHEN a scheduled Consequence fires, THE News_Feed SHALL show its headline.
8. WHEN the Player inspects a Questionable_Opportunity, THE Panel SHALL show its reward, cost, duration and legal-status text without Consequence probabilities.

### Requirement 38: Competitor Events (Phase 2)

**User Story:** As a player, I want competitors to occasionally act, so that the city changes around me without a complex rival simulation.

#### Acceptance Criteria

1. THE Simulation SHALL trigger Competitor events from the data-defined event table at intervals drawn from the seeded random number generator, with the event types open a new location on a free Plot, change drink price, change popularity and offer a Competitor Business for sale.
2. IF an "open a new location" event fires while no free Plot exists, THEN THE Simulation SHALL skip the event.
3. WHEN a "change drink price" event fires, THE Simulation SHALL set the Competitor Pub's drink price within its Pub Definition's minimum and maximum drink price.
4. WHEN a Competitor event fires, THE News_Feed SHALL announce the event with the Competitor's name.
5. WHEN a Competitor offers a Business for sale, THE Simulation SHALL create an Acquisition_Offer for that Business.
6. THE Simulation SHALL model Competitors without revenue, valuation or debt calculations.

### Requirement 39: Optional Minigames (Phase 2)

**User Story:** As a player, I want optional hands-on minigames, so that I can personally help during busy moments.

#### Acceptance Criteria

1. WHILE the CEO is inside a Player-owned Pub and the number of waiting Customers exceeds the Help Serve threshold defined in data, THE HUD SHALL offer "Help Serve" as the Context_Action.
2. WHEN the Player completes a Minigame, THE Simulation SHALL grant the reward defined in data: faster Job completion, bonus Resources, a temporary efficiency boost of at most 15% for at most 60 seconds, or a revealed opportunity.
3. THE Simulation SHALL keep every Business fully operable by assigned Humans or automation without any Minigame being played.

### Requirement 40: Achievements (Phase 2)

**User Story:** As a player, I want satirical achievements, so that milestones are funny to reach.

#### Acceptance Criteria

1. THE Definition_Registry SHALL define each Achievement with a name, a satirical description and a game-state condition.
2. WHEN an Achievement condition becomes true for the first time in a Save_Slot, THE Game SHALL award the Achievement and show a toast with its name and description (for example "Synergy": nobody knows what it means, but you have 100).
3. THE Save_Serializer SHALL include awarded Achievements in the Save_Document.

### Requirement 41: Performance (Non-Functional)

**User Story:** As a player on a phone, I want smooth rendering, so that the game is pleasant to play on my device.

#### Acceptance Criteria

1. WHILE the Phase 1 map is displayed on a Mid_Range_Phone, THE Renderer SHALL sustain at least 30 frames per second averaged over any 10-second real-time window at every Zoom_Level.
2. WHILE the Phase 1 map is displayed on a PC with integrated graphics from 2020 or newer, THE Renderer SHALL sustain at least 60 frames per second averaged over any 10-second real-time window.
3. THE Simulation SHALL complete one Tick of the Phase 2 reference scenario (3 Pubs, 1 Brewery, 1 Warehouse, 4 Vehicles, 60 Customers) within 4 ms of real time on a Mid_Range_Phone.
4. WHEN the installed PWA is launched on a Mid_Range_Phone with cached assets, THE Game SHALL show the Profile picker within 5 seconds of real time.
5. WHEN the averaged frame rate falls below the target of criterion 41.1, THE Renderer SHALL lower render resolution in steps down to a minimum of 0.75× device pixel ratio.
6. WHEN the averaged frame rate exceeds the target of criterion 41.1 by at least 20% at reduced resolution, THE Renderer SHALL raise render resolution in steps up to a maximum of 1× device pixel ratio.

### Requirement 42: PWA Installability and Offline Play (Non-Functional)

**User Story:** As a player, I want to install the game on my phone and play without a connection, so that it feels like a native app.

#### Acceptance Criteria

1. THE PWA_Shell SHALL provide a web app manifest with name, icons, landscape orientation and standalone display mode, so that the Game is installable on Samsung Internet or Chrome on Android, Safari on iOS and Chromium browsers on PC.
2. WHEN the Game has been loaded once, THE PWA_Shell SHALL cache all application assets required to start and play from Local_Store without a network connection.
3. WHEN a new application version is available, THE PWA_Shell SHALL notify the Player.
4. WHEN a new application version is available, THE PWA_Shell SHALL apply the update only after the Player confirms or at the next app launch, and only after writing the current Save_Document to Local_Store.
5. WHILE offline, THE Game SHALL allow loading and playing Save_Slots present in Local_Store.

### Requirement 43: Deployment (Non-Functional)

**User Story:** As the server owner, I want a single Docker container on my Ubuntu server, so that deployment matches my other self-hosted apps.

#### Acceptance Criteria

1. THE Deployment_Container SHALL serve the built static frontend and the Save_API from one Docker image.
2. THE Project SHALL provide a Dockerfile and a docker-compose file that build and run the Deployment_Container on Ubuntu with a named volume for save data.
3. THE Deployment_Container SHALL serve the Game over HTTPS or behind a Tailscale-provided HTTPS endpoint, because service workers require a secure context.
4. WHEN the Deployment_Container starts, THE Save_API SHALL expose a health endpoint that returns success once storage is writable.

### Requirement 44: Testability (Non-Functional)

**User Story:** As the developer, I want automated tests for the simulation, so that economy changes do not silently break the game.

#### Acceptance Criteria

1. THE Project SHALL include a unit test runner and a property-based testing library for the Simulation, runnable in a single non-watch command.
2. THE Project SHALL include property tests for the determinism property (2.5), the storage invariant (2.10), the conservation invariant (2.11), price monotonicity (4.2), the reorder no-overfill property (10.12), the save round-trip properties (24.3, 24.4), the migration property (24.10), Human_Name uniqueness in the Workforce (7.20, 7.21) and the Market price-bounds property (30.3).
3. THE Simulation SHALL run headless in Node.js for tests without a browser or WebGL context.

### Requirement 45: Repository Hygiene and OneDrive Handling (Non-Functional)

**User Story:** As the developer, I want a clean git repository that coexists with OneDrive syncing, so that builds stay fast and the repo stays small.

#### Acceptance Criteria

1. THE Project SHALL include a .gitignore that excludes node_modules, build output, Vite and test caches, coverage reports, local environment files and save-data volumes.
2. THE Project_Documentation SHALL describe how to exclude node_modules and build caches from OneDrive syncing (for example by keeping them outside the synced folder or marking them as excluded), because the Project folder is OneDrive-synced.
3. THE Project SHALL commit a lockfile so that dependency versions are pinned.
4. THE Project SHALL use the branch main and the remote https://github.com/davidzonnenberg/HumanResource.git.

### Requirement 46: Extensibility Boundaries (Non-Functional)

**User Story:** As the developer, I want the architecture to leave room for future industries and systems, so that later features do not require rewriting the economy.

#### Acceptance Criteria

1. THE Simulation SHALL model production, storage, transport and trade only in terms of Definitions, so that a Forest → Timber → Construction → Supermarket chain can be added through new Definitions and production rules.
2. THE Simulation SHALL represent each Human's qualifications as a data-defined set, so that educated or specialist Humans can be added later.
3. THE Simulation SHALL give every Phase 1 and Phase 2 Human only the "regular" qualification.
4. THE Simulation SHALL represent a Vehicle's driver requirement as a data field, so that automated Vehicles can be defined later without a Driver Job.
5. THE Simulation SHALL represent Routes as stop lists independent of path-finding, so that traffic and routing simulation can replace direct road paths later.
6. THE Project SHALL limit implemented functionality to the Phase 1, Phase 2 and Non-Functional requirements of this document.
7. THE Game SHALL derive every displayed Human label from the Human_Name through a single display-name function, so that a later display-name mode (for example numbered Humans) requires changing only that function.
8. THE Game SHALL show user-facing text in English only and SHALL obtain every user-facing string by Text_Key from `packages/content/data/text/en.json` through a single lookup function t(), with no user-facing text literals in code, so that another language can be added later as a data file.

### Requirement 47: Game Speed (Phase 1)

**User Story:** As a player, I want to speed up time once my business runs smoothly, so that I can skip waiting; as the developer, I want every speed available while testing.

#### Acceptance Criteria

1. THE Game SHALL provide the Game_Speed settings 1x, 2x and 4x and a speed pause.
2. THE Game SHALL keep the current Game_Speed in client session state outside the Simulation state, so that Game_Speed is not part of the Save_Document and does not affect Simulation determinism.
3. WHEN a new Save_Slot starts or a Save_Slot is loaded, THE Game SHALL set Game_Speed to 1x with the speed pause off.
4. WHILE the game-speed Reveal_Trigger defined in data has not fired in the Save_Slot and Dev_Mode is off, THE Game SHALL run at 1x and show no Game_Speed control.
5. WHILE the game-speed Reveal_Trigger has fired in the Save_Slot or Dev_Mode is on, THE Game SHALL offer 1x, 2x, 4x and the speed pause.
6. THE Game SHALL turn Dev_Mode on when the URL contains the query parameter `dev=1`, in development builds, or when the Player enables the "Testing" option in the Pause_Menu, SHALL store the "Testing" option per device in Local_Store, and SHALL apply Dev_Mode without firing any Reveal_Trigger or changing the Simulation state.
7. WHILE 2x and 4x are offered, THE HUD SHALL show a Game_Speed touch control of at least 44 × 44 CSS pixels that shows the current setting and lets the Player choose 1x, 2x, 4x or the speed pause.
8. WHERE the Game runs on PC and 2x and 4x are offered, THE Input_System SHALL bind the keys 1, 2 and 3 to 1x, 2x and 4x, the keys ] and [ to the next higher and next lower speed, and the key 0 to toggle the speed pause.
9. WHEN the Player turns the speed pause on, THE Game SHALL stop advancing Ticks and suspend physics stepping without opening the Pause_Menu, and write the Save_Document to Local_Store.
10. WHEN the Player turns the speed pause off while the Pause_Menu is closed, the document is visible and no Sync_Conflict is open, THE Game SHALL resume advancing Ticks at the selected Game_Speed.
11. WHILE Manual_Driving is active, THE Game SHALL advance Ticks at 1x and SHALL restore the previously selected Game_Speed when Manual_Driving ends.

### Requirement 48: Districts (Phase 1)

**User Story:** As the developer, I want the map divided into Districts from the start, so that the city can later grow by unlocking areas without reworking the map, path-finding or saves.

#### Acceptance Criteria

1. THE Definition_Registry SHALL load the map from a world file listing all Districts and District_Connectors and from one data file per District containing that District's bounds, road sub-graph, Plots, Unloading_Zones, drivable bounds and walkable bounds.
2. IF two Districts share an identifier, a District_Connector references an unknown District or road node, or a Plot lies outside its District's bounds, THEN THE Definition_Registry SHALL reject the map with an error naming the District and the invalid field.
3. THE Simulation SHALL store a locked or unlocked state for every District in the Simulation state, and THE Save_Serializer SHALL include the District states in the Save_Document.
4. WHEN the Player starts a new Save_Slot, THE Simulation SHALL set the District states from start-state data, which for Phase 1 SHALL contain exactly one unlocked starting District and at most one neighbouring locked District.
5. THE Simulation SHALL compute all paths for Humans, the CEO and Vehicles over the union of the road sub-graphs of unlocked Districts, joined by every District_Connector whose two Districts are unlocked.
6. WHEN a District changes from locked to unlocked, THE Simulation SHALL recompute the precomputed paths for the new set of unlocked Districts before any movement in the next Tick.
7. IF a Command would assign a Human to a Job_Slot, add a Route stop or set an Order destination at a Business in a locked District, THEN THE Simulation SHALL reject the Command with Reason_Code district_locked.
8. WHILE a District is locked, THE Simulation SHALL keep the CEO, Humans and automatic Vehicles outside it, and THE Game SHALL treat its area as outside the drivable map area of criterion 13.15.
9. WHILE a District is locked, THE Renderer SHALL draw the District visibly as locked, and THE HUD SHALL offer no Context_Action for objects inside it.
10. THE Camera_Controller SHALL limit Management_View panning to the combined bounds of all unlocked Districts and SHALL set the City Zoom_Level maximum distance so that all unlocked Districts fit in view.
11. THE Definition_Registry SHALL define each District's unlock condition as data, so that District unlocking can be added later without changing path-finding, map or save code, and THE Game SHALL offer the Player no District unlock action in Phase 1.

### Requirement 49: Headcount Staffing Model (Phase 1, model-level)

**User Story:** As the developer, I want a Job_Slot to be fillable by an anonymous headcount as well as by a named Human, so that a later automation phase can turn people into numbers without reworking staffing.

#### Acceptance Criteria

1. THE Simulation SHALL represent the fill of every Job_Slot as empty, as one individual Human, or as a Headcount_Fill with a whole-number count and a Human Definition.
2. IF a Headcount_Fill has a count below 1 or above the Job Definition's maximum headcount per Job_Slot (default 1), THEN THE Save_Serializer SHALL refuse the state and name the invalid field.
3. WHILE a Job_Slot holds a Headcount_Fill of count N, THE Simulation SHALL provide the working capacity of N working Humans in that Job at the Job location, without walking, Human_Names or individual positions, and SHALL treat a Driver Headcount_Fill as a Driver on board.
4. WHILE a Job_Slot holds a Headcount_Fill, THE Simulation SHALL deduct the count multiplied by the Salary of the Headcount_Fill's Human Definition per Game_Minute as a Mandatory_Expense with category salary.
5. THE Simulation SHALL count a Headcount_Fill as working in staffing metrics, Alerts and production requirements in the same way as working individual Humans.
6. IF the Player assigns a Human to a Job_Slot that holds a Headcount_Fill, THEN THE Simulation SHALL reject the Command with Reason_Code slot_occupied.
7. WHILE Phase 1 content is active, THE Simulation SHALL create no Headcount_Fill, and THE Game SHALL provide no UI for creating or editing a Headcount_Fill.
8. THE Renderer SHALL draw no individual figure for a Headcount_Fill.
