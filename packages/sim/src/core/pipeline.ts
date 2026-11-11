// The ordered system pipeline (design: Tick pipeline). Phase 2 systems have reserved slots and
// are no-ops until their tasks land, so adding them never reorders Phase 1 systems.
import type { TickContext } from './context';
import { commandsSystem } from '../commands/dispatch';
import { humansSystem } from '../systems/humans';
import { ceoProximitySystem } from '../systems/ceo';
import { customerArrivalsSystem, customerVisitsSystem, staffSystem } from '../systems/pub';
import { logisticsSystem, sourcingSystem } from '../systems/logistics';
import { financeSystem } from '../systems/finance';
import { alertsSystem, metricsSystem, revealsSystem } from '../systems/observe';
import { schedulerSystem } from './scheduler';

export interface SystemEntry {
  id: string;
  phase: 1 | 2;
  run(ctx: TickContext): void;
}

const noop = (): void => {};

/** Generic production rules. No Phase 1 Business has production rules (Brewery arrives in Phase 2). */
function productionSystem(): void {}

export const PIPELINE: readonly SystemEntry[] = [
  { id: 'clock', phase: 1, run: (ctx) => void (ctx.state.tick += 1) },
  { id: 'commands', phase: 1, run: commandsSystem },
  { id: 'scheduler', phase: 1, run: schedulerSystem },
  { id: 'competitorEvents', phase: 2, run: noop },
  { id: 'market', phase: 2, run: noop },
  { id: 'acquisitions', phase: 2, run: noop },
  { id: 'humans', phase: 1, run: humansSystem },
  { id: 'ceoProximity', phase: 1, run: ceoProximitySystem },
  { id: 'production', phase: 1, run: productionSystem },
  { id: 'customerArrivals', phase: 1, run: customerArrivalsSystem },
  { id: 'staff', phase: 1, run: staffSystem },
  { id: 'customerVisits', phase: 1, run: customerVisitsSystem },
  { id: 'minigames', phase: 2, run: noop },
  { id: 'logistics', phase: 1, run: logisticsSystem },
  { id: 'sourcing', phase: 1, run: sourcingSystem },
  { id: 'questionable', phase: 2, run: noop },
  { id: 'finance', phase: 1, run: financeSystem },
  { id: 'chains', phase: 2, run: noop },
  { id: 'reputation', phase: 2, run: noop },
  { id: 'metrics', phase: 1, run: metricsSystem },
  { id: 'alerts', phase: 1, run: alertsSystem },
  { id: 'reveals', phase: 1, run: revealsSystem },
  { id: 'achievements', phase: 2, run: noop },
];
