// Domain op `startLoan` (task 48.1): creates the Loan record, sets the Fit_Out_Budget and pays out the principal
// minus that budget (the budget is part of the principal and can only be spent on the fit-out, 63.2).
import { gold } from '../../core/context';
import { nextId } from '../../core/ids';
import { mulDivCeil } from '../../money/gold';
import { PLAYER } from '../../state/types';
import type { DomainHandler } from './types';
export const startLoan: DomainHandler = (ctx, _ectx, params) => {
  const offer = ctx.reg.phase3.loanOffers[String(params.offerId ?? '')];
  if (!offer || (ctx.state.loans ?? []).length > 0) return;
  const id = nextId(ctx.state, 'loan');
  (ctx.state.loans ??= []).push({
    id,
    offerId: offer.id,
    principal: offer.principal,
    remaining: offer.principal + mulDivCeil(offer.principal, offer.interestBp, 10000),
    repaymentPerMinute: offer.repaymentPerMinute,
    carry: 0,
    startTick: ctx.state.tick,
  });
  ctx.state.player.fitOutBudget = offer.fitOutBudget;
  gold(ctx, PLAYER, offer.principal - offer.fitOutBudget, 'loan', id);
};
