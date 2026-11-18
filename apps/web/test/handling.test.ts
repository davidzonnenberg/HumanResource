import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rawContent } from '@hr/content';
import { DONUT_MAX_SPEED, driveStep, type DriveInput, type Handling } from '../src/physics/handling';

const van = (rawContent.vehicles as { id: string; speed: number; handling: Handling }[]).find((v) => v.id === 'delivery_van');
if (!van) throw new Error('delivery_van missing');
const h = van.handling;
const idle: DriveInput = { throttle: 0, steer: 0, gasAndBrake: false, handbrake: false };
const dt = 1 / 60;

function run(input: DriveInput, frames: number, start = { vx: 0, vz: 0 }) {
  let { vx, vz } = start;
  let out = driveStep(h, vx, vz, 0, -1, input, dt);
  for (let i = 0; i < frames; i++) {
    out = driveStep(h, vx, vz, 0, -1, input, dt);
    vx = out.vx;
    vz = out.vz;
  }
  return out;
}

describe('manual driving handling (34.5)', () => {
  it('full gas reaches the manual top speed, about twice the route speed', () => {
    const out = run({ ...idle, throttle: 1 }, 240);
    expect(Math.hypot(out.vx, out.vz)).toBeCloseTo(h.manualTopSpeed, 5);
    expect(h.manualTopSpeed).toBeGreaterThanOrEqual(van.speed * 2);
  });

  // Feature: human-resource-mvp, Property 20: Manual speed cap
  it('Property 20: no input ever pushes the van past manualTopSpeed', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -30, max: 30, noNaN: true }),
        fc.double({ min: -30, max: 30, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.boolean(),
        (vx, vz, throttle, steer, handbrake) => {
          const out = driveStep(h, vx, vz, 0, -1, { throttle, steer, gasAndBrake: false, handbrake }, dt);
          const inDonut = out.mode === 'donut';
          if (!inDonut) expect(Math.hypot(out.vx, out.vz)).toBeLessThanOrEqual(h.manualTopSpeed + 1e-9);
        },
      ),
    );
  });

  it('S brakes first and only reverses once stopped, capped at reverseTopSpeed', () => {
    const moving = driveStep(h, 0, -10, 0, -1, { ...idle, throttle: -1 }, dt);
    expect(-moving.vz).toBeGreaterThan(0); // still going forward, slower
    expect(-moving.vz).toBeLessThan(10);
    const back = run({ ...idle, throttle: -1 }, 300);
    expect(back.vz).toBeCloseTo(h.reverseTopSpeed, 5); // forward is -z, so reverse is +z
  });

  it('the handbrake keeps much more sideways slide than normal grip', () => {
    const normal = driveStep(h, 6, -10, 0, -1, { ...idle, throttle: 1 }, dt);
    const drift = driveStep(h, 6, -10, 0, -1, { ...idle, throttle: 1, handbrake: true }, dt);
    expect(drift.mode).toBe('drift');
    expect(Math.abs(drift.vx)).toBeGreaterThan(Math.abs(normal.vx));
    const turnN = driveStep(h, 0, -10, 0, -1, { ...idle, steer: 1 }, dt).yawRate;
    const turnD = driveStep(h, 0, -10, 0, -1, { ...idle, steer: 1, handbrake: true }, dt).yawRate;
    expect(turnD).toBeGreaterThan(turnN);
  });

  it('gas + brake, or gas + handbrake, at low speed spins donuts; steer picks the direction', () => {
    const a = driveStep(h, 0, 0, 0, -1, { ...idle, throttle: 0, gasAndBrake: true }, dt);
    expect(a.mode).toBe('donut');
    expect(a.yawRate).toBeCloseTo(h.donutTurnRate);
    const b = driveStep(h, 0, 0, 0, -1, { ...idle, throttle: 1, steer: -1, handbrake: true }, dt);
    expect(b.mode).toBe('donut');
    expect(b.yawRate).toBeCloseTo(-h.donutTurnRate);
    const fast = driveStep(h, 0, -(DONUT_MAX_SPEED + 3), 0, -1, { ...idle, throttle: 1, handbrake: true }, dt);
    expect(fast.mode).toBe('drift'); // at speed the same input is a drift, not a donut
  });

  it('coasting rolls to a stop so Load/Unload/Get out appear', () => {
    const out = run(idle, 400, { vx: 0, vz: -15 });
    expect(Math.hypot(out.vx, out.vz)).toBeLessThan(0.5);
  });
});
