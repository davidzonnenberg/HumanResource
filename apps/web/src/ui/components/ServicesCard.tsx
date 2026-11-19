// Services of a Business (Requirement 51.9): each with its cost, a location icon when it needs the
// CEO present, and a "Drive there" hint while the CEO is elsewhere (the Waypoint arrives with task 57.1).
import { goldToWholeFloor, isCeoPresent, type Business, type DefinitionRegistry, type SimState } from '@hr/sim';
import { t, tDynamic } from '../../text/t';
import { useHud } from '../../store/stores';
import { Card, PanelButton, Row } from './Card';
import { useService } from '../panels/panelActions';

export function ServicesCard({ reg, state, b }: { reg: DefinitionRegistry; state: SimState; b: Business }) {
  const services = reg.businesses[b.defId]?.services ?? [];
  if (services.length === 0 || (b.owner !== 'player' && b.owner !== 'npc')) return null;
  const present = isCeoPresent({ reg, state }, b.id);
  return (
    <Card title={t('panel.services')}>
      {services.map((s) => {
        const used = (state.servicesUsed?.[s.id] ?? 0) > 0;
        const away = s.access === 'presence' && !present;
        const needsChoice = Object.keys(s.params ?? {}).length > 0;
        return (
          <div key={s.id} className="service-row">
            <Row
              label={
                <>
                  {s.access === 'presence' && (
                    <span aria-label={t('panel.service.presence')} title={t('panel.service.presence')}>
                      📍{' '}
                    </span>
                  )}
                  {tDynamic(s.nameKey)}
                </>
              }
              value={s.cost > 0 ? t('panel.price.value', { amount: goldToWholeFloor(s.cost) }) : t('panel.service.free')}
            />
            {away && (
              <PanelButton onClick={() => useHud.getState().pushToast('panel.service.driveThere.toast', { target: b.name })}>{t('panel.service.driveThere')}</PanelButton>
            )}
            {!away && needsChoice && <span className="row-label">{t('panel.service.needsChoice')}</span>}
            {!away && !needsChoice && (
              <PanelButton kind="primary" disabled={s.once === true && used} onClick={() => useService(b.id, s.id)}>
                {s.once === true && used ? t('panel.service.done') : t('panel.service.use')}
              </PanelButton>
            )}
          </div>
        );
      })}
    </Card>
  );
}