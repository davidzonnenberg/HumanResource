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

/** Arriving Customers per Game_Minute (criterion 4.1). Non-increasing in price (4.2). */
export function demandPerMinute(pub: PubParams, price: number, reputation: number, brandMultiplier = 1): number {
  const priceMul = piecewise(pub.demand.price.points, price);
  const repMul = piecewise(pub.demand.reputation.points, reputation);
  return Math.max(0, pub.baseDemandPerMinute * priceMul * repMul * brandMultiplier);
}

/** Recommended service Humans (criterion 6.3) via the data-defined throughput formula. */
export function recommendedServiceHumans(pub: PubParams, arrivalsPerMinute: number): number {
  const f = pub.staffing;
  if (arrivalsPerMinute <= 0) return 1 + Math.ceil(f.serverRatio);
  const drinksPerMinute = arrivalsPerMinute * f.expectedDrinksPerVisit;
  const bartenders = (drinksPerMinute * pub.bartendingIntervalSeconds) / 60;
  return Math.max(1, Math.ceil(bartenders * (1 + f.serverRatio) * f.headroom));
}
