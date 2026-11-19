/**
 * Per-frame van rig maths. Web-only (render), no three.js, no React.
 * Derives wheel spin, steering, body roll/pitch, bob and impact squash from
 * the van's pose, so it works for sim-interpolated vans and physics driving.
 */
import type { RigSpec, WheelSpec } from './vanRecipe';

/** Heading in radians: 0 faces +X, positive turns left (counter-clockwise from above), same as object.rotation.y. */
export interface VanMotion {
  x: number;
  z: number;
  /** Ground height under the van (curbs). Defaults to 0. */
  y?: number;
  heading: number;
  /** Manual driving: steer input in radians. Leave out for auto vans. */
  steer?: number | null;
  /** Manual driving: suspension compression per wheel in metres (ray-cast). */
  compression?: readonly number[] | null;
  /** Increase this counter on every impact to trigger a squash. */
  impact?: number;
}

export interface VanRigState {
  initialised: boolean;
  prevX: number;
  prevZ: number;
  prevHeading: number;
  speed: number;
  accel: number;
  steer: number;
  roll: number;
  pitch: number;
  bob: number;
  time: number;
  squash: number;
  lastImpact: number;
  wheelAngle: number;
}

export function createVanRigState(): VanRigState {
  return { initialised: false, prevX: 0, prevZ: 0, prevHeading: 0, speed: 0, accel: 0, steer: 0, roll: 0, pitch: 0, bob: 0, time: 0, squash: 0, lastImpact: 0, wheelAngle: 0 };
}

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const wrapAngle = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
/** Frame-rate independent smoothing factor. */
const smooth = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export function stepVanRig(s: VanRigState, m: VanMotion, dt: number, rig: RigSpec, wheels: WheelSpec): void {
  if (!s.initialised) {
    s.initialised = true;
    s.prevX = m.x;
    s.prevZ = m.z;
    s.prevHeading = m.heading;
    s.lastImpact = m.impact ?? 0;
    return;
  }
  if (dt <= 0) return;

  const dx = m.x - s.prevX;
  const dz = m.z - s.prevZ;
  const jumped = Math.hypot(dx, dz) > rig.teleportDistance;

  // Signed distance along the facing direction (forward = (cos h, -sin h) in XZ).
  const fwd = jumped ? 0 : dx * Math.cos(s.prevHeading) - dz * Math.sin(s.prevHeading);
  const turnRate = jumped ? 0 : wrapAngle(m.heading - s.prevHeading) / dt;

  const rawSpeed = fwd / dt;
  const rawAccel = (rawSpeed - s.speed) / dt;
  const km = smooth(rig.motionSmoothing, dt);
  s.speed += (rawSpeed - s.speed) * km;
  s.accel += (rawAccel - s.accel) * km;

  // Spin: forward motion along +X rolls the wheel with negative rotation about Z.
  s.wheelAngle = (s.wheelAngle - fwd / wheels.radius) % TAU;

  // Steering: explicit input when driving, otherwise inferred from the turn rate.
  const dir = s.speed < -0.05 ? -1 : 1;
  const targetSteer = m.steer ?? clamp(turnRate * rig.steerPerTurnRate * dir, -wheels.maxSteerRad, wheels.maxSteerRad);
  s.steer += (clamp(targetSteer, -wheels.maxSteerRad, wheels.maxSteerRad) - s.steer) * smooth(rig.steerSmoothing, dt);

  // Body: roll outward in turns, nose up when accelerating.
  const kb = smooth(rig.bodySmoothing, dt);
  const targetRoll = clamp(turnRate * s.speed * rig.rollPerLateral, -rig.maxRollRad, rig.maxRollRad);
  const targetPitch = clamp(s.accel * rig.pitchPerAccel, -rig.maxPitchRad, rig.maxPitchRad);
  s.roll += (targetRoll - s.roll) * kb;
  s.pitch += (targetPitch - s.pitch) * kb;

  // Idle-free bob that grows with speed.
  s.time += dt;
  s.bob = Math.sin(s.time * rig.bobFrequencyHz * TAU) * rig.bobAmplitude * Math.min(1, Math.abs(s.speed) / rig.bobFullSpeed);

  // Impact squash.
  const impact = m.impact ?? 0;
  if (impact !== s.lastImpact) {
    s.lastImpact = impact;
    s.squash = 1;
  }
  s.squash *= Math.exp(-rig.squashDecay * dt);

  s.prevX = m.x;
  s.prevZ = m.z;
  s.prevHeading = m.heading;
}
