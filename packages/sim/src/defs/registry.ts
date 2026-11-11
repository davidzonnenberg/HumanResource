// Definition_Registry loader and validator (Requirement 1). Two passes collect ALL errors:
// structural (zod per file) and referential/semantic. The result is frozen.
import type { z } from 'zod';
import { sq } from '../core/math';
import {
  acquisitionConfigSchema,
  achievementDefSchema,
  brandDefSchema,
  businessDefSchema,
  chainsConfigSchema,
  competitorEventsSchema,
  districtDefSchema,
  humanDefSchema,
  jobDefSchema,
  marketConfigSchema,
  minigameDefSchema,
  modelKeysSchema,
  namePoolSchema,
  questionableConfigSchema,
  questionableDefSchema,
  recipeDefSchema,
  resourceDefSchema,
  revealTriggerDefSchema,
  simConfigSchema,
  startStateDefSchema,
  traitDefSchema,
  vehicleDefSchema,
  worldDefSchema,
  type AcquisitionConfig,
  type AchievementDef,
  type BrandDef,
  type BusinessDef,
  type ChainsConfig,
  type CompetitorEventsConfig,
  type Condition,
  type DistrictDef,
  type HumanDef,
  type JobDef,
  type MarketConfig,
  type MinigameDef,
  type PlotDef,
  type QuestionableConfig,
  type QuestionableDef,
  type RecipeDef,
  type ResourceDef,
  type RevealTriggerDef,
  type SimConfig,
  type StartStateDef,
  type TraitDef,
  type VehicleDef,
} from './schemas';

export interface DefinitionError {
  definition: string;
  field: string;
  message: string;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E };

export interface RawContentInput {
  resources: unknown;
  businesses: unknown;
  vehicles: unknown;
  jobs: unknown;
  humans: unknown;
  traits: unknown;
  recipes: unknown;
  brands: unknown;
  achievements: unknown;
  revealTriggers: unknown;
  models: unknown;
  namePool: unknown;
  startState: unknown;
  world: unknown;
  districtFiles: Record<string, unknown>;
  simConfig: unknown;
  text: Record<string, unknown>;
  // Phase 2 tables (content/data/phase2)
  market: unknown;
  acquisitions: unknown;
  questionables: unknown;
  questionableConfig: unknown;
  competitorEvents: unknown;
  minigames: unknown;
  chains: unknown;
}

export interface RoadNode {
  id: string; // namespaced `<district>:<node>`
  districtId: string;
  x: number;
  z: number;
}
export interface RoadEdge {
  id: string;
  a: string;
  b: string;
  length: number;
  districtId: string | null; // null = District_Connector edge
}
export interface PlotInfo {
  def: PlotDef;
  districtId: string;
  accessNode: string; // namespaced
}
export interface DistrictInfo {
  def: DistrictDef;
  unlockCondition: Condition | null;
}
export interface WorldInfo {
  districts: Record<string, DistrictInfo>;
  districtOrder: string[];
  nodes: Record<string, RoadNode>;
  edges: RoadEdge[];
  plots: Record<string, PlotInfo>;
}

export interface DefinitionRegistry {
  resources: Record<string, ResourceDef>;
  businesses: Record<string, BusinessDef>;
  vehicles: Record<string, VehicleDef>;
  jobs: Record<string, JobDef>;
  humans: Record<string, HumanDef>;
  traits: Record<string, TraitDef>;
  recipes: Record<string, RecipeDef>;
  brands: Record<string, BrandDef>;
  achievements: Record<string, AchievementDef>;
  revealTriggers: Record<string, RevealTriggerDef>;
  modelKeys: ReadonlySet<string>;
  namePool: readonly string[];
  text: Readonly<Record<string, unknown>>;
  config: SimConfig;
  world: WorldInfo;
  startState: StartStateDef;
  // Phase 2
  market: MarketConfig;
  acquisitions: AcquisitionConfig;
  questionables: Record<string, QuestionableDef>;
  questionableConfig: QuestionableConfig;
  competitorEvents: CompetitorEventsConfig;
  minigames: Record<string, MinigameDef>;
  chains: ChainsConfig;
  /** Brand modifiers as integer basis points (10000 = x1.0), converted once at load: brandId -> venueType -> bp. */
  brandBp: Record<string, Record<string, { demandBp: number; priceBp: number }>>;
}

const nsNode = (district: string, node: string): string => `${district}:${node}`;

function pointInPolygon(x: number, z: number, poly: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i] as readonly [number, number];
    const [xj, zj] = poly[j] as readonly [number, number];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
/** Point inside or on the boundary of a polygon. */
export function pointInOrOnPolygon(x: number, z: number, poly: readonly (readonly [number, number])[]): boolean {
  if (pointInPolygon(x, z, poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j] as readonly [number, number];
    const [bx, bz] = poly[i] as readonly [number, number];
    const cross = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (Math.abs(cross) > 1e-9) continue;
    if (x >= Math.min(ax, bx) - 1e-9 && x <= Math.max(ax, bx) + 1e-9 && z >= Math.min(az, bz) - 1e-9 && z <= Math.max(az, bz) + 1e-9)
      return true;
  }
  return false;
}

function parseArray<T extends { id: string }>(
  file: string,
  raw: unknown,
  schema: z.ZodType<T>,
  errors: DefinitionError[],
): Record<string, T> {
  const out: Record<string, T> = {};
  if (!Array.isArray(raw)) {
    errors.push({ definition: file, field: '(root)', message: 'expected an array' });
    return out;
  }
  raw.forEach((item, i) => {
    const res = schema.safeParse(item);
    const rawId = typeof item === 'object' && item !== null && 'id' in item ? String((item as { id: unknown }).id) : `[${i}]`;
    if (!res.success) {
      for (const iss of res.error.issues)
        errors.push({ definition: `${file}#${rawId}`, field: iss.path.map(String).join('.') || '(root)', message: iss.message });
      return;
    }
    if (out[res.data.id]) errors.push({ definition: `${file}#${res.data.id}`, field: 'id', message: 'duplicate id' });
    out[res.data.id] = res.data;
  });
  return out;
}

function parseOne<T>(file: string, raw: unknown, schema: z.ZodType<T>, errors: DefinitionError[]): T | null {
  const res = schema.safeParse(raw);
  if (res.success) return res.data;
  errors.push(...res.error.issues.map((iss) => ({ definition: file, field: iss.path.map(String).join('.') || '(root)', message: iss.message })));
  return null;
}

/** Validates and loads all content. Returns every error found (criteria 1.5–1.7). */
export function loadRegistry(raw: RawContentInput): Result<DefinitionRegistry, DefinitionError[]> {
  const errors: DefinitionError[] = [];
  const resources = parseArray('resources', raw.resources, resourceDefSchema, errors);
  const businesses = parseArray('businesses', raw.businesses, businessDefSchema, errors);
  const vehicles = parseArray('vehicles', raw.vehicles, vehicleDefSchema, errors);
  const jobs = parseArray('jobs', raw.jobs, jobDefSchema, errors);
  const humans = parseArray('humans', raw.humans, humanDefSchema, errors);
  const traits = parseArray('traits', raw.traits, traitDefSchema, errors);
  const recipes = parseArray('recipes', raw.recipes, recipeDefSchema, errors);
  const brands = parseArray('brands', raw.brands, brandDefSchema, errors);
  const achievements = parseArray('achievements', raw.achievements, achievementDefSchema, errors);
  const revealTriggers = parseArray('reveal-triggers', raw.revealTriggers, revealTriggerDefSchema, errors);
  const models = parseOne('models', raw.models, modelKeysSchema, errors) ?? [];
  const namePool = parseOne('name-pool', raw.namePool, namePoolSchema, errors) ?? [];
  const config = parseOne('config/sim', raw.simConfig, simConfigSchema, errors);
  const startState = parseOne('start-state', raw.startState, startStateDefSchema, errors);
  const worldFile = parseOne('maps/world', raw.world, worldDefSchema, errors);
  const market = parseOne('phase2/market', raw.market, marketConfigSchema, errors);
  const acquisitions = parseOne('phase2/acquisitions', raw.acquisitions, acquisitionConfigSchema, errors);
  const questionables = parseArray('phase2/questionables', raw.questionables, questionableDefSchema, errors);
  const questionableConfig = parseOne('phase2/questionable-config', raw.questionableConfig, questionableConfigSchema, errors);
  const competitorEvents = parseOne('phase2/competitor-events', raw.competitorEvents, competitorEventsSchema, errors);
  const minigames = parseArray('phase2/minigames', raw.minigames, minigameDefSchema, errors);
  const chains = parseOne('phase2/chains', raw.chains, chainsConfigSchema, errors);
  const text = raw.text;
  const modelKeys = new Set(models);

  // ---------- World / Districts ----------
  const world: WorldInfo = { districts: {}, districtOrder: [], nodes: {}, edges: [], plots: {} };
  if (worldFile) {
    for (const entry of worldFile.districts) {
      const file = `maps/districts/${entry.file}`;
      if (world.districts[entry.id]) {
        errors.push({ definition: `maps/world#${entry.id}`, field: 'id', message: 'duplicate District id' });
        continue;
      }
      const d = parseOne(file, raw.districtFiles[entry.file], districtDefSchema, errors);
      if (!d) {
        if (raw.districtFiles[entry.file] === undefined)
          errors.push({ definition: `maps/world#${entry.id}`, field: 'file', message: `unknown District file "${entry.file}"` });
        continue;
      }
      if (d.id !== entry.id) errors.push({ definition: file, field: 'id', message: `District id "${d.id}" does not match world entry "${entry.id}"` });
      world.districts[entry.id] = { def: d, unlockCondition: entry.unlockCondition };
      world.districtOrder.push(entry.id);
      for (const n of d.nodes) {
        const nid = nsNode(entry.id, n.id);
        if (world.nodes[nid]) errors.push({ definition: `${file}#${n.id}`, field: 'nodes', message: 'duplicate node id' });
        world.nodes[nid] = { id: nid, districtId: entry.id, x: n.x, z: n.z };
      }
      for (const e of d.edges) {
        const a = world.nodes[nsNode(entry.id, e.a)];
        const b = world.nodes[nsNode(entry.id, e.b)];
        if (!a || !b) {
          errors.push({ definition: `${file}#${e.id}`, field: 'edges', message: `unknown node "${!a ? e.a : e.b}"` });
          continue;
        }
        world.edges.push({ id: nsNode(entry.id, e.id), a: a.id, b: b.id, length: Math.sqrt(sq(a.x - b.x) + sq(a.z - b.z)), districtId: entry.id });
      }
      for (const p of d.plots) {
        if (world.plots[p.id]) errors.push({ definition: `${file}#${p.id}`, field: 'id', message: 'duplicate Plot id' });
        const access = nsNode(entry.id, p.accessNode);
        if (!world.nodes[access]) errors.push({ definition: `${file}#${p.id}`, field: 'accessNode', message: `unknown node "${p.accessNode}"` });
        if (!pointInOrOnPolygon(p.x, p.z, d.bounds))
          errors.push({ definition: `${file}#${p.id}`, field: 'x', message: 'Plot lies outside its District bounds' });
        world.plots[p.id] = { def: p, districtId: entry.id, accessNode: access };
      }
    }
    for (const c of worldFile.connectors) {
      const a = world.nodes[nsNode(c.a.district, c.a.node)];
      const b = world.nodes[nsNode(c.b.district, c.b.node)];
      if (!world.districts[c.a.district] || !world.districts[c.b.district] || !a || !b) {
        errors.push({ definition: `maps/world#${c.id}`, field: 'connectors', message: 'connector references an unknown District or node' });
        continue;
      }
      world.edges.push({ id: `connector:${c.id}`, a: a.id, b: b.id, length: Math.sqrt(sq(a.x - b.x) + sq(a.z - b.z)), districtId: null });
    }
  }

  // ---------- Referential and semantic checks ----------
  const ref = (definition: string, field: string, kind: string, idv: string, table: Record<string, unknown> | ReadonlySet<string>): void => {
    const exists = table instanceof Set ? table.has(idv) : Object.prototype.hasOwnProperty.call(table, idv);
    if (!exists) errors.push({ definition, field, message: `unknown ${kind} "${idv}"` });
  };
  const textRef = (definition: string, field: string, key: string): void => {
    if (!Object.prototype.hasOwnProperty.call(text, key)) errors.push({ definition, field, message: `unknown text key "${key}"` });
  };

  for (const r of Object.values(resources)) {
    ref(`resources#${r.id}`, 'modelKey', 'model key', r.modelKey, modelKeys);
    textRef(`resources#${r.id}`, 'nameKey', r.nameKey);
  }
  for (const j of Object.values(jobs)) {
    textRef(`jobs#${j.id}`, 'nameKey', j.nameKey);
    if (j.maxHeadcountPerSlot < 1) errors.push({ definition: `jobs#${j.id}`, field: 'maxHeadcountPerSlot', message: 'must be at least 1' });
  }
  for (const h of Object.values(humans)) ref(`humans#${h.id}`, 'modelKey', 'model key', h.modelKey, modelKeys);
  for (const b of Object.values(businesses)) {
    const def = `businesses#${b.id}`;
    for (const r of [...b.inputs, ...b.outputs, ...Object.keys(b.storage)]) ref(def, 'resources', 'Resource', r, resources);
    for (const hr of b.humanRequirements) ref(def, 'humanRequirements.jobId', 'Job', hr.jobId, jobs);
    for (const t of b.traits) ref(def, 'traits', 'Trait', t, traits);
    if (b.brand !== null) ref(def, 'brand', 'Brand', b.brand, brands);
    ref(def, 'modelKey', 'model key', b.modelKey, modelKeys);
    textRef(def, 'nameTable', b.nameTable);
    for (const pr of b.productionRules) {
      ref(def, 'productionRules.requiredJob', 'Job', pr.requiredJob, jobs);
      for (const r of [...Object.keys(pr.inputs), ...Object.keys(pr.outputs)]) ref(def, 'productionRules', 'Resource', r, resources);
    }
    if (b.pub) {
      const p = b.pub;
      if (p.seats < 1) errors.push({ definition: def, field: 'pub.seats', message: 'seat count must be at least 1' });
      if (p.minDrinkPrice <= 0) errors.push({ definition: def, field: 'pub.minDrinkPrice', message: 'minimum drink price must be above 0' });
      if (p.minDrinkPrice > p.maxDrinkPrice) errors.push({ definition: def, field: 'pub.minDrinkPrice', message: 'minimum drink price is above the maximum' });
      if (p.defaultDrinkPrice < p.minDrinkPrice || p.defaultDrinkPrice > p.maxDrinkPrice)
        errors.push({ definition: def, field: 'pub.defaultDrinkPrice', message: 'default drink price outside min/max' });
      ref(def, 'pub.drinkResource', 'Resource', p.drinkResource, resources);
      const pts = p.demand.price.points;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1] as [number, number];
        const cur = pts[i] as [number, number];
        if (cur[0] <= prev[0]) errors.push({ definition: def, field: 'pub.demand.price.points', message: 'prices must be strictly increasing' });
        if (cur[1] > prev[1]) errors.push({ definition: def, field: 'pub.demand.price.points', message: 'demand multiplier must not increase with price' });
      }
      if (pts.some((pt) => pt[1] < 0)) errors.push({ definition: def, field: 'pub.demand.price.points', message: 'multipliers must be >= 0' });
    }
    if (b.supplier) for (const s of b.supplier.sells) ref(def, 'supplier.sells.resourceId', 'Resource', s.resourceId, resources);
    // ---- Phase 2 fields ----
    if (b.construction) {
      if (b.construction.cost <= 0) errors.push({ definition: def, field: 'construction.cost', message: 'construction cost must be above 0' });
      if (b.owner === 'npc' || b.owner === 'competitor')
        errors.push({ definition: def, field: 'construction', message: 'only Player-buildable Definitions (owner any or player) can have a construction block' });
    }
    if (b.warehouse) {
      if (b.warehouse.buyPrice <= 0) errors.push({ definition: def, field: 'warehouse.buyPrice', message: 'buy price must be above 0' });
      if (b.warehouse.rentPerMinute <= 0) errors.push({ definition: def, field: 'warehouse.rentPerMinute', message: 'rent must be above 0' });
    }
    if (b.unstaffedLoadRatePerSecond !== undefined && b.unstaffedLoadRatePerSecond >= b.loadRatePerSecond)
      errors.push({ definition: def, field: 'unstaffedLoadRatePerSecond', message: 'must be below loadRatePerSecond' });
    for (const r of b.recipes ?? []) ref(def, 'recipes', 'Recipe', r, recipes);
    if (b.acquisition && b.acquisition.askingPrice <= 0)
      errors.push({ definition: def, field: 'acquisition.askingPrice', message: 'asking price must be above 0' });
  }
  for (const v of Object.values(vehicles)) {
    const def = `vehicles#${v.id}`;
    if (v.driverRequirement) ref(def, 'driverRequirement.jobId', 'Job', v.driverRequirement.jobId, jobs);
    for (const r of v.allowedResources) ref(def, 'allowedResources', 'Resource', r, resources);
    ref(def, 'modelKey', 'model key', v.modelKey, modelKeys);
    textRef(def, 'nameKey', v.nameKey);
  }
  for (const t of Object.values(traits)) {
    textRef(`traits#${t.id}`, 'nameKey', t.nameKey);
    if (t.revealDelaySeconds && t.revealDelaySeconds[0] > t.revealDelaySeconds[1])
      errors.push({ definition: `traits#${t.id}`, field: 'revealDelaySeconds', message: 'minimum delay is above the maximum' });
    if (t.liability && t.liability.cost <= 0) errors.push({ definition: `traits#${t.id}`, field: 'liability.cost', message: 'liability cost must be above 0' });
  }
  for (const r of Object.values(recipes)) {
    ref(`recipes#${r.id}`, 'product', 'Resource', r.product, resources);
    for (const t of r.traits) ref(`recipes#${r.id}`, 'traits', 'Trait', t, traits);
    textRef(`recipes#${r.id}`, 'nameKey', r.nameKey);
  }
  const brandBp: DefinitionRegistry['brandBp'] = {};
  for (const b of Object.values(brands)) {
    textRef(`brands#${b.id}`, 'nameKey', b.nameKey);
    // Data multipliers become integer basis points once, here (phase2-guide rule 5).
    brandBp[b.id] = Object.fromEntries(
      Object.entries(b.perVenue).map(([venue, m]) => [venue, { demandBp: Math.round(m.demandMul * 10000), priceBp: Math.round(m.priceMul * 10000) }]),
    );
  }
  for (const a of Object.values(achievements)) {
    textRef(`achievements#${a.id}`, 'nameKey', a.nameKey);
    textRef(`achievements#${a.id}`, 'descriptionKey', a.descriptionKey);
  }
  for (const d of Object.values(world.districts)) textRef(`maps/districts/${d.def.id}`, 'nameKey', d.def.nameKey);

  validatePhase2Tables({ market, acquisitions, questionables, questionableConfig, competitorEvents, minigames, chains }, { resources, businesses }, textRef, errors);

  if (startState) validateStartState(startState, { businesses, vehicles, jobs, humans, resources, world }, textRef, errors);

  if (errors.length > 0 || !config || !startState || !market || !acquisitions || !questionableConfig || !competitorEvents || !chains) {
    if (errors.length === 0) errors.push({ definition: '(content)', field: '(root)', message: 'missing configuration' });
    return { ok: false, errors };
  }

  const registry: DefinitionRegistry = {
    resources,
    businesses,
    vehicles,
    jobs,
    humans,
    traits,
    recipes,
    brands,
    achievements,
    revealTriggers,
    modelKeys,
    namePool,
    text,
    config,
    world,
    startState,
    market,
    acquisitions,
    questionables,
    questionableConfig,
    competitorEvents,
    minigames,
    chains,
    brandBp,
  };
  return { ok: true, value: deepFreeze(registry) };
}

interface Phase2Tables {
  market: MarketConfig | null;
  acquisitions: AcquisitionConfig | null;
  questionables: Record<string, QuestionableDef>;
  questionableConfig: QuestionableConfig | null;
  competitorEvents: CompetitorEventsConfig | null;
  minigames: Record<string, MinigameDef>;
  chains: ChainsConfig | null;
}

/** Referential and semantic checks for the Phase 2 tables (phase2-guide A2). */
function validatePhase2Tables(
  t: Phase2Tables,
  defs: { resources: Record<string, ResourceDef>; businesses: Record<string, BusinessDef> },
  textRef: (definition: string, field: string, key: string) => void,
  errors: DefinitionError[],
): void {
  const err = (definition: string, field: string, message: string): void => void errors.push({ definition, field, message });
  const rangeOk = (definition: string, field: string, r: readonly [number, number]): void => {
    if (r[0] > r[1]) err(definition, field, 'minimum is above the maximum');
  };

  if (t.market) {
    if (t.market.intervalSeconds <= 0) err('phase2/market', 'intervalSeconds', 'must be above 0');
    for (const [resId, m] of Object.entries(t.market.resources)) {
      const def = `phase2/market#${resId}`;
      const res = defs.resources[resId];
      if (!res) err(def, 'resources', `unknown Resource "${resId}"`);
      else if (!res.tradable || res.kind !== 'storable') err(def, 'resources', `Resource "${resId}" is not tradable`);
      if (m.min <= 0) err(def, 'min', 'minimum price must be above 0');
      if (m.minSpread < 1) err(def, 'minSpread', 'minimum spread must be at least 1');
      if (m.step < 1) err(def, 'step', 'step must be at least 1');
      if (m.min + m.minSpread > m.base || m.base > m.max) err(def, 'base', 'must satisfy min + minSpread <= base <= max');
    }
  }
  if (t.acquisitions) rangeOk('phase2/acquisitions', 'intervalSeconds', t.acquisitions.intervalSeconds);
  for (const q of Object.values(t.questionables)) {
    const def = `phase2/questionables#${q.id}`;
    textRef(def, 'nameKey', q.nameKey);
    textRef(def, 'legalKey', q.legalKey);
    const res = defs.resources[q.reward.resourceId];
    if (!res) err(def, 'reward.resourceId', `unknown Resource "${q.reward.resourceId}"`);
    else if (res.kind !== 'storable') err(def, 'reward.resourceId', `Resource "${q.reward.resourceId}" is not storable`);
    if (q.cost < 0) err(def, 'cost', 'cost must not be negative');
    for (const c of q.consequences) {
      textRef(def, 'consequences.headlineKey', c.headlineKey);
      rangeOk(def, 'consequences.delaySeconds', c.delaySeconds);
      if (c.fine < 0) err(def, 'consequences.fine', 'fine must not be negative');
    }
  }
  if (t.competitorEvents) {
    rangeOk('phase2/competitor-events', 'intervalSeconds', t.competitorEvents.intervalSeconds);
    for (const e of t.competitorEvents.events) {
      const def = `phase2/competitor-events#${e.kind}`;
      if (e.kind === 'openLocation') {
        const b = defs.businesses[e.businessDefId];
        if (!b) err(def, 'businessDefId', `unknown Business "${e.businessDefId}"`);
        else if (!b.pub) err(def, 'businessDefId', `Business "${e.businessDefId}" is not a Pub`);
      }
      if (e.kind === 'changePrice' && e.maxStep < 1) err(def, 'maxStep', 'must be at least 1');
      if (e.kind === 'changePopularity' && e.minBp > e.maxBp) err(def, 'minBp', 'minimum is above the maximum');
    }
  }
  for (const m of Object.values(t.minigames)) textRef(`phase2/minigames#${m.id}`, 'nameKey', m.nameKey);
  if (t.chains) {
    const pts = t.chains.synergyPerMinuteByLength;
    for (let i = 1; i < pts.length; i++)
      if ((pts[i] as [number, number])[0] <= (pts[i - 1] as [number, number])[0])
        err('phase2/chains', 'synergyPerMinuteByLength', 'chain lengths must be strictly increasing');
    if (pts.length > 0 && (pts[0] as [number, number])[0] > t.chains.minLength)
      err('phase2/chains', 'synergyPerMinuteByLength', 'the table must start at or below the minimum chain length');
  }
}

function validateStartState(
  s: StartStateDef,
  defs: {
    businesses: Record<string, BusinessDef>;
    vehicles: Record<string, VehicleDef>;
    jobs: Record<string, JobDef>;
    humans: Record<string, HumanDef>;
    resources: Record<string, ResourceDef>;
    world: WorldInfo;
  },
  textRef: (definition: string, field: string, key: string) => void,
  errors: DefinitionError[],
): void {
  const def = 'start-state';
  const owners = new Set(['player', 'npc', ...s.competitors.map((c) => c.id)]);
  for (const c of s.competitors) {
    if (!c.id.startsWith('cmp_')) errors.push({ definition: def, field: 'competitors.id', message: `competitor id "${c.id}" must start with "cmp_"` });
    textRef(def, 'competitors.nameKey', c.nameKey);
  }
  const unlocked = Object.entries(s.districts).filter(([, v]) => v.unlocked).map(([k]) => k);
  for (const dId of Object.keys(s.districts))
    if (!defs.world.districts[dId]) errors.push({ definition: def, field: 'districts', message: `unknown District "${dId}"` });
  for (const dId of Object.keys(defs.world.districts))
    if (!s.districts[dId]) errors.push({ definition: def, field: 'districts', message: `District "${dId}" missing from start state` });
  if (unlocked.length !== 1) errors.push({ definition: def, field: 'districts', message: 'exactly one District must be unlocked at start' });

  const bizKeys = new Set<string>();
  for (const b of s.businesses) {
    bizKeys.add(b.key);
    const plot = defs.world.plots[b.plotId];
    if (!plot) errors.push({ definition: def, field: `businesses.${b.key}.plotId`, message: `unknown Plot "${b.plotId}"` });
    else if (!unlocked.includes(plot.districtId))
      errors.push({ definition: def, field: `businesses.${b.key}.plotId`, message: 'starting Businesses must be in the unlocked District' });
    if (!defs.businesses[b.defId]) errors.push({ definition: def, field: `businesses.${b.key}.defId`, message: `unknown Business "${b.defId}"` });
    if (!owners.has(b.owner)) errors.push({ definition: def, field: `businesses.${b.key}.owner`, message: `unknown owner "${b.owner}"` });
  }
  const vehKeys = new Set<string>();
  for (const v of s.vehicles) {
    vehKeys.add(v.key);
    if (!defs.vehicles[v.defId]) errors.push({ definition: def, field: `vehicles.${v.key}.defId`, message: `unknown Vehicle "${v.defId}"` });
    if (!bizKeys.has(v.parkedAt)) errors.push({ definition: def, field: `vehicles.${v.key}.parkedAt`, message: `unknown business key "${v.parkedAt}"` });
    for (const st of v.route ?? [])
      if (!bizKeys.has(st.stop)) errors.push({ definition: def, field: `vehicles.${v.key}.route`, message: `unknown business key "${st.stop}"` });
  }
  for (const [i, h] of s.humans.entries()) {
    if (!defs.humans[h.defId]) errors.push({ definition: def, field: `humans.${i}.defId`, message: `unknown Human "${h.defId}"` });
    if (!defs.jobs[h.job.jobId]) errors.push({ definition: def, field: `humans.${i}.job.jobId`, message: `unknown Job "${h.job.jobId}"` });
    if ('business' in h.job && !bizKeys.has(h.job.business))
      errors.push({ definition: def, field: `humans.${i}.job.business`, message: `unknown business key "${h.job.business}"` });
    if ('vehicle' in h.job && !vehKeys.has(h.job.vehicle))
      errors.push({ definition: def, field: `humans.${i}.job.vehicle`, message: `unknown vehicle key "${h.job.vehicle}"` });
  }
  for (const o of s.orders) {
    if (!bizKeys.has(o.source) || !bizKeys.has(o.destination))
      errors.push({ definition: def, field: 'orders', message: 'order references an unknown business key' });
    if (!defs.resources[o.resourceId]) errors.push({ definition: def, field: 'orders.resourceId', message: `unknown Resource "${o.resourceId}"` });
  }
  if (!bizKeys.has(s.ceo.nearBusiness)) errors.push({ definition: def, field: 'ceo.nearBusiness', message: 'unknown business key' });
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !(o instanceof Set) && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}
