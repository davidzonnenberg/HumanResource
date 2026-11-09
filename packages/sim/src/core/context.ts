// TickContext: everything a system or handler may touch during one Tick.
import type { DefinitionRegistry } from '../defs/registry';
import type { SimConfig } from '../defs/schemas';
import type { PathCache } from '../logistics/pathCache';
import type { FinanceCategory, Gold, OwnerId, SimState } from '../state/types';
import type { CommandEnvelope, CommandResult } from '../commands/types';
import type { DomainEvent } from './events';
import { applyGold } from '../money/gold';

export interface TickContext {
  state: SimState;
  reg: DefinitionRegistry;
  cfg: SimConfig;
  tps: number; // ticks per second
  dt: number; // game seconds per Tick
  events: DomainEvent[];
  results: CommandResult[];
  queue: CommandEnvelope[];
  /** Created (+) / removed (-) Resource quantities this Tick, by `${resource}|${cause}`. */
  ledger: Record<string, number>;
  paths(): PathCache;
  /** Replace the path cache after a District unlock (48.6). */
  refreshPaths(): void;
}

/** Records a Resource creation/removal and keeps state.resourceTotals consistent (2.11). */
export function ledgerChange(ctx: TickContext, resourceId: string, delta: number, cause: string): void {
  if (delta === 0) return;
  const key = `${resourceId}|${cause}`;
  ctx.ledger[key] = (ctx.ledger[key] ?? 0) + delta;
  ctx.state.resourceTotals[resourceId] = (ctx.state.resourceTotals[resourceId] ?? 0) + delta;
}

export function gold(ctx: TickContext, owner: OwnerId, delta: Gold, category: FinanceCategory, source: string): void {
  applyGold(ctx.state, owner, delta, category, source, ctx.tps, ctx.cfg.financeWindowSeconds);
}

export const secondsToTicks = (ctx: Pick<TickContext, 'tps'>, seconds: number): number => Math.max(1, Math.ceil(seconds * ctx.tps - 1e-9));
