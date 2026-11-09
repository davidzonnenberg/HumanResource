// Camera_Controller (15): one fixed yaw, continuous zoom through the bands, CEO_Mode <->
// Management_View switch with hysteresis, follow/pan, manual-driving clamp, District bounds.
// Also drives the GameLoop once per rendered frame (priority -1 runs before other useFrames).
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { clampDistance, nextViewMode, unlockedDistricts, pathCacheFor } from '@hr/sim';
import { bridge, publish } from '../store/simBridge';
import { useUi } from '../store/stores';
import { inputState } from '../input/inputState';
import { camState } from './cameraState';
import { businessBandMax, camCfg, screenToWorld, tiltFor, YAW } from './theme';

export function CameraController() {
  const { camera, size } = useThree();
  const lastUi = useRef(0);

  useFrame((_, rawDt) => {
    const loop = bridge.loop;
    if (!loop) return;
    loop.frame(performance.now());
    if (loop.frames % 6 === 0) publish(false);
    const dt = Math.min(0.1, rawDt);
    const s = loop.sim.state;
    const ui = useUi.getState();
    const driving = s.ceo.drivingVehicleId !== null;

    // Zoom (continuous, smoothed) with the driving clamp (15.2, 15.7)
    camState.targetDistance = clampDistance(camState.targetDistance, camCfg.dMin, maxDistance(size.width / size.height), driving, businessBandMax);
    const k = 1 - Math.exp(-camCfg.zoomSmoothing * dt);
    camState.distance += (camState.targetDistance - camState.distance) * k;

    // Mode switch with hysteresis (15.3, 15.4)
    const mode = nextViewMode(ui.viewMode, camState.distance, camCfg);
    if (mode !== ui.viewMode) {
      ui.set({ viewMode: mode });
      if (mode === 'management') loop.sim.submit({ type: 'uiEvent', event: 'managementViewOpened' }, 'ui');
    }

    // Target: follow the CEO / van in CEO_Mode, pan in Management_View (15.5, 15.9)
    if (mode === 'ceo' || driving) {
      const p = camState.physicsPose ?? loop.pose('ceo');
      if (p) {
        const f = 1 - Math.exp(-camCfg.followSmoothing * dt * (driving ? 2 : 1));
        camState.target.x += (p.x - camState.target.x) * f;
        camState.target.z += (p.z - camState.target.z) * f;
      }
    } else {
      const speed = camState.distance * camCfg.panSpeed * dt;
      const w = screenToWorld(inputState.stickX, inputState.stickY);
      camState.target.x += w.x * speed + camState.panDx;
      camState.target.z += w.z * speed + camState.panDz;
    }
    camState.panDx = 0;
    camState.panDz = 0;
    const b = pathCacheFor(loop.sim.reg, unlockedDistricts(s.districts)).bounds();
    camState.target.x = Math.min(b.maxX, Math.max(b.minX, camState.target.x));
    camState.target.z = Math.min(b.maxZ, Math.max(b.minZ, camState.target.z));

    // Place the camera: fixed yaw, tilt grows with distance (no rotation input exists, 15.12)
    const tilt = tiltFor(camState.distance);
    const d = camState.distance;
    const horiz = d * Math.cos(tilt);
    camera.position.set(camState.target.x + Math.sin(YAW) * horiz, d * Math.sin(tilt), camState.target.z + Math.cos(YAW) * horiz);
    camera.lookAt(camState.target.x, 0, camState.target.z);

    const now = performance.now();
    if (Math.abs(ui.cameraDistance - d) > 0.5 && now - lastUi.current > 150) {
      lastUi.current = now;
      ui.set({ cameraDistance: d });
    }
  }, -1);

  return null;
}

/** City band max distance fitted to the unlocked Districts (48.10), capped by dMax. */
function maxDistance(aspect: number): number {
  const loop = bridge.loop;
  if (!loop) return camCfg.dMax;
  const b = pathCacheFor(loop.sim.reg, unlockedDistricts(loop.sim.state.districts)).bounds();
  const span = Math.max(b.maxX - b.minX, (b.maxZ - b.minZ) * aspect);
  const fov = (camCfg.fovDeg * Math.PI) / 180;
  const fit = (span / 2 / Math.tan(fov / 2)) * 0.75;
  return Math.min(camCfg.dMax, Math.max(camCfg.modeSwitchThreshold * 1.5, fit));
}
