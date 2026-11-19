// Fit-out of the Player's Pub (Requirement 64): pick tables, taps and decorations within the Fit_Out_Budget.
// The choice is the `fit_out` Service's params, one count per item. Rejections arrive as toasts.
import { useState } from 'react';
import { goldToWholeFloor, isCeoPresent, type Business, type DefinitionRegistry, type SimState } from '@hr/sim';
import { t, tDynamic } from '../../text/t';
import { useHud } from '../../store/stores';
import { Card, PanelButton, Row } from './Card';
import { useService } from '../panels/panelActions';

export function FitOutCard({ reg, state, b }: { reg: DefinitionRegistry; state: SimState; b: Business }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const service = reg.businesses[b.defId]?.services?.find((s) => Object.keys(s.params ?? {}).some((k) => reg.phase3.fitOutItems[k]));
  if (!service || b.owner !== 'player' || !b.pub) return null;
  const items = Object.values(reg.phase3.fitOutItems);
  const total = items.reduce((n, i) => n + i.price * (counts[i.id] ?? 0), 0);
  const budget = state.player.fitOutBudget;
  const present = isCeoPresent({ reg, state }, b.id);
  const bump = (id: string, d: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(12, (c[id] ?? 0) + d)) }));
  const confirm = () => {
    if (!present) return useHud.getState().pushToast('panel.service.driveThere.toast', { target: b.name });
    useService(b.id, service.id, Object.fromEntries(items.map((i) => [i.id, counts[i.id] ?? 0])));
    setCounts({});
  };
  return (
    <Card title={t('panel.fitOut')}>
      <Row label={t('panel.fitOut.budget')} value={t('panel.price.value', { amount: goldToWholeFloor(budget) })} />
      {items.map((i) => (
        <div key={i.id} className="service-row">
          <Row label={tDynamic(i.nameKey)} value={t('panel.fitOut.item', { price: goldToWholeFloor(i.price), count: counts[i.id] ?? 0 })} />
          <div className="button-row">
            <PanelButton onClick={() => bump(i.id, -1)}>-</PanelButton>
            <PanelButton onClick={() => bump(i.id, 1)}>+</PanelButton>
          </div>
        </div>
      ))}
      <Row label={t('panel.fitOut.total')} value={t('panel.price.value', { amount: goldToWholeFloor(total) })} />
      <PanelButton kind="primary" disabled={total === 0 || total > budget} onClick={confirm}>{t('panel.fitOut.confirm')}</PanelButton>
    </Card>
  );
}
