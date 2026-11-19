// Mutable camera state shared by the Camera_Controller, gestures and keyboard (not React state).
import { useSession } from '../store/stores';
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
  /** Cab camera distance behind the van, in metres: at least minBack (roof in view), more = GTA-style chase view. */
  cabBack: camCfg.cab.minBack,
  cabBackTarget: camCfg.cab.minBack,
  /** Last zoom per view, so zooming in one view does not change the others (the cab camera has its own, above). */
  viewZoom: {} as Partial<Record<'ceo' | 'management', number>>,
  /** Smoothed point the chase camera follows (the van pose without physics jitter). */
  cabAnchor: { x: 0, z: 0, set: false },
};

export interface CabConfig {
  eyeHeight: number;
  eyeForward: number;
  lookAhead: number;
  lookHeight: number;
  /** Closest the camera may get: a little behind the roof so you still see the van top. */
  minBack: number;
  maxBack: number;
  chaseFullAt: number;
  chaseRise: number;
  chaseLookHeight: number;
}

/** 0 on the roof, 1 once the camera is `chaseFullAt` metres behind the van. */
export const chaseBlend = (back: number, cab: Pick<CabConfig, 'chaseFullAt'>): number => Math.min(1, Math.max(0, back / cab.chaseFullAt));

/**
 * Cab camera. With back = 0 it sits just above the van roof looking down the road ahead. Pulling
 * back moves it behind and higher and turns it to look at the van (GTA-style). Pure, so it can be tested.
 */
export function cabCameraPose(x: number, z: number, fx: number, fz: number, cab: CabConfig, back = 0) {
  const len = Math.hypot(fx, fz) || 1;
  const ux = fx / len;
  const uz = fz / len;
  const b = Math.min(cab.maxBack, Math.max(0, back));
  const s = chaseBlend(b, cab);
  const eyeAlong = cab.eyeForward - b;
  const lookAlong = cab.lookAhead * (1 - s) + 1.5 * s;
  return {
    eye: { x: x + ux * eyeAlong, y: cab.eyeHeight + b * cab.chaseRise, z: z + uz * eyeAlong },
    look: { x: x + ux * lookAlong, y: cab.lookHeight * (1 - s) + cab.chaseLookHeight * s, z: z + uz * lookAlong },
  };
}

export function zoomBy(factor: number): void {
  if (useSession.getState().driveCam === 'cab') {
    // In the cab camera zoom moves the camera behind the van: zooming out pulls back (additive).
    camState.cabBackTarget = Math.min(camCfg.cab.maxBack, Math.max(camCfg.cab.minBack, camState.cabBackTarget + (factor - 1) * camCfg.cab.zoomPerFactor));
    return;
  }
  camState.targetDistance = Math.min(camCfg.dMax, Math.max(camCfg.dMin, camState.targetDistance * factor));
}export function resetCamera(x: number, z: number): void {
  camState.target = { x, z };
  camState.distance = camCfg.startDistance;
  camState.targetDistance = camCfg.startDistance;
  camState.panDx = 0;
  camState.panDz = 0;
  camState.physicsPose = null;
  camState.cabDir = { x: 0, z: -1 };
  camState.cabBack = camCfg.cab.minBack;
  camState.cabBackTarget = camCfg.cab.minBack;
  camState.viewZoom = {};
  camState.cabAnchor.set = false;
}
