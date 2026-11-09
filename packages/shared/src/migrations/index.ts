// Migration_Pipeline (24.5–24.8). Each step is a pure function over plain JSON. Older shapes are
// typed locally inside each migration file; migrations never import current game types.
import { CURRENT_SCHEMA_VERSION } from '../saveDocument';

export interface Migration {
  from: number;
  to: number;
  name: string;
  up(doc: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Ordered steps. Phase 2 adds e.g. `{ from: 1, to: 2, name: 'v1_to_v2_phase2_sections', up }`
 * in its own file and bumps CURRENT_SCHEMA_VERSION.
 */
export const MIGRATIONS: readonly Migration[] = [];

export type MigrationResult =
  | { ok: true; doc: Record<string, unknown>; applied: string[] }
  | { ok: false; error: 'newer_version'; version: number }
  | { ok: false; error: 'missing_step'; from: number }
  | { ok: false; error: 'step_failed'; step: string; message: string };

/** Upgrades a raw Save_Document to CURRENT_SCHEMA_VERSION. Never mutates the input. */
export function migrate(input: Record<string, unknown>, migrations: readonly Migration[] = MIGRATIONS, target = CURRENT_SCHEMA_VERSION): MigrationResult {
  let version = typeof input.schemaVersion === 'number' ? input.schemaVersion : 0;
  if (version > target) return { ok: false, error: 'newer_version', version };
  let doc = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  const applied: string[] = [];
  while (version < target) {
    const step = migrations.find((m) => m.from === version);
    if (!step) return { ok: false, error: 'missing_step', from: version };
    try {
      doc = step.up(doc);
    } catch (err) {
      return { ok: false, error: 'step_failed', step: step.name, message: err instanceof Error ? err.message : String(err) };
    }
    doc.schemaVersion = step.to;
    version = step.to;
    applied.push(step.name);
  }
  return { ok: true, doc, applied };
}
