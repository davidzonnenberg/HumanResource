// Job_Slot picker (7.16, 7.23): lists every Workforce Human with state; tap assigns. Also offers
// "leave empty" to unassign the current occupant.
import { displayName, type DefinitionRegistry, type SimState } from '@hr/sim';
import { t, tDynamic } from '../../text/t';
import { Panel, PanelButton } from '../components/Card';
import { assign, unassign } from './panelActions';

export function SlotPicker({ reg, state, picking, onClose }: { reg: DefinitionRegistry; state: SimState; picking: { kind: 'business' | 'vehicle'; id: string; slotId: string }; onClose: () => void }) {
  const holder = picking.kind === 'business' ? state.businesses[picking.id] : state.vehicles[picking.id];
  const slot = holder?.jobSlots.find((s) => s.slotId === picking.slotId);
  if (!holder || !slot) return null;
  const jobName = tDynamic(reg.jobs[slot.jobId]?.nameKey ?? slot.jobId);
  const workforce = Object.values(state.humans).filter((h) => h.owner === 'player');
  const occupant = slot.filledBy?.kind === 'human' ? slot.filledBy.humanId : null;

  return (
    <Panel title={t('panel.slot.pick', { job: jobName })} onClose={onClose}>
      <div className="card-list vertical">
        {workforce.map((h) => (
          <button
            key={h.id}
            className={`slot-row ${occupant === h.id ? 'current' : ''}`}
            onClick={() => {
              assign(h.id, picking);
              onClose();
            }}
          >
            <span className="slot-job">{displayName(h)}</span>
            <span className="slot-fill">{t(`panel.human.state.${h.status}` as Parameters<typeof t>[0])}</span>
          </button>
        ))}
        {workforce.length === 0 && <p>{t('panel.workforce')}</p>}
        {occupant && (
          <PanelButton kind="danger" onClick={() => { unassign(occupant); onClose(); }}>
            {t('panel.slot.unassign')}
          </PanelButton>
        )}
      </div>
    </Panel>
  );
}


