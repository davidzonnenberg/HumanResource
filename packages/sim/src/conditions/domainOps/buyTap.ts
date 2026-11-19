// Domain op `buyTap` (task 43.4): one more Tap for the Player's Pub. The Service that uses it checks
// `tapsBelowMax` first (reason limit_reached) and charges the price as its cost.
import { firstPlayerPub } from '../../world/queries';
import type { DomainHandler } from './types';
export const buyTap: DomainHandler = (ctx) => {
  const b = firstPlayerPub(ctx.reg, ctx.state);
  if (b?.pub) b.pub.tapsBuilt += 1;
};
