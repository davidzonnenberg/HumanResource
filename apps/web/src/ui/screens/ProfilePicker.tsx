// Profile picker (22.4–22.7, 26.5, 26.6): server list with cached fallback, profile creation,
// PIN pad verified online or offline against the cached salted hash with a per-device lockout.
import { useEffect, useState } from 'react';
import { lockStatus, validateDisplayName, validatePin, verifyPin, type ProfileDto } from '@hr/shared';
import { t } from '../../text/t';
import { getServices } from '../../game/session';
import { newId, type LocalProfile } from '../../persistence/saves';

const fromDto = (p: ProfileDto): LocalProfile => ({ id: p.id, displayName: p.displayName, pin: p.pin, createdAt: '' });

async function pinFailures(id: string): Promise<number[]> {
  return (await getServices()?.repo.store.get<number[]>('meta', `pinFailures:${id}`)) ?? [];
}

export function ProfilePicker({ onPick }: { onPick: (p: LocalProfile) => void }) {
  const [profiles, setProfiles] = useState<LocalProfile[]>([]);
  const [offline, setOffline] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<LocalProfile | null>(null);

  async function refresh() {
    const s = getServices();
    if (!s) return;
    const res = await s.api.listProfiles();
    if (res.kind === 'ok') {
      const list = res.data.map(fromDto);
      for (const p of list) await s.repo.putProfile(p); // cache for offline use (22.5)
      setProfiles(list);
      setOffline(false);
    } else {
      setProfiles(await s.repo.listProfiles());
      setOffline(true);
    }
  }
  useEffect(() => void refresh(), []);

  async function create() {
    const s = getServices();
    if (!s) return;
    if (validateDisplayName(name)) return setError(t('profiles.error.invalid_name'));
    if (validatePin(pin)) return setError(t('profiles.error.invalid_pin'));
    const res = await s.api.createProfile(name.trim(), pin || undefined);
    if (res.kind === 'ok') {
      await s.repo.putProfile(fromDto(res.data));
    } else if (res.kind === 'error') {
      return setError(res.error.error === 'display_name_taken' ? t('profiles.error.name_taken') : t('profiles.error.invalid_name'));
    } else {
      // Offline: a local-only profile; it syncs once the server knows it.
      await s.repo.putProfile({ id: newId(), displayName: name.trim(), pin: null, createdAt: new Date().toISOString() });
    }
    setCreating(false);
    setName('');
    setPin('');
    setError(null);
    await refresh();
  }

  function pick(p: LocalProfile) {
    if (p.pin) setPinFor(p);
    else onPick(p);
  }

  return (
    <div className="screen">
      <h1 className="screen-title">{t('app.title')}</h1>
      <p className="screen-sub">{t('app.tagline')}</p>
      <h2>{t('profiles.title')}</h2>
      {offline && <p className="notice">{t('profiles.error.offline')}</p>}
      <div className="card-list">
        {profiles.map((p) => (
          <button key={p.id} className="big-button" onClick={() => pick(p)}>
            {p.displayName}
          </button>
        ))}
        {!creating && (
          <button className="big-button secondary" onClick={() => setCreating(true)}>
            {t('profiles.new')}
          </button>
        )}
      </div>
      {creating && (
        <div className="form">
          <label>
            {t('profiles.name')}
            <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label>
            {t('profiles.pin')}
            <input value={pin} inputMode="numeric" maxLength={6} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="big-button" onClick={() => void create()}>
            {t('profiles.create')}
          </button>
          <button className="big-button secondary" onClick={() => setCreating(false)}>
            {t('slots.cancel')}
          </button>
        </div>
      )}
      {pinFor && <PinPad profile={pinFor} onCancel={() => setPinFor(null)} onOk={() => onPick(pinFor)} />}
    </div>
  );
}

function PinPad({ profile, onOk, onCancel }: { profile: LocalProfile; onOk: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const press = (d: string) => setPin((p) => (p.length < 6 ? p + d : p));

  async function submit() {
    const s = getServices();
    if (!s || !profile.pin) return onOk();
    const now = Date.now();
    const local = lockStatus(await pinFailures(profile.id), now);
    if (local.locked) return setMsg(t('profiles.pinLocked', { seconds: Math.ceil(local.retryAfterMs / 1000) }));
    const res = await s.api.verifyPin(profile.id, pin);
    if (res.kind === 'ok') return onOk();
    if (res.kind === 'error') {
      if (res.error.error === 'pin_locked') return setMsg(t('profiles.pinLocked', { seconds: res.error.retryAfterSec }));
      setPin('');
      return setMsg(t('profiles.pinWrong', { left: res.error.error === 'wrong_pin' ? (res.error.attemptsLeft ?? 0) : 0 }));
    }
    // Offline: verify against the cached salted hash with a per-device lockout (22.7, 26.5)
    if (await verifyPin(pin, profile.pin)) {
      await s.repo.store.put('meta', `pinFailures:${profile.id}`, []);
      return onOk();
    }
    const fails = [...(await pinFailures(profile.id)), now];
    await s.repo.store.put('meta', `pinFailures:${profile.id}`, fails);
    const st = lockStatus(fails, now);
    setPin('');
    setMsg(st.locked ? t('profiles.pinLocked', { seconds: Math.ceil(st.retryAfterMs / 1000) }) : t('profiles.pinWrong', { left: st.attemptsLeft }));
  }

  return (
    <div className="modal">
      <div className="modal-card">
        <h3>{t('profiles.pinPrompt', { name: profile.displayName })}</h3>
        <div className="pin-dots">{'•'.repeat(pin.length) || '\u00a0'}</div>
        {msg && <p className="error">{msg}</p>}
        <div className="pin-grid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => (
            <button key={d} className="pin-key" onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <button className="pin-key" onClick={() => setPin('')}>
            {t('profiles.pinClear')}
          </button>
          <button className="pin-key primary" onClick={() => void submit()}>
            {t('profiles.pinOk')}
          </button>
        </div>
        <button className="big-button secondary" onClick={onCancel}>
          {t('slots.cancel')}
        </button>
      </div>
    </div>
  );
}
