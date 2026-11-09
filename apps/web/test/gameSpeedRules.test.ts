// Game_Speed rules (task 13.9, Requirement 47): locking, Dev_Mode, speed keys and the speed pause.
import { rawContent } from '@hr/content';
import { loadRegistry, newGame, Simulation, type DefinitionRegistry } from '@hr/sim';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { devModeFromEnvironment, isDevMode } from '../src/dev/devMode';
import { setSpeed, stepGameSpeed, toggleSpeedPause } from '../src/input/actions';
import { availableSpeeds, effectiveSpeed, stepSpeed } from '../src/loop/gameSpeed';
import { GameLoop, type SaveReason } from '../src/loop/GameLoop';
import { bridge } from '../src/store/simBridge';
import { useSession } from '../src/store/stores';

// Dev_Mode is on by default under Vitest (import.meta.env.DEV), so it is pinned off here and
// individual tests turn it on explicitly.
vi.mock('../src/dev/devMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/dev/devMode')>()),
  isDevMode: vi.fn(() => false),
}));

const registry: DefinitionRegistry = (() => {
  const res = loadRegistry(rawContent);
  if (!res.ok) throw new Error('Base content invalid');
  return res.value;
})();

let sim: Simulation;
let loop: GameLoop;
let requestSave: Mock<(reason: SaveReason) => void>;

beforeEach(() => {
  vi.mocked(isDevMode).mockReturnValue(false);
  useSession.getState().set({ gameSpeed: 1, speedPaused: false });
  sim = new Simulation(registry, newGame(registry, 1));
  requestSave = vi.fn<(reason: SaveReason) => void>();
  loop = new GameLoop(sim, { requestSave });
  bridge.loop = loop;
});

afterEach(() => {
  bridge.loop = null;
});

/** Unlocks Game_Speed the way play does: the game_speed Reveal_Trigger fires. */
function unlockGameSpeed(): void {
  sim.state.reveals.fired.push('game_speed');
}

describe('Game_Speed pure rules', () => {
  it('only 1x is available until the reveal fires or Dev_Mode is on', () => {
    expect(availableSpeeds(false, false)).toEqual([1]);
    expect(availableSpeeds(true, false)).toEqual([1, 2, 4]);
    expect(availableSpeeds(false, true)).toEqual([1, 2, 4]);
  });

  it('stepping moves one available speed at a time and clamps at both ends', () => {
    expect(stepSpeed(1, 1, [1, 2, 4])).toBe(2);
    expect(stepSpeed(2, 1, [1, 2, 4])).toBe(4);
    expect(stepSpeed(4, 1, [1, 2, 4])).toBe(4);
    expect(stepSpeed(4, -1, [1, 2, 4])).toBe(2);
    expect(stepSpeed(1, -1, [1, 2, 4])).toBe(1);
    expect(stepSpeed(1, 1, [1])).toBe(1);
  });

  it('manual driving always runs at 1x', () => {
    expect(effectiveSpeed(4, true)).toBe(1);
    expect(effectiveSpeed(4, false)).toBe(4);
  });

  it('Dev_Mode comes from ?dev=1, a dev build or the Testing toggle', async () => {
    // isDevMode is mocked for this file, so the real implementation is loaded for the pure checks.
    const actual = await vi.importActual<typeof import('../src/dev/devMode')>('../src/dev/devMode');
    expect(devModeFromEnvironment('?dev=1', false)).toBe(true);
    expect(devModeFromEnvironment('?dev=0', false)).toBe(false);
    expect(devModeFromEnvironment('', true)).toBe(true);
    expect(actual.isDevMode('', false, true)).toBe(true);
    expect(actual.isDevMode('', false, false)).toBe(false);
  });
});

describe('Game_Speed controls with a real Simulation', () => {
  it('speed keys are ignored while Game_Speed is locked', () => {
    setSpeed(4);
    stepGameSpeed(1);
    expect(useSession.getState().gameSpeed).toBe(1);
    expect(loop.selectedSpeed).toBe(1);
  });

  it('the speed pause is ignored while Game_Speed is locked', () => {
    toggleSpeedPause();
    expect(useSession.getState().speedPaused).toBe(false);
    expect(loop.paused).toBe(false);
  });

  it('after the reveal, speeds step 1x to 2x to 4x and stop at 4x', () => {
    unlockGameSpeed();
    setSpeed(2);
    expect(useSession.getState().gameSpeed).toBe(2);
    expect(loop.selectedSpeed).toBe(2);
    stepGameSpeed(1);
    expect(useSession.getState().gameSpeed).toBe(4);
    stepGameSpeed(1);
    expect(useSession.getState().gameSpeed).toBe(4);
  });

  it('Dev_Mode unlocks speeds without changing the Simulation state', () => {
    vi.mocked(isDevMode).mockReturnValue(true);
    const before = structuredClone(sim.state);
    setSpeed(4);
    expect(useSession.getState().gameSpeed).toBe(4);
    expect(sim.state).toEqual(before);
  });

  it('the speed pause stops Ticks, requests a save and resumes cleanly', () => {
    unlockGameSpeed();
    loop.frame(0);
    loop.frame(1000);
    const running = sim.state.tick;
    expect(running).toBeGreaterThan(0);

    toggleSpeedPause();
    expect(useSession.getState().speedPaused).toBe(true);
    expect(loop.paused).toBe(true);
    expect(requestSave).toHaveBeenCalledWith('speedPause');

    loop.frame(2000);
    loop.frame(3000);
    expect(sim.state.tick).toBe(running);

    toggleSpeedPause();
    expect(useSession.getState().speedPaused).toBe(false);
    expect(loop.paused).toBe(false);
  });
});
