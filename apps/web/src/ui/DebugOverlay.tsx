// Development overlay (task 38.3): the current Tick and the latest State_Hash. Two devices that
// reach the same Tick must show the same hash; a difference is a divergence to investigate.
import { bridge } from '../store/simBridge';
import { useSimVersion } from '../store/stores';
import { devModeOn } from '../input/actions';
import { t } from '../text/t';

export function DebugOverlay() {
  useSimVersion((s) => s.v); // refresh at the throttled panel rate
  if (!devModeOn()) return null;
  const loop = bridge.loop;
  if (!loop) return null;
  const h = loop.latestHash;
  return (
    <div className="debug-overlay" aria-hidden="true">
      <span>{t('debug.tick', { tick: loop.sim.state.tick })}</span>
      <span>{h ? t('debug.hash', { hash: h.hash, tick: h.tick }) : t('debug.hash.none')}</span>
    </div>
  );
}