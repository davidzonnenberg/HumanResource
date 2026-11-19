// Phase 3 content tables (task 41.2): License_Tiers, Loans, fit-out, supply deals, hiring candidates,
// municipality/bank requests, customer types, quests and pub layouts. All are data; systems read them
// through the registry (`reg.phase3`) and never name an id (architecture.md, Data-driven content).
import { z } from 'zod';
import { conditionSchema, effectSchema } from './schemas';

const id = z.string().min(1);
const gold = z.number().int(); // integer hundredths of Gold
const nonNeg = z.number().int().nonnegative();

/** Requirement 62.5. `customerTypes` lists the customer type ids the tier allows. */
export const licenseTierDefSchema = z.object({
  id,
  nameKey: id,
  descriptionKey: id,
  fee: gold.nonnegative(),
  minSeats: nonNeg,
  maxSeats: nonNeg,
  minTaps: nonNeg,
  customerTypes: z.array(id).min(1),
});
export type LicenseTierDef = z.infer<typeof licenseTierDefSchema>;

/** Requirement 63.1. Interest is in basis points of the principal; the term is in Game_Minutes. */
export const loanOfferDefSchema = z.object({
  id,
  nameKey: id,
  descriptionKey: id,
  principal: gold.positive(),
  fitOutBudget: gold.nonnegative(),
  repaymentPerMinute: gold.positive(),
  interestBp: nonNeg,
  termMinutes: z.number().int().positive(),
});
export type LoanOfferDef = z.infer<typeof loanOfferDefSchema>;

/** Requirement 64.2. `modelKey` null = the Renderer draws a placeholder box (task 48.3). */
export const fitOutItemDefSchema = z.object({
  id,
  nameKey: id,
  kind: z.enum(['table', 'tap', 'decoration']),
  price: gold.nonnegative(),
  seats: nonNeg.optional(),
  taps: nonNeg.optional(),
  vibe: z.number().int().optional(),
  modelKey: id.nullable(),
});
export type FitOutItemDef = z.infer<typeof fitOutItemDefSchema>;

/** Requirement 65.1. Prices are per Keg; a Keg is a display and pricing unit, the unit of account stays the drink. */
export const supplyDealDefSchema = z.object({
  id,
  nameKey: id,
  descriptionKey: id,
  pricePerKeg: gold.positive(),
  kegDrinks: z.number().int().positive(),
  contractFeePerMinute: gold.nonnegative().optional(),
});
export type SupplyDealDef = z.infer<typeof supplyDealDefSchema>;

/** Requirement 66.1. `quirkId` is a Phase 5 Quirk; its text lives under `quirk.<quirkId>`. */
export const candidateDefSchema = z.object({
  id,
  name: z.string().min(1),
  jobId: id,
  quirkId: id,
  cvKey: id,
  salaryPerMinute: gold.nonnegative(),
  hiringCost: gold.nonnegative(),
});
export type CandidateDef = z.infer<typeof candidateDefSchema>;

/** Requirement 68.3. `serviceId` is the presence Service of the same Office that answers the request. */
export const requestDefSchema = z.object({
  id,
  nameKey: id,
  businessRole: id,
  serviceId: id,
  deadlineSeconds: z.number().int().positive(),
  consequence: z.array(effectSchema),
});
export type RequestDef = z.infer<typeof requestDefSchema>;

/** Requirement 57.1: a weight is drawn only when the License_Tier allows more than one type. */
export const customerTypeDefSchema = z.object({
  id,
  nameKey: id,
  weight: z.number().int().positive(),
});
export type CustomerTypeDef = z.infer<typeof customerTypeDefSchema>;

/** Requirement 73.1. `done` is a shared Condition; `reward` Effects apply once (73.2). */
export const questStepDefSchema = z.object({
  id,
  textKey: id,
  done: conditionSchema,
  targetBusinessRole: id.optional(),
  reward: z.array(effectSchema).optional(),
  requires: z.array(id).optional(),
});
export type QuestStepDef = z.infer<typeof questStepDefSchema>;
export const questDefSchema = z.object({
  id,
  nameKey: id,
  /** Quest ids that must be completed before this one starts (the chain after the Grand Opening). */
  after: id.optional(),
  steps: z.array(questStepDefSchema).min(1),
});
export type QuestDef = z.infer<typeof questDefSchema>;

/**
 * Requirement 55.5: anchors of a pub interior; distances between them drive throughput.
 * Coordinates are plot-local metres, so one layout fits any plot orientation: 'u' is the offset from the plot
 * centre along its width, v the depth measured from the BACK wall towards the street (0 = back wall, plot depth = door).
 */
const anchor = z.object({ u: z.number(), v: z.number() });
export const layoutDefSchema = z.object({
  id,
  door: anchor,
  mat: anchor,
  bar: anchor,
  till: anchor,
  cleanSpot: anchor,
  storage: anchor,
  exit: anchor,
  /** Where a Bar_Worker stands to pour at tap i. */
  taps: z.array(anchor),
  seats: z.array(anchor),
});
export type LayoutDef = z.infer<typeof layoutDefSchema>;

/** The raw `phase3` pack handed to the registry; every table is optional so older callers keep working. */
export interface RawPhase3 {
  licenseTiers?: unknown;
  loanOffers?: unknown;
  fitOutItems?: unknown;
  supplyDeals?: unknown;
  candidates?: unknown;
  requests?: unknown;
  customerTypes?: unknown;
  quests?: unknown;
  layouts?: unknown;
}

export interface Phase3Defs {
  licenseTiers: Record<string, LicenseTierDef>;
  loanOffers: Record<string, LoanOfferDef>;
  fitOutItems: Record<string, FitOutItemDef>;
  supplyDeals: Record<string, SupplyDealDef>;
  candidates: Record<string, CandidateDef>;
  requests: Record<string, RequestDef>;
  customerTypes: Record<string, CustomerTypeDef>;
  quests: Record<string, QuestDef>;
  layouts: Record<string, LayoutDef>;
}
