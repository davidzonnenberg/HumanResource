// Camera_Controller (15): one fixed yaw, continuous zoom through the bands, CEO_Mode <->
// Management_View switch with hysteresis, follow/pan, manual-driving clamp, District bounds.
// Also drives the GameLoop once per rendered frame (priority -1 runs before other useFrames).
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import { clampDistance, unlockedDistricts, pathCacheFor } from '@hr/sim';
import { bridge, publish } from '../store/simBridge';
import { useSession, useUi } from '../store/stores';
import { inputState } from '../input/inputState';
import { cabCameraPose, camState, chaseBlend } from './cameraState';
import { camCfg, screenToWorld, tiltFor, YAW } from './theme';
import { interiorRect } from './interiorView';

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
    camState.targetDistance = clampDistance(camState.targetDistance, camCfg.dMin, maxDistance(size.width / size.height), driving, camCfg.drivingMax);
    const k = 1 - Math.exp(-camCfg.zoomSmoothing * dt);
    camState.distance += (camState.targetDistance - camState.distance) * k;

    // View mode is an explicit toggle now (15.3): follow the CEO/van in CEO_Mode, pan in
    // Management_View. Driving always follows the van regardless of the stored mode (15.7).
    const mode = ui.viewMode;

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
    // Inside a Business the camera stays over that room (14.3)
    const room = interiorRect(loop.sim.reg, s);
    if (room) {
      camState.target.x = Math.min(room.x + room.w / 2, Math.max(room.x - room.w / 2, camState.target.x));
      camState.target.z = Math.min(room.z + room.d / 2, Math.max(room.z - room.d / 2, camState.target.z));
    }

    // Driving camera: the cab camera only exists while driving; leaving the van resets it.
    const session = useSession.getState();
    if (!driving && session.driveCam !== 'overview') session.set({ driveCam: 'overview' });
    const cab = driving && session.driveCam === 'cab' && camState.physicsPose?.fx !== undefined;
    const persp = camera as PerspectiveCamera;
    // Zoom in the cab camera moves the camera behind the van (smoothed).
    camState.cabBack += (camState.cabBackTarget - camState.cabBack) * k;
    const blend = chaseBlend(camState.cabBack, camCfg.cab);
    const wantFov = cab ? camCfg.cab.fovDeg + (camCfg.cab.chaseFovDeg - camCfg.cab.fovDeg) * blend : camCfg.fovDeg;
    if (persp.isPerspectiveCamera && Math.abs(persp.fov - wantFov) > 0.01) {
      persp.fov = wantFov;
      persp.updateProjectionMatrix();
    }
    const d = camState.distance;
    if (cab && camState.physicsPose) {
      // Smooth the facing so drifts and donuts don't whip the view around.
      const pose = camState.physicsPose;
      // The chase view turns and follows more lazily than the roof view, and ignores the van's physics jitter.
      const turn = camCfg.cab.smoothing + (camCfg.cab.chaseTurnSmoothing - camCfg.cab.smoothing) * blend;
      const ks = 1 - Math.exp(-turn * dt);
      camState.cabDir.x += ((pose.fx ?? 0) - camState.cabDir.x) * ks;
      camState.cabDir.z += ((pose.fz ?? -1) - camState.cabDir.z) * ks;
      const anchor = camState.cabAnchor;
      if (!anchor.set) {
        anchor.x = pose.x;
        anchor.z = pose.z;
        anchor.set = true;
      }
      const follow = 1 - Math.exp(-(60 + (camCfg.cab.chaseFollowSmoothing - 60) * blend) * dt);
      anchor.x += (pose.x - anchor.x) * follow;
      anchor.z += (pose.z - anchor.z) * follow;
      const c = cabCameraPose(anchor.x, anchor.z, camState.cabDir.x, camState.cabDir.z, camCfg.cab, camState.cabBack);
      camera.position.set(c.eye.x, c.eye.y, c.eye.z);
      camera.lookAt(c.look.x, c.look.y, c.look.z);
    } else {
      // Place the camera: fixed yaw, tilt grows with the log of the distance (no rotation input exists, 15.12)
      const tilt = tiltFor(d);
      const horiz = d * Math.cos(tilt);
      camera.position.set(camState.target.x + Math.sin(YAW) * horiz, d * Math.sin(tilt), camState.target.z + Math.cos(YAW) * horiz);
      camera.lookAt(camState.target.x, 0, camState.target.z);
    }

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
