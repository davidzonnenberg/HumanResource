// A domain op is a registered handler for behaviour the other Effect kinds cannot express (52.2).
import type { TickContext } from '../../core/context';
import type { ParamValue } from '../../defs/schemas';
import type { Rejection } from '../../commands/types';
import type { Id } from '../../state/types';

/** What an Effect list is applied for. */
export interface EffectContext {
  /** The Business the Effects belong to (a Service's Business). `self` targets resolve to it. */
  businessId?: Id;
  /** Label for finance rows and Modifier sources: a Service id, quest id or Consequence id. */
  source: string;
  /** Validated `params` of the Command that triggered the Effects. */
  params?: Record<string, ParamValue>;
}

/** Checked by `useService` before anything is charged or applied, for rules a static Condition cannot express (fit-out budget, hiring gates). */
export type DomainValidator = (ctx: TickContext, ectx: EffectContext, params: Record<string, ParamValue>) => Rejection | null;
/** Applies the op. Receives the `params` written in the Effect and the context of the whole list. */
export type DomainHandler = (ctx: TickContext, ectx: EffectContext, params: Record<string, ParamValue>) => void;
