// Home screen (ceo-phone Requirement 2): elapsed-time widget, money widget, quest placeholder,
// 4-column app grid and the dock (installed apps only, no empty slots).
import { goldToWholeFloor } from '@hr/sim';
import { t, tDynamic } from '../../text/t';
import { useHud } from '../../store/stores';
import type { PhoneApp } from './appsSchema';
import { dockApps, gridApps } from './installedApps';
import { openPhoneApp } from './phoneActions';

function AppIcon({ app, showName }: { app: PhoneApp; showName: boolean }) {
  return (
    <button type="button" className="ph-appicon" aria-label={tDynamic(app.nameKey)} onClick={() => openPhoneApp(app.id)}>
      <span className="ph-ic" style={{ background: app.colour }} aria-hidden="true">
        {app.icon}
      </span>
      {showName && <span className="ph-appname">{tDynamic(app.nameKey)}</span>}
    </button>
  );
}

export function HomeScreen({ installed, elapsed }: { installed: readonly PhoneApp[]; elapsed: string }) {
  const gold = useHud((h) => h.gold);
  const ledgr = installed.find((a) => a.id === 'ledgr');
  const money = (
    <>
      <b>{t('phone.home.money', { amount: goldToWholeFloor(gold).toLocaleString() })}</b>
      <span className="ph-wg-sub">{t('phone.home.moneyHint')}</span>
    </>
  );
  return (
    <div className="ph-home">
      <div className="ph-wg">
        <div className="ph-wg-big">{elapsed}</div>
        <div className="ph-wg-sub">{t('phone.home.elapsed')}</div>
      </div>
      {ledgr ? (
        <button type="button" className={`ph-wg${gold < 0 ? ' neg' : ''}`} onClick={() => openPhoneApp(ledgr.id)}>
          {money}
        </button>
      ) : (
        <div className={`ph-wg${gold < 0 ? ' neg' : ''}`}>{money}</div>
      )}
      <div className="ph-wg ph-wg-muted" aria-disabled="true">
        <b>{t('phone.home.quest')}</b>
        <span className="ph-wg-sub">{t('phone.home.questSoon')}</span>
      </div>
      <div className="ph-grid">
        {gridApps(installed).map((a) => (
          <AppIcon key={a.id} app={a} showName />
        ))}
      </div>
      <div className="ph-dock">
        {dockApps(installed).map((a) => (
          <AppIcon key={a.id} app={a} showName={false} />
        ))}
      </div>
    </div>
  );
}
