// Derived metric views for Panels and Alerts (6.1–6.3, 11.6, 17.4).
import type { DefinitionRegistry } from '../defs/registry';
import { recommendedServiceHumans } from '../defs/formulas';
import { ringCount, ringSum } from '../metrics/ring';
import type { LostReason, SimState } from '../state/types';

export interface PubMetricsView {
  arrivalsPerMinute: number;
  arrivalsInWindow: number;
  serviceHumans: number;
  recommendedServiceHumans: number;
  averageWaitSeconds: number;
  lostPct: number;
  lostInWindow: number;
  topLostReason: LostReason;
  popularity: 'low' | 'medium' | 'high';
}

export function pubMetricsView(reg: DefinitionRegistry, state: SimState, pubId: string): PubMetricsView | null {
  const m = state.metrics.pubs[pubId];
  const b = state.businesses[pubId];
  const def = b ? reg.businesses[b.defId]?.pub : undefined;
  if (!m || !def) return null;
  const tps = reg.config.ticksPerSecond;
  const now = Math.floor(state.tick / tps);
  const window = m.arrivals.size;
  const elapsed = Math.min(window, now + 1);
  const arrivals = ringSum(m.arrivals, now);
  const lostBy: Record<LostReason, number> = {
    no_seat: ringSum(m.lostNoSeat, now),
    out_of_beer: ringSum(m.lostOutOfBeer, now),
    patience_expired: ringSum(m.lostPatience, now),
  };
  const lost = lostBy.no_seat + lostBy.out_of_beer + lostBy.patience_expired;
  let top: LostReason = 'patience_expired';
  for (const r of ['patience_expired', 'no_seat', 'out_of_beer'] as const) if (lostBy[r] > lostBy[top]) top = r;
  const waitCount = ringSum(m.waitCount, now);
  const staffSamples = ringCount(m.staff, now);
  const arrivalsPerMinute = (arrivals * 60) / Math.max(1, elapsed);
  const bands = reg.config.popularityBands;
  return {
    arrivalsPerMinute,
    arrivalsInWindow: arrivals,
    serviceHumans: staffSamples > 0 ? Math.round(ringSum(m.staff, now) / staffSamples) : 0,
    recommendedServiceHumans: recommendedServiceHumans(def, arrivalsPerMinute),
    averageWaitSeconds: waitCount > 0 ? ringSum(m.waitSum, now) / waitCount : 0,
    lostPct: arrivals > 0 ? (lost / arrivals) * 100 : 0, // 0% when nobody arrived (6.2)
    lostInWindow: lost,
    topLostReason: top,
    popularity: arrivalsPerMinute < bands.low ? 'low' : arrivalsPerMinute > bands.high ? 'high' : 'medium',
  };
}

export function vehicleDeliveriesPerMinute(state: SimState, vehicleId: string, tps: number): number {
  const m = state.metrics.vehicles[vehicleId];
  if (!m) return 0;
  const now = Math.floor(state.tick / tps);
  const elapsed = Math.min(m.deliveries.size, now + 1);
  return (ringSum(m.deliveries, now) * 60) / Math.max(1, elapsed);
}
