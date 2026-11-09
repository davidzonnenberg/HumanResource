// Human, Vehicle, Supplier, Competitor, Plot, Customer and Finance panels (8.3, 10.1, 11.6,
// 12.1, 13.13, 14.5, 14.6, 17.4). Derived numbers come from @hr/sim selectors.
import { useState } from 'react';
import {
  cargoTotal,
  displayName,
  financeSummary,
  goldToWholeFloor,
  vehicleDeliveriesPerMinute,
  type Business,
  type DefinitionRegistry,
  type Human,
  type SimState,
  type Vehicle,
} from '@hr/sim';
import { t, tDynamic } from '../../text/t';
import { useUi } from '../../store/stores';
import { Card, Panel, PanelButton, Row } from '../components/Card';
import { fire, resumeRoute, setRoute, unassign } from './panelActions';

export function HumanPanel({ reg, state, human, onClose }: { reg: DefinitionRegistry; state: SimState; human: Human; onClose: () => void }) {
  const def = reg.humans[human.defId];
  const job = human.assignment
    ? (human.assignment.kind === 'business' ? state.businesses[human.assignment.id] : state.vehicles[human.assignment.id])?.jobSlots.find((s) => s.slotId === human.assignment?.slotId)?.jobId
    : null;
  return (
    <Panel title={displayName(human)} onClose={onClose}>
      <Card>
        <Row label={t('panel.human.job', { job: '' }).replace('{job}', '').trim()} value={job ? tDynamic(reg.jobs[job]?.nameKey ?? job) : t('panel.human.noJob')} />
        <Row label={t('panel.human.state.working')} value={t(`panel.human.state.${human.status}` as Parameters<typeof t>[0])} />
        <Row label={t('panel.human.salary', { amount: '' }).replace('{amount}', '').trim()} value={goldToWholeFloor(def?.salaryPerMinute ?? 0)} />
      </Card>
      {human.owner === 'player' && (
        <Card>
          {human.assignment && <PanelButton onClick={() => { unassign(human.id); }}>{t('panel.slot.unassign')}</PanelButton>}
          <PanelButton kind="danger" onClick={() => { fire(human.id); onClose(); }}>
            {t('panel.human.fire', { amount: goldToWholeFloor(def?.severance ?? 0) })}
          </PanelButton>
        </Card>
      )}
    </Panel>
  );
}

function routeText(reg: DefinitionRegistry, state: SimState, v: Vehicle): string {
  if (!v.routeId) return t('panel.vehicle.noRoute');
  const r = state.routes[v.routeId];
  if (!r) return t('panel.vehicle.noRoute');
  return r.stops.map((s) => state.businesses[s.businessId]?.name ?? '?').join(' → ');
}

export function VehiclePanel({ reg, state, v, onClose }: { reg: DefinitionRegistry; state: SimState; v: Vehicle; onClose: () => void }) {
  const def = reg.vehicles[v.defId];
  const driverJobId = def?.driverRequirement?.jobId;
  const driverSlot = v.jobSlots.find((s) => s.jobId === driverJobId) ?? v.jobSlots[0];
  const driverHuman = driverSlot?.filledBy?.kind === 'human' ? state.humans[driverSlot.filledBy.humanId] : null;
  const owned = v.owner === 'player';
  const status = v.control === 'manual' ? 'manual' : v.control === 'parked' ? 'parked' : 'auto';
  // Re-drive is possible when the van is parked or has a suspended route but still has its route.
  const canResume = owned && !!v.routeId && v.control !== 'manual' && (v.routeSuspended || v.control === 'parked');
  return (
    <Panel title={tDynamic(v.name)} onClose={onClose}>
      <Card>
        <Row label={t('panel.vehicle.status.auto').replace(/:.*/, '')} value={t(`panel.vehicle.status.${status}` as Parameters<typeof t>[0])} />
        <Row label={t('panel.vehicle.capacity', { value: '' }).replace('{value}', '').trim()} value={`${cargoTotal(v)} / ${def?.capacity ?? 0}`} />
        <Row label={t('panel.vehicle.deliveries', { value: '' }).replace('{value}', '').trim()} value={vehicleDeliveriesPerMinute(state, v.id, reg.config.ticksPerSecond).toFixed(1)} />
        <Row label={t('panel.vehicle.route', { stops: '' }).replace('{stops}', '').trim()} value={routeText(reg, state, v)} />
      </Card>
      {owned && (
        <Card title={t('panel.vehicle.driver', { name: '' }).replace('{name}', '').replace(':', '').trim()}>
          {driverSlot && (
            <button className="slot-row" onClick={() => useUi.getState().set({ pickingSlot: { kind: 'vehicle', id: v.id, slotId: driverSlot.slotId } })}>
              <span className="slot-job">{tDynamic(reg.jobs[driverSlot.jobId]?.nameKey ?? driverSlot.jobId)}</span>
              <span className="slot-fill">{driverHuman ? displayName(driverHuman) : t('panel.vehicle.noDriver')}</span>
            </button>
          )}
          {canResume && <PanelButton kind="primary" onClick={() => resumeRoute(v.id)}>{t('panel.vehicle.resume')}</PanelButton>}
        </Card>
      )}
      {owned && (
        <Card>
          <RouteEditor reg={reg} state={state} v={v} />
        </Card>
      )}
    </Panel>
  );
}

/** Minimal route editor: pick a pickup business and a drop-off business from player-owned/NPC. */
function RouteEditor({ reg, state, v }: { reg: DefinitionRegistry; state: SimState; v: Vehicle }) {
  const stops = v.routeId ? (state.routes[v.routeId]?.stops ?? []) : [];
  const pickupInit = stops.find((s) => s.action === 'pickup')?.businessId ?? '';
  const dropInit = stops.find((s) => s.action === 'dropoff')?.businessId ?? '';
  const [pickup, setPickup] = useState(pickupInit);
  const [drop, setDrop] = useState(dropInit);
  const options = Object.values(state.businesses).filter((b) => (b.owner === 'player' || b.owner === 'npc') && state.districts[reg.world.plots[b.plotId]?.districtId ?? '']?.unlocked);
  const label = (b: Business) => b.name;
  return (
    <div className="route-editor">
      <select value={pickup} onChange={(e) => setPickup(e.target.value)}>
        <option value="">—</option>
        {options.map((b) => (
          <option key={b.id} value={b.id}>
            {label(b)}
          </option>
        ))}
      </select>
      <select value={drop} onChange={(e) => setDrop(e.target.value)}>
        <option value="">—</option>
        {options
          .filter((b) => b.owner === 'player')
          .map((b) => (
            <option key={b.id} value={b.id}>
              {label(b)}
            </option>
          ))}
      </select>
      <PanelButton
        disabled={!pickup || !drop || pickup === drop}
        onClick={() =>
          setRoute(v.id, [
            { businessId: pickup, action: 'pickup' },
            { businessId: drop, action: 'dropoff' },
          ])
        }
      >
        {t('panel.vehicle.route', { stops: '↻' })}
      </PanelButton>
    </div>
  );
}

export function SupplierPanel({ reg, state, b, onClose }: { reg: DefinitionRegistry; state: SimState; b: Business; onClose: () => void }) {
  const def = reg.businesses[b.defId];
  const orders = Object.values(state.orders).filter((o) => o.sourceId === b.id && o.owner === 'player');
  return (
    <Panel title={b.name} onClose={onClose}>
      <Card>
        {def?.supplier?.sells.map((s) => (
          <Row key={s.resourceId} label={tDynamic(reg.resources[s.resourceId]?.nameKey ?? s.resourceId)} value={t('panel.supplier.price', { resource: '', amount: goldToWholeFloor(s.unitPrice) }).replace(': ', '')} />
        ))}
        <Row label={t('panel.supplier.orders', { value: '' }).replace('{value}', '').trim()} value={orders.reduce((n, o) => n + o.remaining, 0)} />
      </Card>
    </Panel>
  );
}

export function CompetitorPanel({ reg, state, b, onClose }: { reg: DefinitionRegistry; state: SimState; b: Business; onClose: () => void }) {
  const pop = reg.businesses[b.defId]?.pub ? popularity(reg, state, b.id) : 'medium';
  return (
    <Panel title={b.name} onClose={onClose}>
      <Card title={t('panel.owner.competitor', { name: tDynamic(state.competitors[b.owner]?.nameKey ?? b.owner) })}>
        <Row label={t('panel.competitor.popularity', { value: '' }).replace('{value}', '').trim()} value={t(`panel.competitor.popularity.${pop}` as Parameters<typeof t>[0])} />
        {b.pub && <Row label={t('panel.price')} value={t('panel.price.value', { amount: goldToWholeFloor(b.pub.drinkPrice) })} />}
      </Card>
    </Panel>
  );
}

function popularity(reg: DefinitionRegistry, state: SimState, id: string): 'low' | 'medium' | 'high' {
  const m = state.metrics.pubs[id];
  if (!m) return 'medium';
  const now = Math.floor(state.tick / reg.config.ticksPerSecond);
  let sum = 0;
  for (let i = 0; i < m.arrivals.size; i++) if ((m.arrivals.secs[i] ?? -1) > now - m.arrivals.size) sum += m.arrivals.values[i] ?? 0;
  const perMin = (sum * 60) / Math.max(1, Math.min(m.arrivals.size, now + 1));
  const bands = reg.config.popularityBands;
  return perMin < bands.low ? 'low' : perMin > bands.high ? 'high' : 'medium';
}

export function PlotPanel({ reg, state, plotId, onClose }: { reg: DefinitionRegistry; state: SimState; plotId: string; onClose: () => void }) {
  const p = state.plots[plotId];
  const def = reg.world.plots[plotId]?.def;
  if (!p || !def) return null;
  const locked = !state.districts[p.districtId]?.unlocked;
  return (
    <Panel title={t('panel.plot.empty')} onClose={onClose}>
      <Card>
        <Row label={t('panel.plot.empty')} value={locked ? t('panel.plot.locked') : p.status === 'for_sale' ? t('panel.plot.forSale', { amount: goldToWholeFloor(p.price ?? 0) }) : t('panel.plot.empty')} />
      </Card>
    </Panel>
  );
}

export function CustomerPanel({ state, customerId, onClose }: { reg: DefinitionRegistry; state: SimState; customerId: string; onClose: () => void }) {
  const c = state.customers[customerId];
  if (!c) return null;
  return (
    <Panel title={t('panel.customer.state', { state: t(`customer.state.${c.state}` as Parameters<typeof t>[0]) })} onClose={onClose}>
      <Card>
        <Row label={t('panel.customer.drinks', { value: '' }).replace('{value}', '').trim()} value={c.drinksConsumed} />
      </Card>
    </Panel>
  );
}

export function FinancePanel({ reg, state, onClose }: { reg: DefinitionRegistry; state: SimState; onClose: () => void }) {
  const f = financeSummary(state, reg.config.ticksPerSecond, 5 * 60);
  const cats = Object.entries(f.byCategory).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return (
    <Panel title={t('panel.finance')} onClose={onClose}>
      <Card>
        <Row label={t('panel.finance.income', { amount: '' }).replace('{amount}', '').trim()} value={goldToWholeFloor(f.income)} />
        <Row label={t('panel.finance.expenses', { amount: '' }).replace('{amount}', '').trim()} value={goldToWholeFloor(f.expenses)} />
      </Card>
      <Card>
        {cats.map(([cat, v]) => (
          <Row key={cat} label={tDynamic(`finance.${cat}`)} value={goldToWholeFloor(v)} />
        ))}
      </Card>
    </Panel>
  );
}
