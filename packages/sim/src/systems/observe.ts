// Systems that observe the final state of a Tick: metrics, alerts, reveals (6, 9, 18.10, 19, 48).
import type { TickContext } from '../core/context';
import { evaluateCondition } from '../conditions/evaluate';
import { ringSet } from '../metrics/ring';
import { isJobUnstaffed, jobCapacity } from '../staffing/capacity';
import type { Alert, Business } from '../state/types';
import { PLAYER } from '../state/types';
import { storageCapacity } from '../world/queries';
import { pubMetricsView } from '../selectors/metrics';
import { feedingSources } from './phase2/sourcing';

/** Samples per-second metrics (staff on duty). Event counters are added where they happen. */
export function metricsSystem(ctx: TickContext): void {
  if (ctx.state.tick % ctx.tps !== 0) return;
  const sec = Math.floor(ctx.state.tick / ctx.tps);
  for (const b of Object.values(ctx.state.businesses)) {
    const m = ctx.state.metrics.pubs[b.id];
    if (!m) continue;
    let staff = 0;
    for (const job of Object.values(ctx.reg.jobs)) if (job.service) staff += jobCapacity(b, job.id, ctx.state);
    ringSet(m.staff, sec, staff);
  }
}

function raise(next: Record<string, Alert>, prev: Record<string, Alert>, tick: number, type: string, objectId: string, variant?: string): void {
  const key = `${type}@${objectId}`;
  const old = prev[key];
  const a: Alert = { key, type, objectId, since: old?.since ?? tick };
  if (variant !== undefined) a.variant = variant;
  next[key] = a;
}

function storageAlerts(ctx: TickContext, b: Business, prev: Record<string, Alert>, next: Record<string, Alert>): void {
  for (const [res, stock] of Object.entries(b.storage)) {
    const cap = storageCapacity(ctx.reg, b, res);
    if (cap <= 0) continue;
    const fullKey = `storage_full:${res}`;
    const emptyKey = `storage_empty:${res}`;
    if (stock.amount >= cap) {
      if (!prev[`${fullKey}@${b.id}`]) ctx.events.push({ type: 'storageFull', businessId: b.id, owner: b.owner, resourceId: res });
      raise(next, prev, ctx.state.tick, fullKey, b.id);
    }
    if (stock.amount === 0) {
      if (!prev[`${emptyKey}@${b.id}`]) ctx.events.push({ type: 'storageEmpty', businessId: b.id, owner: b.owner, resourceId: res });
      raise(next, prev, ctx.state.tick, emptyKey, b.id);
    }
  }
}

/** Recomputes the Alert set; at most one Alert per type per object by construction (18.10). */
export function alertsSystem(ctx: TickContext): void {
  const prev = ctx.state.alerts;
  const next: Record<string, Alert> = {};
  const tick = ctx.state.tick;
  for (const b of Object.values(ctx.state.businesses)) {
    if (b.owner !== PLAYER) continue;
    const def = ctx.reg.businesses[b.defId];
    if (!def) continue;
    storageAlerts(ctx, b, prev, next);
    if (def.pub && b.pub) {
      const res = def.pub.drinkResource;
      const amount = b.storage[res]?.amount ?? 0;
      const open = b.pub.orderQueue.some((o) => !o.poured);
      const wasOut = prev[`out_of_beer@${b.id}`] !== undefined;
      if (amount === 0 && (open || wasOut)) raise(next, prev, tick, 'out_of_beer', b.id); // 4.11, 4.12
      const m = pubMetricsView(ctx.reg, ctx.state, b.id);
      if (m) {
        const wasLost = prev[`lost_customers@${b.id}`] !== undefined;
        const over = m.lostPct > ctx.cfg.lostAlertPct;
        if ((over && m.arrivalsInWindow >= ctx.cfg.lostAlertMinArrivals) || (wasLost && over)) raise(next, prev, tick, 'lost_customers', b.id, m.topLostReason); // 6.5, 6.6
      }
    }
    for (const hr of def.humanRequirements) if (hr.slots > 0 && isJobUnstaffed(b, hr.jobId, ctx.state)) raise(next, prev, tick, `unstaffed:${hr.jobId}`, b.id); // 5.6
    for (const ar of Object.values(b.autoReorder)) if (ar.enabled && ar.failed) raise(next, prev, tick, 'reorder_failed', b.id);
    // "internal supply" with no Player Route delivering that input (31.3)
    for (const [res, policy] of Object.entries(b.sourcing)) {
      if (policy === 'internal' && feedingSources(ctx.reg, ctx.state, b, res).length === 0) {
        raise(next, prev, tick, 'no_internal_supply', b.id);
        break;
      }
    }
  }
  for (const v of Object.values(ctx.state.vehicles)) {
    if (v.owner !== PLAYER) continue;
    const hasDriver = v.jobSlots.some((s) => s.filledBy !== null);
    if (hasDriver && !v.routeId) raise(next, prev, tick, 'no_route', v.id); // 12.5
  }
  // Orders waiting at a Supplier without a Route that will pick them up (10.7)
  for (const o of Object.values(ctx.state.orders)) {
    if (o.owner !== PLAYER || !o.destinationId) continue;
    const served = Object.values(ctx.state.routes).some(
      (r) => r.owner === PLAYER && r.stops.some((s) => s.businessId === o.sourceId && s.action === 'pickup') && r.stops.some((s) => s.businessId === o.destinationId && s.action === 'dropoff'),
    );
    if (!served) raise(next, prev, tick, 'awaiting_pickup_no_route', o.destinationId);
  }
  ctx.state.alerts = next;
}

/** First firing of each Reveal_Trigger is recorded once (19.1, 19.3); data-driven District unlocks (48.11). */
export function revealsSystem(ctx: TickContext): void {
  const fired = new Set(ctx.state.reveals.fired);
  for (const trig of Object.values(ctx.reg.revealTriggers)) {
    if (fired.has(trig.id)) continue;
    if (!evaluateCondition(trig.condition, ctx.state, ctx.events, ctx.reg)) continue;
    ctx.state.reveals.fired.push(trig.id);
    fired.add(trig.id);
    ctx.events.push({ type: 'revealFired', triggerId: trig.id, reveals: [...trig.reveals] });
  }
  let unlockedAny = false;
  for (const id of ctx.reg.world.districtOrder) {
    const d = ctx.state.districts[id];
    const cond = ctx.reg.world.districts[id]?.unlockCondition ?? null;
    if (!d || d.unlocked || !cond) continue;
    if (evaluateCondition(cond, ctx.state, ctx.events, ctx.reg)) {
      d.unlocked = true;
      unlockedAny = true;
      ctx.events.push({ type: 'districtUnlocked', districtId: id });
    }
  }
  if (unlockedAny) ctx.refreshPaths();
}

export function isRevealed(state: { reveals: { fired: string[] } }, reg: { revealTriggers: Record<string, { reveals: string[] }> }, feature: string): boolean {
  return state.reveals.fired.some((id) => reg.revealTriggers[id]?.reveals.includes(feature));
}
