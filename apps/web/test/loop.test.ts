import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ticksToRun, TICK_MS } from '../src/loop/ticks';
import { availableSpeeds, effectiveSpeed, stepSpeed, type GameSpeed } from '../src/loop/gameSpeed';
import { decideLoad } from '../src/sync/loadDecision';
import { nextDprFactor } from '../src/render/dprRule';
import { clampManualVelocity, newUprightState, updateUpright } from '../src/physics/uprightMonitor';
import { devModeFromEnvironment } from '../src/dev/devMode';

const speedArb = fc.constantFrom<GameSpeed>(1, 2, 4);

describe('Tick scheduling', () => {
  // Feature: human-resource-mvp, Property 24: Tick scheduling bounds
  it('Property 24: never more than 10 x speed Ticks per frame; game time = speed x real time otherwise', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.double({ min: 0, max: 2000, noNaN: true }), speedArb), { minLength: 1, maxLength: 200 }), (frames) => {
        let acc = 0;
        for (const [dt, speed] of frames) {
          const before = acc;
          const r = ticksToRun(acc, dt, speed);
          expect(r.run).toBeLessThanOrEqual(10 * speed);
          expect(r.acc).toBeGreaterThanOrEqual(0);
          expect(r.acc).toBeLessThan(TICK_MS + 1e-6);
          if (r.run < 10 * speed) expect(r.run * TICK_MS + r.acc).toBeCloseTo(before + dt * speed, 6);
          acc = r.acc;
        }
      }),
    );
  });

  it('Game_Speed rules: locked until revealed or Dev_Mode; 1x while driving', () => {
    expect(availableSpeeds(false, false)).toEqual([1]);
    expect(availableSpeeds(true, false)).toEqual([1, 2, 4]);
    expect(availableSpeeds(false, true)).toEqual([1, 2, 4]);
    expect(stepSpeed(1, 1, [1, 2, 4])).toBe(2);
    expect(stepSpeed(4, 1, [1, 2, 4])).toBe(4);
    expect(stepSpeed(1, -1, [1])).toBe(1);
    expect(effectiveSpeed(4, true)).toBe(1);
    expect(devModeFromEnvironment('?dev=1', false)).toBe(true);
    expect(devModeFromEnvironment('', false)).toBe(false);
  });
});

describe('Load decision', () => {
  // Feature: human-resource-mvp, Property 31: Load decision table
  it('Property 31: matches the decision table', () => {
    fc.assert(
      fc.property(fc.option(fc.record({ revision: fc.nat(20), syncedRevision: fc.nat(20) })), fc.option(fc.record({ revision: fc.nat(20) })), (localRaw, server) => {
        const local = localRaw ? { revision: Math.max(localRaw.revision, localRaw.syncedRevision), syncedRevision: localRaw.syncedRevision } : null;
        const d = decideLoad(local, server);
        let expected: string;
        if (!local) expected = 'useServer';
        else if (!server) expected = local.revision > local.syncedRevision ? 'useLocalAndUpload' : 'useLocal';
        else if (local.revision === local.syncedRevision) expected = server.revision > local.syncedRevision ? 'useServer' : 'useLocal';
        else expected = server.revision === local.syncedRevision ? 'useLocalAndUpload' : 'conflict';
        expect(d).toBe(expected);
      }),
    );
  });
});

describe('Rendering and physics helpers', () => {
  // Feature: human-resource-mvp, Property 44: Adaptive render resolution stays in bounds
  it('Property 44: DPR factor stays within [0.75, 1]', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.75, max: 1, noNaN: true }), fc.double({ min: 0, max: 200, noNaN: true }), fc.nat(10_000), (f, fps, since) => {
        const n = nextDprFactor(f, fps, since);
        expect(n).toBeGreaterThanOrEqual(0.75);
        expect(n).toBeLessThanOrEqual(1);
      }),
    );
  });

  // Feature: human-resource-mvp, Property 20: Manual speed cap
  it('Property 20: manual velocity never exceeds speed x (1 + bonus)', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: 100, noNaN: true }), fc.double({ min: -100, max: 100, noNaN: true }), fc.double({ min: 0.1, max: 20, noNaN: true }), (vx, vz, speed) => {
        const c = clampManualVelocity(vx, vz, speed, 0.1);
        expect(Math.hypot(c.vx, c.vz)).toBeLessThanOrEqual(speed * 1.1 + 1e-9);
      }),
    );
  });

  it('upright monitor resets after 2 s upside down and 0.5 s out of bounds', () => {
    const s = newUprightState();
    expect(updateUpright(s, -0.5, true, 1000)).toBe('ok');
    expect(updateUpright(s, -0.5, true, 1000)).toBe('resetUpright');
    expect(updateUpright(s, 1, false, 300)).toBe('ok');
    expect(updateUpright(s, 1, false, 300)).toBe('resetOutOfBounds');
  });
});
