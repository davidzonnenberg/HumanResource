// Recents (ceo-phone 4.6): the last 5 opened apps as large cards. Unknown or uninstalled apps are skipped.
import { t, tDynamic } from '../../text/t';
import type { PhoneApp } from './appsSchema';
import { usePhone } from './phoneStore';
import { openPhoneApp } from './phoneActions';

export function RecentsScreen({ installed }: { installed: readonly PhoneApp[] }) {
  const recents = usePhone((s) => s.recents);
  const apps = recents.flatMap((id) => installed.filter((a) => a.id === id));
  return (
    <div className="ph-app">
      <div className="ph-topbar">
        <span className="ph-title ph-pad">{t('phone.recents.title')}</span>
      </div>
      <div className="ph-body">
        {apps.length === 0 ? (
          <div className="ph-card ph-mut">{t('phone.recents.empty')}</div>
        ) : (
          apps.map((a) => (
            <button key={a.id} type="button" className="ph-recent" onClick={() => openPhoneApp(a.id)}>
              <span className="ph-ic" style={{ background: a.colour }} aria-hidden="true">
                {a.icon}
              </span>
              <b>{tDynamic(a.nameKey)}</b>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
