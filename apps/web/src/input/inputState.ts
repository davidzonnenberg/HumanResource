// Shared mutable input intent (read inside the loop / useFrame, never React state).
import type { Simulation } from '@hr/sim';

export interface InputState {
  /** CEO movement / steering vector in world axes, |v| <= 1 (fixed screen-aligned axes, 15.12). */
  mx: number;
  mz: number;
  /** Raw screen-space stick (x right, y up) for driving: throttle/steer. */
  stickX: number;
  stickY: number;
  keys: Set<string>;
  /** Set by the Physics_Layer while mounted; submits manualVehicleUpdate once per Tick. */
  physicsBeforeTick: ((sim: Simulation) => void) | null;
}

export const inputState: InputState = { mx: 0, mz: 0, stickX: 0, stickY: 0, keys: new Set(), physicsBeforeTick: null };
