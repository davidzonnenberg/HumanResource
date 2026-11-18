# Far-future wishlist

Ideas that are nowhere near implementation. They are not part of the spec and must not be built speculatively. The architecture should simply not block them.

## World and time

- Time of day / day-night cycle with busy evenings, opening hours and night deliveries.
- Weather that changes demand (sunny terraces, rainy days).
- Multiple cities and international expansion.

## People

- Educated specialists (R&D, engineering, AI, legal, marketing/data).
- Staff commuting, staff buses, remote work.
- "Numbers mode": Humans shown as headcount once automation/AI takes over (data model exists as Headcount_Fill).

## Economy and companies

- Additional industries: hop and grain farms, forestry, construction, property, supermarkets, food production, marketing agencies.
- Headquarters with corporate departments.
- Product creation (design your own beers and products).
- Competitor simulation with revenue, valuation, debt; buying struggling rivals.
- Supplier evolution (a tiny farm grows into a large agricultural company because of your demand).
- Contracts and partnerships: price agreements, exclusivity, joint ventures, minority stakes.
- Stock market.
- Vehicle manufacturing, autonomous delivery, electric power.
- Multiple vehicle types to buy (user plan, Nov 2026): more capacity, faster, longer range. Already data-driven per Vehicle Definition (capacity, speed, handling); range needs a fuel system (fuel capacity, consumption per distance, refuel stops, save migration).
- Alternative starts: wood chopping, small farm, delivery company, tiny shop, workshop.
- More Trait / Recipe modifier stats (requirement 34.1 ideas that no system reads yet, so the schema rejects them): consumption speed, production cost, brand engagement. Add a stat to `modifierStatSchema` only together with the code that reads it.

## Driving
- Crash damage (user idea, Nov 2026): hard impacts break part of the load (a crate cracks and its contents are lost) and later dent the vehicle. Needs a sim Command for "cargo lost" from the physics layer (cargo is sim data) plus a save field for vehicle condition. Visuals do not need a different model setup: crates are already separate meshes, so a broken crate can swap to a cracked variant, tint, or pop off with a little bounce; vehicle damage can use named parts inside one GLB (bumper, door, mirror) that get hidden, swapped or bent, plus scuff decals.
- Style points for a perfect drift (long slide, close to a wall, ending in the unloading zone), maybe feeding a small tip bonus or an achievement.
- Fuel/range per vehicle type (see "Multiple vehicle types" below).

## Map
- Move the Warehouse much further away from the pubs (user, Nov 2026, "for later"), so the long drive is part of the trade-off. Probably a plot in another District or at the far end of the ring road; check Phase 2 Warehouse placement in `phase2-guide.md` when doing it.

## Town and politics (user, Nov 2026)
- **Permit board.**
  - The Municipality lists permits: terrace, late licence, live music, extra seats. Each one changes a pub stat and has upkeep.
  - Implementation idea: `permits.json` definitions with modifiers, and an `applyPermit` Command that is only accepted when the CEO is at the office. Renewal goes through the scheduler.
  - With the planned generic Service definitions (see `docs/ideas.md`), this becomes a service with a `requiresPresence` flag and an `addModifier` effect rather than a new Command.
- **Council votes.**
  - Every few in-game days the council votes on a policy: alcohol tax, car-free main street, closing a road. You can lobby, which costs Gold or Favour.
  - Implementation idea: a scheduled `councilVote` event whose outcome is drawn from the seeded RNG, weighted by lobbying. The effect is a data modifier, or a road closed in the path provider.
  - Favour would be a new currency, so it needs state and a save migration.
- **Road works.**
  - A street is closed for a while and van routes take detours, which makes your route bottlenecks visible.
  - Implementation idea: `pathCacheFor` takes a `closedEdges` set from state, so it stays deterministic. The cache key must include the closed set.

## Logistics

- Traffic and congestion, road capacity, delivery scheduling.
- Satirical logistics R&D ("AI Traffic Optimization", traffic lights favouring company vans).
- Questionable traffic-infrastructure "research" (fictional, satirical).

## Multiplayer

- Shared city or competitive mode between players. Currently every device runs its own simulation and the server only stores saves.

## Platform
- Sync CEO Phone settings (dark mode, text size, notifications…) across devices with the profile. Today they are stored per device in IndexedDB (decision D7, `.kiro/specs/ceo-phone`). This needs a ProfileDto/server field and the patchProfile API.

- Other languages (Dutch first). All text already goes through `t()` keys, so this is a content task.
- Proper accounts and hardened security when the game is shared beyond the tailnet.
