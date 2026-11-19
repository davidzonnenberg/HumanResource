// Domain op `setSupplyDeal` (task 48.4): signs a keg deal. Until a deal exists, Orders are rejected with deal_missing (65.5).
import type { DomainHandler } from './types';
export const setSupplyDeal: DomainHandler = (ctx, _ectx, params) => {
  const deal = ctx.reg.phase3.supplyDeals[String(params.dealId ?? '')];
  if (!deal) return;
  ctx.state.player.supplyDeal = { dealId: deal.id, kegDrinks: deal.kegDrinks, pricePerKeg: deal.pricePerKeg, contractFeePerMinute: deal.contractFeePerMinute ?? 0, feeCarry: 0 };
};
