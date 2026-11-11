// Command handler table. Handlers validate fully before mutating and return a Rejection or null.
import type { TickContext } from '../core/context';
import type { Command, CommandEnvelope, CommandResult, Rejection } from './types';
import { handleAssign, handleFire, handleHire, handleUnassign } from '../systems/humans';
import { handleSetDrinkPrice } from '../systems/pub';
import {
  handleEndManualDriving,
  handleManualLoad,
  handleManualUnload,
  handleManualVehicleUpdate,
  handlePlaceOrder,
  handleResetVehicle,
  handleResumeRoute,
  handleSetAutoReorder,
  handleSetRoute,
  handleStartManualDriving,
} from '../systems/logistics';
import { handleCeoEnter, handleCeoExit, handleCeoMove } from '../systems/ceo';
import { handleMarketBuy } from '../systems/phase2/market';
import { handleBuyPlot, handleConstruct } from '../systems/phase2/construction';
import { handleAcquireWarehouse, handleEndRental } from '../systems/phase2/warehouse';
import { handleSetSourcingPolicy } from '../systems/phase2/sourcing';
import { handleSetProductionRecipe } from '../systems/phase2/production';

function handleUnlockDistrict(ctx: TickContext, env: CommandEnvelope, cmd: Extract<Command, { type: 'unlockDistrict' }>): Rejection | null {
  if (env.issuer !== 'system') return { reason: 'not_allowed' };
  const d = ctx.state.districts[cmd.districtId];
  if (!d) return { reason: 'unknown_entity', field: 'districtId' };
  if (d.unlocked) return null;
  d.unlocked = true;
  ctx.refreshPaths(); // before humans/logistics run this Tick (48.6)
  ctx.events.push({ type: 'districtUnlocked', districtId: cmd.districtId });
  return null;
}

function dispatch(ctx: TickContext, env: CommandEnvelope): Rejection | null {
  const cmd = env.cmd;
  switch (cmd.type) {
    case 'hire':
      return handleHire(ctx);
    case 'assign':
      return handleAssign(ctx, cmd);
    case 'unassign':
      return handleUnassign(ctx, cmd);
    case 'fire':
      return handleFire(ctx, cmd);
    case 'setDrinkPrice':
      return handleSetDrinkPrice(ctx, cmd);
    case 'placeOrder':
      return handlePlaceOrder(ctx, cmd);
    case 'setAutoReorder':
      return handleSetAutoReorder(ctx, cmd);
    case 'setRoute':
      return handleSetRoute(ctx, cmd);
    case 'resumeRoute':
      return handleResumeRoute(ctx, cmd);
    case 'startManualDriving':
      return handleStartManualDriving(ctx, cmd);
    case 'manualVehicleUpdate':
      return handleManualVehicleUpdate(ctx, cmd);
    case 'manualLoad':
      return handleManualLoad(ctx, cmd);
    case 'manualUnload':
      return handleManualUnload(ctx, cmd);
    case 'endManualDriving':
      return handleEndManualDriving(ctx, cmd);
    case 'resetVehicle':
      return handleResetVehicle(ctx, cmd);
    case 'ceoMove':
      return handleCeoMove(ctx, cmd);
    case 'ceoEnter':
      return handleCeoEnter(ctx, cmd);
    case 'ceoExit':
      return handleCeoExit(ctx);
    case 'uiEvent':
      ctx.events.push({ type: 'uiManagementViewOpened' });
      return null;
    case 'unlockDistrict':
      return handleUnlockDistrict(ctx, env, cmd);
    case 'marketBuy':
      return handleMarketBuy(ctx, cmd);
    case 'buyPlot':
      return handleBuyPlot(ctx, cmd);
    case 'construct':
      return handleConstruct(ctx, cmd);
    case 'acquireWarehouse':
      return handleAcquireWarehouse(ctx, cmd);
    case 'endRental':
      return handleEndRental(ctx, cmd);
    case 'setSourcingPolicy':
      return handleSetSourcingPolicy(ctx, cmd);
    case 'setProductionRecipe':
      return handleSetProductionRecipe(ctx, cmd);
    // Phase 2 Commands whose handlers arrive with later tasks (acquisitions 28, questionable 29, minigames 30)
    case 'acceptAcquisition':
    case 'startQuestionable':
    case 'completeMinigame':
      return { reason: 'not_available' };
  }
}

/**
 * Applies queued Commands in submission order. A rejected Command leaves the state unchanged
 * (2.8) because handlers validate before mutating. A throwing handler is a bug; it is reported
 * as not_allowed so one bad Command cannot stop the Tick.
 */
export function commandsSystem(ctx: TickContext): void {
  const queue = ctx.queue.splice(0, ctx.queue.length);
  for (const env of queue) {
    let rej: Rejection | null;
    try {
      rej = dispatch(ctx, env);
    } catch (err) {
      rej = { reason: 'not_allowed', field: err instanceof Error ? err.message : 'error' };
    }
    const result: CommandResult = rej
      ? { seq: env.seq, type: env.cmd.type, ok: false, ...rej }
      : { seq: env.seq, type: env.cmd.type, ok: true };
    ctx.results.push(result);
  }
}
