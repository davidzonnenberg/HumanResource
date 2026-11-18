// Settings app (ceo-phone Requirement 12): Display + Notifications in task 1, plus a Dev_Mode-only
// Developer section with "reveal all apps". Stored per device (phoneSettings.ts), never in SimState.
import { t } from '../../../text/t';
import { useSession } from '../../../store/stores';
import { devModeOn } from '../../../input/actions';
import { Switch } from '../components/Switch';
import { Segmented } from '../components/Segmented';
import { usePhoneSettings, resolvedDark, resolvedReducedMotion } from '../phoneSettings';

export function SettingsApp() {
  const s = usePhoneSettings((x) => x.settings);
  const update = usePhoneSettings((x) => x.update);
  useSession((x) => x.devTesting); // re-render when the Testing toggle changes Dev_Mode
  const dev = devModeOn();
  return (
    <>
      <h3 className="ph-hd">{t('app.set.display')}</h3>
      <div className="ph-card">
        <div className="ph-row">
          <span>{t('app.set.darkMode')}</span>
          <Switch checked={resolvedDark(s)} label={t('app.set.darkMode')} onChange={(on) => update({ darkMode: on ? 'dark' : 'light' })} />
        </div>
        <div className="ph-row ph-col">
          <span>{t('app.set.textSize')}</span>
          <Segmented
            label={t('app.set.textSize')}
            value={s.textSize}
            onChange={(v) => update({ textSize: v })}
            options={[
              { value: 's', label: t('app.set.textSize.s') },
              { value: 'm', label: t('app.set.textSize.m') },
              { value: 'l', label: t('app.set.textSize.l') },
            ]}
          />
        </div>
        <div className="ph-row">
          <span>{t('app.set.reducedMotion')}</span>
          <Switch checked={resolvedReducedMotion(s)} label={t('app.set.reducedMotion')} onChange={(on) => update({ reducedMotion: on ? 'on' : 'off' })} />
        </div>
      </div>
      <h3 className="ph-hd">{t('app.set.notifications')}</h3>
      <div className="ph-card">
        <div className="ph-row">
          <span>
            {t('app.set.dnd')}
            <span className="ph-mut ph-block">{t('app.set.dnd.hint')}</span>
          </span>
          <Switch checked={s.dnd} label={t('app.set.dnd')} onChange={(on) => update({ dnd: on })} />
        </div>
        <div className="ph-row">
          <span>{t('app.set.questPings')}</span>
          <Switch checked={s.questPings} label={t('app.set.questPings')} onChange={(on) => update({ questPings: on })} />
        </div>
      </div>
      {dev && (
        <>
          <h3 className="ph-hd">{t('app.set.developer')}</h3>
          <div className="ph-card">
            <div className="ph-row">
              <span>{t('app.set.revealAllApps')}</span>
              <Switch checked={s.devRevealAllApps} label={t('app.set.revealAllApps')} onChange={(on) => update({ devRevealAllApps: on })} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
