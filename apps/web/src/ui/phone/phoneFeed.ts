// Fills the notification ring from Alerts and domain events (ceo-phone Requirement 6.2). Web layer
// only: no new Simulation state. Runs for as long as the Phone component is mounted, open or not,
// so the shade has history when the player opens it. Do-Not-Disturb hides cards in the shade; it
// does not stop collecting.
import { tDynamic } from '../../text/t';
import { onDomainEvents } from '../../store/simBridge';
import { useHud } from '../../store/stores';
import { alertRows } from '../hud/alertText';
import { PHONE_APPS } from './appsSchema';
import { alertTarget } from './phoneAlerts';
import { currentInstalledApps } from './phoneActions';
import { newAlerts } from './phoneNotifications';
import { usePhone } from './phoneStore';

export function startPhoneFeed(): () => void {
  let prevKeys = new Set(useHud.getState().alerts.map((a) => a.key)); // existing Alerts are not news
  let prevAlerts = useHud.getState().alerts;

  const offHud = useHud.subscribe((s) => {
    if (s.alerts === prevAlerts) return;
    prevAlerts = s.alerts;
    const fresh = newAlerts(prevKeys, s.alerts);
    prevKeys = new Set(s.alerts.map((a) => a.key));
    if (fresh.length === 0) return;
    const rows = alertRows(s.alerts);
    const installed = currentInstalledApps();
    for (const a of fresh) {
      const row = rows.find((r) => r.key === a.key);
      if (!row) continue; // merged into another row (e.g. storage empty + out of beer)
      const target = alertTarget(a, installed);
      usePhone.getState().pushNotification({
        text: row.text,
        source: `alert:${a.key}`,
        objectId: a.objectId,
        ...(target ? { app: target.app, ...(target.tab !== undefined ? { tab: target.tab } : {}) } : {}),
      });
    }
  });

  const offEvents = onDomainEvents((events) => {
    for (const e of events) {
      if (e.type !== 'revealFired') continue;
      for (const feature of e.reveals) {
        const app = PHONE_APPS.find((a) => a.revealFeature === feature);
        usePhone.getState().pushNotification({ text: tDynamic(`toast.reveal.${feature}`), source: `reveal:${feature}`, ...(app ? { app: app.id } : {}) });
      }
    }
  });

  return () => {
    offHud();
    offEvents();
  };
}
