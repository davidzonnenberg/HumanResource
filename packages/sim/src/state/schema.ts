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
  orderQueue: z.array(z.object({ customerId: id, placedTick: nonNegInt, poured: z.boolean() })),
  bar: z.array(z.object({ customerId: id, recipeId: id.nullable(), origin: lotOriginSchema })),
  arrivalAcc: finite,
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

export const scheduledEventSchema = z.object({
  seq: nonNegInt,
  fireTick: nonNegInt,
  kind: z.string(),
  payload: z.record(z.string(), z.union([z.string(), z.number()])),
});

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
  competitors: z.record(z.string(), z.object({ id, nameKey: id, colorToken: id })),
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
});
