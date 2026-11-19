// "Why this number" (Requirement 50.7): the base value of a stat and every active Modifier with its
// source and value, from `explainStat`. Collapsed by default so a Panel stays short (18.8).
import type { DefinitionRegistry, SimState, StatEntry, StatId } from '@hr/sim';
import { explainStat } from '@hr/sim';
import { t, tDynamic } from '../../text/t';
import { Card, Row } from './Card';

/** Every current StatId is in basis points (10000 = 100%). */
export function formatBp(bp: number): string {
  const pct = bp / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}
function formatValue(e: Pick<StatEntry, 'op' | 'value'>): string {
  const sign = e.value > 0 ? '+' : '';
  return e.op === 'addBp' ? `${sign}${formatBp(e.value)}` : `${sign}${e.value}`;
}
/** Readable name of a Modifier source: the Definition's name where there is one, else the kind. */
export function sourceLabel(reg: DefinitionRegistry, source: StatEntry['source']): string {
  const kind = tDynamic(`panel.stat.source.${source.kind}`);
  const nameKey =
    source.kind === 'trait' ? reg.traits[source.id]?.nameKey : source.kind === 'brand' ? reg.brands[source.id]?.nameKey : source.kind === 'recipe' ? reg.recipes[source.id]?.nameKey : undefined;
  return nameKey ? `${kind}: ${tDynamic(nameKey)}` : kind;
}

export function StatBreakdownCard({ reg, state, stat, businessId, recipeId }: { reg: DefinitionRegistry; state: SimState; stat: StatId; businessId: string; recipeId?: string | null }) {
  const target = recipeId === undefined ? { businessId } : { businessId, recipeId };
  const ex = explainStat({ reg, state }, stat, target);
  return (
    <Card title={tDynamic(`panel.stat.${stat}`)}>
      <details className="stat-breakdown">
        <summary>
          <span className="row">
            <span className="row-label">{t('panel.stat.why')}</span>
            <span className="row-value">{formatBp(ex.total)}</span>
          </span>
        </summary>
        <Row label={t('panel.stat.base')} value={formatBp(ex.base)} />
        {ex.entries.map((e, i) => (
          <Row key={i} label={sourceLabel(reg, e.source)} value={formatValue(e)} />
        ))}
        <Row label={t('panel.stat.total')} value={formatBp(ex.total)} />
      </details>
    </Card>
  );
}
