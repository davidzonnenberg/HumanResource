// Parameterised formulas (no code strings). Piecewise-linear only, so results are identical
// across JS engines (no transcendental math).
import type { PubParams } from './schemas';

/** Piecewise-linear interpolation, clamped at both ends. Points sorted by x. */
export function piecewise(points: readonly (readonly [number, number])[], x: number): number {
  const first = points[0];
  if (!first) return 1;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i] as readonly [number, number];
    const [x0, y0] = points[i - 1] as readonly [number, number];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return (points[points.length - 1] as readonly [number, number])[1];
}

/** Reputation 0..100 as a demand multiplier in basis points (10000 = x1.0), from the Pub's data formula. */
export function reputationDemandBp(pub: PubParams, reputation: number): number {
  return Math.round(piecewise(pub.demand.reputation.points, reputation) * 10000);
}
/**
 * Arriving Customers per Game_Minute (criterion 4.1). `demandBp` is the `demand` stat from `getStat`
 * (brand, Traits, Reputation and boosts as basis points; 10000 = x1.0). Non-increasing in price (4.2).
 */
export function demandPerMinute(pub: PubParams, price: number, demandBp = 10000): number {
  const priceMul = piecewise(pub.demand.price.points, price);
  return Math.max(0, pub.baseDemandPerMinute * priceMul * (demandBp / 10000));
}
/** Recommended service Humans (criterion 6.3) via the data-defined throughput formula. */
export function recommendedServiceHumans(pub: PubParams, arrivalsPerMinute: number): number {
  const f = pub.staffing;
  if (arrivalsPerMinute <= 0) return 1 + Math.ceil(f.serverRatio);
  const drinksPerMinute = arrivalsPerMinute * f.expectedDrinksPerVisit;
  const bartenders = (drinksPerMinute * pub.bartendingIntervalSeconds) / 60;
  return Math.max(1, Math.ceil(bartenders * (1 + f.serverRatio) * f.headroom));
}
