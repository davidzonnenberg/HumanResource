// Invariant checker used by tests, dev builds (every Tick) and production (every 100 Ticks).
import type { DefinitionRegistry } from '../defs/registry';
import { GOLD_LIMIT } from '../money/gold';
import { lotsTotal } from '../storage/stock';
import type { SimState } from '../state/types';
import { cargoTotal, storageCapacity } from '../world/queries';

export interface InvariantViolation {
  code: string;
  path: string;
  message: string;
}

/** Physical Resource totals: Storage + cargo + reserved Orders. */
export function physicalTotals(state: SimState): Record<string, number> {
  const t: Record<string, number> = {};
  const add = (r: string, n: number): void => void (t[r] = (t[r] ?? 0) + n);
  for (const b of Object.values(state.businesses)) for (const [r, s] of Object.entries(b.storage)) add(r, s.amount);
  for (const v of Object.values(state.vehicles)) for (const [r, s] of Object.entries(v.cargo)) add(r, s.amount);
  for (const o of Object.values(state.orders)) add(o.resourceId, o.remaining);
  return t;
}

export function checkInvariants(state: SimState, reg: DefinitionRegistry, opts: { capacity?: boolean } = {}): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const v = (code: string, path: string, message: string): void => void out.push({ code, path, message });

  for (const b of Object.values(state.businesses)) {
    for (const [r, s] of Object.entries(b.storage)) {
      if (s.amount < 0) v('storage_negative', `businesses.${b.id}.storage.${r}`, 'negative amount');
      if (lotsTotal(s.lots) !== s.amount) v('stock_lots_mismatch', `businesses.${b.id}.storage.${r}`, 'amount != sum(lots)');
      if (opts.capacity !== false && s.amount > storageCapacity(reg, b, r)) v('storage_over_capacity', `businesses.${b.id}.storage.${r}`, 'above capacity');
    }
    for (const slot of b.jobSlots) checkSlot(state, 'business', b.id, slot, v);
  }
  for (const veh of Object.values(state.vehicles)) {
    for (const [r, s] of Object.entries(veh.cargo)) if (lotsTotal(s.lots) !== s.amount) v('stock_lots_mismatch', `vehicles.${veh.id}.cargo.${r}`, 'amount != sum(lots)');
    const cap = reg.vehicles[veh.defId]?.capacity ?? 0;
    if (cargoTotal(veh) > cap) v('cargo_over_capacity', `vehicles.${veh.id}.cargo`, 'cargo above capacity');
    for (const slot of veh.jobSlots) checkSlot(state, 'vehicle', veh.id, slot, v);
    if (veh.routeId && !state.routes[veh.routeId]) v('missing_route', `vehicles.${veh.id}.routeId`, 'unknown route');
  }
  for (const h of Object.values(state.humans)) {
    const ref = h.assignment;
    if (!ref) continue;
    const holder = ref.kind === 'business' ? state.businesses[ref.id] : state.vehicles[ref.id];
    const slot = holder?.jobSlots.find((s) => s.slotId === ref.slotId);
    if (!slot || slot.filledBy?.kind !== 'human' || slot.filledBy.humanId !== h.id) v('slot_link_broken', `humans.${h.id}.assignment`, 'slot does not point back');
  }
  for (const c of Object.values(state.customers)) {
    const pub = state.businesses[c.pubId]?.pub;
    if (!pub) v('customer_without_pub', `customers.${c.id}`, 'unknown pub');
    else if (c.state !== 'leaving' && pub.seats[c.seat] !== c.id) v('seat_link_broken', `customers.${c.id}.seat`, 'seat does not point back');
  }
  // Conservation (2.11): physical totals equal the running ledger totals.
  const phys = physicalTotals(state);
  for (const r of new Set([...Object.keys(phys), ...Object.keys(state.resourceTotals)]))
    if ((phys[r] ?? 0) !== (state.resourceTotals[r] ?? 0)) v('conservation', `resourceTotals.${r}`, `physical ${phys[r] ?? 0} != ledger ${state.resourceTotals[r] ?? 0}`);
  // Gold safe-integer limit (8.10)
  out.push(...checkGoldLimit(state));
  return out;
}

export function checkGoldLimit(state: SimState): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const check = (path: string, g: number): void => {
    if (!Number.isInteger(g) || Math.abs(g) > GOLD_LIMIT) out.push({ code: 'gold_limit_exceeded', path, message: `Gold value ${g} outside ±2^50 hundredths` });
  };
  check('player.gold', state.player.gold);
  for (const b of Object.values(state.businesses)) if (b.pub) check(`businesses.${b.id}.pub.drinkPrice`, b.pub.drinkPrice);
  state.finance.buckets.forEach((bk, i) => {
    for (const [k, g] of Object.entries(bk.byKey)) check(`finance.buckets.${i}.byKey.${k}`, g);
  });
  for (const p of Object.values(state.plots)) if (p.price !== null) check(`plots.${p.id}.price`, p.price);
  return out;
}

function checkSlot(
  state: SimState,
  kind: 'business' | 'vehicle',
  holderId: string,
  slot: { slotId: string; filledBy: { kind: 'human'; humanId: string } | { kind: 'headcount'; count: number; humanDefId: string } | null },
  v: (code: string, path: string, message: string) => void,
): void {
  if (slot.filledBy?.kind !== 'human') return;
  const h = state.humans[slot.filledBy.humanId];
  if (!h || !h.assignment || h.assignment.kind !== kind || h.assignment.id !== holderId || h.assignment.slotId !== slot.slotId)
    v('slot_link_broken', `${kind}s.${holderId}.jobSlots.${slot.slotId}`, 'human does not point back');
}
