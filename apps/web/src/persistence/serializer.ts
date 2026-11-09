// Save_Serializer (24): SimState <-> Save_Document. Load = parse -> envelope -> version check ->
// migrations -> state schema (first invalid field) -> semantic invariants.
import { CURRENT_SCHEMA_VERSION, migrate, saveEnvelopeSchema, type Migration, type SaveDocument } from '@hr/shared';
import { checkInvariants, simStateSchema, type DefinitionRegistry, type SimState } from '@hr/sim';

export function buildSaveDocument(state: SimState, meta: { profileId: string; slotId: string; revision: number; syncedRevision: number }, now = new Date()): SaveDocument<SimState> {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: meta.revision,
    syncedRevision: meta.syncedRevision,
    timestamp: now.toISOString(),
    profileId: meta.profileId,
    slotId: meta.slotId,
    state,
  };
}

export const serialize = (doc: SaveDocument): string => JSON.stringify(doc);

export type LoadResult =
  | { ok: true; doc: SaveDocument<SimState>; migrated: boolean; original: Record<string, unknown> }
  | { ok: false; error: 'parse' }
  | { ok: false; error: 'envelope'; field: string }
  | { ok: false; error: 'newer_version'; version: number }
  | { ok: false; error: 'migration_failed'; step: string }
  | { ok: false; error: 'invalid'; field: string };

export function deserialize(raw: string | unknown, reg: DefinitionRegistry, migrations?: readonly Migration[]): LoadResult {
  let data: unknown;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, error: 'parse' };
  }
  const env = saveEnvelopeSchema.safeParse(data);
  if (!env.success) return { ok: false, error: 'envelope', field: env.error.issues[0]?.path.join('.') ?? '(root)' };
  const original = data as Record<string, unknown>;
  const mig = migrate(original, migrations);
  if (!mig.ok) {
    if (mig.error === 'newer_version') return { ok: false, error: 'newer_version', version: mig.version };
    if (mig.error === 'step_failed') return { ok: false, error: 'migration_failed', step: mig.step };
    return { ok: false, error: 'migration_failed', step: `from_v${mig.from}` };
  }
  const st = simStateSchema.safeParse(mig.doc.state);
  if (!st.success) return { ok: false, error: 'invalid', field: ['state', ...(st.error.issues[0]?.path ?? [])].join('.') };
  const violations = checkInvariants(st.data, reg);
  if (violations[0]) return { ok: false, error: 'invalid', field: `state.${violations[0].path}` };
  const doc = { ...(mig.doc as unknown as SaveDocument<SimState>), state: st.data };
  return { ok: true, doc, migrated: mig.applied.length > 0, original };
}
