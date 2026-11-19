// One stub file per domain op, so later tasks fill separate files (task 36.2).
import type { DomainOp } from '../../defs/vocabulary';
import { applyFitOut } from './applyFitOut';
import { buyTap } from './buyTap';
import { fireRibbon } from './fireRibbon';
import { hireCandidate } from './hireCandidate';
import { occupyStaff } from './occupyStaff';
import { payOffLoan } from './payOffLoan';
import { setLicense } from './setLicense';
import { setSupplyDeal } from './setSupplyDeal';
import { startLoan } from './startLoan';
import type { DomainHandler } from './types';

export type { DomainHandler, EffectContext } from './types';

/** Typed over the closed `DOMAIN_OPS` enum: adding an op without a handler does not compile. */
export const DOMAIN_HANDLERS: Record<DomainOp, DomainHandler> = {
  setLicense,
  startLoan,
  payOffLoan,
  applyFitOut,
  setSupplyDeal,
  buyTap,
  hireCandidate,
  fireRibbon,
  occupyStaff,
};
