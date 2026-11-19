// The closed vocabularies of the shared Condition and Effect engine and of the stat system
// (Requirements 50, 52). Schemas, the registry check and the evaluators all read these lists, so a
// new entry is added in exactly one place and an unknown entry is rejected with a precise error.

/** Stats a system reads through `getStat`. A stat that no system reads must not be listed (50.3). */
export const STAT_IDS = ['demand', 'premiumPrice', 'repeatOrderChance'] as const;
export type StatId = (typeof STAT_IDS)[number];

export const CONDITION_KINDS = [
  'event',
  'goldAtLeast',
  'corporateResourceAtLeast',
  'ownedBusinessCountAtLeast',
  'tickAtLeast',
  'never',
  'all',
  'any',
  'not',
  'revealed',
  'statAtLeast',
  'statBelow',
  'loanActive',
  'licensed',
  'pubOpen',
  'humanCountAtLeast',
  'serviceUsed',
  'questStepDone',
] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

export const EFFECT_KINDS = ['gold', 'addModifier', 'reveal', 'schedule', 'grantResource', 'news', 'domain'] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

/** Registered domain handlers: behaviour the other Effect kinds cannot express (52.2). */
export const DOMAIN_OPS = [
  'setLicense',
  'startLoan',
  'payOffLoan',
  'applyFitOut',
  'setSupplyDeal',
  'buyTap',
  'hireCandidate',
  'fireRibbon',
  'occupyStaff',
] as const;
export type DomainOp = (typeof DOMAIN_OPS)[number];

/** Kinds the scheduler can dispatch (core/scheduler.ts); a `schedule` Effect names one of them. */
export const SCHEDULED_KINDS = ['constructionDone', 'revealAttribute', 'questionableDone', 'consequence'] as const;

/**
 * Largest |Gold| a single gold Effect may carry (hundredths). Well below GOLD_LIMIT (2^50), so a handful of
 * Effects in one finance bucket can never leave the safe-integer range (52.6).
 */
export const EFFECT_GOLD_MAX = 2 ** 40;

/** Finance buckets (8.2). Kept here so the schema and the `FinanceCategory` type share one list. */
export const FINANCE_CATEGORIES = [
  'sales',
  'tip',
  'salary',
  'hiring',
  'severance',
  'purchase',
  'rental',
  'construction',
  'acquisition',
  'liability',
  'fine',
  'market_sale',
  'other',
] as const;
export type FinanceCategoryId = (typeof FINANCE_CATEGORIES)[number];
