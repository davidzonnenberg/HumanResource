// State types inferred from the zod state schema (single source of truth).
import type { z } from 'zod';
import type * as S from './schema';

export type Id = string;
export type Tick = number;
/** Integer number of hundredths of Gold. Never a float. */
export type Gold = number;
/** 'player' | 'npc' | competitor id (prefix 'cmp_'). */
export type OwnerId = string;

export type SimState = z.infer<typeof S.simStateSchema>;
export type Lot = z.infer<typeof S.lotSchema>;
export type LotOrigin = z.infer<typeof S.lotOriginSchema>;
export type Stock = z.infer<typeof S.stockSchema>;
export type StaffTask = z.infer<typeof S.staffTaskSchema>;
export type SlotFill = z.infer<typeof S.slotFillSchema>;
export type JobSlot = z.infer<typeof S.jobSlotSchema>;
export type JobSlotRef = z.infer<typeof S.jobSlotRefSchema>;
export type Path = z.infer<typeof S.pathSchema>;
export type PubRuntime = z.infer<typeof S.pubRuntimeSchema>;
export type Business = z.infer<typeof S.businessSchema>;
export type Human = z.infer<typeof S.humanSchema>;
export type HumanLocation = z.infer<typeof S.humanLocationSchema>;
export type Customer = z.infer<typeof S.customerSchema>;
export type Vehicle = z.infer<typeof S.vehicleSchema>;
export type Route = z.infer<typeof S.routeSchema>;
export type Order = z.infer<typeof S.orderSchema>;
export type Plot = z.infer<typeof S.plotSchema>;
export type CeoState = z.infer<typeof S.ceoSchema>;
export type Ring = z.infer<typeof S.ringSchema>;
export type PubMetrics = z.infer<typeof S.pubMetricsSchema>;
export type Alert = z.infer<typeof S.alertSchema>;
export type NewsItem = z.infer<typeof S.newsItemSchema>;
export type ScheduledEvent = z.infer<typeof S.scheduledEventSchema>;
export type ScheduledKind = z.infer<typeof S.scheduledKindSchema>;
export type ProductionEntry = z.infer<typeof S.productionEntrySchema>;
export type MarketState = z.infer<typeof S.marketStateSchema>;
export type AcquisitionOffer = z.infer<typeof S.acquisitionOfferSchema>;
export type AcquisitionsState = z.infer<typeof S.acquisitionsStateSchema>;
export type RunningQuestionable = z.infer<typeof S.runningQuestionableSchema>;
export type QuestionableState = z.infer<typeof S.questionableStateSchema>;
export type CorporateChain = z.infer<typeof S.corporateChainSchema>;
export type ChainsState = z.infer<typeof S.chainsStateSchema>;
export type Boost = z.infer<typeof S.boostSchema>;
export type ReputationPending = z.infer<typeof S.reputationPendingSchema>;

export type LostReason = 'no_seat' | 'out_of_beer' | 'patience_expired';
export type FinanceCategory =
  | 'sales'
  | 'tip'
  | 'salary'
  | 'hiring'
  | 'severance'
  | 'purchase'
  | 'rental'
  | 'construction'
  | 'acquisition'
  | 'liability'
  | 'fine'
  | 'market_sale'
  | 'other';

export const PLAYER: OwnerId = 'player';
export const NPC: OwnerId = 'npc';
export const isCompetitor = (owner: OwnerId): boolean => owner.startsWith('cmp_');
