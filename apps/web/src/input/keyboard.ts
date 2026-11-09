// PC keyboard bindings (18.6): WASD/arrows move or pan, E context action, +/- zoom, Tab cycle,
// Esc close, P pause, 1/2/3 speed, [ ] slower/faster, 0 speed pause. No rotation keys (15.12).
import { useHud, useUi } from '../store/stores';
import { inputState } from './inputState';
import { joystick } from './joystickState';
import { runContextAction, setPauseMenu, setSpeed, stepGameSpeed, toggleSpeedPause, zoomIn, zoomOut } from './actions';
import { screenToWorld } from '../render/theme';
import { bridge } from '../store/simBridge';
import { camState } from '../render/cameraState';

const MOVE = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export function recomputeMove(): void {
  let sx: number;
  let sy: number;
  if (joystick.active) {
    sx = joystick.x;
    sy = joystick.y;
  } else {
    const k = inputState.keys;
    sx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    sy = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const len = Math.hypot(sx, sy);
    if (len > 1) {
      sx /= len;
      sy /= len;
    }
  }
  inputState.stickX = sx;
  inputState.stickY = sy;
  const w = screenToWorld(sx, sy);
  inputState.mx = w.x;
  inputState.mz = w.z;
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function cycleSelection(): void {
  const loop = bridge.loop;
  if (!loop) return;
  const s = loop.sim.state;
  const reg = loop.sim.reg;
  const items = [
    ...Object.values(s.businesses).map((b) => ({ kind: 'business' as const, id: b.id, x: reg.world.plots[b.plotId]?.def.x ?? 0, z: reg.world.plots[b.plotId]?.def.z ?? 0 })),
    ...Object.values(s.vehicles).map((v) => ({ kind: 'vehicle' as const, id: v.id, x: v.pose.x, z: v.pose.z })),
  ].sort((a, b) => Math.hypot(a.x - camState.target.x, a.z - camState.target.z) - Math.hypot(b.x - camState.target.x, b.z - camState.target.z));
  const cur = useUi.getState().selection;
  const i = cur ? items.findIndex((x) => x.id === cur.id) : -1;
  const next = items[(i + 1) % items.length];
  if (next) useUi.getState().set({ selection: { kind: next.kind, id: next.id } });
}

export function installKeyboard(): () => void {
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    const key = e.key.toLowerCase();
    if (MOVE.has(key)) {
      inputState.keys.add(key);
      recomputeMove();
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    switch (key) {
      case 'e':
        runContextAction(useHud.getState().contextAction);
        break;
      case '+':
      case '=':
        zoomIn();
        break;
      case '-':
      case '_':
        zoomOut();
        break;
      case 'tab':
        e.preventDefault();
        cycleSelection();
        break;
      case 'escape':
        if (useUi.getState().pauseMenuOpen) setPauseMenu(false);
        else useUi.getState().set({ selection: null, pickingSlot: null });
        break;
      case 'p':
        setPauseMenu(!useUi.getState().pauseMenuOpen);
        break;
      case '1':
        setSpeed(1);
        break;
      case '2':
        setSpeed(2);
        break;
      case '3':
        setSpeed(4);
        break;
      case ']':
        stepGameSpeed(1);
        break;
      case '[':
        stepGameSpeed(-1);
        break;
      case '0':
        toggleSpeedPause();
        break;
    }
  };
  const up = (e: KeyboardEvent) => {
    inputState.keys.delete(e.key.toLowerCase());
    recomputeMove();
  };
  const blur = () => {
    inputState.keys.clear();
    recomputeMove();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}
