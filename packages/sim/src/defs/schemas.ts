// Zod schemas for every Definition (Requirement 1). Types are inferred from the schemas so
// data and code can never drift apart. Formulas are parameterised kinds, never code strings.
import { z } from 'zod';

const id = z.string().min(1);
const gold = z.number().int(); // integer hundredths of Gold
const point2 = z.tuple([z.number(), z.number()]);
const polygon = z.array(point2).min(3);

// ---------- Conditions (Reveal_Triggers, Achievements, District unlocks) ----------
export type Condition =
  | { kind: 'event'; event: string; where?: Record<string, string | number | boolean> }
  | { kind: 'goldAtLeast'; amount: number }
  | { kind: 'corporateResourceAtLeast'; resourceId: string; amount: number }
  | { kind: 'ownedBusinessCountAtLeast'; businessType: string; count: number }
  | { kind: 'tickAtLeast'; tick: number }
  | { kind: 'never' }
  | { kind: 'all' | 'any'; of: Condition[] };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal('event'),
      event: id,
      where: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    }),
    z.object({ kind: z.literal('goldAtLeast'), amount: gold }),
    z.object({ kind: z.literal('corporateResourceAtLeast'), resourceId: id, amount: z.number() }),
    z.object({ kind: z.literal('ownedBusinessCountAtLeast'), businessType: id, count: z.number().int() }),
    z.object({ kind: z.literal('tickAtLeast'), tick: z.number().int().nonnegative() }),
    z.object({ kind: z.literal('never') }),
    z.object({ kind: z.enum(['all', 'any']), of: z.array(conditionSchema) }),
  ]),
) as z.ZodType<Condition>;

// ---------- Resources ----------
export const resourceDefSchema = z.object({
  id,
  kind: z.enum(['storable', 'corporate']),
  tradable: z.boolean(),
  modelKey: id,
  nameKey: id,
  crateUnits: z.number().int().positive(),
});
export type ResourceDef = z.infer<typeof resourceDefSchema>;

// ---------- Formulas ----------
const piecewise = z.object({ points: z.array(point2).min(1) });
export const demandFormulaSchema = z.object({
  kind: z.literal('piecewise'),
  price: piecewise, // price in Gold hundredths -> multiplier (must be non-increasing)
  reputation: piecewise, // reputation 0..100 -> multiplier
});
export type DemandFormula = z.infer<typeof demandFormulaSchema>;

export const staffingFormulaSchema = z.object({
  kind: z.literal('throughput'),
  expectedDrinksPerVisit: z.number().positive(),
  serverRatio: z.number().nonnegative(),
  headroom: z.number().positive(),
});
export type StaffingFormula = z.infer<typeof staffingFormulaSchema>;

// ---------- Businesses ----------
export const pubParamsSchema = z.object({
  venueType: id,
  seats: z.number().int(),
  baseDemandPerMinute: z.number().nonnegative(),
  patienceSeconds: z.number().positive(),
  bartendingIntervalSeconds: z.number().positive(),
  enterSeconds: z.number().positive(),
  drinkSeconds: z.number().positive(),
  paySeconds: z.number().positive(),
  leaveSeconds: z.number().positive(),
  serveDistance: z.number().positive(),
  minDrinkPrice: gold,
  maxDrinkPrice: gold,
  defaultDrinkPrice: gold,
  repeatOrderChance: z.number().min(0).max(1),
  maxDrinksPerVisit: z.number().int().positive(),
  drinkResource: id,
  demand: demandFormulaSchema,
  staffing: staffingFormulaSchema,
});
export type PubParams = z.infer<typeof pubParamsSchema>;

export const supplierParamsSchema = z.object({
  sells: z.array(z.object({ resourceId: id, unitPrice: gold })).min(1),
});
export type SupplierParams = z.infer<typeof supplierParamsSchema>;

export const productionRuleSchema = z.object({
  id,
  inputs: z.record(z.string(), z.number().int().positive()),
  outputs: z.record(z.string(), z.number().int().positive()),
  cycleSeconds: z.number().positive(),
  requiredJob: id,
  requiredWorkers: z.number().int().nonnegative(),
  recipeFromState: z.boolean(),
});
export type ProductionRule = z.infer<typeof productionRuleSchema>;

export const sourcingPolicySchema = z.enum(['buy_external', 'internal', 'internal_first']);
export type SourcingPolicy = z.infer<typeof sourcingPolicySchema>;

export const businessDefSchema = z.object({
  id,
  type: id,
  nameTable: id, // text table of funny names, e.g. "names.pub"
  inputs: z.array(id),
  outputs: z.array(id),
  storage: z.record(z.string(), z.number().int().nonnegative()),
  humanRequirements: z.array(
    z.object({ jobId: id, slots: z.number().int().nonnegative(), requiredForProduction: z.number().int().nonnegative() }),
  ),
  productionRules: z.array(productionRuleSchema),
  brand: id.nullable(),
  traits: z.array(id),
  locationConstraints: z.object({ plotTags: z.array(z.string()) }),
  owner: z.enum(['any', 'player', 'competitor', 'npc']),
  automation: z.object({ autoReorderAvailable: z.boolean(), defaultSourcing: sourcingPolicySchema }),
  loadRatePerSecond: z.number().positive(),
  modelKey: id,
  layoutKey: id,
  pub: pubParamsSchema.optional(),
  supplier: supplierParamsSchema.optional(),
  // ---- Phase 2 (all optional, so Phase 1 definitions stay valid) ----
  /** Buildable on an empty Player Plot via `construct`. */
  construction: z.object({ cost: gold, seconds: z.number().positive() }).optional(),
  /** Acquirable via `acquireWarehouse` (buy once, or rent per Game_Minute). */
  warehouse: z.object({ buyPrice: gold, rentPerMinute: gold }).optional(),
  /** Load/unload rate while no Warehouse_Worker is working (28.2). Must be below loadRatePerSecond. */
  unstaffedLoadRatePerSecond: z.number().positive().optional(),
  /** Marker: Market pickup/sale point. Written as `{}` in JSON. */
  marketDepot: z.record(z.string(), z.never()).optional(),
  /** Recipes held by Businesses of this Definition (Secret_Recipes travel via Acquisition). */
  recipes: z.array(id).optional(),
  /** Makes Businesses of this Definition acquirable. */
  acquisition: z.object({ askingPrice: gold }).optional(),
});
export type BusinessDef = z.infer<typeof businessDefSchema>;

// ---------- Vehicles, Jobs, Humans ----------
export const vehicleDefSchema = z.object({
  id,
  type: id,
  nameKey: id,
  capacity: z.number().int().positive(),
  speed: z.number().positive(), // World_Units per second
  driverRequirement: z.object({ jobId: id }).nullable(), // null = driverless (later automation)
  allowedResources: z.array(id),
  handling: z.object({
    acceleration: z.number().positive(),
    steeringLooseness: z.number().min(0).max(1),
    bodyRoll: z.number().nonnegative(),
    bounciness: z.number().min(0).max(1),
    mass: z.number().positive(),
    turnRate: z.number().positive(),
  }),
  modelKey: id,
});
export type VehicleDef = z.infer<typeof vehicleDefSchema>;

export const jobDefSchema = z.object({
  id,
  nameKey: id,
  requiredQualifications: z.array(z.string()),
  movementSpeed: z.number().positive(),
  maxHeadcountPerSlot: z.number().int(),
  service: z.boolean(), // counts as a service Human in Pub metrics
});
export type JobDef = z.infer<typeof jobDefSchema>;

export const humanDefSchema = z.object({
  id,
  qualifications: z.array(z.string()),
  salaryPerMinute: gold,
  severance: gold,
  walkingSpeed: z.number().positive(),
  hiring: z.object({ factor: z.number().nonnegative(), minutes: z.number().nonnegative() }),
  modelKey: id,
});
export type HumanDef = z.infer<typeof humanDefSchema>;

// ---------- Traits, Recipes, Brands (Phase 2 content, schema exists from Phase 1) ----------
/** Wired stats only: a stat that no code reads must not be accepted in content (phase2-guide A2). */
export const modifierStatSchema = z.enum(['repeatOrderChance', 'premiumPrice', 'demand']);
export type ModifierStat = z.infer<typeof modifierStatSchema>;
export const modifierSchema = z.object({ stat: modifierStatSchema, addPct: z.number() });
export const traitDefSchema = z.object({
  id,
  nameKey: id,
  target: z.enum(['business', 'recipe', 'brand']),
  modifiers: z.array(modifierSchema),
  liability: z.object({ cost: gold, penalty: z.array(modifierSchema).optional() }).optional(),
  revealDelaySeconds: point2.optional(),
});
export type TraitDef = z.infer<typeof traitDefSchema>;

export const recipeDefSchema = z.object({ id, nameKey: id, product: id, traits: z.array(id), secret: z.boolean() });
export type RecipeDef = z.infer<typeof recipeDefSchema>;

export const brandDefSchema = z.object({
  id,
  nameKey: id,
  category: z.enum(['mainstream', 'traditional_local', 'budget', 'premium']),
  perVenue: z.record(z.string(), z.object({ demandMul: z.number().positive(), priceMul: z.number().positive() })),
});
export type BrandDef = z.infer<typeof brandDefSchema>;

export const achievementDefSchema = z.object({ id, nameKey: id, descriptionKey: id, condition: conditionSchema });
export type AchievementDef = z.infer<typeof achievementDefSchema>;

export const revealTriggerDefSchema = z.object({
  id,
  condition: conditionSchema,
  reveals: z.array(id).min(1),
  phase: z.union([z.literal(1), z.literal(2)]),
});
export type RevealTriggerDef = z.infer<typeof revealTriggerDefSchema>;

// ---------- Map: World + Districts (Requirement 48) ----------
export const plotDefSchema = z.object({
  id,
  x: z.number(),
  z: z.number(),
  w: z.number().positive(),
  d: z.number().positive(),
  rotation: z.number(),
  tags: z.array(z.string()),
  accessNode: id, // local node id inside the District
  unloadingZone: z.object({ x: z.number(), z: z.number(), w: z.number().positive(), d: z.number().positive() }),
  initial: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('empty') }),
    z.object({ kind: z.literal('for_sale'), price: gold }),
    z.object({ kind: z.literal('reserved') }), // filled by start-state data
  ]),
});
export type PlotDef = z.infer<typeof plotDefSchema>;

export const districtDefSchema = z.object({
  id,
  nameKey: id,
  bounds: polygon,
  nodes: z.array(z.object({ id, x: z.number(), z: z.number() })).min(1),
  edges: z.array(z.object({ id, a: id, b: id })),
  plots: z.array(plotDefSchema),
  drivableBounds: polygon,
  walkableBounds: polygon,
});
export type DistrictDef = z.infer<typeof districtDefSchema>;

export const worldDefSchema = z.object({
  districts: z.array(z.object({ id, file: id, unlockCondition: conditionSchema.nullable() })).min(1),
  connectors: z.array(
    z.object({ id, a: z.object({ district: id, node: id }), b: z.object({ district: id, node: id }) }),
  ),
});
export type WorldFileDef = z.infer<typeof worldDefSchema>;

// ---------- Config ----------
export const simConfigSchema = z.object({
  tickMs: z.number().int().positive(),
  ticksPerSecond: z.number().int().positive(),
  maxTicksPerFrame: z.number().int().positive(),
  gameSpeeds: z.array(z.number().int().positive()).min(1),
  interactionRange: z.number().positive(),
  manualSpeedBonus: z.number().nonnegative(),
  manualTipFactor: z.number().nonnegative(),
  stoppedSpeed: z.number().nonnegative(),
  lostAlertPct: z.number().nonnegative(),
  lostAlertMinArrivals: z.number().int().nonnegative(),
  bottleneckPct: z.number().nonnegative(),
  routeWaitSeconds: z.number().nonnegative(),
  repeatChanceMax: z.number().min(0).max(1),
  reputationStart: z.number().int().min(0).max(100),
  popularityBands: z.object({ low: z.number(), high: z.number() }),
  ceoWalkingSpeed: z.number().positive(),
  boardingDistance: z.number().positive(),
  pubWindowSeconds: z.number().int().positive(),
  vehicleWindowSeconds: z.number().int().positive(),
  financeWindowSeconds: z.number().int().positive(),
  newsLimit: z.number().int().positive(),
});
export type SimConfig = z.infer<typeof simConfigSchema>;

// ---------- Phase 2 tables ----------
/** Integer percent 0..100. Chances in data are integer percent and rolled with rngInt(0, 99). */
const percent = z.number().int().min(0).max(100);
const range2 = z.tuple([z.number().nonnegative(), z.number().nonnegative()]); // [min, max] seconds

/**
 * Market prices (30). `base` is the STARTING BUY price; the starting sell price is
 * `base - minSpread`. Both walk inside [min, max] with buy = sell + spread, so the validation is
 * min + minSpread <= base <= max.
 */
export const marketConfigSchema = z.object({
  intervalSeconds: z.number().positive(),
  resources: z.record(
    z.string(),
    z.object({ base: gold, min: gold, max: gold, minSpread: gold, step: gold }),
  ),
});
export type MarketConfig = z.infer<typeof marketConfigSchema>;

export const acquisitionConfigSchema = z.object({
  intervalSeconds: range2,
  expirySeconds: z.number().positive(),
  maxOpenOffers: z.number().int().positive(),
});
export type AcquisitionConfig = z.infer<typeof acquisitionConfigSchema>;

export const questionableDefSchema = z.object({
  id,
  nameKey: id,
  legalKey: id, // legal-status text shown to the Player; the probabilities below never are (37.8)
  humans: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  cost: gold,
  reward: z.object({ resourceId: id, qty: z.number().int().positive() }),
  consequences: z.array(
    z.object({ chancePct: percent, delaySeconds: range2, reputationDelta: z.number().int(), fine: gold, headlineKey: id }),
  ),
});
export type QuestionableDef = z.infer<typeof questionableDefSchema>;

export const questionableConfigSchema = z.object({
  refreshSeconds: z.number().positive(),
  maxOffers: z.number().int().positive(),
});
export type QuestionableConfig = z.infer<typeof questionableConfigSchema>;

const weight = z.number().int().positive();
export const competitorEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('openLocation'), weight, businessDefId: id }),
  z.object({ kind: z.literal('changePrice'), weight, maxStep: gold }),
  z.object({ kind: z.literal('changePopularity'), weight, stepBp: z.number().int().positive(), minBp: z.number().int().positive(), maxBp: z.number().int().positive() }),
  z.object({ kind: z.literal('offerForSale'), weight }),
]);
export type CompetitorEventDef = z.infer<typeof competitorEventSchema>;
export const competitorEventsSchema = z.object({
  intervalSeconds: range2,
  events: z.array(competitorEventSchema).min(1),
});
export type CompetitorEventsConfig = z.infer<typeof competitorEventsSchema>;

/** Minigame boosts are bounded IN THE SCHEMA: at most 15% for at most 60 s (39.2). */
export const minigameDefSchema = z.object({
  id,
  nameKey: id,
  waitingThreshold: z.number().int().positive(),
  passScore: z.number().int().nonnegative(),
  reward: z.object({
    kind: z.literal('boost'),
    stat: z.literal('serviceSpeed'),
    pct: z.number().int().min(1).max(15),
    seconds: z.number().int().min(1).max(60),
  }),
});
export type MinigameDef = z.infer<typeof minigameDefSchema>;

/** Corporate chains (35). `synergyPerMinuteByLength` is a piecewise table: [chain length, Synergy/min]. */
export const chainsConfigSchema = z.object({
  windowSeconds: z.number().positive(),
  minLength: z.literal(3),
  synergyPerMinuteByLength: z.array(z.tuple([z.number().int().positive(), z.number().nonnegative()])).min(1),
});
export type ChainsConfig = z.infer<typeof chainsConfigSchema>;

// ---------- Start state ----------
const startJob = z.union([
  z.object({ business: id, jobId: id }),
  z.object({ vehicle: id, jobId: id }),
]);
export const startStateDefSchema = z.object({
  gold: gold,
  reputation: z.number().int().min(0).max(100),
  districts: z.record(z.string(), z.object({ unlocked: z.boolean() })),
  businesses: z.array(
    z.object({
      key: id, // local reference used inside this file
      plotId: id,
      defId: id,
      owner: id, // 'player' | 'npc' | competitor id
      stockPct: z.record(z.string(), z.number().min(0).max(100)).optional(),
      autoReorder: z.record(z.string(), z.object({ enabled: z.boolean(), thresholdPct: z.number().min(0).max(100) })).optional(),
    }),
  ),
  competitors: z.array(z.object({ id, nameKey: id, colorToken: id })),
  vehicles: z.array(
    z.object({
      key: id,
      defId: id,
      owner: id,
      parkedAt: id, // business key
      route: z.array(z.object({ stop: id, action: z.enum(['pickup', 'dropoff']) })).optional(),
    }),
  ),
  humans: z.array(
    z.object({ name: z.string().min(1).optional(), owner: id, defId: id, job: startJob, onBoard: z.boolean().optional() }),
  ),
  orders: z.array(z.object({ owner: id, source: id, destination: id, resourceId: id, pctOfCapacity: z.number().min(0).max(100) })),
  ceo: z.object({ nearBusiness: id }),
});
export type StartStateDef = z.infer<typeof startStateDefSchema>;

export const namePoolSchema = z.array(z.string().min(1)).min(1);
export const modelKeysSchema = z.array(id).min(1);
export const textTableSchema = z.record(z.string(), z.unknown());
