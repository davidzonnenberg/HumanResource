// Holds the running Simulation and GameLoop; publishes throttled snapshots to the stores.
import { contextActionFor, frontSign, type DefinitionRegistry, type DomainEvent, type Simulation, type TickOutput } from '@hr/sim';
import { useEffect, useState } from 'react';
import { GameLoop, type LoopHooks } from '../loop/GameLoop';
import { SessionRecorder } from '../loop/commandRecorder';
import { useHud, useSimVersion, useUi } from './stores';
import { inputState } from '../input/inputState';
import { shapeMove } from '../input/walkCollision';
import { allFootprints, clearFootprints, exteriorDoorPoint } from '../render/footprints';
import { usePhone } from '../ui/phone/phoneStore';

interface Bridge {
  reg: DefinitionRegistry | null;
  loop: GameLoop | null;
  lastPublish: number;
  eventListeners: Set<(e: DomainEvent[]) => void>;
  /** Records every submitted Command of the running session (53.1). */
  recorder: SessionRecorder | null;
}

export const bridge: Bridge = { reg: null, loop: null, lastPublish: 0, eventListeners: new Set(), recorder: null };

/** Tracks the Business the CEO was inside last publish, to auto-open/close its Panel (14.3). */
let lastInsideBusinessId: string | null = null;

export const currentSim = (): Simulation | null => bridge.loop?.sim ?? null;

export function attachSimulation(sim: Simulation, extraHooks: LoopHooks = {}, dev = false): GameLoop {
  const loop = new GameLoop(
    sim,
    {
      beforeTick: (s) => submitPerTickInput(s),
      afterTicks: (outs) => onTicks(outs),
      ...extraHooks,
    },
    { dev },
  );
  bridge.loop = loop;
  bridge.reg = sim.reg;
  bridge.recorder?.detach();
  bridge.recorder = new SessionRecorder(sim, sim.reg.config.commandLogTailLimit);
  bridge.recorder.attach();
  clearFootprints();
  usePhone.getState().reset(); // phone navigation is session state per Save_Slot (ceo-phone 4.11)
  publish(true);
  return loop;
}

export function detachSimulation(): void {
  bridge.recorder?.detach();
  bridge.recorder = null;
  bridge.loop = null;
}

/** One ceoMove per Tick from the current input vector; manual driving is handled by physics. */
function submitPerTickInput(sim: Simulation): void {
  if (sim.state.ceo.drivingVehicleId) {
    inputState.physicsBeforeTick?.(sim);
    return;
  }
  if (useUi.getState().viewMode !== 'ceo') return;
  const { mx, mz } = inputState;
  if (mx === 0 && mz === 0) return;
  const ceo = sim.state.ceo;
  // Building hitboxes only apply outside; inside, the sim keeps the CEO within the room walls.
  const move = ceo.insideBusinessId
    ? { dx: mx, dz: mz }
    : shapeMove(ceo.x, ceo.z, mx, mz, (sim.reg.config.ceoWalkingSpeed * sim.reg.config.tickMs) / 1000, sim.reg.config.ceoRadius, allFootprints().values());
  if (move.dx !== 0 || move.dz !== 0) sim.submit({ type: 'ceoMove', dx: move.dx, dz: move.dz });
}

function onTicks(outs: TickOutput[]): void {
  const events = outs.flatMap((o) => o.events);
  if (events.length > 0) for (const l of bridge.eventListeners) l(events);
  const results = outs.flatMap((o) => o.results).filter((r) => !r.ok);
  // TEMP driving diagnostics (dev builds only): per-Tick van updates are otherwise silent when rejected.
  if (import.meta.env.DEV) for (const r of results) if (!r.ok && r.type === 'manualVehicleUpdate') console.warn('[drive] manualVehicleUpdate rejected', r.reason);
  for (const r of results) if (!r.ok && r.type !== 'ceoMove' && r.type !== 'manualVehicleUpdate') {
    const amount = r.missingGold !== undefined ? Math.ceil(r.missingGold / 100) : 0;
    useHud.getState().pushToast(`reason.${r.reason}`, { amount });
  }
  publish(false);
}

/** Updates HUD fields every frame-batch (cheap) and bumps the Panel version at most 5 Hz. */
export function publish(force: boolean): void {
  const loop = bridge.loop;
  if (!loop) return;
  const s = loop.sim.state;
  const hud = useHud.getState();
  const alerts = Object.values(s.alerts);
  const changedAlerts = alerts.length !== hud.alerts.length || alerts.some((a, i) => a.key !== hud.alerts[i]?.key || a.variant !== hud.alerts[i]?.variant);
  const reg = loop.sim.reg;
  const ca = contextActionFor(s, reg, (id) => {
    const b = s.businesses[id];
    return b ? exteriorDoorPoint(id, frontSign(reg, b.plotId)) : undefined;
  });
  const caChanged = ca?.kind !== hud.contextAction?.kind || ca?.targetId !== hud.contextAction?.targetId;
  const revealed = s.reveals.fired.flatMap((id) => loop.sim.reg.revealTriggers[id]?.reveals ?? []);
  const patch: Parameters<typeof hud.set>[0] = {};
  if (hud.gold !== s.player.gold) patch.gold = s.player.gold;
  if (hud.savings !== s.player.savings) patch.savings = s.player.savings;
  if (changedAlerts) patch.alerts = alerts.map((a) => (a.variant !== undefined ? { key: a.key, type: a.type, objectId: a.objectId, variant: a.variant } : { key: a.key, type: a.type, objectId: a.objectId }));
  if (caChanged) patch.contextAction = ca;
  if (revealed.length !== hud.revealed.length) patch.revealed = revealed;
  if (Object.keys(patch).length > 0) hud.set(patch);

  // Auto-open the Business panel on entry; close it on leave if it is still the selection (14.3).
  const inside = s.ceo.insideBusinessId;
  if (inside !== lastInsideBusinessId) {
    const ui = useUi.getState();
    if (inside && s.businesses[inside]) {
      ui.set({ selection: { kind: 'business', id: inside }, pickingSlot: null, financeOpen: false });
    } else if (lastInsideBusinessId && ui.selection?.kind === 'business' && ui.selection.id === lastInsideBusinessId) {
      ui.set({ selection: null });
    }
    lastInsideBusinessId = inside;
  }

  const now = performance.now();
  if (force || now - bridge.lastPublish >= 200) {
    bridge.lastPublish = now;
    useSimVersion.getState().bump();
  }
}

/** Panel selector: re-evaluates at most 5 times per second. */
export function useSimSelector<T>(select: (sim: Simulation) => T): T | null {
  const v = useSimVersion((x) => x.v);
  const [value, setValue] = useState<T | null>(() => (bridge.loop ? select(bridge.loop.sim) : null));
  useEffect(() => {
    setValue(bridge.loop ? select(bridge.loop.sim) : null);
  }, [v]); // refresh only on the throttled version bump
  return value;
}

export function onDomainEvents(l: (e: DomainEvent[]) => void): () => void {
  bridge.eventListeners.add(l);
  return () => bridge.eventListeners.delete(l);
}
