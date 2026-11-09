// Domain events: Tick output for the UI, News_Feed, reveals and renderer effects. Not saved.
import type { Gold, Id, LostReason, NewsItem, OwnerId } from '../state/types';

export type DomainEvent =
  | { type: 'customerArrived'; pubId: Id; owner: OwnerId }
  | { type: 'customerLost'; pubId: Id; owner: OwnerId; reason: LostReason }
  | { type: 'drinkPoured'; pubId: Id; owner: OwnerId }
  | { type: 'drinkServed'; pubId: Id; owner: OwnerId; customerId: Id }
  | { type: 'customerPaid'; pubId: Id; owner: OwnerId; amount: Gold }
  | { type: 'storageFull'; businessId: Id; owner: OwnerId; resourceId: string }
  | { type: 'storageEmpty'; businessId: Id; owner: OwnerId; resourceId: string }
  | { type: 'vehicleLoaded'; vehicleId: Id; owner: OwnerId; businessId: Id; resourceId: string; qty: number }
  | { type: 'vehicleUnloaded'; vehicleId: Id; owner: OwnerId; businessId: Id; resourceId: string; qty: number }
  | { type: 'manualTip'; vehicleId: Id; owner: OwnerId; amount: Gold }
  | { type: 'humanHired'; humanId: Id; owner: OwnerId }
  | { type: 'humanFired'; humanId: Id; owner: OwnerId }
  | { type: 'humanArrived'; humanId: Id; owner: OwnerId }
  | { type: 'orderPlaced'; orderId: Id; owner: OwnerId; qty: number }
  | { type: 'revealFired'; triggerId: string; reveals: string[] }
  | { type: 'districtUnlocked'; districtId: string }
  | { type: 'uiManagementViewOpened' }
  | { type: 'news'; item: NewsItem }
  | { type: 'achievementAwarded'; achievementId: string };

export type DomainEventType = DomainEvent['type'];
