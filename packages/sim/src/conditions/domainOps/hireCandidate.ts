// Domain op `hireCandidate` (task 48.6): the Job_Centre hires a candidate with a Quirk. The validator charges nothing
// itself but rejects a missing amount of Gold, a duplicate name and a second Bar_Worker before `hiring_option` (66.5).
import { gold } from '../../core/context';
import { nextId } from '../../core/ids';
import { baseName, uniqueInWorkforce } from '../../names/names';
import { requireGold } from '../../money/gold';
import { PLAYER } from '../../state/types';
import { isRevealed } from '../revealed';
import { firstPlayerPub } from '../../world/queries';
import { plotCenter } from '../../world/geometry';
import type { DomainHandler, DomainValidator } from './types';
export const validateHireCandidate: DomainValidator = (ctx, ectx, params) => {
  const c = ctx.reg.phase3.candidates[String(params.candidateId ?? '')];
  if (!c) return { reason: 'unknown_entity', field: 'candidateId' };
  if (Object.values(ctx.state.humans).some((h) => h.owner === PLAYER && baseName(h.name) === c.name)) return { reason: 'not_allowed' }; // already on the payroll
  // A second Bar_Worker waits for the hiring option; a Driver can always be hired.
  const service = ctx.reg.jobs[c.jobId]?.service === true;
  const hiredSameJob = Object.values(ctx.reg.phase3.candidates).filter((o) => o.jobId === c.jobId && (ctx.state.servicesUsed?.[`hire_${o.id}`] ?? 0) > 0).length;
  if (service && hiredSameJob >= 1 && !isRevealed(ctx.state, ctx.reg, 'hiring')) return { reason: 'not_available' };
  const check = requireGold(ctx.state, PLAYER, c.hiringCost);
  return check.ok ? null : { reason: check.reason, missingGold: check.missingGold };
};
export const hireCandidate: DomainHandler = (ctx, _ectx, params) => {
  const c = ctx.reg.phase3.candidates[String(params.candidateId ?? '')];
  const pub = firstPlayerPub(ctx.reg, ctx.state);
  const humanDef = ctx.reg.humans.regular ?? Object.values(ctx.reg.humans)[0];
  if (!c || !pub || !humanDef) return;
  const id = nextId(ctx.state, 'hum');
  const centre = plotCenter(ctx.reg, pub.plotId);
  ctx.state.humans[id] = {
    id,
    defId: humanDef.id,
    name: uniqueInWorkforce(ctx.state, PLAYER, c.name),
    owner: PLAYER,
    qualifications: [...humanDef.qualifications],
    assignment: null,
    status: 'unassigned',
    location: { kind: 'at', x: centre.x, z: centre.z, insideBusinessId: pub.id },
    task: null,
    salaryCarry: 0,
    quirkId: c.quirkId,
  };
  gold(ctx, PLAYER, -c.hiringCost, 'hiring', id);
  ctx.events.push({ type: 'humanHired', humanId: id, owner: PLAYER });
};
