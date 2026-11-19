// Domain op `payOffLoan` (task 48.1): early payoff pays the whole remaining balance and removes the Loan (63.7).
import { gold } from '../../core/context';
import { requireGold } from '../../money/gold';
import { PLAYER } from '../../state/types';
import type { DomainHandler, DomainValidator } from './types';
export const validatePayOffLoan: DomainValidator = (ctx) => {
  const loan = (ctx.state.loans ?? [])[0];
  if (!loan) return { reason: 'conditions_not_met' };
  const check = requireGold(ctx.state, PLAYER, loan.remaining);
  return check.ok ? null : { reason: check.reason, missingGold: check.missingGold };
};
export const payOffLoan: DomainHandler = (ctx) => {
  const loan = (ctx.state.loans ?? [])[0];
  if (!loan) return;
  gold(ctx, PLAYER, -loan.remaining, 'loan', loan.id);
  ctx.state.loans = (ctx.state.loans ?? []).filter((l) => l.id !== loan.id);
};
