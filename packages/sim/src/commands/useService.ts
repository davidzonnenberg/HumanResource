// The single `useService` Command (Requirement 51): every Business office action is data. Order of
// validation: unknown entity, locked District, access, params, Conditions in order, `once`, Gold.
// Nothing is mutated before the last check passes, so a rejection leaves the state unchanged.
import type { TickContext } from '../core/context';
import { gold } from '../core/context';
import { applyEffects } from '../conditions/effects';
import { evaluateCondition } from '../conditions/evaluate';
import type { ParamValue, ServiceDef } from '../defs/schemas';
import { requireGold } from '../money/gold';
import { NPC, PLAYER } from '../state/types';
import { requireAccess } from '../world/access';
import { isBusinessInUnlockedDistrict } from '../world/geometry';
import type { Command, ReasonCode, Rejection } from './types';

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** True when `params` carries exactly the parameters the Service declares, each of the declared type. */
export function serviceParamsValid(service: ServiceDef, params: Record<string, ParamValue> | undefined): boolean {
  const spec = service.params ?? {};
  const given = params ?? {};
  for (const k of Object.keys(given)) if (!hasOwn(spec, k)) return false;
  for (const [name, p] of Object.entries(spec)) {
    if (!hasOwn(given, name)) return false;
    const v = given[name] as ParamValue;
    switch (p.type) {
      case 'string':
        if (typeof v !== 'string' || (p.oneOf && !p.oneOf.includes(v))) return false;
        break;
      case 'int':
        if (typeof v !== 'number' || !Number.isInteger(v) || v < p.min || v > p.max) return false;
        break;
      case 'boolean':
        if (typeof v !== 'boolean') return false;
        break;
      case 'stringList':
        if (!Array.isArray(v) || v.length > p.maxItems || new Set(v).size !== v.length || v.some((x) => !p.oneOf.includes(x))) return false;
        break;
    }
  }
  return true;
}

export function handleUseService(ctx: TickContext, cmd: Extract<Command, { type: 'useService' }>): Rejection | null {
  const { state, reg } = ctx;
  const b = state.businesses[cmd.businessId];
  if (!b) return { reason: 'unknown_entity', field: 'businessId' };
  const service = reg.businesses[b.defId]?.services?.find((s) => s.id === cmd.serviceId);
  if (!service) return { reason: 'unknown_entity', field: 'serviceId' };
  if (!isBusinessInUnlockedDistrict(reg, state, b)) return { reason: 'district_locked' };
  if (b.owner !== PLAYER && b.owner !== NPC) return { reason: 'not_owner' }; // a rival's Business offers no Services
  const denied = requireAccess(ctx, service.access, b.id);
  if (denied) return denied;
  if (!serviceParamsValid(service, cmd.params)) return { reason: 'conditions_not_met', field: 'params' };
  for (const c of service.conditions)
    if (!evaluateCondition(c.condition, state, ctx.events, reg)) return { reason: (c.reason as ReasonCode | undefined) ?? 'conditions_not_met' };
  if (service.once && (state.servicesUsed?.[service.id] ?? 0) > 0) return { reason: 'already_done' };
  const afford = requireGold(state, PLAYER, service.cost);
  if (!afford.ok) return { reason: afford.reason, missingGold: afford.missingGold };
  // All checks passed: apply.
  if (service.cost > 0) gold(ctx, PLAYER, -service.cost, 'other', b.id);
  applyEffects(ctx, service.effects, { businessId: b.id, source: service.id, params: cmd.params ?? {} });
  const used = (state.servicesUsed ??= {});
  used[service.id] = (used[service.id] ?? 0) + 1;
  ctx.events.push({ type: 'serviceUsed', businessId: b.id, serviceId: service.id });
  return null;
}
