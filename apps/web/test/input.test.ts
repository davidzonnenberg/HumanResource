// Input mapping (task 12.3, Requirements 14.1, 15.12, 18.4, 18.6): keyboard bindings, joystick
// normalisation and Tab selection order. Context actions and speed changes are mocked so only the
// mapping is under test.
import type { ContextAction } from '@hr/sim';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as actions from '../src/input/actions';
import { inputState } from '../src/input/inputState';
import { installKeyboard } from '../src/input/keyboard';
import { joystick, stickVector } from '../src/input/joystickState';
import type { GameLoop } from '../src/loop/GameLoop';
import { camState } from '../src/render/cameraState';
import { SCREEN_UP } from '../src/render/theme';
import { bridge } from '../src/store/simBridge';
import { useHud, useUi } from '../src/store/stores';

vi.mock('../src/input/actions', () => ({
  runContextAction: vi.fn(),
  setPauseMenu: vi.fn(),
  setSpeed: vi.fn(),
  stepGameSpeed: vi.fn(),
  toggleSpeedPause: vi.fn(),
  toggleViewMode: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
}));

function keydown(key: string, init: KeyboardEventInit = {}, target: EventTarget = window): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

function keyup(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}

let uninstall: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  inputState.keys.clear();
  inputState.stickX = 0;
  inputState.stickY = 0;
  inputState.mx = 0;
  inputState.mz = 0;
  joystick.active = false;
  joystick.x = 0;
  joystick.y = 0;
  useUi.getState().set({ pauseMenuOpen: false, selection: null, pickingSlot: null });
  useHud.getState().set({ contextAction: null });
  bridge.loop = null;
  camState.target = { x: 0, z: 0 };
  uninstall = installKeyboard();
});

afterEach(() => {
  uninstall();
});

describe('keyboard bindings (18.6)', () => {
  it('number keys 1, 2 and 3 select 1x, 2x and 4x', () => {
    keydown('1');
    expect(actions.setSpeed).toHaveBeenLastCalledWith(1);
    keydown('2');
    expect(actions.setSpeed).toHaveBeenLastCalledWith(2);
    keydown('3');
    expect(actions.setSpeed).toHaveBeenLastCalledWith(4);
  });

  it('square brackets step the speed and 0 toggles the speed pause', () => {
    keydown(']');
    expect(actions.stepGameSpeed).toHaveBeenLastCalledWith(1);
    keydown('[');
    expect(actions.stepGameSpeed).toHaveBeenLastCalledWith(-1);
    keydown('0');
    expect(actions.toggleSpeedPause).toHaveBeenCalledTimes(1);
  });

  it('plus and equals zoom in, minus and underscore zoom out', () => {
    keydown('+');
    keydown('=');
    expect(actions.zoomIn).toHaveBeenCalledTimes(2);
    keydown('-');
    keydown('_');
    expect(actions.zoomOut).toHaveBeenCalledTimes(2);
  });

  it('E runs the Context_Action currently offered by the HUD', () => {
    const offered = { kind: 'inspect', targetKind: 'business', targetId: 'biz_near' } as unknown as ContextAction;
    useHud.getState().set({ contextAction: offered });
    keydown('e');
    expect(actions.runContextAction).toHaveBeenCalledWith(offered);
  });

  it('V toggles the view mode', () => {
    keydown('v');
    expect(actions.toggleViewMode).toHaveBeenCalledTimes(1);
  });

  it('P opens the Pause_Menu when closed and closes it when open', () => {
    keydown('p');
    expect(actions.setPauseMenu).toHaveBeenLastCalledWith(true);
    useUi.getState().set({ pauseMenuOpen: true });
    keydown('p');
    expect(actions.setPauseMenu).toHaveBeenLastCalledWith(false);
  });

  it('Escape closes the Pause_Menu first, and otherwise clears the selection', () => {
    useUi.getState().set({ pauseMenuOpen: true, selection: { kind: 'business', id: 'biz_near' } });
    keydown('Escape');
    expect(actions.setPauseMenu).toHaveBeenLastCalledWith(false);
    expect(useUi.getState().selection).toEqual({ kind: 'business', id: 'biz_near' });

    useUi.getState().set({ pauseMenuOpen: false });
    keydown('Escape');
    expect(useUi.getState().selection).toBeNull();
    expect(actions.setPauseMenu).toHaveBeenCalledTimes(1);
  });

  it('Tab is captured so the browser does not move focus', () => {
    expect(keydown('Tab').defaultPrevented).toBe(true);
  });

  it('auto-repeat does not fire one-shot actions again', () => {
    keydown('e', { repeat: true });
    keydown('1', { repeat: true });
    expect(actions.runContextAction).not.toHaveBeenCalled();
    expect(actions.setSpeed).not.toHaveBeenCalled();
  });

  it('there are no rotation keys: Q and R do nothing to the fixed camera', () => {
    keydown('q');
    keydown('r');
    keydown('Q');
    expect(inputState.keys.size).toBe(0);
    for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled();
  });

  it('keys typed into a text field do not trigger bindings', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    keydown('1', {}, input);
    keydown('w', {}, input);
    expect(actions.setSpeed).not.toHaveBeenCalled();
    expect(inputState.keys.size).toBe(0);
    input.remove();
  });
});

describe('movement keys (14.1, 15.12)', () => {
  it('W and the up arrow both drive the stick up the screen', () => {
    keydown('w');
    expect(inputState.stickX).toBe(0);
    expect(inputState.stickY).toBe(1);
    keyup('w');
    keydown('ArrowUp');
    expect(inputState.stickY).toBe(1);
  });

  it('the arrow keys map to the screen axes', () => {
    keydown('ArrowRight');
    expect(inputState.stickX).toBe(1);
    expect(inputState.stickY).toBe(0);
    keyup('ArrowRight');
    keydown('a');
    expect(inputState.stickX).toBe(-1);
  });

  it('diagonal input is normalised to unit length', () => {
    keydown('w');
    keydown('d');
    expect(Math.hypot(inputState.stickX, inputState.stickY)).toBeCloseTo(1, 10);
    expect(inputState.stickX).toBeCloseTo(Math.SQRT1_2, 10);
    expect(inputState.stickY).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it('opposite keys cancel out', () => {
    keydown('a');
    keydown('d');
    expect(inputState.stickX).toBe(0);
  });

  it('releasing a key stops that direction', () => {
    keydown('s');
    keyup('s');
    expect(inputState.stickY).toBe(0);
  });

  it('losing window focus clears every held key', () => {
    keydown('w');
    window.dispatchEvent(new Event('blur'));
    expect(inputState.keys.size).toBe(0);
    expect(inputState.stickY).toBe(0);
  });

  it('the world direction follows the fixed screen-aligned axes', () => {
    keydown('w');
    expect(inputState.mx).toBeCloseTo(SCREEN_UP.x, 10);
    expect(inputState.mz).toBeCloseTo(SCREEN_UP.z, 10);
  });

  it('an active joystick overrides held keys', () => {
    joystick.active = true;
    joystick.x = 0.5;
    joystick.y = -0.25;
    keydown('w');
    expect(inputState.stickX).toBe(0.5);
    expect(inputState.stickY).toBe(-0.25);
  });
});

describe('joystick normalisation (14.1, 18.4)', () => {
  it('a zero offset gives a zero vector', () => {
    expect(stickVector(0, 0, 60)).toEqual({ x: 0, y: 0 });
  });

  it('offsets inside the radius scale linearly', () => {
    const v = stickVector(30, 0, 60);
    expect(v.x).toBeCloseTo(0.5, 10);
    expect(v.y).toBeCloseTo(0, 10);
  });

  it('screen y points down, so dragging up gives a positive y', () => {
    expect(stickVector(0, -30, 60).y).toBeCloseTo(0.5, 10);
  });

  it('offsets beyond the radius clamp to unit length in the same direction', () => {
    const v = stickVector(300, 400, 60);
    expect(v.x).toBeCloseTo(0.6, 10);
    expect(v.y).toBeCloseTo(-0.8, 10);
  });

  it('property: magnitude is min(1, distance / radius) and the direction follows the drag', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        (dx, dy, radius) => {
          const len = Math.hypot(dx, dy);
          const v = stickVector(dx, dy, radius);
          expect(Math.hypot(v.x, v.y)).toBeCloseTo(Math.min(1, len / radius), 9);
          expect(v.x * dx).toBeGreaterThanOrEqual(0);
          expect(v.y * dy).toBeLessThanOrEqual(0);
        },
      ),
    );
  });
});

describe('Tab selection order (12.1)', () => {
  // Plots are at x = 1 (near), 9 (far); the van sits at x = 5 between them.
  function fakeLoop(): GameLoop {
    const loop = {
      sim: {
        state: {
          businesses: {
            biz_far: { id: 'biz_far', plotId: 'plot_far' },
            biz_near: { id: 'biz_near', plotId: 'plot_near' },
          },
          vehicles: { veh_mid: { id: 'veh_mid', pose: { x: 5, z: 0 } } },
        },
        reg: {
          world: {
            plots: {
              plot_near: { def: { x: 1, z: 0 } },
              plot_far: { def: { x: 9, z: 0 } },
            },
          },
        },
      },
    };
    return loop as unknown as GameLoop;
  }

  it('cycles through Businesses and Vehicles from nearest to farthest and wraps around', () => {
    bridge.loop = fakeLoop();
    keydown('Tab');
    expect(useUi.getState().selection).toEqual({ kind: 'business', id: 'biz_near' });
    keydown('Tab');
    expect(useUi.getState().selection).toEqual({ kind: 'vehicle', id: 'veh_mid' });
    keydown('Tab');
    expect(useUi.getState().selection).toEqual({ kind: 'business', id: 'biz_far' });
    keydown('Tab');
    expect(useUi.getState().selection).toEqual({ kind: 'business', id: 'biz_near' });
  });

  it('distance is measured from the camera target', () => {
    bridge.loop = fakeLoop();
    camState.target = { x: 9, z: 0 };
    keydown('Tab');
    expect(useUi.getState().selection).toEqual({ kind: 'business', id: 'biz_far' });
  });

  it('does nothing when no Simulation is running', () => {
    keydown('Tab');
    expect(useUi.getState().selection).toBeNull();
  });
});
