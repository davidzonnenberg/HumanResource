// Property 23: View mode hysteresis and camera clamp (task 7.12; Requirements 15.3, 15.4, 15.7).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clampDistance, nextViewMode, type ViewMode } from '../src/interaction/viewMode';

const HYSTERESIS = 0.05; // default 5% from the requirements
const cfgFor = (threshold: number) => ({ modeSwitchThreshold: threshold, hysteresis: HYSTERESIS });
const thresholdArb = fc.double({ min: 1, max: 200, noNaN: true });
const modeArb = fc.constantFrom<ViewMode>('ceo', 'management');

describe('view mode hysteresis', () => {
  // Feature: human-resource-mvp, Property 23: View mode hysteresis and camera clamp
  it('Property 23: outside the dead band the mode follows the distance', () => {
    fc.assert(
      fc.property(thresholdArb, fc.double({ min: 0, max: 400, noNaN: true }), (t, d) => {
        const cfg = cfgFor(t);
        const lower = t * (1 - HYSTERESIS);
        if (d > t) expect(nextViewMode('ceo', d, cfg)).toBe('management');
        if (d < lower) expect(nextViewMode('management', d, cfg)).toBe('ceo');
        if (d <= t) expect(nextViewMode('ceo', d, cfg)).toBe('ceo');
        if (d >= lower) expect(nextViewMode('management', d, cfg)).toBe('management');
      }),
    );
  });

  it('Property 23: distances inside the dead band never flip either mode', () => {
    fc.assert(
      fc.property(
        thresholdArb,
        modeArb,
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 50 }),
        (t, start, fractions) => {
          const cfg = cfgFor(t);
          const lower = t * (1 - HYSTERESIS);
          let mode = start;
          for (const f of fractions) {
            const d = Math.min(t, Math.max(lower, lower + f * (t - lower))); // within [lower, t] despite rounding
            mode = nextViewMode(mode, d, cfg);
            expect(mode).toBe(start);
          }
        },
      ),
    );
  });

  it('Property 23: the switch is idempotent for a fixed distance', () => {
    fc.assert(
      fc.property(thresholdArb, modeArb, fc.double({ min: 0, max: 400, noNaN: true }), (t, m, d) => {
        const once = nextViewMode(m, d, cfgFor(t));
        expect(nextViewMode(once, d, cfgFor(t))).toBe(once);
      }),
    );
  });

  it('a zoom that crosses the threshold and comes back does not flicker in the dead band', () => {
    const cfg = cfgFor(100);
    expect(nextViewMode('ceo', 101, cfg)).toBe('management');
    expect(nextViewMode('management', 99, cfg)).toBe('management'); // above 95, still management
    expect(nextViewMode('management', 94, cfg)).toBe('ceo');
  });
});

describe('camera clamp while driving (15.7)', () => {
  // Feature: human-resource-mvp, Property 23: View mode hysteresis and camera clamp
  it('Property 23: the distance stays in the band and never exceeds the driving maximum while driving', () => {
    // The driving maximum sits inside the band (it is a Person/Business band limit), so dMin <= drivingMax <= dMax.
    const bandArb = fc.double({ min: 5, max: 20, noNaN: true }).chain((dMin) =>
      fc.tuple(fc.constant(dMin), fc.double({ min: 40, max: 200, noNaN: true })).chain(([lo, hi]) =>
        fc.double({ min: lo, max: hi, noNaN: true }).map((drivingMax) => ({ dMin: lo, dMax: hi, drivingMax })),
      ),
    );
    fc.assert(
      fc.property(fc.double({ min: -100, max: 500, noNaN: true }), bandArb, fc.boolean(), (d, { dMin, dMax, drivingMax }, driving) => {
        const c = clampDistance(d, dMin, dMax, driving, drivingMax);
        expect(c).toBeGreaterThanOrEqual(dMin);
        expect(c).toBeLessThanOrEqual(dMax);
        if (driving) expect(c).toBeLessThanOrEqual(drivingMax);
        // Inside the allowed range the camera keeps the requested distance.
        const hi = driving ? drivingMax : dMax;
        if (d >= dMin && d <= hi) expect(c).toBe(d);
      }),
    );
  });
});
