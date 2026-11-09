// Sync_Service (25): uploads after each local write, revision-based conflicts, offline retry
// every 60 s, offline deletion queue, and the load flow from the pure decision table.
import { MAX_SAVE_BYTES, saveSizeBytes, type SaveDocument } from '@hr/shared';
import type { SaveRepository } from '../persistence/saves';
import type { ApiClient } from './apiClient';
import { decideLoad, type LoadDecision } from './loadDecision';

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'conflict' | 'tooLarge' | 'outdated' | 'deleted';

export interface SyncEvents {
  onStatus?(slotKey: string, status: SyncStatus): void;
  onConflict?(profileId: string, slotId: string, serverRevision: number): void;
  onDeleted?(profileId: string, slotId: string): void;
  onOutdated?(): void;
}

interface QueuedDelete {
  kind: 'deleteSlot';
  profileId: string;
  slotId: string;
  queuedAt: string;
}

export const RETRY_MS = 60_000;

export class SyncService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly status = new Map<string, SyncStatus>();
  private active: { profileId: string; slotId: string } | null = null;

  constructor(
    private readonly repo: SaveRepository,
    private readonly api: ApiClient,
    private readonly events: SyncEvents = {},
  ) {}

  statusOf(profileId: string, slotId: string): SyncStatus | undefined {
    return this.status.get(`${profileId}/${slotId}`);
  }

  private setStatus(profileId: string, slotId: string, s: SyncStatus): void {
    const k = `${profileId}/${slotId}`;
    this.status.set(k, s);
    this.events.onStatus?.(k, s);
  }

  /** Starts the 60 s retry loop for the slot being played. */
  start(profileId: string, slotId: string): void {
    this.active = { profileId, slotId };
    this.stop();
    this.timer = setInterval(() => void this.retry(), RETRY_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async retry(): Promise<void> {
    if (!this.active) return;
    const st = this.statusOf(this.active.profileId, this.active.slotId);
    if (st !== 'offline' && st !== 'pending') return;
    await this.flushQueue();
    const doc = await this.repo.getRawSave(this.active.profileId, this.active.slotId);
    if (doc && doc.revision > doc.syncedRevision) await this.upload(doc);
  }

  /** Called after every successful local write (25.1). */
  async upload(doc: SaveDocument): Promise<SyncStatus> {
    const { profileId, slotId } = doc;
    if (saveSizeBytes(doc) > MAX_SAVE_BYTES) {
      this.setStatus(profileId, slotId, 'tooLarge'); // 25.12
      return 'tooLarge';
    }
    this.setStatus(profileId, slotId, 'pending');
    const slot = await this.repo.getSlot(profileId, slotId);
    if (slot) await this.api.putSlot(profileId, slotId, slot.name);
    const res = await this.api.putSave(profileId, slotId, doc.syncedRevision, doc);
    if (res.kind === 'offline') {
      this.setStatus(profileId, slotId, 'offline'); // 25.10
      return 'offline';
    }
    if (res.kind === 'ok') {
      await this.repo.markSynced(profileId, slotId, res.data.revision); // 25.2
      await this.flushQueue();
      this.setStatus(profileId, slotId, 'synced');
      return 'synced';
    }
    switch (res.error.error) {
      case 'conflict':
        this.setStatus(profileId, slotId, 'conflict');
        this.events.onConflict?.(profileId, slotId, res.error.serverRevision); // 25.4
        return 'conflict';
      case 'slot_deleted':
        this.setStatus(profileId, slotId, 'deleted');
        this.events.onDeleted?.(profileId, slotId); // 25.15
        return 'deleted';
      case 'client_outdated':
        this.setStatus(profileId, slotId, 'outdated');
        this.events.onOutdated?.(); // 25.13
        return 'outdated';
      case 'too_large':
        this.setStatus(profileId, slotId, 'tooLarge');
        return 'tooLarge';
      default:
        this.setStatus(profileId, slotId, 'offline');
        return 'offline';
    }
  }

  /** Load flow (design sequence diagram). Returns what the caller should load. */
  async decide(profileId: string, slotId: string): Promise<{ decision: LoadDecision | 'offline'; serverRevision?: number }> {
    const local = await this.repo.getRawSave(profileId, slotId);
    const meta = await this.api.saveMeta(profileId, slotId);
    if (meta.kind === 'offline') {
      this.setStatus(profileId, slotId, 'offline');
      return { decision: 'offline' };
    }
    if (meta.kind === 'error' && meta.error.error === 'slot_deleted') {
      this.setStatus(profileId, slotId, 'deleted');
      return { decision: local ? 'useLocal' : 'useServer' };
    }
    const server = meta.kind === 'ok' ? { revision: meta.data.revision } : null;
    const decision = decideLoad(local ? { revision: local.revision, syncedRevision: local.syncedRevision } : null, server);
    return server ? { decision, serverRevision: server.revision } : { decision };
  }

  /** Downloads the server copy into Local_Store with syncedRevision = revision (25.7). */
  async downloadServer(profileId: string, slotId: string): Promise<SaveDocument | null> {
    const res = await this.api.getSave(profileId, slotId);
    if (res.kind !== 'ok') return null;
    const doc = { ...res.data, syncedRevision: res.data.revision };
    await this.repo.putDocument(doc);
    this.setStatus(profileId, slotId, 'synced');
    return doc;
  }

  /** Conflict: keep the server copy, local copy becomes the backup (25.5). */
  async keepServer(profileId: string, slotId: string): Promise<SaveDocument | null> {
    const local = await this.repo.getRawSave(profileId, slotId);
    if (local) await this.repo.putBackup(local, profileId, slotId);
    return this.downloadServer(profileId, slotId);
  }

  /**
   * Conflict: overwrite the server copy. The local Revision is rebased above the server's so no
   * stale device can later win (design note, 25.6).
   */
  async overwriteServer(profileId: string, slotId: string, serverRevision: number): Promise<SyncStatus> {
    const local = await this.repo.getRawSave(profileId, slotId);
    if (!local) return 'offline';
    const rebased = { ...local, revision: Math.max(local.revision, serverRevision) + 1, timestamp: new Date().toISOString() };
    await this.repo.putDocument(rebased);
    const res = await this.api.overwriteSave(profileId, slotId, serverRevision, rebased);
    if (res.kind === 'ok') {
      await this.repo.markSynced(profileId, slotId, rebased.revision);
      this.setStatus(profileId, slotId, 'synced');
      return 'synced';
    }
    this.setStatus(profileId, slotId, res.kind === 'offline' ? 'offline' : 'conflict');
    return res.kind === 'offline' ? 'offline' : 'conflict';
  }

  /** Deletes on the server, or queues the deletion while offline (25.14). */
  async deleteSlot(profileId: string, slotId: string): Promise<void> {
    const res = await this.api.deleteSlot(profileId, slotId);
    if (res.kind === 'offline') {
      const entry: QueuedDelete = { kind: 'deleteSlot', profileId, slotId, queuedAt: new Date().toISOString() };
      await this.repo.store.put('syncQueue', `${profileId}/${slotId}`, entry);
    }
  }

  async flushQueue(): Promise<void> {
    const queued = await this.repo.store.list<QueuedDelete>('syncQueue');
    for (const q of queued) {
      const res = await this.api.deleteSlot(q.profileId, q.slotId);
      if (res.kind === 'offline') return;
      await this.repo.store.delete('syncQueue', `${q.profileId}/${q.slotId}`);
    }
  }
}
