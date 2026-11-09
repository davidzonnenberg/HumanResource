// Turns intents into Commands/UI changes. Shared by the Context_Action button, keys and panels.
import type { ContextAction } from '@hr/sim';
import { bridge } from '../store/simBridge';
import { useSession, useUi } from '../store/stores';
import { availableSpeeds, stepSpeed, type GameSpeed } from '../loop/gameSpeed';
import { camState, zoomBy } from '../render/cameraState';
import { camCfg } from '../render/theme';
import { isDevMode } from '../dev/devMode';

export function runContextAction(ca: ContextAction | null): void {
  const sim = bridge.loop?.sim;
  if (!sim || !ca) return;
  switch (ca.kind) {
    case 'enter':
      sim.submit({ type: 'ceoEnter', businessId: ca.targetId });
      camState.targetDistance = Math.min(camState.targetDistance, 12);
      break;
    case 'exitBuilding':
      sim.submit({ type: 'ceoExit' });
      break;
    case 'inspect':
      useUi.getState().set({ selection: { kind: ca.targetKind, id: ca.targetId } });
      break;
    case 'drive':
      sim.submit({ type: 'startManualDriving', vehicleId: ca.targetId });
      camState.targetDistance = Math.min(camState.targetDistance, 22);
      break;
    case 'load':
      if (sim.state.ceo.drivingVehicleId) sim.submit({ type: 'manualLoad', vehicleId: sim.state.ceo.drivingVehicleId, businessId: ca.targetId });
      break;
    case 'unload':
      if (sim.state.ceo.drivingVehicleId) sim.submit({ type: 'manualUnload', vehicleId: sim.state.ceo.drivingVehicleId, businessId: ca.targetId });
      break;
    case 'exitVehicle': {
      const vid = sim.state.ceo.drivingVehicleId;
      if (!vid) break;
      sim.submit({ type: 'endManualDriving', vehicleId: vid });
      const v = sim.state.vehicles[vid];
      if (v?.routeId && v.routeSuspended) useUi.getState().set({ dialog: { kind: 'resumeRoute', vehicleId: vid } }); // 13.11
      break;
    }
  }
}

export function zoomIn(): void {
  zoomBy(1 / camCfg.keyZoomFactor);
}
export function zoomOut(): void {
  zoomBy(camCfg.keyZoomFactor);
}

/** Comfortable CEO distance to ease to when switching back from Management_View (not max zoom). */
const CEO_VIEW_DISTANCE = camCfg.startDistance;
/** Overview distance to ease to when switching to Management_View. */
const MANAGEMENT_VIEW_DISTANCE = Math.min(camCfg.dMax, camCfg.modeSwitchThreshold * 3);

/**
 * Explicit Management_View <-> CEO_Mode toggle (15.3). The mode is authoritative; the camera
 * smoothly zooms/pans to a comfortable distance for the new mode. Zooming inside a mode never
 * flips it, so Management_View can zoom all the way in to inspect something.
 */
export function toggleViewMode(): void {
  const ui = useUi.getState();
  if (bridge.loop?.sim.state.ceo.drivingVehicleId) return; // driving stays in CEO follow (15.7)
  const next = ui.viewMode === 'ceo' ? 'management' : 'ceo';
  ui.set({ viewMode: next });
  if (next === 'management') {
    camState.targetDistance = MANAGEMENT_VIEW_DISTANCE;
    bridge.loop?.sim.submit({ type: 'uiEvent', event: 'managementViewOpened' }, 'ui');
  } else {
    camState.targetDistance = CEO_VIEW_DISTANCE;
  }
}

export function devModeOn(): boolean {
  return isDevMode(window.location.search, import.meta.env.DEV, useSession.getState().devTesting);
}

export function speedsAvailable(): readonly GameSpeed[] {
  const loop = bridge.loop;
  const revealed = loop ? loop.sim.state.reveals.fired.some((id) => loop.sim.reg.revealTriggers[id]?.reveals.includes('gameSpeed')) : false;
  return availableSpeeds(revealed, devModeOn());
}

export function setSpeed(speed: GameSpeed): void {
  if (!speedsAvailable().includes(speed)) return; // ignored while locked (47.8)
  useSession.getState().set({ gameSpeed: speed, speedPaused: false });
  const loop = bridge.loop;
  if (loop) {
    loop.selectedSpeed = speed;
    loop.resume('speedPause');
  }
}

export function stepGameSpeed(dir: 1 | -1): void {
  const av = speedsAvailable();
  if (av.length <= 1) return;
  setSpeed(stepSpeed(useSession.getState().gameSpeed, dir, av));
}

export function toggleSpeedPause(): void {
  if (speedsAvailable().length <= 1) return;
  const loop = bridge.loop;
  const paused = !useSession.getState().speedPaused;
  useSession.getState().set({ speedPaused: paused });
  if (!loop) return;
  if (paused) loop.pause('speedPause');
  else loop.resume('speedPause');
}

export function setPauseMenu(open: boolean): void {
  useUi.getState().set({ pauseMenuOpen: open });
  const loop = bridge.loop;
  if (!loop) return;
  if (open) loop.pause('pauseMenu');
  else loop.resume('pauseMenu');
}
