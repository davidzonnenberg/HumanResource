// Domain op `setLicense` (task 48.2): the Player takes a License_Tier. The Service rejects a second licence
// with already_licensed through its Condition. The tier's Seats, Taps and customer types are read from data.
import type { DomainHandler } from './types';
export const setLicense: DomainHandler = (ctx, _ectx, params) => {
  const tierId = String(params.tierId ?? '');
  if (ctx.reg.phase3.licenseTiers[tierId]) ctx.state.player.license = tierId;
};
