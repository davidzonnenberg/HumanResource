// GameLoop: real-time accumulator driving the Simulation (2.1–2.3, 21, 47). Driven by the R3F
// frame callback so rendering and Ticks stay in step. Speed never enters SimState.
import { checkInvariants, humanPosition, type Simulation, type TickOutput } from '@hr/sim';
import { ticksToRun, TICK_MS } from './ticks';
import { effectiveSpeed, type GameSpeed } from './gameSpeed';

export type PauseReason = 'hidden' | 'pauseMenu' | 'speedPause' | 'syncConflict' | 'fatalError' | 'loading';
export type SaveReason = 'interval' | 'hidden' | 'pagehide' | 'pauseMenu' | 'speedPause' | 'exit' | 'update';

export interface Pose {
  x: number;
  z: number;
  heading: number;
}

export interface LoopHooks {
  /** Called right before every Tick: submit per-Tick Commands (ceoMove, manualVehicleUpdate). */
  beforeTick?(sim: Simulation): void;
  /** Called once per frame with the outputs of the Ticks run in that frame. */
  afterTicks?(outputs: TickOutput[]): void;
  /** Asks the persistence layer to write a save (wired in task 16.10). */
  requestSave?(reason: SaveReason): void;
  onFatal?(message: string): void;
}

export class GameLoop {
  readonly sim: Simulation;
  readonly pauseReasons = new Set<PauseReason>();
  selectedSpeed: GameSpeed = 1;
  private acc = 0;
  private last: number | null = null;
  private hooks: LoopHooks;
  private readonly checkEvery: number;
  prevPoses = new Map<string, Pose>();
  currPoses = new Map<string, Pose>();
  /** Fraction of the next Tick already elapsed, for render interpolation. */
  alpha = 0;
  frames = 0;

  constructor(sim: Simulation, hooks: LoopHooks = {}, opts: { dev: boolean } = { dev: false }) {
    this.sim = sim;
    this.hooks = hooks;
    this.checkEvery = opts.dev ? 1 : 100;
    this.capturePoses();
    this.prevPoses = new Map(this.currPoses);
  }

  setHooks(h: LoopHooks): void {
    this.hooks = { ...this.hooks, ...h };
  }

  get paused(): boolean {
    return this.pauseReasons.size > 0;
  }

  get speed(): GameSpeed {
    return effectiveSpeed(this.selectedSpeed, this.sim.state.ceo.drivingVehicleId !== null);
  }

  pause(reason: PauseReason): void {
    if (this.pauseReasons.has(reason)) return;
    this.pauseReasons.add(reason);
    this.last = null; // no real time is simulated while paused (21.3)
    if (reason === 'hidden' || reason === 'pauseMenu' || reason === 'speedPause') this.hooks.requestSave?.(reason);
  }

  resume(reason: PauseReason): void {
    this.pauseReasons.delete(reason);
    this.last = null;
  }

  /** One rendered frame. `now` in ms (performance.now()). */
  frame(now: number): void {
    this.frames += 1;
    if (this.paused) {
      this.last = null;
      return;
    }
    const dt = this.last === null ? 0 : now - this.last;
    this.last = now;
    const sched = ticksToRun(this.acc, dt, this.speed);
    this.acc = sched.acc;
    const outputs: TickOutput[] = [];
    for (let i = 0; i < sched.run; i++) {
      if (this.paused) break; // a pause raised during a Tick stops further Ticks (21.1)
      outputs.push(this.runTick());
    }
    this.alpha = Math.min(1, this.acc / TICK_MS);
    if (outputs.length > 0) this.hooks.afterTicks?.(outputs);
  }

  /** Runs exactly one Tick (also used by tests and the debug "step" button). */
  runTick(): TickOutput {
    this.hooks.beforeTick?.(this.sim);
    const out = this.sim.tick();
    this.prevPoses = this.currPoses;
    this.capturePoses();
    if (this.sim.state.tick % this.checkEvery === 0) {
      const v = checkInvariants(this.sim.state, this.sim.reg);
      if (v.length > 0) {
        const fatal = v.filter((x) => x.code !== 'gold_limit_exceeded');
        if (v.some((x) => x.code === 'gold_limit_exceeded')) console.warn('[sim] Gold limit exceeded', v);
        if (fatal.length > 0) {
          console.error('[sim] invariant violation', fatal);
          this.pause('fatalError');
          this.hooks.onFatal?.(fatal.map((x) => `${x.code} at ${x.path}`).join('; '));
        }
      }
    }
    return out;
  }

  private capturePoses(): void {
    const s = this.sim.state;
    const m = new Map<string, Pose>();
    for (const h of Object.values(s.humans)) {
      const p = humanPosition(s, h);
      m.set(h.id, { x: p.x, z: p.z, heading: 0 });
    }
    for (const v of Object.values(s.vehicles)) m.set(v.id, { x: v.pose.x, z: v.pose.z, heading: v.pose.heading });
    m.set('ceo', { x: s.ceo.x, z: s.ceo.z, heading: s.ceo.heading });
    this.currPoses = m;
  }

  /** Interpolated pose between the last two Ticks. */
  pose(id: string): Pose | undefined {
    const c = this.currPoses.get(id);
    const p = this.prevPoses.get(id) ?? c;
    if (!c || !p) return c;
    const a = this.paused ? 1 : this.alpha;
    return { x: p.x + (c.x - p.x) * a, z: p.z + (c.z - p.z) * a, heading: c.heading };
  }
}
