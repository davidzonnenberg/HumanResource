// Zod schema of the complete Simulation state. It is the single source of the state types
// (see types.ts) and validates loaded saves, reporting the first invalid field (Requirement 24.9).
// State is plain JSON: records keyed by prefixed string ids, no Maps/classes/undefined values.
import { z } from 'zod';

const id = z.string().min(1);
const int = z.number().int();
const nonNegInt = int.nonnegative();
const finite = z.number().finite();
const goldSchema = int;

export const lotOriginSchema = z.enum(['start', 'supplier', 'market_depot', 'brewery', 'business', 'reward']);
export const lotSchema = z.object({
  qty: int.positive(),
  recipeId: id.nullable(),
  arrivedTick: nonNegInt,
  origin: lotOriginSchema,
});
export const stockSchema = z.object({ amount: nonNegInt, lots: z.array(lotSchema) });

export const staffTaskSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pour'), customerId: id, doneTick: nonNegInt }),
  z.object({ kind: z.literal('carry'), customerId: id, doneTick: nonNegInt }),
  z.object({ kind: z.literal('produce'), doneTick: nonNegInt }),
  z.object({ kind: z.literal('questionable'), runId: id }),
]);

export const slotFillSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('human'), humanId: id }),
  z.object({ kind: z.literal('headcount'), count: int.positive(), humanDefId: id }),
]);

export const jobSlotSchema = z.object({
  slotId: id,
  jobId: id,
  filledBy: slotFillSchema.nullable(),
  headcountTasks: z.array(staffTaskSchema.nullable()).optional(),
  headcountSalaryCarry: finite.optional(),
});

export const jobSlotRefSchema = z.object({ kind: z.enum(['business', 'vehicle']), id, slotId: id });

export const pathSchema = z.object({
  pts: z.array(z.tuple([finite, finite])).min(1),
  seg: nonNegInt,
  along: finite,
});

export const pubRuntimeSchema = z.object({
  drinkPrice: goldSchema,
  seats: z.array(id.nullable()),
  // `lot` is the recipe/origin of the unit being poured; set when pouring starts (lot threading).
  orderQueue: z.array(
    z.object({
      customerId: id,
      placedTick: nonNegInt,
      poured: z.boolean(),
      lot: z.object({ recipeId: id.nullable(), origin: lotOriginSchema }).optional(),
    }),
  ),
  bar: z.array(z.object({ customerId: id, recipeId: id.nullable(), origin: lotOriginSchema })),
  arrivalAcc: finite,
});

/** One production rule's runtime (Phase 2). `missing` holds `input:<res>` / `workers:<job>` / `output:<res>`. */
export const productionEntrySchema = z.object({
  ruleId: id,
  recipeId: id.nullable(),
  progressTicks: nonNegInt,
  running: z.boolean(),
  started: z.boolean(),
  missing: z.array(z.string()),
});

export const businessSchema = z.object({
  id,
  defId: id,
  owner: id,
  plotId: id,
  name: z.string(),
  storage: z.record(z.string(), stockSchema),
  jobSlots: z.array(jobSlotSchema),
  brandId: id.nullable(),
  traits: z.array(z.object({ traitId: id, hidden: z.boolean() })),
  sourcing: z.record(z.string(), z.enum(['buy_external', 'internal', 'internal_first'])),
  autoReorder: z.record(z.string(), z.object({ enabled: z.boolean(), threshold: nonNegInt, failed: z.boolean() })),
  pub: pubRuntimeSchema.optional(),
  // ---- Phase 2 (keys are omitted, never undefined, when not applicable) ----
  production: z.array(productionEntrySchema).optional(),
  /** Rented Warehouse: fee per Game_Minute with an exact carry (same pattern as salary). */
  rental: z.object({ feePerMinute: goldSchema, carry: finite }).optional(),
  recipes: z.array(id).optional(),
});

export const humanLocationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('at'), x: finite, z: finite, insideBusinessId: id.nullable() }),
  z.object({ kind: z.literal('walking'), path: pathSchema }),
  z.object({ kind: z.literal('onVehicle'), vehicleId: id }),
]);

export const humanSchema = z.object({
  id,
  defId: id,
  name: z.string().min(1),
  owner: id,
  qualifications: z.array(z.string()),
  assignment: jobSlotRefSchema.nullable(),
  status: z.enum(['unassigned', 'en_route', 'working', 'occupied']),
  location: humanLocationSchema,
  task: staffTaskSchema.nullable(),
  salaryCarry: finite,
});

export const customerSchema = z.object({
  id,
  pubId: id,
  seat: nonNegInt,
  state: z.enum(['entering', 'waiting', 'drinking', 'paying', 'leaving']),
  stateUntil: nonNegInt,
  drinksConsumed: nonNegInt,
  servedAny: z.boolean(),
  seatedTick: nonNegInt,
  currentLot: z.object({ recipeId: id.nullable(), origin: lotOriginSchema }).nullable(),
});

export const vehicleSchema = z.object({
  id,
  defId: id,
  owner: id,
  name: z.string(),
  cargo: z.record(z.string(), stockSchema),
  jobSlots: z.array(jobSlotSchema),
  driverOnBoard: z.boolean(),
  control: z.enum(['auto', 'manual', 'parked']),
  routeId: id.nullable(),
  routeSuspended: z.boolean(),
  pose: z.object({ x: finite, z: finite, heading: finite, speed: finite }),
  path: pathSchema.nullable(),
  stopIndex: nonNegInt,
  phase: z.enum(['driving', 'loading', 'unloading', 'waiting', 'idle']),
  phaseUntil: nonNegInt,
  retriedLoad: z.boolean(),
});

export const routeSchema = z.object({
  id,
  vehicleId: id,
  owner: id,
  stops: z
    .array(z.object({ businessId: id, action: z.enum(['pickup', 'dropoff']), resources: z.union([z.literal('all'), z.array(id)]) }))
    .min(2),
  waitSeconds: z.number().nonnegative(),
});

export const orderSchema = z.object({
  id,
  owner: id,
  sourceId: id,
  destinationId: id.nullable(),
  resourceId: id,
  remaining: int.positive(),
  placedTick: nonNegInt,
});

export const plotSchema = z.object({
  id,
  districtId: id,
  status: z.enum(['empty', 'for_sale', 'under_construction', 'occupied']),
  owner: id.nullable(),
  businessId: id.nullable(),
  price: goldSchema.nullable(),
  construction: z.object({ defId: id, doneTick: nonNegInt }).optional(),
});

export const ceoSchema = z.object({
  x: finite,
  z: finite,
  heading: finite,
  insideBusinessId: id.nullable(),
  drivingVehicleId: id.nullable(),
});

export const ringSchema = z.object({ size: int.positive(), secs: z.array(int), values: z.array(finite) });

export const pubMetricsSchema = z.object({
  arrivals: ringSchema,
  lostNoSeat: ringSchema,
  lostOutOfBeer: ringSchema,
  lostPatience: ringSchema,
  waitSum: ringSchema,
  waitCount: ringSchema,
  staff: ringSchema,
});

export const metricsSchema = z.object({
  pubs: z.record(z.string(), pubMetricsSchema),
  vehicles: z.record(z.string(), z.object({ deliveries: ringSchema, delivered: ringSchema })),
  routesBottleneck: z.record(z.string(), z.boolean()),
  /** Phase 2: per production Business, consumed input quantities by Resource and produced units (29.4). */
  production: z
    .record(z.string(), z.object({ consumed: z.record(z.string(), ringSchema), produced: ringSchema }))
    .optional(),
});

export const financeSchema = z.object({
  buckets: z.array(z.object({ second: nonNegInt, byKey: z.record(z.string(), goldSchema) })),
});

export const alertSchema = z.object({
  key: id,
  type: id,
  objectId: id,
  since: nonNegInt,
  variant: z.string().optional(),
});

/** Kinds the scheduler can dispatch (core/scheduler.ts). An unknown kind makes the save invalid. */
export const scheduledKindSchema = z.enum(['constructionDone', 'revealAttribute', 'questionableDone', 'consequence']);

export const scheduledEventSchema = z.object({
  seq: nonNegInt,
  fireTick: nonNegInt,
  kind: scheduledKindSchema,
  payload: z.record(z.string(), z.union([z.string(), z.number()])),
});

// ---------- Phase 2 sections (optional in the schema; newGame always creates them) ----------
export const marketStateSchema = z.object({
  prices: z.record(z.string(), z.object({ buy: goldSchema, sell: goldSchema, history: z.array(goldSchema) })), // history = last 10 sell prices
  nextUpdateTick: nonNegInt,
});

export const acquisitionOfferSchema = z.object({
  id,
  businessId: id,
  askingPrice: goldSchema,
  expiresTick: nonNegInt,
  knownTraits: z.array(id),
  hidden: z.array(z.object({ kind: z.enum(['trait', 'recipe']), id })),
});
export const acquisitionsStateSchema = z.object({
  offers: z.record(z.string(), acquisitionOfferSchema),
  nextOfferTick: nonNegInt,
});

export const runningQuestionableSchema = z.object({
  id,
  defId: id,
  humanIds: z.array(id),
  destinationId: id,
  doneTick: nonNegInt,
});
export const questionableStateSchema = z.object({
  offers: z.record(z.string(), z.object({ id, defId: id, expiresTick: nonNegInt })),
  running: z.record(z.string(), runningQuestionableSchema),
  nextRefreshTick: nonNegInt,
});

export const corporateChainSchema = z.object({
  key: id,
  nodes: z.array(id).min(1),
  length: int.positive(),
  active: z.boolean(),
  lastFlowSecond: nonNegInt,
});
export const chainsStateSchema = z.object({
  /** "fromId>toId" -> last game second with a transfer on that edge. */
  edges: z.record(z.string(), nonNegInt),
  /** Nodes joined by ">" -> chain. */
  registered: z.record(z.string(), corporateChainSchema),
  synergyCarry: finite,
});

export const boostSchema = z.object({
  businessId: id,
  stat: z.literal('serviceSpeed'),
  pct: int.positive(),
  untilTick: nonNegInt,
});

export const reputationPendingSchema = z.object({ delta: int, causeKey: z.string() });

export const newsItemSchema = z.object({
  tick: nonNegInt,
  textKey: id,
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const simStateSchema = z.object({
  tick: nonNegInt,
  seed: int,
  rng: z.tuple([int, int, int, int]),
  idCounters: z.record(z.string(), nonNegInt),
  districts: z.record(z.string(), z.object({ unlocked: z.boolean() })),
  player: z.object({
    gold: goldSchema,
    reputation: int.min(0).max(100),
    corporateResources: z.record(z.string(), finite),
    availableBrands: z.array(id),
    recipes: z.array(id),
  }),
  competitors: z.record(
    z.string(),
    z.object({
      id,
      nameKey: id,
      colorToken: id,
      // Phase 2: set lazily by the competitorEvents system (absent = unscheduled / 10000 bp).
      nextEventTick: nonNegInt.optional(),
      popularityBp: int.optional(),
    }),
  ),
  plots: z.record(z.string(), plotSchema),
  businesses: z.record(z.string(), businessSchema),
  humans: z.record(z.string(), humanSchema),
  customers: z.record(z.string(), customerSchema),
  vehicles: z.record(z.string(), vehicleSchema),
  routes: z.record(z.string(), routeSchema),
  orders: z.record(z.string(), orderSchema),
  ceo: ceoSchema,
  scheduler: z.array(scheduledEventSchema),
  schedulerSeq: nonNegInt,
  metrics: metricsSchema,
  finance: financeSchema,
  resourceTotals: z.record(z.string(), int),
  alerts: z.record(z.string(), alertSchema),
  reveals: z.object({ fired: z.array(id) }),
  achievements: z.array(id),
  news: z.array(newsItemSchema),
  // Phase 2 sections. Systems return early when their section is absent.
  market: marketStateSchema.optional(),
  acquisitions: acquisitionsStateSchema.optional(),
  questionable: questionableStateSchema.optional(),
  chains: chainsStateSchema.optional(),
  boosts: z.array(boostSchema).optional(),
  reputationPending: z.array(reputationPendingSchema).optional(),
});
