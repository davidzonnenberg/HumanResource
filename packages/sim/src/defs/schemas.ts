// Zod schemas for every Definition (Requirement 1). Types are inferred from the schemas so
// data and code can never drift apart. Formulas are parameterised kinds, never code strings.
import { z } from 'zod';
import { DOMAIN_OPS, EFFECT_GOLD_MAX, FINANCE_CATEGORIES, SCHEDULED_KINDS, STAT_IDS, type DomainOp, type StatId } from './vocabulary';

const id = z.string().min(1);
const gold = z.number().int(); // integer hundredths of Gold
const point2 = z.tuple([z.number(), z.number()]);
const polygon = z.array(point2).min(3);

// ---------- Stats, Conditions and Effects (Requirements 50, 52) ----------
export const statIdSchema = z.enum(STAT_IDS);
export type { StatId, DomainOp };
export const domainOpSchema = z.enum(DOMAIN_OPS);
export const financeCategorySchema = z.enum(FINANCE_CATEGORIES);
/** Conditions read state and the Tick's events only (52.1, 52.5). Vocabulary: `CONDITION_KINDS`. */
export type Condition =
  | { kind: 'event'; event: string; where?: Record<string, string | number | boolean> }
  | { kind: 'goldAtLeast'; amount: number }
  | { kind: 'corporateResourceAtLeast'; resourceId: string; amount: number }
  | { kind: 'ownedBusinessCountAtLeast'; businessType: string; count: number }
  | { kind: 'tickAtLeast'; tick: number }
  | { kind: 'never' }
  | { kind: 'all' | 'any'; of: Condition[] }
  | { kind: 'not'; of: Condition }
  | { kind: 'revealed'; feature: string }
  /** `value` is in the unit of the stat (basis points for every current StatId). Without `businessId`: the Player's first Pub. */
  | { kind: 'statAtLeast' | 'statBelow'; stat: StatId; value: number; businessId?: string }
  | { kind: 'loanActive' }
  | { kind: 'licensed'; tier?: string }
  | { kind: 'pubOpen'; businessId?: string }
  | { kind: 'humanCountAtLeast'; count: number; jobId?: string }
  | { kind: 'serviceUsed'; serviceId: string }
  | { kind: 'questStepDone'; questId: string; stepId: string };
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
    z.object({ kind: z.literal('not'), of: conditionSchema }),
    z.object({ kind: z.literal('revealed'), feature: id }),
    z.object({ kind: z.enum(['statAtLeast', 'statBelow']), stat: statIdSchema, value: z.number(), businessId: id.optional() }),
    z.object({ kind: z.literal('loanActive') }),
    z.object({ kind: z.literal('licensed'), tier: id.optional() }),
    z.object({ kind: z.literal('pubOpen'), businessId: id.optional() }),
    z.object({ kind: z.literal('humanCountAtLeast'), count: z.number().int(), jobId: id.optional() }),
    z.object({ kind: z.literal('serviceUsed'), serviceId: id }),
    z.object({ kind: z.literal('questStepDone'), questId: id, stepId: id }),
  ]),
) as z.ZodType<Condition>;
/** An integer, or an inclusive `range` that is drawn from the seeded RNG in Effect order (52.2). */
export type EffectAmount = number | { range: [number, number] };
const effectAmount: z.ZodType<EffectAmount> = z.union([
  z.number().int(),
  z.object({ range: z.tuple([z.number().int(), z.number().int()]) }).refine((r) => r.range[0] <= r.range[1], 'range minimum is above the maximum'),
]);
const goldBounded = z.number().int().min(-EFFECT_GOLD_MAX).max(EFFECT_GOLD_MAX);
/** Gold amounts are bounded in the schema so Effects can never push Gold out of range (52.6). */
const goldAmount: z.ZodType<EffectAmount> = z.union([
  goldBounded,
  z.object({ range: z.tuple([goldBounded, goldBounded]) }).refine((r) => r.range[0] <= r.range[1], 'range minimum is above the maximum'),
]);
export type EffectTarget = { kind: 'all' } | { kind: 'player' } | { kind: 'self' } | { kind: 'business'; id: string };
const effectTarget: z.ZodType<EffectTarget> = z.union([
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('player') }),
  z.object({ kind: z.literal('self') }),
  z.object({ kind: z.literal('business'), id }),
]);
const paramValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
export type ParamValue = z.infer<typeof paramValue>;
/** Effects are applied by `applyEffects` over the closed vocabulary `EFFECT_KINDS` (52.2). */
export const effectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gold'), amount: goldAmount, category: financeCategorySchema.optional() }),
  z.object({
    kind: z.literal('addModifier'),
    stat: statIdSchema,
    op: z.enum(['addBp', 'addFlat']),
    value: z.number().int(),
    target: effectTarget.optional(),
    /** Game seconds until the Modifier expires; absent = permanent. */
    seconds: z.number().positive().optional(),
  }),
  z.object({ kind: z.literal('reveal'), triggerId: id }),
  z.object({
    kind: z.literal('schedule'),
    event: z.enum(SCHEDULED_KINDS),
    delaySeconds: effectAmount,
    payload: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  }),
  z.object({ kind: z.literal('grantResource'), resourceId: id, qty: effectAmount }),
  z.object({ kind: z.literal('news'), textKey: id, params: z.record(z.string(), z.union([z.string(), z.number()])).optional() }),
  z.object({ kind: z.literal('domain'), op: domainOpSchema, params: z.record(z.string(), paramValue).optional() }),
]);
export type Effect = z.infer<typeof effectSchema>;
// ---------- Services (Requirement 51) ----------
export const serviceParamSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('string'), oneOf: z.array(z.string()).min(1).optional() }),
  z.object({ type: z.literal('int'), min: z.number().int(), max: z.number().int() }),
  z.object({ type: z.literal('boolean') }),
  z.object({ type: z.literal('stringList'), oneOf: z.array(z.string()).min(1), maxItems: z.number().int().positive() }),
]);
export type ServiceParamDef = z.infer<typeof serviceParamSchema>;
export const serviceDefSchema = z.object({
  id,
  nameKey: id,
  cost: gold,
  /** `remote`: usable from anywhere. `presence`: the CEO must be at the door or inside (51.5). */
  access: z.enum(['remote', 'presence']),
  /** Checked in order; the first that fails rejects with its own `reason` (default conditions_not_met). */
  conditions: z.array(z.object({ condition: conditionSchema, reason: id.optional() })),
  effects: z.array(effectSchema),
  /** Usable once per Save_Slot (`already_done` afterwards). */
  once: z.boolean().optional(),
  /** Accepted `params` of the Command; any other parameter is rejected (51.12). */
  params: z.record(z.string(), serviceParamSchema).optional(),
});
export type ServiceDef = z.infer<typeof serviceDefSchema>;
/** One entry of `settings.json`: which Command is a setting and whether it needs the CEO present (51.5). */
export const settingDefSchema = z.object({ commandType: id, access: z.enum(['remote', 'presence']) });
export type SettingDef = z.infer<typeof settingDefSchema>;

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
  // ---- Phase 2 foundations (Requirement 51) ----
  /** Data-defined Services used through the useService Command. */
  services: z.array(serviceDefSchema).optional(),
  /** Marker: an office with a counter screen (Municipality, Bank, Job_Centre). Written as `{}` in JSON. */
  office: z.record(z.string(), z.never()).optional(),
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
    /** Manual-driving feel (Physics_Layer only; route timing keeps using `speed`). */
    manualTopSpeed: z.number().positive(),
    reverseTopSpeed: z.number().positive(),
    brakeDecel: z.number().positive(),
    /** Handbrake drift: sideways grip while held (0 = ice), turn multiplier, speed lost per second. */
    driftGrip: z.number().min(0).max(1),
    driftTurnBoost: z.number().positive(),
    driftDrag: z.number().min(0).max(1),
    /** Donuts (gas + brake, or gas + handbrake, at low speed): spin rate in rad/s. */
    donutTurnRate: z.number().positive(),
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
export const modifierStatSchema = statIdSchema;
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
  phase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  // Unlock menu (Requirement 67). Optional until task 48.8 gives every trigger its texts; task 50.1 then makes
  // `teaserKey` and `descriptionKey` required and the registry rejects a Definition without them (67.5).
  teaserKey: id.optional(),
  descriptionKey: id.optional(),
  gaveKey: id.optional(),
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

// ---------- Street layout: Frontage_Slots (Requirement 54) ----------
const slotZone = z.object({ w: z.number().positive().optional(), d: z.number().positive().optional(), offset: z.number().nonnegative().optional() });
const slotBase = {
  id,
  /** Width along the street in World_Units (narrow canal houses 6 to 8, a Landmark takes a double slot). */
  width: z.number().positive(),
  /** Model drawn in the slot; absent = a generated house (filler) or the Business Definition's model. */
  modelKey: id.optional(),
  /** Overrides of the street's `depth` and `setback` for this slot. */
  depth: z.number().positive().optional(),
  setback: z.number().nonnegative().optional(),
};
const plotLike = {
  /** Plot id; defaults to the slot id. Keep the old id when a hand-placed Plot becomes a slot (54.10). */
  plotId: id.optional(),
  tags: z.array(z.string()).optional(),
  /** Overrides of the Unloading_Zone derived on the road next to the slot. */
  unloadingZone: slotZone.optional(),
};
export const frontageSlotSchema = z.discriminatedUnion('kind', [
  /** Scenery: a model with a hitbox, no interaction, no Business Definition (54.3). */
  z.object({ ...slotBase, kind: z.literal('filler') }),
  /** A Business stands here from the start (door, Context_Action, services; 54.4). */
  z.object({ ...slotBase, ...plotLike, kind: z.literal('business') }),
  /** A Plot: "Inspect" and, when for sale, buy and build (54.5). */
  z.object({
    ...slotBase,
    ...plotLike,
    kind: z.literal('plot'),
    initial: z.discriminatedUnion('kind', [z.object({ kind: z.literal('empty') }), z.object({ kind: z.literal('for_sale'), price: gold })]).optional(),
  }),
]);
export type FrontageSlot = z.infer<typeof frontageSlotSchema>;
export const streetDefSchema = z.object({
  id,
  /** The street runs along the straight road from node `from` to node `to` (same x or same z). */
  from: id,
  to: id,
  /** Side of the direction of travel; a +x line has `left` = north (-z). */
  side: z.enum(['left', 'right']),
  /** Distance along the line before the first slot. */
  start: z.number().nonnegative().optional(),
  /** Distance from the line to the front of the slots (road half width plus sidewalk at least). */
  setback: z.number().nonnegative(),
  /** Default depth of a slot. */
  depth: z.number().positive(),
  /** Default Plot tags of the street's business and plot slots. */
  tags: z.array(z.string()).optional(),
  slots: z.array(frontageSlotSchema).min(1),
});
export type StreetDef = z.infer<typeof streetDefSchema>;
export const districtDefSchema = z.object({
  id,
  nameKey: id,
  bounds: polygon,
  nodes: z.array(z.object({ id, x: z.number(), z: z.number() })).min(1),
  edges: z.array(z.object({ id, a: id, b: id })),
  /** Hand-placed Plots; still valid next to streets (54.6). */
  plots: z.array(plotDefSchema).default([]),
  /** Streets of Frontage_Slots; their Plots are derived (defs/frontage.ts). */
  streets: z.array(streetDefSchema).optional(),
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
  /** CEO collision radius against building footprints and interior walls. */
  ceoRadius: z.number().positive().default(0.4),
  /** Thickness of a building's interior walls (the CEO cannot walk into them). */
  interiorWallThickness: z.number().nonnegative().default(0.25),
  boardingDistance: z.number().positive(),
  pubWindowSeconds: z.number().int().positive(),
  vehicleWindowSeconds: z.number().int().positive(),
  financeWindowSeconds: z.number().int().positive(),
  newsLimit: z.number().int().positive(),
  /** Newest Command_Log entries kept in a Save_Document (53.2). */
  commandLogTailLimit: z.number().int().positive().default(2000),
  /** The State_Hash is computed every this many Ticks (53.7). */
  stateHashEveryTicks: z.number().int().positive().default(100),
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
