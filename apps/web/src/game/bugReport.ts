// Bug-report export (task 38.8): the start snapshot, the full Command_Log of the session and the
// latest State_Hash as one JSON file. Replaying `entries` over `start` with `runLog` reproduces
// `stateHash` at `tick` (unless `truncated`, when the oldest entries were dropped).
import { stateHash, type LogEntry, type SimState } from '@hr/sim';
import { CURRENT_SCHEMA_VERSION } from '@hr/shared';
import type { SessionRecorder } from '../loop/commandRecorder';

export interface BugReport {
  kind: 'hr-bug-report';
  version: 1;
  createdAt: string;
  schemaVersion: number;
  /** State the log replays from. */
  start: SimState;
  entries: LogEntry[];
  /** True when the session was so long that the oldest Commands were dropped from `entries`. */
  truncated: boolean;
  /** Tick and State_Hash of the live state when the report was made. */
  tick: number;
  stateHash: string;
}

export function buildBugReport(recorder: SessionRecorder, now = new Date()): BugReport {
  const state = recorder.sim.state;
  return {
    kind: 'hr-bug-report',
    version: 1,
    createdAt: now.toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    start: recorder.start,
    entries: recorder.full.snapshot(),
    truncated: recorder.full.dropped > 0,
    tick: state.tick,
    stateHash: stateHash(state),
  };
}

/** Starts a browser download of the report. */
export function downloadBugReport(report: BugReport): void {
  const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hr-bug-report-tick${report.tick}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}