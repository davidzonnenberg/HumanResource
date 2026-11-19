// Mutable camera state shared by the Camera_Controller, gestures and keyboard (not React state).
import { camCfg } from './theme';

export const camState = {
  target: { x: 0, z: 0 },
  distance: camCfg.startDistance,
  targetDistance: camCfg.startDistance,
  /** Pan offset requested by drag gestures this frame (world units). */
  panDx: 0,
  panDz: 0,
  /** Live pose of the manually driven van, written by the Physics_Layer each frame. */
  physicsPose: null as null | { x: number; z: number; /** Unit forward direction of the van on the ground. */ fx?: number; fz?: number },
  /** Smoothed forward direction used by the cab camera. */
  cabDir: { x: 0, z: -1 },
};

/** Cab camera: just above the van roof looking down the road ahead. Pure, so it can be tested. */
export function cabCameraPose(x: number, z: number, fx: number, fz: number, cab: { eyeHeight: number; eyeForward: number; lookAhead: number; lookHeight: number }) {
  const len = Math.hypot(fx, fz) || 1;
  const ux = fx / len;
  const uz = fz / len;
  return {
    eye: { x: x + ux * cab.eyeForward, y: cab.eyeHeight, z: z + uz * cab.eyeForward },
    look: { x: x + ux * cab.lookAhead, y: cab.lookHeight, z: z + uz * cab.lookAhead },
  };
}

export function zoomBy(factor: number): void {
  camState.targetDistance = Math.min(camCfg.dMax, Math.max(camCfg.dMin, camState.targetDistance * factor));
}

export function resetCamera(x: number, z: number): void {
  camState.target = { x, z };
  camState.distance = camCfg.startDistance;
  camState.targetDistance = camCfg.startDistance;
  camState.panDx = 0;
  camState.panDz = 0;
  camState.physicsPose = null;
  camState.cabDir = { x: 0, z: -1 };
}
