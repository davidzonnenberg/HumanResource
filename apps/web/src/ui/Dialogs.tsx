// Pause_Menu (21.6, 47.6 Testing toggle), "Resume Route?" (13.11) and sync dialogs (25.4, 25.15).
import { t } from '../text/t';
import { useSession, useUi } from '../store/stores';
import { bridge } from '../store/simBridge';
import { setPauseMenu } from '../input/actions';
import { getServices, replaceRunningState, runningSession } from '../game/session';

export function PauseMenu({ onExit }: { onExit: () => void }) {
  const open = useUi((u) => u.pauseMenuOpen);
  const testing = useSession((s) => s.devTesting);
  if (!open) return null;
  const toggleTesting = async () => {
    const next = !testing;
    useSession.getState().set({ devTesting: next });
    await getServices()?.repo.store.put('meta', 'devTesting', next); // per device
  };
  return (
    <div className="modal">
      <div className="modal-card">
        <h2>{t('pause.title')}</h2>
        <button className="big-button" onClick={() => setPauseMenu(false)} autoFocus>
          {t('pause.resume')}
        </button>
        <button className="big-button secondary" onClick={() => void toggleTesting()} aria-pressed={testing}>
          {t('pause.testing')}: {t(testing ? 'pause.testing.on' : 'pause.testing.off')}
        </button>
        <button className="big-button secondary" onClick={onExit}>
          {t('pause.exitToSlots')}
        </button>
      </div>
    </div>
  );
}

export function GameDialogs() {
  const dialog = useUi((u) => u.dialog);
  if (!dialog) return null;
  const close = () => useUi.getState().set({ dialog: null });

  if (dialog.kind === 'resumeRoute') {
    return (
      <div className="modal non-blocking">
        <div className="modal-card">
          <h3>{t('dialog.resumeRoute.title')}</h3>
          <button
            className="big-button"
            onClick={() => {
              bridge.loop?.sim.submit({ type: 'resumeRoute', vehicleId: dialog.vehicleId });
              close();
            }}
          >
            {t('dialog.resumeRoute.yes')}
          </button>
          <button className="big-button secondary" onClick={close}>
            {t('dialog.resumeRoute.no')}
          </button>
        </div>
      </div>
    );
  }

  const r = runningSession();
  const s = getServices();
  if (dialog.kind === 'syncConflict') {
    const resolve = async (keepServer: boolean) => {
      if (!r || !s) return close();
      if (keepServer) {
        const doc = await s.sync.keepServer(r.profile.id, r.slot.slotId);
        if (doc) replaceRunningState(doc);
      } else {
        // Save what we have, then overwrite the server with a rebased Revision.
        await r.autosave.save('exit');
        const meta = await s.api.saveMeta(r.profile.id, r.slot.slotId);
        await s.sync.overwriteServer(r.profile.id, r.slot.slotId, meta.kind === 'ok' ? meta.data.revision : 0);
      }
      bridge.loop?.resume('syncConflict');
      close();
    };
    return (
      <div className="modal">
        <div className="modal-card">
          <h3>{t('sync.conflict.title')}</h3>
          <p>{t('sync.conflict.body')}</p>
          <button className="big-button" onClick={() => void resolve(true)}>
            {t('sync.conflict.keepServer')}
          </button>
          <button className="big-button secondary" onClick={() => void resolve(false)}>
            {t('sync.conflict.keepLocal')}
          </button>
        </div>
      </div>
    );
  }

  // Slot deleted on another device: keep as a new playthrough or discard (25.15)
  const keep = async () => {
    if (r && s) {
      const doc = await s.repo.getRawSave(r.profile.id, r.slot.slotId);
      if (doc) {
        const slotId = globalThis.crypto.randomUUID();
        await s.repo.putSlot({ ...r.slot, slotId, revision: doc.revision, syncedRevision: 0, updatedAt: new Date().toISOString() });
        await s.repo.putDocument({ ...doc, slotId, syncedRevision: 0 });
        await s.repo.deleteSlot(r.profile.id, r.slot.slotId);
      }
    }
    close();
  };
  return (
    <div className="modal">
      <div className="modal-card">
        <h3>{t('sync.deleted.title')}</h3>
        <button className="big-button" onClick={() => void keep()}>
          {t('sync.deleted.keep')}
        </button>
        <button className="big-button secondary" onClick={close}>
          {t('sync.deleted.discard')}
        </button>
      </div>
    </div>
  );
}
