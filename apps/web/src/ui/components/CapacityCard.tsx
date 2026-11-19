// Seats, Taps and Hands as three bars; the lowest relative bar is the bottleneck (56.2).
import { pubCapacity, type Business, type CapacityKind, type DefinitionRegistry, type SimState } from '@hr/sim';
import { t, tDynamic } from '../../text/t';
import { setPubOpen, setWorkerPace } from '../panels/panelActions';
import { Bar, Card, PanelButton, Row } from './Card';

const KINDS: readonly CapacityKind[] = ['seats', 'taps', 'hands'];
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function CapacityCard({ reg, state, b }: { reg: DefinitionRegistry; state: SimState; b: Business }) {
  const cap = pubCapacity({ reg, state }, b);
  if (!cap || !b.pub) return null;
  const owned = b.owner === 'player';
  const open = b.pub.open !== false;
  return (
    <Card title={t('panel.capacity')}>
      {KINDS.map((k) => (
        <div key={k}>
          <Row label={tDynamic(`panel.capacity.${k}`)} value={t('panel.capacity.value', { have: fmt(cap[k]), need: fmt(cap.load[k]) })} />
          <Bar amount={Math.min(1, cap.ratio[k])} capacity={1} over={cap.bottleneck === k} />
        </div>
      ))}
      <Row label={cap.bottleneck ? t('panel.capacity.bottleneck', { what: tDynamic(`panel.capacity.${cap.bottleneck}`) }) : t('panel.capacity.none')} value="" />
      {owned && (
        <>
          <Row label={t('panel.pace')} value={tDynamic(`panel.pace.${b.pub.pace}`)} />
          <div className="button-row">
            {Object.keys(reg.config.paces).map((p) => (
              <PanelButton key={p} kind={b.pub?.pace === p ? 'primary' : 'default'} onClick={() => setWorkerPace(b.id, p)}>
                {tDynamic(`panel.pace.${p}`)}
              </PanelButton>
            ))}
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={open} onChange={(e) => setPubOpen(b.id, e.target.checked)} />
            {t(open ? 'panel.pub.open' : 'panel.pub.closed')}
          </label>
        </>
      )}
    </Card>
  );
}
