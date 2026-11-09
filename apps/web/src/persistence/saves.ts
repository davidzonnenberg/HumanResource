// Local Profiles, Save_Slots and save writes (22, 23, 24.6–24.8). Keys: `${profileId}/${slotId}`.
import type { PinRecord, SaveDocument } from '@hr/shared';
import type { DefinitionRegistry, SimState } from '@hr/sim';
import type { KeyValueStore } from './localStore';
import { buildSaveDocument, deserialize, type LoadResult } from './serializer';

export interface LocalProfile {
  id: string;
  displayName: string;
  pin: PinRecord | null;
  createdAt: string;
}

export interface LocalSlot {
  profileId: string;
  slotId: string;
  name: string;
  updatedAt: string;
  revision: number;
  syncedRevision: number;
  schemaVersion: number;
  deleted: boolean;
}

export const slotKey = (profileId: string, slotId: string): string => `${profileId}/${slotId}`;

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function newSeed(): number {
  return globalThis.crypto.getRandomValues(new Int32Array(1))[0] ?? 1;
}

export class SaveRepository {
  readonly store: KeyValueStore;
  private lastWrittenTick = new Map<string, number>();

  constructor(store: KeyValueStore) {
    this.store = store;
  }

  // ---------- Profiles ----------
  listProfiles(): Promise<LocalProfile[]> {
    return this.store.list<LocalProfile>('profiles');
  }
  putProfile(p: LocalProfile): Promise<void> {
    return this.store.put('profiles', p.id, p);
  }

  // ---------- Slots ----------
  async listSlots(profileId: string): Promise<LocalSlot[]> {
    const all = await this.store.list<LocalSlot>('slots', `${profileId}/`);
    return all.filter((s) => !s.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  getSlot(profileId: string, slotId: string): Promise<LocalSlot | undefined> {
    return this.store.get<LocalSlot>('slots', slotKey(profileId, slotId));
  }
  putSlot(s: LocalSlot): Promise<void> {
    return this.store.put('slots', slotKey(s.profileId, s.slotId), s);
  }
  async deleteSlot(profileId: string, slotId: string): Promise<void> {
    const k = slotKey(profileId, slotId);
    await this.store.delete('saves', k);
    await this.store.delete('backups', k);
    await this.store.delete('slots', k);
  }

  // ---------- Saves ----------
  getRawSave(profileId: string, slotId: string): Promise<SaveDocument | undefined> {
    return this.store.get<SaveDocument>('saves', slotKey(profileId, slotId));
  }

  /**
   * Writes the current state. Skips when the Tick has not changed since the last write (23.3);
   * Revision increases by exactly 1 on success (23.4). Returns the written document or null.
   */
  async writeSave(profileId: string, slotId: string, state: SimState, force = false): Promise<SaveDocument<SimState> | null> {
    const k = slotKey(profileId, slotId);
    if (!force && this.lastWrittenTick.get(k) === state.tick) return null;
    const slot = await this.getSlot(profileId, slotId);
    const prev = await this.getRawSave(profileId, slotId);
    const revision = (prev?.revision ?? 0) + 1;
    const syncedRevision = prev?.syncedRevision ?? slot?.syncedRevision ?? 0;
    const doc = buildSaveDocument(JSON.parse(JSON.stringify(state)) as SimState, { profileId, slotId, revision, syncedRevision });
    await this.store.put('saves', k, doc);
    this.lastWrittenTick.set(k, state.tick);
    if (slot) await this.putSlot({ ...slot, revision, updatedAt: doc.timestamp, schemaVersion: doc.schemaVersion });
    return doc;
  }

  /** Stores a document as-is (server download, rebased overwrite). */
  async putDocument(doc: SaveDocument): Promise<void> {
    await this.store.put('saves', slotKey(doc.profileId, doc.slotId), doc);
    const slot = await this.getSlot(doc.profileId, doc.slotId);
    if (slot) await this.putSlot({ ...slot, revision: doc.revision, syncedRevision: doc.syncedRevision, updatedAt: doc.timestamp, schemaVersion: doc.schemaVersion });
  }

  /** Records a Save_API acknowledgement (metadata only, no Revision increment, 25.2). */
  async markSynced(profileId: string, slotId: string, revision: number): Promise<void> {
    const doc = await this.getRawSave(profileId, slotId);
    if (doc && doc.revision >= revision) await this.store.put('saves', slotKey(profileId, slotId), { ...doc, syncedRevision: revision });
    const slot = await this.getSlot(profileId, slotId);
    if (slot) await this.putSlot({ ...slot, syncedRevision: revision });
  }

  async putBackup(doc: unknown, profileId: string, slotId: string): Promise<void> {
    await this.store.put('backups', slotKey(profileId, slotId), doc); // replaces the older backup (24.6)
  }

  /**
   * Loads a slot: migrations run on a copy; before migrating, the original is kept as backup.
   * A failed migration or a newer version never modifies the stored copy (24.7, 24.8).
   */
  async loadSlot(profileId: string, slotId: string, reg: DefinitionRegistry): Promise<LoadResult | { ok: false; error: 'missing' }> {
    const raw = await this.getRawSave(profileId, slotId);
    if (!raw) return { ok: false, error: 'missing' };
    const res = deserialize(raw, reg);
    if (res.ok && res.migrated) {
      await this.putBackup(res.original, profileId, slotId);
      await this.store.put('saves', slotKey(profileId, slotId), res.doc);
    }
    if (res.ok) this.lastWrittenTick.set(slotKey(profileId, slotId), res.doc.state.tick);
    return res;
  }
}
