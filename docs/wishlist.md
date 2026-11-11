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
- Alternative starts: wood chopping, small farm, delivery company, tiny shop, workshop.
- More Trait / Recipe modifier stats (requirement 34.1 ideas that no system reads yet, so the schema rejects them): consumption speed, production cost, brand engagement. Add a stat to `modifierStatSchema` only together with the code that reads it.

## Logistics

- Traffic and congestion, road capacity, delivery scheduling.
- Satirical logistics R&D ("AI Traffic Optimization", traffic lights favouring company vans).
- Questionable traffic-infrastructure "research" (fictional, satirical).

## Multiplayer

- Shared city or competitive mode between players. Currently every device runs its own simulation and the server only stores saves.

## Platform

- Other languages (Dutch first). All text already goes through `t()` keys, so this is a content task.
- Proper accounts and hardened security when the game is shared beyond the tailnet.
