// Records every Command submitted to the running Simulation (Requirement 53.1, 53.2). The recorder
// wraps `sim.submit` on the instance, so every caller (HUD, panels, physics, input) is covered, and
// compresses runs of identical per-Tick Commands as they arrive. Two views of the log exist:
//  - a rolling tail (`config.commandLogTailLimit` entries) that goes into the Save_Document, and
//  - the whole session since the start snapshot, for the bug-report export (task 38.8).
import { cloneState, CommandRecorder, type Command, type Issuer, type LogEntry, type SimState, type Simulation } from '@hr/sim';

/** Entries kept for the bug report; a longer session drops its oldest entries and says so. */
export const FULL_LOG_LIMIT = 100_000;

export class SessionRecorder {
  /** The state the recording started from (a copy; the log replays from here). */
  readonly start: SimState;
  readonly full = new CommandRecorder(FULL_LOG_LIMIT);
  private readonly tailRecorder: CommandRecorder;
  private original: Simulation['submit'] | null = null;

  constructor(
    readonly sim: Simulation,
    private readonly tailLimit: number,
  ) {
    this.start = cloneState(sim.state);
    this.tailRecorder = new CommandRecorder(tailLimit);
  }

  attach(): void {
    if (this.original) return;
    const submit = this.sim.submit.bind(this.sim);
    this.original = this.sim.submit;
    this.sim.submit = (cmd: Command, issuer: Issuer = 'player'): number => {
      this.full.record(this.sim.state.tick, cmd, issuer);
      this.tailRecorder.record(this.sim.state.tick, cmd, issuer);
      return submit(cmd, issuer);
    };
  }

  detach(): void {
    if (!this.original) return;
    this.sim.submit = this.original;
    this.original = null;
  }

  /** The rolling tail for a Save_Document, oldest first. */
  tail(): LogEntry[] {
    return this.tailRecorder.snapshot();
  }
}