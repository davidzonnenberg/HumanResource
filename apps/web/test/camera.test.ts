// Camera angles and the driving cab camera.
import { describe, expect, it } from 'vitest';
import { cameraConfig } from '@hr/content';
import { clampDistance } from '@hr/sim';
import { cabCameraPose, chaseBlend, zoomBy, camState } from '../src/render/cameraState';
import { useSession } from '../src/store/stores';
import { camCfg, tiltFor } from '../src/render/theme';

const deg = (r: number) => (r * 180) / Math.PI;

describe('tilt follows the logarithm of the distance', () => {
  it('is flat when zoomed in, steep when zoomed out, and never goes backwards', () => {
    expect(deg(tiltFor(camCfg.dMin))).toBeCloseTo(camCfg.tiltNearDeg, 5);
    expect(deg(tiltFor(camCfg.dMax))).toBeCloseTo(camCfg.tiltFarDeg, 5);
    let prev = 0;
    for (let d = camCfg.dMin; d <= camCfg.dMax; d *= 1.2) {
      const t = tiltFor(d);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
  it('the geometric middle distance gives the middle angle (log, not linear)', () => {
    const mid = Math.sqrt(camCfg.dMin * camCfg.dMax);
    expect(deg(tiltFor(mid))).toBeCloseTo((camCfg.tiltNearDeg + camCfg.tiltFarDeg) / 2, 5);
  });
  it('clamps outside the range', () => {
    expect(tiltFor(1)).toBeCloseTo(tiltFor(camCfg.dMin), 9);
    expect(tiltFor(10_000)).toBeCloseTo(tiltFor(camCfg.dMax), 9);
  });
});

describe('driving zoom', () => {
  it('allows far more zoom while driving than the old business band, but not the whole city', () => {
    expect(camCfg.drivingMax).toBeGreaterThan(60);
    expect(clampDistance(500, camCfg.dMin, camCfg.dMax, true, camCfg.drivingMax)).toBe(camCfg.drivingMax);
    expect(clampDistance(500, camCfg.dMin, camCfg.dMax, false, camCfg.drivingMax)).toBe(camCfg.dMax);
  });
});

describe('cab camera', () => {
  const cab = cameraConfig.cab;
  it('sits above the van and looks down the road ahead (-z facing)', () => {
    const p = cabCameraPose(10, 20, 0, -1, cab);
    expect(p.eye.x).toBeCloseTo(10);
    expect(p.eye.z).toBeCloseTo(20 - cab.eyeForward);
    expect(p.eye.y).toBeCloseTo(cab.eyeHeight);
    expect(p.look.z).toBeCloseTo(20 - cab.lookAhead);
    expect(p.look.y).toBeLessThan(p.eye.y);
  });
  it('pulling back moves the camera behind and higher and turns it towards the van', () => {
    const roof = cabCameraPose(0, 0, 0, -1, cab, 0);
    const chase = cabCameraPose(0, 0, 0, -1, cab, 10);
    expect(chase.eye.z).toBeGreaterThan(roof.eye.z); // behind (+z when facing -z)
    expect(chase.eye.y).toBeGreaterThan(roof.eye.y);
    expect(Math.abs(chase.look.z)).toBeLessThan(Math.abs(roof.look.z)); // looks at the van, not far ahead
    expect(chaseBlend(0, cab)).toBe(0);
    expect(chaseBlend(cab.chaseFullAt * 3, cab)).toBe(1);
  });
  it('zoom moves the camera back and forth while the cab camera is on, not the overview distance', () => {
    useSession.getState().set({ driveCam: 'cab' });
    camState.cabBackTarget = cab.minBack;
    const overview = camState.targetDistance;
    zoomBy(1.3);
    expect(camState.cabBackTarget).toBeGreaterThan(cab.minBack);
    zoomBy(1 / 1.3);
    zoomBy(1 / 1.3);
    expect(camState.cabBackTarget).toBe(cab.minBack); // closest: the roof stays in view
    for (let i = 0; i < 50; i++) zoomBy(1.5);
    expect(camState.cabBackTarget).toBe(cab.maxBack);
    expect(camState.targetDistance).toBe(overview);
    useSession.getState().set({ driveCam: 'overview' });
  });
  it('normalises the facing and survives a zero vector', () => {
    const p = cabCameraPose(0, 0, 3, 4, cab);
    expect(Math.hypot(p.look.x, p.look.z)).toBeCloseTo(cab.lookAhead);
    expect(Number.isFinite(cabCameraPose(0, 0, 0, 0, cab).eye.x)).toBe(true);
  });
});

describe('zoom is remembered per view', () => {
  it('the cab camera has its own zoom, separate from the overview', () => {
    useSession.getState().set({ driveCam: 'overview' });
    camState.targetDistance = 40;
    camState.cabBackTarget = camCfg.cab.minBack;
    useSession.getState().set({ driveCam: 'cab' });
    zoomBy(1.5);
    expect(camState.targetDistance).toBe(40);
    useSession.getState().set({ driveCam: 'overview' });
    zoomBy(1 / 1.5);
    expect(camState.targetDistance).toBeLessThan(40);
    expect(camState.cabBackTarget).toBeGreaterThan(camCfg.cab.minBack);
  });
  it('the closest cab zoom is about one scroll notch behind the roof', () => {
    expect(camCfg.cab.minBack).toBeGreaterThan(0);
    expect(camCfg.cab.minBack).toBeLessThanOrEqual(camCfg.cab.chaseFullAt / 2);
  });
});