// Domain op `fireRibbon` (task 48.7): cuts the ribbon. The Service lists the checklist as Conditions and fires the
// `pub_open` Reveal_Trigger; this op opens the Player's Pub.
import { firstPlayerPub } from '../../world/queries';
import type { DomainHandler } from './types';
export const fireRibbon: DomainHandler = (ctx) => {
  const b = firstPlayerPub(ctx.reg, ctx.state);
  if (b?.pub) b.pub.open = true;
};
