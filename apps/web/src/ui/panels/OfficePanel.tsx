// The counter screen of an office (Requirement 60.3, 60.5): a plain Panel with the office's Services.
// The full Desk arrives with task 60. The ticket queue is shown from the first visit and runs on game time,
// so pressing the Context_Action again never shortens it.
import type { ReactNode } from 'react';
import { officeVisitKey, type Business, type DefinitionRegistry, type SimState } from '@hr/sim';
import { t } from '../../text/t';
import { Card, Panel, Row } from '../components/Card';
import { ServicesCard } from '../components/ServicesCard';

const SECONDS_PER_TICKET = 2;

export function OfficePanel({ reg, state, b, onClose }: { reg: DefinitionRegistry; state: SimState; b: Business; onClose: () => void }) {
  const def = reg.businesses[b.defId];
  const tickets = def?.office?.queueTickets;
  const firstVisit = state.counters?.[officeVisitKey(b.defId)];
  let queue: ReactNode = null;
  if (tickets !== undefined && firstVisit !== undefined) {
    const serving = Math.min(tickets, Math.floor((state.tick - (firstVisit - 1)) / (reg.config.ticksPerSecond * SECONDS_PER_TICKET)));
    queue = (
      <Card title={t('panel.office.queue')}>
        <Row label={t('panel.office.ticket')} value={String(tickets)} />
        <Row label={t('panel.office.serving')} value={String(serving)} />
        {serving >= tickets && <p>{t('panel.office.yourTurn')}</p>}
      </Card>
    );
  }
  return (
    <Panel title={b.name} onClose={onClose}>
      {queue}
      <ServicesCard reg={reg} state={state} b={b} />
    </Panel>
  );
}
