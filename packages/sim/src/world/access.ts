// Access tags (Requirement 51.5): `remote` works from anywhere; `presence` needs the CEO at the
// Business door or inside. Shared by Services and by settings tagged `presence` in settings.json.
import { dist2d } from '../core/math';
import type { Rejection } from '../commands/types';
import type { DefinitionRegistry } from '../defs/registry';
import type { SimState } from '../state/types';
import { entrance } from './geometry';

export type AccessTag = 'remote' | 'presence';

/** The CEO is inside the Business, or on foot within Interaction_Range of its door. */
export function isCeoPresent(env: { state: SimState; reg: DefinitionRegistry }, businessId: string): boolean {
  const { ceo } = env.state;
  if (ceo.insideBusinessId === businessId) return true;
  if (ceo.drivingVehicleId || ceo.insideBusinessId) return false;
  const b = env.state.businesses[businessId];
  if (!b) return false;
  const door = entrance(env.reg, b.plotId);
  return dist2d(ceo.x, ceo.z, door.x, door.z) <= env.reg.config.interactionRange + 1;
}

/** `not_present` when the tag is `presence` and the CEO is not there; null otherwise. */
export function requireAccess(env: { state: SimState; reg: DefinitionRegistry }, access: AccessTag, businessId: string): Rejection | null {
  return access === 'presence' && !isCeoPresent(env, businessId) ? { reason: 'not_present' } : null;
}
