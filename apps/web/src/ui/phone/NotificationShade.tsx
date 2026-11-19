// Notification shade (ceo-phone Requirement 6): quick tiles, then notification cards. With
// Do-Not-Disturb on the cards are replaced by a "silenced" text; the HUD alert bell is unaffected.
import { t } from '../../text/t';
import { usePhone } from './phoneStore';
import { usePhoneSettings, resolvedDark } from './phoneSettings';
import { openPhoneApp } from './phoneActions';

function Tile({ icon, label, on, onClick }: { icon: string; label: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`ph-tile${on ? ' on' : ''}`} {...(on !== undefined ? { 'aria-pressed': on } : {})} onClick={onClick}>
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function NotificationShade() {
  const items = usePhone((s) => s.notifications);
  const clear = usePhone((s) => s.clearNotifications);
  const settings = usePhoneSettings((s) => s.settings);
  const update = usePhoneSettings((s) => s.update);
  return (
    <div className="ph-shade" role="region" aria-label={t('phone.shade')}>
      <div className="ph-tiles">
        <Tile icon="🔕" label={t('app.set.dnd')} on={settings.dnd} onClick={() => update({ dnd: !settings.dnd })} />
        <Tile icon="🌙" label={t('app.set.darkMode')} on={resolvedDark(settings)} onClick={() => update({ darkMode: resolvedDark(settings) ? 'light' : 'dark' })} />
        <Tile icon="📳" label={t('app.set.haptics')} on={settings.haptics} onClick={() => update({ haptics: !settings.haptics })} />
        <Tile icon="⚙️" label={t('app.set.name')} onClick={() => openPhoneApp('set')} />
      </div>
      {settings.dnd ? (
        <div className="ph-card ph-mut">{t('phone.shade.silenced')}</div>
      ) : items.length === 0 ? (
        <div className="ph-card ph-mut">{t('phone.shade.empty')}</div>
      ) : (
        <>
          <div className="ph-shade-head">
            <span className="ph-hd">{t('phone.shade.title')}</span>
            <button type="button" className="ph-btn tonal" onClick={clear}>
              {t('phone.shade.clear')}
            </button>
          </div>
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              className="ph-notif"
              disabled={!n.app}
              onClick={() => n.app && openPhoneApp(n.app, { ...(n.tab !== undefined ? { tab: n.tab } : {}), ...(n.objectId !== undefined ? { id: n.objectId } : {}) })}
            >
              {n.text}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
