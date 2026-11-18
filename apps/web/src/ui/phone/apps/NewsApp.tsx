// LinkedOut, minimal (ceo-phone task 1.7b): the existing news list, newest first. Installed by the
// existing `news_feed` reveal feature. LinkedIn-style posts come later (ceo-phone task 6.1).
import { t, tDynamic } from '../../../text/t';
import { useSimSelector } from '../../../store/simBridge';
import { formatElapsed } from '../elapsed';

export function NewsApp() {
  const items = useSimSelector((sim) => ({ news: [...sim.state.news].reverse().slice(0, 30), tick: sim.state.tick, tps: sim.reg.config.ticksPerSecond }));
  if (!items || items.news.length === 0) return <div className="ph-card ph-mut">{t('app.news.empty')}</div>;
  return (
    <>
      {items.news.map((n, i) => (
        <div key={`${n.tick}-${i}`} className="ph-card">
          <div className="ph-mut">{t('app.news.ago', { time: formatElapsed(items.tick - n.tick, items.tps) })}</div>
          <div>{tDynamic(n.textKey, n.params)}</div>
        </div>
      ))}
    </>
  );
}
