// Game session wiring: registry, Local_Store, Sync_Service, and starting/stopping a Save_Slot.
import { rawContent } from '@hr/content';
import { loadRegistry, newGame, Simulation, entrance, firstPlayerPub, type DefinitionError, type DefinitionRegistry, type SimState } from '@hr/sim';
import type { SaveDocument } from '@hr/shared';
import { openLocalStore } from '../persistence/localStore';
import { SaveRepository, newId, newSeed, type LocalProfile, type LocalSlot } from '../persistence/saves';
import { Autosave, installLifecycle } from '../persistence/autosave';
import { httpApiClient, type ApiClient } from '../sync/apiClient';
import { SyncService } from '../sync/syncService';
import { attachSimulation, bridge, detachSimulation } from '../store/simBridge';
import { useHud, useSession, useUi } from '../store/stores';
import { resetCamera } from '../render/cameraState';
import type { GameLoop } from '../loop/GameLoop';

export interface AppServices {
  reg: DefinitionRegistry;
  repo: SaveRepository;
  api: ApiClient;
  sync: SyncService;
  storageWarning: boolean;
}

export type Boot = { ok: true; services: AppServices } | { ok: false; errors: DefinitionError[] };

let services: AppServices | null = null;
export const getServices = (): AppServices | null => services;

/** Registry first: Definition errors block starting or loading (1.1, 1.7). */
export async function boot(overrides?: { api?: ApiClient; store?: Awaited<ReturnType<typeof openLocalStore>>['store'] }): Promise<Boot> {
  const res = loadRegistry(rawContent);
  if (!res.ok) return { ok: false, errors: res.errors };
  const { store, showFallbackWarning } = overrides?.store ? { store: overrides.store, showFallbackWarning: false } : await openLocalStore();
  const repo = new SaveRepository(store);
  const api = overrides?.api ?? httpApiClient();
  const sync = new SyncService(repo, api, {
    onStatus: (_k, s) => useHud.getState().set({ syncStatus: s }),
    onConflict: (_p, slotId) => {
      bridge.loop?.pause('syncConflict');
      useUi.getState().set({ dialog: { kind: 'syncConflict', slotId } });
    },
    onDeleted: (_p, slotId) => useUi.getState().set({ dialog: { kind: 'slotDeleted', slotId } }),
    onOutdated: () => useHud.getState().pushToast('sync.outdated'),
  });
  services = { reg: res.value, repo, api, sync, storageWarning: showFallbackWarning };
  return { ok: true, services };
}

interface Running {
  profile: LocalProfile;
  slot: LocalSlot;
  loop: GameLoop;
  autosave: Autosave;
  uninstall: () => void;
}
let running: Running | null = null;
export const runningSession = (): Running | null => running;

export async function createSlot(profile: LocalProfile, name: string): Promise<LocalSlot> {
  const s = services;
  if (!s) throw new Error('not booted');
  const slot: LocalSlot = { profileId: profile.id, slotId: newId(), name, updatedAt: new Date().toISOString(), revision: 0, syncedRevision: 0, schemaVersion: 0, deleted: false };
  await s.repo.putSlot(slot);
  const state = newGame(s.reg, newSeed()); // new Seed per Save_Slot (3.2)
  await s.repo.writeSave(profile.id, slot.slotId, state, true);
  void s.api.putSlot(profile.id, slot.slotId, name);
  return (await s.repo.getSlot(profile.id, slot.slotId)) ?? slot;
}

export type StartResult = { ok: true } | { ok: false; messageKey: string; params?: Record<string, string | number> };

/** Loads a slot (sync decision first) and starts the GameLoop. No offline progress (21.5). */
export async function startSlot(profile: LocalProfile, slot: LocalSlot): Promise<StartResult> {
  const s = services;
  if (!s) return { ok: false, messageKey: 'app.fatal.body' };
  const d = await s.sync.decide(profile.id, slot.slotId);
  if (d.decision === 'useServer') await s.sync.downloadServer(profile.id, slot.slotId);
  if (d.decision === 'conflict') useUi.getState().set({ dialog: { kind: 'syncConflict', slotId: slot.slotId } });
  const res = await s.repo.loadSlot(profile.id, slot.slotId, s.reg);
  if (!res.ok) {
    if (res.error === 'newer_version') return { ok: false, messageKey: 'slots.newerVersion' };
    if (res.error === 'migration_failed') return { ok: false, messageKey: 'slots.migrationFailed', params: { step: res.step } };
    if (res.error === 'invalid' || res.error === 'envelope') return { ok: false, messageKey: 'slots.invalid', params: { field: res.field } };
    return { ok: false, messageKey: 'slots.invalid', params: { field: res.error } };
  }
  if (res.migrated) useHud.getState().pushToast('slots.migrated');
  run(profile, slot, res.doc.state);
  if (d.decision === 'conflict') bridge.loop?.pause('syncConflict');
  if (d.decision === 'useLocalAndUpload') void s.sync.upload(res.doc);
  return { ok: true };
}

function run(profile: LocalProfile, slot: LocalSlot, state: SimState): void {
  const s = services;
  if (!s) return;
  void stopSlot(false);
  const sim = new Simulation(s.reg, state);
  let autosave: Autosave | null = null;
  const loop = attachSimulation(
    sim,
    {
      requestSave: (r) => void autosave?.save(r),
      onFatal: () => useHud.getState().pushToast('app.fatal.body'),
    },
    import.meta.env.DEV,
  );
  autosave = new Autosave(s.repo, loop, profile.id, slot.slotId);
  autosave.onSaved = (doc: SaveDocument) => void s.sync.upload(doc); // 25.1
  autosave.start();
  s.sync.start(profile.id, slot.slotId);
  const uninstallLifecycle = installLifecycle(loop, (r) => void autosave?.save(r));
  // Game_Speed resets to 1x on every new or loaded slot (47.3)
  useSession.getState().set({ gameSpeed: 1, speedPaused: false });
  useUi.getState().set({ viewMode: 'ceo', selection: null, dialog: useUi.getState().dialog, pauseMenuOpen: false });
  const pub = firstPlayerPub(s.reg, state);
  const c = pub ? entrance(s.reg, pub.plotId) : { x: state.ceo.x, z: state.ceo.z };
  resetCamera(state.ceo.x || c.x, state.ceo.z || c.z);
  running = { profile, slot, loop, autosave, uninstall: uninstallLifecycle };
}

/** Saves and stops the current slot. */
export async function stopSlot(save = true): Promise<void> {
  const r = running;
  if (!r) return;
  running = null;
  if (save) await r.autosave.save('exit');
  r.autosave.stop();
  r.uninstall();
  services?.sync.stop();
  detachSimulation();
}

/** Applies a downloaded/kept document to the running slot (conflict resolution). */
export function replaceRunningState(doc: SaveDocument): void {
  const r = running;
  const s = services;
  if (!r || !s) return;
  run(r.profile, r.slot, doc.state as SimState);
}
