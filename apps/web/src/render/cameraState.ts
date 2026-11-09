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
  physicsPose: null as null | { x: number; z: number },
};

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
}
