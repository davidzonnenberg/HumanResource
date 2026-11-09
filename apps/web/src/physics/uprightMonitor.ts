// Pure reset rules for the manually driven van (13.14, 13.15): upside down for 2 s real time,
// or out of the drivable area for 0.5 s, triggers a reset onto the nearest road point.
export interface UprightState {
  tiltedMs: number;
  outMs: number;
}

export type UprightVerdict = 'ok' | 'resetUpright' | 'resetOutOfBounds';

export const TILT_RESET_MS = 2000;
export const OUT_RESET_MS = 500;

export function newUprightState(): UprightState {
  return { tiltedMs: 0, outMs: 0 };
}

/** `upY` is the world-up component of the body's up vector (< 0 means more than 90° tilted). */
export function updateUpright(s: UprightState, upY: number, inBounds: boolean, dtMs: number): UprightVerdict {
  s.tiltedMs = upY < 0 ? s.tiltedMs + dtMs : 0;
  s.outMs = inBounds ? 0 : s.outMs + dtMs;
  if (s.outMs >= OUT_RESET_MS) {
    s.outMs = 0;
    s.tiltedMs = 0;
    return 'resetOutOfBounds';
  }
  if (s.tiltedMs >= TILT_RESET_MS) {
    s.tiltedMs = 0;
    return 'resetUpright';
  }
  return 'ok';
}

/** Arcade speed cap: manual top speed = automatic speed × (1 + bonus) (13.4). */
export function clampManualVelocity(vx: number, vz: number, autoSpeed: number, bonus: number): { vx: number; vz: number } {
  const max = autoSpeed * (1 + bonus);
  const sp = Math.hypot(vx, vz);
  if (sp <= max || sp === 0) return { vx, vz };
  const k = max / sp;
  return { vx: vx * k, vz: vz * k };
}

/** Converts a touch stick (desired world direction) into throttle/steer relative to the van. */
export function stickToDrive(desiredX: number, desiredZ: number, forwardX: number, forwardZ: number): { throttle: number; steer: number } {
  const mag = Math.min(1, Math.hypot(desiredX, desiredZ));
  if (mag < 0.05) return { throttle: 0, steer: 0 };
  const cross = forwardX * desiredZ - forwardZ * desiredX;
  const dot = forwardX * desiredX + forwardZ * desiredZ;
  const angle = Math.atan2(cross, dot); // signed angle from forward to desired
  if (Math.abs(angle) > (120 * Math.PI) / 180) {
    // Desired direction far behind: reverse, steering towards it
    return { throttle: -mag, steer: Math.sign(angle) * -1 };
  }
  return { throttle: mag, steer: Math.max(-1, Math.min(1, -angle * 1.5)) };
}
