// App screen (ceo-phone Requirement 5): top app bar, scrolling body, optional bottom tabs.
import type { ComponentType } from 'react';
import { t, tDynamic } from '../../text/t';
import type { PhoneApp } from './appsSchema';
import { usePhone } from './phoneStore';
import { SettingsApp } from './apps/SettingsApp';
import { NewsApp } from './apps/NewsApp';
import { BankApp } from './apps/BankApp';

/** App id → body component. An app without a body is never installed in apps.json. */
export const APP_BODIES: Record<string, ComponentType<{ tab: string | undefined; id: string | undefined }>> = {
  set: SettingsApp,
  news: NewsApp,
  bank: BankApp,
};

export function AppShell({ app, tab, id }: { app: PhoneApp; tab: string | undefined; id: string | undefined }) {
  const back = usePhone((s) => s.back);
  const setTab = usePhone((s) => s.setTab);
  const Body = APP_BODIES[app.id];
  const activeTab = tab ?? app.tabs[0]?.id;
  return (
    <div className="ph-app">
      <div className="ph-topbar">
        <button type="button" className="ph-icon" aria-label={t('phone.back')} onClick={back}>
          ←
        </button>
        <span className="ph-title">{tDynamic(app.nameKey)}</span>
      </div>
      <div className="ph-body">{Body ? <Body tab={activeTab} id={id} /> : null}</div>
      {app.tabs.length > 0 && (
        <nav className="ph-tabs" data-phone-tabs aria-label={tDynamic(app.nameKey)}>
          {app.tabs.map((tb) => (
            <button key={tb.id} type="button" className={tb.id === activeTab ? 'on' : ''} aria-current={tb.id === activeTab ? 'page' : undefined} onClick={() => setTab(app.id, tb.id)}>
              <span className="ph-tab-pill" aria-hidden="true">
                {tb.icon}
              </span>
              {tDynamic(tb.labelKey)}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
