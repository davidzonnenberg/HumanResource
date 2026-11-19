// Municipality and bank requests, delayed Effects and the Head of Errands (Requirement 68; tasks 51.1 to 51.5).
//  - `spawnRequest` (scheduled): opens a request at the Business with the Definition's role and schedules its deadline.
//  - `requestDeadline` (scheduled): a request nobody answered applies its data Consequence (68.4).
//  - `applyEffects` (scheduled): applies a named list of Effects later (follow-ups).
//  - `errandsSystem` (slot 2.5): working Humans of a delegating Job answer delegable requests without the CEO (68.8).
import { handleUseService } from '../commands/useService';
import type { TickContext } from '../core/context';
import { secondsToTicks } from '../core/context';
import { nextId } from '../core/ids';
import { schedule, type ScheduledPayload } from '../core/scheduler';
import { applyEffects } from '../conditions/effects';
import { jobCapacity } from '../staffing/capacity';
import { PLAYER } from '../state/types';

export function spawnRequest(ctx: TickContext, payload: ScheduledPayload): void {
  const def = ctx.reg.phase3.requests[String(payload.defId ?? '')];
  if (!def) return;
  const office = Object.values(ctx.state.businesses).find((b) => ctx.reg.businesses[b.defId]?.role === def.businessRole);
  if (!office) return;
  const id = nextId(ctx.state, 'req');
  const expiresTick = ctx.state.tick + secondsToTicks(ctx, def.deadlineSeconds);
  (ctx.state.requests ??= {})[id] = { id, defId: def.id, businessId: office.id, expiresTick };
  schedule(ctx, 'requestDeadline', expiresTick, { requestId: id });
  ctx.events.push({ type: 'news', item: { tick: ctx.state.tick, textKey: def.nameKey, params: {} } });
}

export function requestDeadline(ctx: TickContext, payload: ScheduledPayload): void {
  const id = String(payload.requestId ?? '');
  const req = ctx.state.requests?.[id];
  if (!req || !ctx.state.requests) return; // answered in time
  Reflect.deleteProperty(ctx.state.requests, id);
  const def = ctx.reg.phase3.requests[req.defId];
  if (def) applyEffects(ctx, def.consequence, { businessId: req.businessId, source: `request.${def.id}` });
}

export function appliedEffects(ctx: TickContext, payload: ScheduledPayload): void {
  const list = ctx.reg.phase3.delayedEffects[String(payload.id ?? '')];
  if (list) applyEffects(ctx, list.effects, { source: `delayed.${list.id}` });
}

/** Slot 2.5: delegating Humans answer open requests whose answering Service is `delegable`. */
export function errandsSystem(ctx: TickContext): void {
  const open = Object.values(ctx.state.requests ?? {});
  if (open.length === 0) return;
  let capacity = 0;
  for (const job of Object.values(ctx.reg.jobs))
    if (job.delegates) for (const b of Object.values(ctx.state.businesses)) if (b.owner === PLAYER) capacity += jobCapacity(b, job.id, ctx.state);
  for (const req of open.sort((a, b) => a.expiresTick - b.expiresTick || (a.id < b.id ? -1 : 1))) {
    if (capacity <= 0) return;
    const def = ctx.reg.phase3.requests[req.defId];
    const service = def ? ctx.reg.services[def.serviceId] : undefined;
    if (!def || !service?.delegable) continue;
    const answered = handleUseService(ctx, { type: 'useService', businessId: req.businessId, serviceId: service.id }, { delegated: true });
    if (answered === null) capacity -= 1;
  }
}
