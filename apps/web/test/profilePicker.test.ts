// Guards the offline profile-create flow (the "Create does nothing offline" bug). Exercises the
// create + refresh logic directly against a memory store and an always-offline API, without React.
import { describe, expect, it } from 'vitest';
import { boot, getServices } from '../src/game/session';
import { memoryStore } from '../src/persistence/localStore';
import { newId, type LocalProfile } from '../src/persistence/saves';
import type { ApiClient } from '../src/sync/apiClient';

const offlineApi: ApiClient = new Proxy({} as ApiClient, {
  get() {
    return async () => ({ kind: 'offline' as const });
  },
});

/** Mirrors ProfilePicker.create()'s local-first path (the part that must work offline). */
async function createLocalFirst(displayName: string): Promise<LocalProfile> {
  const s = getServices();
  if (!s) throw new Error('not booted');
  const local: LocalProfile = { id: newId(), displayName, pin: null, createdAt: new Date().toISOString() };
  await s.repo.putProfile(local);
  // Background server call: offline here, so it must not throw and must not remove the local one.
  await s.api.createProfile(displayName);
  return local;
}

/** Mirrors ProfilePicker.refresh()'s merge of server + local-only profiles. */
async function mergedProfiles(): Promise<LocalProfile[]> {
  const s = getServices();
  if (!s) throw new Error('not booted');
  const res = await s.api.listProfiles();
  const local = await s.repo.listProfiles();
  if (res.kind !== 'ok') return local;
  const names = new Set(res.data.map((p) => p.displayName.toLocaleLowerCase()));
  return [...res.data.map((p) => ({ id: p.id, displayName: p.displayName, pin: p.pin, createdAt: '' })), ...local.filter((p) => !names.has(p.displayName.toLocaleLowerCase()))];
}

describe('offline profile create', () => {
  it('creates a usable local profile when the server is unreachable', async () => {
    const b = await boot({ api: offlineApi, store: memoryStore() });
    expect(b.ok).toBe(true);
    await createLocalFirst('David');
    const stored = await getServices()!.repo.listProfiles();
    expect(stored.map((p) => p.displayName)).toContain('David');
    // refresh() offline must keep showing the local profile
    expect((await mergedProfiles()).map((p) => p.displayName)).toContain('David');
  });

  it('the local create path never throws on an offline API', async () => {
    await boot({ api: offlineApi, store: memoryStore() });
    await expect(createLocalFirst('Girlfriend')).resolves.toBeDefined();
  });
});
