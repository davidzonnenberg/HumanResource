// Commands: every external influence enters the Simulation as one of these, applied at the next
// Tick boundary (Requirement 2.7). Phase 2 shapes exist so the union never needs a breaking change.
import type { Gold, Id, JobSlotRef } from '../state/types';
import type { SourcingPolicy } from '../defs/schemas';

export type Issuer = 'player' | 'physics' | 'ui' | 'system';

export interface RouteStopInput {
  businessId: Id;
  action: 'pickup' | 'dropoff';
  resources?: string[] | 'all';
}

export type Command =
  // Human allocation (Requirement 7)
  | { type: 'hire' }
  | { type: 'assign'; humanId: Id; target: JobSlotRef }
  | { type: 'unassign'; humanId: Id }
  | { type: 'fire'; humanId: Id }
  // Pub and supply (Requirements 6, 10)
  | { type: 'setDrinkPrice'; businessId: Id; price: Gold }
  | { type: 'placeOrder'; supplierId: Id; destinationId: Id; resourceId: string; quantity: number }
  | { type: 'setAutoReorder'; businessId: Id; resourceId: string; enabled: boolean; threshold: number }
  // Routes and vehicles (Requirements 12, 13)
  | { type: 'setRoute'; vehicleId: Id; stops: RouteStopInput[]; waitSeconds?: number }
  | { type: 'resumeRoute'; vehicleId: Id }
  | { type: 'startManualDriving'; vehicleId: Id }
  | { type: 'manualVehicleUpdate'; vehicleId: Id; x: number; z: number; heading: number; speed: number }
  | { type: 'manualLoad'; vehicleId: Id; businessId: Id }
  | { type: 'manualUnload'; vehicleId: Id; businessId: Id }
  | { type: 'endManualDriving'; vehicleId: Id }
  | { type: 'resetVehicle'; vehicleId: Id; x: number; z: number; heading: number }
  // CEO (Requirements 14, 15)
  | { type: 'ceoMove'; dx: number; dz: number }
  | { type: 'ceoEnter'; businessId: Id }
  | { type: 'ceoExit' }
  | { type: 'uiEvent'; event: 'managementViewOpened' }
  // Districts (Requirement 48) - system issuer only
  | { type: 'unlockDistrict'; districtId: string }
  // Phase 2 (handlers arrive with Phase 2 tasks; rejected with not_available until then)
  | { type: 'buyPlot'; plotId: Id }
  | { type: 'construct'; plotId: Id; businessDefId: string }
  | { type: 'acquireWarehouse'; plotId: Id; mode: 'buy' | 'rent' }
  | { type: 'endRental'; businessId: Id }
  | { type: 'setSourcingPolicy'; businessId: Id; resourceId: string; policy: SourcingPolicy }
  | { type: 'marketBuy'; resourceId: string; quantity: number }
  | { type: 'acceptAcquisition'; offerId: Id }
  | { type: 'setProductionRecipe'; businessId: Id; recipeId: string }
  | { type: 'startQuestionable'; opportunityId: Id; humanIds: Id[]; destinationId: Id }
  | { type: 'completeMinigame'; minigameId: string; businessId: Id; score: number };

export type CommandType = Command['type'];

export interface CommandEnvelope {
  seq: number;
  issuer: Issuer;
  cmd: Command;
}

export type ReasonCode =
  | 'insufficient_gold'
  | 'invalid_price'
  | 'invalid_quantity'
  | 'invalid_threshold'
  | 'invalid_route'
  | 'not_owner'
  | 'slot_occupied'
  | 'human_occupied'
  | 'unknown_entity'
  | 'not_in_range'
  | 'not_stopped'
  | 'vehicle_not_manual'
  | 'storage_not_empty'
  | 'insufficient_humans'
  | 'nothing_to_load'
  | 'nothing_to_unload'
  | 'offer_expired'
  | 'district_locked'
  | 'not_qualified'
  | 'not_allowed'
  | 'not_available';

export type CommandResult =
  | { seq: number; type: CommandType; ok: true }
  | { seq: number; type: CommandType; ok: false; reason: ReasonCode; missingGold?: Gold; field?: string };

/** What a handler returns. `null` = accepted. */
export type Rejection = { reason: ReasonCode; missingGold?: Gold; field?: string };
