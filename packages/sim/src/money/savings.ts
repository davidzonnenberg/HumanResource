// Savings account (bank app). An internal transfer between two of the player's own balances:
// it is neither income nor an expense, so it does not go through applyGold and leaves the finance
// buckets alone. Total money (gold + savings) never changes here.
import type { TickContext } from '../core/context';
import type { Command, Rejection } from '../commands/types';
import { GOLD_LIMIT } from './gold';

export function handleTransferSavings(ctx: TickContext, cmd: Extract<Command, { type: 'transferSavings' }>): Rejection | null {
  const p = ctx.state.player;
  const amount = cmd.amount;
  if (!Number.isInteger(amount) || amount <= 0 || amount > GOLD_LIMIT) return { reason: 'invalid_quantity', field: 'amount' };
  if (cmd.direction === 'toSavings') {
    // The balance account may be in debt; only positive money can be put aside.
    if (p.gold < amount) return { reason: 'insufficient_gold', missingGold: amount - Math.max(0, p.gold) };
    p.gold -= amount;
    p.savings += amount;
    return null;
  }
  if (p.savings < amount) return { reason: 'insufficient_gold', missingGold: amount - p.savings };
  p.savings -= amount;
  p.gold += amount;
  return null;
}
