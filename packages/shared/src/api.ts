// Save_API DTOs (design: Save_API table). Shared by the server routes and the web apiClient.
import { z } from 'zod';
import { saveEnvelopeSchema } from './saveDocument';

export const pinRecordSchema = z.object({ salt: z.string(), iterations: z.number().int().positive(), hash: z.string() });
export type PinRecord = z.infer<typeof pinRecordSchema>;

export const profileDtoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  hasPin: z.boolean(),
  pin: pinRecordSchema.nullable(), // salted hash for offline verification (26.3)
});
export type ProfileDto = z.infer<typeof profileDtoSchema>;

export const createProfileBodySchema = z.object({ displayName: z.string(), pin: z.string().optional() });
export const patchProfileBodySchema = z.object({
  displayName: z.string().optional(),
  newPin: z.string().optional(),
  currentPin: z.string().optional(),
});
export const verifyPinBodySchema = z.object({ pin: z.string() });

export const slotDtoSchema = z.object({
  slotId: z.string(),
  name: z.string(),
  revision: z.number().int().nonnegative(),
  schemaVersion: z.number().int().nonnegative(),
  updatedAt: z.string(),
  deleted: z.boolean(),
});
export type SlotDto = z.infer<typeof slotDtoSchema>;

export const putSlotBodySchema = z.object({ name: z.string() });
export const saveMetaSchema = z.object({ revision: z.number().int(), schemaVersion: z.number().int(), updatedAt: z.string() });
export type SaveMeta = z.infer<typeof saveMetaSchema>;

export const putSaveBodySchema = z.object({ baseRevision: z.number().int().nonnegative(), document: saveEnvelopeSchema });
export const overwriteSaveBodySchema = z.object({ replacedRevision: z.number().int().nonnegative(), document: saveEnvelopeSchema });

export type ApiError =
  | { error: 'invalid_field'; field: string }
  | { error: 'display_name_taken'; field: 'displayName' }
  | { error: 'wrong_pin'; attemptsLeft?: number }
  | { error: 'pin_locked'; retryAfterSec: number }
  | { error: 'conflict'; serverRevision: number }
  | { error: 'slot_deleted' }
  | { error: 'too_large'; limitBytes: number }
  | { error: 'unsupported_schema'; supported: [number, number] }
  | { error: 'client_outdated'; storedSchemaVersion: number }
  | { error: 'not_found' };
