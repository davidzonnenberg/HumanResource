// Generic production rules (task 27.1, Requirements 9.3, 29.1, 29.2, 29.4, 29.5, 34.2).
// Start-consume model (phase2-guide section 4): a cycle starts when every input is in Storage, the
// required workers are on duty and every output fits. Inputs are taken at the start, outputs are
// added all at once when the cycle completes. A completed batch that does not fit waits in progress
// and is retried every Tick, so nothing is discarded.
import type { TickContext } from '../../core/context';
import { ledgerChange, secondsToTicks } from '../../core/context';
import type { Command, Rejection } from '../../commands/types';
import type { DefinitionRegistry } from '../../defs/registry';
import type { ProductionRule } from '../../defs/schemas';
import { newRing, ringAdd, ringSum } from '../../metrics/ring';
import { jobCapacity } from '../../staffing/capacity';
import { addToStock, emptyStock, freeCapacity, takeFromStock } from '../../storage/stock';
import type { Business, ProductionEntry, Ring, SimState } from '../../state/types';
import { PLAYER } from '../../state/types';
import { storageCapacity, supplierFor } from '../../world/queries';

/** Rolling window of the effective unit cost: 5 Game_Minutes (29.4). */
export const UNIT_COST_WINDOW_SECONDS = 300;

type ProductionMetrics = { consumed: Record<string, Ring>; produced: Ring };

const second = (ctx: TickContext): number => Math.floor(ctx.state.tick / ctx.tps);

function productionMetrics(state: SimState, b: Business): ProductionMetrics {
  const all = (state.metrics.production ??= {});
  const existing = all[b.id];
  if (existing) return existing;
  const created: ProductionMetrics = { consumed: {}, produced: newRing(UNIT_COST_WINDOW_SECONDS) };
  all[b.id] = created;
  return created;
}

function outputFree(ctx: TickContext, b: Business, res: string): number {
  return freeCapacity(b.storage[res] ?? emptyStock(), storageCapacity(ctx.reg, b, res));
}

/** Missing requirements in the form `input:<res>`, `workers:<job>`, `output:<res>` (29.2). */
function missingFor(ctx: TickContext, b: Business, rule: ProductionRule): string[] {
  const missing: string[] = [];
  for (const [res, qty] of Object.entries(rule.inputs)) if ((b.storage[res]?.amount ?? 0) < qty) missing.push(`input:${res}`);
  if (jobCapacity(b, rule.requiredJob, ctx.state) < rule.requiredWorkers) missing.push(`workers:${rule.requiredJob}`);
  for (const [res, qty] of Object.entries(rule.outputs)) if (outputFree(ctx, b, res) < qty) missing.push(`output:${res}`);
  return missing;
}

function stepRule(ctx: TickContext, b: Business, entry: ProductionEntry, rule: ProductionRule): void {
  const staffed = jobCapacity(b, rule.requiredJob, ctx.state) >= rule.requiredWorkers;

  if (!entry.started) {
    entry.missing = missingFor(ctx, b, rule);
    entry.running = false;
    if (entry.missing.length > 0) return;
    // Start: take the inputs out of Storage. They leave the economy as production_input.
    for (const [res, qty] of Object.entries(rule.inputs)) {
      const stock = b.storage[res];
      if (!stock) continue;
      takeFromStock(stock, qty);
      ledgerChange(ctx, res, -qty, 'production_input');
      const m = productionMetrics(ctx.state, b);
      ringAdd((m.consumed[res] ??= newRing(UNIT_COST_WINDOW_SECONDS)), second(ctx), qty);
    }
    entry.started = true;
    entry.progressTicks = 0;
    entry.running = true;
    entry.missing = [];
    return;
  }

  // Running: progress only while the workers are on duty (29.2)
  if (!staffed) {
    entry.running = false;
    entry.missing = [`workers:${rule.requiredJob}`];
    return;
  }
  entry.running = true;
  entry.missing = [];
  const cycleTicks = secondsToTicks(ctx, rule.cycleSeconds);
  if (entry.progressTicks < cycleTicks) {
    entry.progressTicks += 1;
    return;
  }

  // Completed: add the outputs only when all of them fit, otherwise wait and retry next Tick
  const blocked = Object.entries(rule.outputs)
    .filter(([res, qty]) => outputFree(ctx, b, res) < qty)
    .map(([res]) => `output:${res}`);
  if (blocked.length > 0) {
    entry.missing = blocked;
    entry.running = false;
    return;
  }
  let produced = 0;
  for (const [res, qty] of Object.entries(rule.outputs)) {
    const stock = (b.storage[res] ??= emptyStock());
    addToStock(stock, { qty, recipeId: entry.recipeId, arrivedTick: ctx.state.tick, origin: 'brewery' }, storageCapacity(ctx.reg, b, res));
    ledgerChange(ctx, res, qty, 'produced');
    produced += qty;
  }
  ringAdd(productionMetrics(ctx.state, b).produced, second(ctx), produced);
  entry.started = false;
  entry.running = false;
  entry.progressTicks = 0;
}

/** Pipeline slot `production`: runs every production rule of every Business that has any. */
export function productionSystem(ctx: TickContext): void {
  for (const b of Object.values(ctx.state.businesses)) {
    if (!b.production) continue;
    const def = ctx.reg.businesses[b.defId];
    if (!def) continue;
    for (const entry of b.production) {
      const rule = def.productionRules.find((r) => r.id === entry.ruleId);
      if (rule) stepRule(ctx, b, entry, rule);
    }
  }
}

/**
 * setProductionRecipe: sets the Recipe of every `recipeFromState` rule whose output is the Recipe's
 * product. The Recipe must be known to the Player or held by this Business.
 */
export function handleSetProductionRecipe(ctx: TickContext, cmd: Extract<Command, { type: 'setProductionRecipe' }>): Rejection | null {
  const b = ctx.state.businesses[cmd.businessId];
  if (!b) return { reason: 'unknown_entity', field: 'businessId' };
  if (b.owner !== PLAYER) return { reason: 'not_owner' };
  const recipe = ctx.reg.recipes[cmd.recipeId];
  if (!recipe) return { reason: 'unknown_entity', field: 'recipeId' };
  const known = ctx.state.player.recipes.includes(cmd.recipeId) || (b.recipes ?? []).includes(cmd.recipeId);
  if (!known) return { reason: 'not_available', field: 'recipeId' };
  const def = ctx.reg.businesses[b.defId];
  const matching = (b.production ?? []).filter((e) => {
    const rule = def?.productionRules.find((r) => r.id === e.ruleId);
    return rule !== undefined && rule.recipeFromState && Object.keys(rule.outputs).includes(recipe.product);
  });
  if (matching.length === 0) return { reason: 'not_allowed', field: 'recipeId' };
  for (const e of matching) e.recipeId = cmd.recipeId;
  return null;
}

/**
 * Effective unit cost per unit of output over the 5-Game_Minute window (29.4): consumed inputs at the
 * current Supplier unit price (Market buy price when no Supplier sells the input), plus the salaries of
 * the production Jobs for the same window, divided by units produced. Null when nothing was produced,
 * which the Panel shows as "n/a" (29.5). Input costs use current prices by design (phase2-guide 4).
 */
export function unitCostPerUnit(reg: DefinitionRegistry, state: SimState, b: Business): number | null {
  const m = state.metrics.production?.[b.id];
  if (!m) return null;
  const now = Math.floor(state.tick / reg.config.ticksPerSecond);
  const produced = ringSum(m.produced, now);
  if (produced <= 0) return null;

  let total = 0;
  for (const [res, ring] of Object.entries(m.consumed)) {
    const unit = supplierFor(reg, state, res)?.unitPrice ?? state.market?.prices[res]?.buy ?? 0;
    total += ringSum(ring, now) * unit;
  }

  const def = reg.businesses[b.defId];
  const jobs = new Set((def?.productionRules ?? []).map((r) => r.requiredJob));
  const minutes = UNIT_COST_WINDOW_SECONDS / 60;
  for (const slot of b.jobSlots) {
    if (!jobs.has(slot.jobId) || !slot.filledBy) continue;
    if (slot.filledBy.kind === 'headcount') {
      const perMinute = reg.humans[slot.filledBy.humanDefId]?.salaryPerMinute ?? 0;
      total += perMinute * slot.filledBy.count * minutes;
      continue;
    }
    const h = state.humans[slot.filledBy.humanId];
    if (h && h.status === 'working') total += (reg.humans[h.defId]?.salaryPerMinute ?? 0) * minutes;
  }
  return Math.round(total / produced);
}
