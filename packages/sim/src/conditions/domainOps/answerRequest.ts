// Domain op `answerRequest` (task 51.2): answering a municipality or bank request before its deadline removes it,
// so the Consequence never applies (68.4). Answers the oldest open request of the Definition named in `params.defId`.
import type { DomainHandler } from './types';
export const answerRequest: DomainHandler = (ctx, _ectx, params) => {
  const open = Object.values(ctx.state.requests ?? {}).filter((r) => r.defId === params.defId);
  const oldest = open.sort((a, b) => a.expiresTick - b.expiresTick || (a.id < b.id ? -1 : 1))[0];
  if (oldest && ctx.state.requests) Reflect.deleteProperty(ctx.state.requests, oldest.id);
};
