// Pub Panel (6.4, 6.7, 9.2, 9.5, 10.3, 10.8, 15.10): storage, metrics, staffing, drink price,
// hire (gated by the hiring reveal), auto-reorder and placing an Order.
import { useState } from 'react';
import { displayName, goldToWholeFloor, isRevealed, pubMetricsView, storageCapacity, supplierFor, type Business, type DefinitionRegistry, type SimState } from '@hr/sim';
import { t, tDynamic } from '../../text/t';
import { bridge } from '../../store/simBridge';
import { useUi } from '../../store/stores';
import { Bar, Card, Panel, PanelButton, Row } from '../components/Card';
import { hire, placeOrder, setAutoReorder, setDrinkPrice } from './panelActions';

export function PubPanel({ reg, state, b, onClose }: { reg: DefinitionRegistry; state: SimState; b: Business; onClose: () => void }) {
  const def = reg.businesses[b.defId];
  const pub = def?.pub;
  if (!def || !pub || !b.pub) return null;
  const owned = b.owner === 'player';
  const metrics = pubMetricsView(reg, state, b.id);
  const res = pub.drinkResource;
  const stock = b.storage[res];
  const cap = storageCapacity(reg, b, res);
  const hiringRevealed = isRevealed(state, reg, 'hiring');
  const ar = b.autoReorder[res];
  const offer = supplierFor(reg, state, res);
  const priceStep = 50;

  return (
    <Panel title={b.name} onClose={onClose}>
      <Card title={t('panel.storage')}>
        <Row label={tDynamic(reg.resources[res]?.nameKey ?? res)} value={stock && stock.amount > cap ? t('panel.storage.over') : t('panel.storage.amount', { resource: '', amount: stock?.amount ?? 0, capacity: cap }).trim()} />
        <Bar amount={stock?.amount ?? 0} capacity={cap} over={(stock?.amount ?? 0) > cap} />
      </Card>

      {metrics && (
        <Card title={t('panel.metrics')}>
          <Row label={t('panel.metrics.arrivals', { value: '' }).replace('{value}', '').trim()} value={metrics.arrivalsPerMinute.toFixed(1)} />
          <Row label={t('panel.staff')} value={`${metrics.serviceHumans} / ${metrics.recommendedServiceHumans}`} />
          <Row label={t('panel.metrics.wait', { value: '' }).replace('{value}', '').trim()} value={metrics.averageWaitSeconds.toFixed(0)} />
          <Row label={t('panel.metrics.lost', { value: '' }).replace('{value}', '').trim()} value={`${metrics.lostPct.toFixed(0)}%`} />
        </Card>
      )}

      {owned && (
        <Card title={t('panel.price')}>
          <Row label={t('panel.price')} value={t('panel.price.value', { amount: goldToWholeFloor(b.pub.drinkPrice) })} />
          <div className="button-row">
            <PanelButton onClick={() => setDrinkPrice(b.id, Math.max(pub.minDrinkPrice, b.pub!.drinkPrice - priceStep))}>{t('panel.price.down')}</PanelButton>
            <PanelButton onClick={() => setDrinkPrice(b.id, Math.min(pub.maxDrinkPrice, b.pub!.drinkPrice + priceStep))}>{t('panel.price.up')}</PanelButton>
          </div>
        </Card>
      )}

      {owned && (
        <Card title={t('panel.staff')}>
          {def.humanRequirements.map((hr) =>
            b.jobSlots
              .filter((s) => s.jobId === hr.jobId)
              .map((slot) => {
                const fill = slot.filledBy;
                const human = fill?.kind === 'human' ? state.humans[fill.humanId] : null;
                const label = fill?.kind === 'headcount' ? t('panel.slot.headcount', { count: fill.count }) : human ? t('panel.slot.human', { name: displayName(human), state: t(`panel.human.state.${human.status}` as Parameters<typeof t>[0]) }) : t('panel.slot.empty');
                return (
                  <button key={slot.slotId} className="slot-row" onClick={() => useUi.getState().set({ pickingSlot: { kind: 'business', id: b.id, slotId: slot.slotId } })}>
                    <span className="slot-job">{tDynamic(reg.jobs[hr.jobId]?.nameKey ?? hr.jobId)}</span>
                    <span className="slot-fill">{label}</span>
                  </button>
                );
              }),
          )}
          {hiringRevealed && <PanelButton kind="primary" onClick={hire}>{t('panel.hireCost', { amount: goldToWholeFloor(hireCost(reg)) })}</PanelButton>}
        </Card>
      )}

      {owned && cap > 0 && (
        <Card title={t('panel.autoReorder')}>
          <label className="toggle-row">
            <input type="checkbox" checked={ar?.enabled ?? false} onChange={(e) => setAutoReorder(b.id, res, e.target.checked, ar?.threshold ?? Math.floor(cap / 2))} />
            {t(ar?.enabled ? 'panel.autoReorder.on' : 'panel.autoReorder.off')}
          </label>
          {ar && (
            <>
              <Row label={t('panel.autoReorder.threshold', { value: ar.threshold })} value={`${Math.round((ar.threshold / cap) * 100)}%`} />
              <input type="range" min={0} max={cap} value={ar.threshold} onChange={(e) => setAutoReorder(b.id, res, ar.enabled, Number(e.target.value))} />
            </>
          )}
          {offer && <OrderForm onOrder={(q) => placeOrder(offer.supplier.id, b.id, res, q)} unitPrice={offer.unitPrice} max={Math.max(1, cap - (stock?.amount ?? 0))} />}
        </Card>
      )}
    </Panel>
  );
}

function OrderForm({ onOrder, unitPrice, max }: { onOrder: (qty: number) => void; unitPrice: number; max: number }) {
  const [qty, setQty] = useState(Math.min(max, Math.ceil(max / 2)));
  const resId = bridge.reg ? Object.keys(bridge.reg.resources)[0] : undefined;
  return (
    <div className="order-form">
      <input type="number" min={1} max={max} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
      <PanelButton onClick={() => onOrder(qty)}>{t('panel.order', { qty, resource: resId ? tDynamic(bridge.reg?.resources[resId]?.nameKey ?? resId) : '', amount: goldToWholeFloor(unitPrice * qty) })}</PanelButton>
    </div>
  );
}

function hireCost(reg: DefinitionRegistry): number {
  const h = reg.humans.regular ?? Object.values(reg.humans)[0];
  return h ? Math.ceil(h.salaryPerMinute * h.hiring.minutes * h.hiring.factor) : 0;
}
