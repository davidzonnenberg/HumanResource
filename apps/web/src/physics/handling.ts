// Pure arcade handling for Manual_Driving (34.5). All feel comes from the Vehicle Definition's
// `handling`, so every vehicle type can drive differently from its JSON alone.
import type { VehicleDef } from '@hr/sim';
import { clampManualVelocity } from './uprightMonitor';

export type Handling = VehicleDef['handling'];

export interface DriveInput {
  /** -1..1: forward (+) / brake-then-reverse (-). */
  throttle: number;
  /** -1..1: left (+) / right (-). */
  steer: number;
  /** Gas and brake held at the same time (keyboard), for donuts. */
  gasAndBrake: boolean;
  /** Handbrake: Space or the touch drift button. */
  handbrake: boolean;
}

export interface DriveOutput {
  vx: number;
  vz: number;
  /** Yaw rate in rad/s for the body's angular velocity. */
  yawRate: number;
  mode: 'drive' | 'drift' | 'donut';
}

/** Below this speed, gas + brake (or gas + handbrake) spins donuts instead of moving. */
export const DONUT_MAX_SPEED = 4;
/** Distance from the van centre to its front axle (pivot of a donut), in body units. */
export const FRONT_AXLE = 1.25;

/**
 * One frame of handling. `fx, fz` is the van's flat unit forward vector, `vx, vz` its current
 * velocity. The result is the velocity and yaw rate to write back to the body.
 */
export function driveStep(h: Handling, vx: number, vz: number, fx: number, fz: number, input: DriveInput, dt: number): DriveOutput {
  const speed = Math.hypot(vx, vz);
  const forward = vx * fx + vz * fz;
  const latX = vx - fx * forward;
  const latZ = vz - fz * forward;
  const gas = input.throttle > 0;

  // Donuts: pivot around the front axle at low speed (gas + brake, or gas + handbrake).
  if (speed < DONUT_MAX_SPEED && ((gas && input.handbrake) || input.gasAndBrake)) {
    const dir = input.steer !== 0 ? Math.sign(input.steer) : 1;
    const w = dir * h.donutTurnRate;
    // velocity of the centre when rotating around the front axle: w x (centre - axle)
    return { vx: -w * FRONT_AXLE * fz, vz: w * FRONT_AXLE * fx, yawRate: w, mode: 'donut' };
  }

  const drifting = input.handbrake && speed > 1;
  // Grip removes a share of the sideways velocity; the handbrake almost removes grip.
  const grip = drifting ? h.driftGrip : (1 - h.steeringLooseness) * 0.35;
  let nf = forward;
  if (input.throttle > 0) nf += h.acceleration * input.throttle * dt;
  else if (input.throttle < 0) {
    // Brake first, reverse only once (almost) stopped.
    if (nf > 0.5) nf = Math.max(0, nf - h.brakeDecel * -input.throttle * dt);
    else nf = Math.max(-h.reverseTopSpeed, nf + h.acceleration * input.throttle * dt);
  } else if (!drifting) nf *= Math.pow(0.94, dt * 60); // roll to a stop so Load/Unload/Exit appear
  let nvx = fx * nf + latX * (1 - grip);
  let nvz = fz * nf + latZ * (1 - grip);
  if (drifting) {
    const k = Math.max(0, 1 - h.driftDrag * dt);
    nvx *= k;
    nvz *= k;
  }
  const capped = clampManualVelocity(nvx, nvz, h.manualTopSpeed);
  const turnBoost = drifting ? h.driftTurnBoost : 1;
  const yawRate = input.steer * h.turnRate * turnBoost * Math.min(1, speed / 3) * Math.sign(forward || 1);
  return { vx: capped.vx, vz: capped.vz, yawRate, mode: drifting ? 'drift' : 'drive' };
}
