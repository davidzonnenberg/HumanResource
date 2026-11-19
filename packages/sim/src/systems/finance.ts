// Salaries per Tick with an exact carry, applied regardless of balance (7.3, 8.5, 49.5).
import type { TickContext } from '../core/context';
import { gold } from '../core/context';
import { PLAYER } from '../state/types';

export function financeSystem(ctx: TickContext): void {
  const perMinute = 60 * ctx.tps;
  for (const h of Object.values(ctx.state.humans)) {
    const def = ctx.reg.humans[h.defId];
    if (!def) continue;
    h.salaryCarry += def.salaryPerMinute;
    const charge = Math.floor(h.salaryCarry / perMinute);
    h.salaryCarry -= charge * perMinute;
    if (charge > 0) gold(ctx, h.owner, -charge, 'salary', h.id);
  }
  // Loan repayment per Game_Minute with an exact carry; a Mandatory_Expense that applies in debt too (63.3, 63.4).
  const loans = ctx.state.loans ?? [];
  for (const loan of loans) {
    loan.carry += loan.repaymentPerMinute;
    const charge = Math.min(Math.floor(loan.carry / perMinute), loan.remaining);
    loan.carry -= Math.floor(loan.carry / perMinute) * perMinute;
    if (charge > 0) {
      gold(ctx, PLAYER, -charge, 'loan', loan.id);
      loan.remaining -= charge;
    }
  }
  if (loans.some((l) => l.remaining <= 0)) ctx.state.loans = loans.filter((l) => l.remaining > 0); // a repaid Loan is removed (63.5)
  // Contract fee of a keg deal, same exact-carry rule (65.6)
  const deal = ctx.state.player.supplyDeal;
  if (deal && deal.contractFeePerMinute > 0) {
    deal.feeCarry += deal.contractFeePerMinute;
    const fee = Math.floor(deal.feeCarry / perMinute);
    deal.feeCarry -= fee * perMinute;
    if (fee > 0) gold(ctx, PLAYER, -fee, 'purchase', deal.dealId);
  }
  // Warehouse rent per Game_Minute with an exact carry, a Mandatory_Expense that applies in debt too (28.4)
  for (const b of Object.values(ctx.state.businesses)) {
    if (!b.rental) continue;
    b.rental.carry += b.rental.feePerMinute;
    const charge = Math.floor(b.rental.carry / perMinute);
    b.rental.carry -= charge * perMinute;
    if (charge > 0) gold(ctx, b.owner, -charge, 'rental', b.id);
  }
  // Headcount_Fill salaries: count x Salary (49.5)
  const holders = [...Object.values(ctx.state.businesses), ...Object.values(ctx.state.vehicles)];
  for (const holder of holders) {
    for (const slot of holder.jobSlots) {
      if (slot.filledBy?.kind !== 'headcount') continue;
      const def = ctx.reg.humans[slot.filledBy.humanDefId];
      if (!def) continue;
      const carry = (slot.headcountSalaryCarry ?? 0) + slot.filledBy.count * def.salaryPerMinute;
      const charge = Math.floor(carry / perMinute);
      slot.headcountSalaryCarry = carry - charge * perMinute;
      if (charge > 0) gold(ctx, holder.owner, -charge, 'salary', holder.id);
    }
  }
}
