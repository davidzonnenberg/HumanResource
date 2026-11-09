// Save_Slot list (22.9, 22.10): create, continue, rename, delete with confirmation. Server slots
// that are not on this device yet are listed too, so a playthrough continues on another device.
import { useEffect, useState } from 'react';
import { validateSlotName } from '@hr/shared';
import { t } from '../../text/t';
import { createSlot, getServices, startSlot } from '../../game/session';
import type { LocalProfile, LocalSlot } from '../../persistence/saves';

export function SlotList({ profile, onPlay, onBack }: { profile: LocalProfile; onPlay: () => void; onBack: () => void }) {
  const [slots, setSlots] = useState<LocalSlot[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<LocalSlot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const s = getServices();

  async function refresh() {
    if (!s) return;
    const local = await s.repo.listSlots(profile.id);
    const remote = await s.api.listSlots(profile.id);
    if (remote.kind === 'ok') {
      for (const r of remote.data) {
        if (r.deleted || local.some((l) => l.slotId === r.slotId)) continue;
        const slot: LocalSlot = { profileId: profile.id, slotId: r.slotId, name: r.name, updatedAt: r.updatedAt, revision: 0, syncedRevision: 0, schemaVersion: r.schemaVersion, deleted: false };
        await s.repo.putSlot(slot);
        local.push(slot);
      }
    }
    setSlots(local.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }
  useEffect(() => void refresh(), []); // load once on mount

  async function play(slot: LocalSlot) {
    const res = await startSlot(profile, slot);
    if (res.ok) onPlay();
    else setMessage(t(res.messageKey as Parameters<typeof t>[0], res.params));
  }

  async function create() {
    const slot = await createSlot(profile, t('slots.newName', { n: slots.length + 1 }));
    await play(slot);
  }

  async function rename(slot: LocalSlot) {
    if (!s || validateSlotName(name)) return;
    await s.repo.putSlot({ ...slot, name: name.trim() });
    void s.api.putSlot(profile.id, slot.slotId, name.trim());
    setRenaming(null);
    await refresh();
  }

  async function remove(slot: LocalSlot) {
    if (!s) return;
    await s.repo.deleteSlot(profile.id, slot.slotId);
    await s.sync.deleteSlot(profile.id, slot.slotId);
    setConfirmDelete(null);
    await refresh();
  }

  return (
    <div className="screen">
      <h1 className="screen-title">{profile.displayName}</h1>
      <h2>{t('slots.title')}</h2>
      {s?.storageWarning && <p className="notice">{t('slots.storageWarning')}</p>}
      {message && <p className="error">{message}</p>}
      <div className="card-list">
        <button className="big-button" onClick={() => void create()}>
          {t('slots.new')}
        </button>
        {slots.length === 0 && <p>{t('slots.empty')}</p>}
        {slots.map((slot) => (
          <div key={slot.slotId} className="slot-card">
            {renaming === slot.slotId ? (
              <>
                <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={t('slots.namePlaceholder')} autoFocus />
                <button className="small-button" onClick={() => void rename(slot)}>
                  {t('slots.save')}
                </button>
              </>
            ) : (
              <>
                <div className="slot-name">{slot.name}</div>
                <div className="slot-meta">{t('slots.updated', { when: new Date(slot.updatedAt).toLocaleString() })}</div>
                <button className="small-button primary" onClick={() => void play(slot)}>
                  {t('slots.load')}
                </button>
                <button
                  className="small-button"
                  onClick={() => {
                    setRenaming(slot.slotId);
                    setName(slot.name);
                  }}
                >
                  {t('slots.rename')}
                </button>
                <button className="small-button danger" onClick={() => setConfirmDelete(slot)}>
                  {t('slots.delete')}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <button className="big-button secondary" onClick={onBack}>
        {t('slots.backToProfiles')}
      </button>
      {confirmDelete && (
        <div className="modal">
          <div className="modal-card">
            <p>{t('slots.deleteConfirm', { name: confirmDelete.name })}</p>
            <button className="big-button danger" onClick={() => void remove(confirmDelete)}>
              {t('slots.confirm')}
            </button>
            <button className="big-button secondary" onClick={() => setConfirmDelete(null)}>
              {t('slots.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
