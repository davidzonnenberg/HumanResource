// Save_Document envelope (Requirements 23–25). The server validates only this envelope, never
// the game state, which keeps the server independent of game rules.
import { z } from 'zod';

/** Bump together with a migration in ./migrations whenever saved SimState data changes shape. */
export const CURRENT_SCHEMA_VERSION = 1;
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;
export const MAX_SAVE_BYTES = 5 * 1024 * 1024;

export const saveEnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  syncedRevision: z.number().int().nonnegative(),
  timestamp: z.string().min(1),
  profileId: z.string().min(1),
  slotId: z.string().min(1),
  state: z.unknown(),
});

export interface SaveDocument<S = unknown> {
  schemaVersion: number;
  /** +1 per successful Local_Store write. */
  revision: number;
  /** Last revision acknowledged by the Save_API; 0 = never synced. */
  syncedRevision: number;
  /** ISO 8601 real time of the write. */
  timestamp: string;
  profileId: string;
  /** UUID generated client-side. */
  slotId: string;
  state: S;
}

export const saveSizeBytes = (doc: SaveDocument): number => new TextEncoder().encode(JSON.stringify(doc)).length;
