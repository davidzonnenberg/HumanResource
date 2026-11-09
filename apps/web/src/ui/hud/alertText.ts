// Alert type -> text (all via Text_Keys). Merges duplicate "out of beer" rows per object.
import { tDynamic } from '../../text/t';
import { bridge } from '../../store/simBridge';

export interface AlertRow {
  key: string;
  objectId: string;
  text: string;
}

function resourceName(id: string): string {
  const key = bridge.reg?.resources[id]?.nameKey;
  return key ? tDynamic(key) : id;
}

function jobName(id: string): string {
  const key = bridge.reg?.jobs[id]?.nameKey;
  return key ? tDynamic(key) : id;
}

export function alertRows(alerts: { key: string; type: string; objectId: string; variant?: string }[]): AlertRow[] {
  const rows: AlertRow[] = [];
  const seen = new Set<string>();
  for (const a of alerts) {
    const [base, arg] = a.type.split(':') as [string, string | undefined];
    let text: string;
    if (base === 'unstaffed') text = tDynamic('alert.unstaffed', { job: jobName(arg ?? '') });
    else if (base === 'storage_full' || base === 'storage_empty') text = tDynamic(`alert.${base}`, { resource: resourceName(arg ?? '') });
    else if (base === 'lost_customers') text = tDynamic(`alert.lost_customers.${a.variant ?? 'patience_expired'}`);
    else text = tDynamic(`alert.${base}`);
    const dedupe = `${a.objectId}|${text}`;
    if (seen.has(dedupe)) continue;
    // "Out of Beer" and "Beer storage empty" describe the same situation for a Pub
    if (base === 'storage_empty' && alerts.some((x) => x.objectId === a.objectId && x.type === 'out_of_beer')) continue;
    seen.add(dedupe);
    rows.push({ key: a.key, objectId: a.objectId, text });
  }
  return rows;
}
