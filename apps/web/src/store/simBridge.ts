// Holds the running Simulation and GameLoop; publishes throttled snapshots to the stores.
import { contextActionFor, type DefinitionRegistry, type DomainEvent, type Simulation, type TickOutput } from '@hr/sim';
import { useEffect, useState } from 'react';
import { GameLoop, type LoopHooks } from '../loop/GameLoop';
import { useHud, useSimVersion, useUi } from './stores';
import { inputState } from '../input/inputState';

interface Bridge {
  reg: DefinitionRegistry | null;
  loop: GameLoop | null;
  lastPublish: number;
  eventListeners: Set<(e: DomainEvent[]) => void>;
}

export const bridge: Bridge = { reg: null, loop: null, lastPublish: 0, eventListeners: new Set() };

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
  publish(true);
  return loop;
}

export function detachSimulation(): void {
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
  if (mx !== 0 || mz !== 0) sim.submit({ type: 'ceoMove', dx: mx, dz: mz });
}

function onTicks(outs: TickOutput[]): void {
  const events = outs.flatMap((o) => o.events);
  if (events.length > 0) for (const l of bridge.eventListeners) l(events);
  const results = outs.flatMap((o) => o.results).filter((r) => !r.ok);
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
  const ca = contextActionFor(s, loop.sim.reg);
  const caChanged = ca?.kind !== hud.contextAction?.kind || ca?.targetId !== hud.contextAction?.targetId;
  const revealed = s.reveals.fired.flatMap((id) => loop.sim.reg.revealTriggers[id]?.reveals ?? []);
  const patch: Parameters<typeof hud.set>[0] = {};
  if (hud.gold !== s.player.gold) patch.gold = s.player.gold;
  if (changedAlerts) patch.alerts = alerts.map((a) => (a.variant !== undefined ? { key: a.key, type: a.type, objectId: a.objectId, variant: a.variant } : { key: a.key, type: a.type, objectId: a.objectId }));
  if (caChanged) patch.contextAction = ca;
  if (revealed.length !== hud.revealed.length) patch.revealed = revealed;
  if (Object.keys(patch).length > 0) hud.set(patch);
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
