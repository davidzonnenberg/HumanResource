// Minimal persistent HUD (18.9): Gold, Alerts, Context_Action button, joystick, pause, zoom,
// Game_Speed control once available. Detailed Panels are added by task 13.
import { useEffect } from 'react';
import { goldToWholeFloor } from '@hr/sim';
import { t, tDynamic } from '../../text/t';
import { useHud, useSession, useUi } from '../../store/stores';
import { onDomainEvents } from '../../store/simBridge';
import { Joystick } from '../../input/Joystick';
import { runContextAction, setPauseMenu, setSpeed, speedsAvailable, toggleSpeedPause, zoomIn, zoomOut } from '../../input/actions';
import { alertRows } from './alertText';
import type { GameSpeed } from '../../loop/gameSpeed';

const SPEED_KEYS: Record<GameSpeed, 'hud.speed.x1' | 'hud.speed.x2' | 'hud.speed.x4'> = { 1: 'hud.speed.x1', 2: 'hud.speed.x2', 4: 'hud.speed.x4' };
const ACTION_KEYS = {
  enter: 'action.enter',
  exitBuilding: 'action.exitBuilding',
  inspect: 'action.inspect',
  drive: 'action.drive',
  load: 'action.load',
  unload: 'action.unload',
  exitVehicle: 'action.exitVehicle',
} as const;

function SpeedControl() {
  useHud((h) => h.revealed.length); // re-evaluate when reveals fire
  useSession((s) => s.devTesting);
  const speed = useSession((s) => s.gameSpeed);
  const paused = useSession((s) => s.speedPaused);
  const available = speedsAvailable();
  if (available.length <= 1) return null; // hidden until unlocked (47.4, 47.7)
  return (
    <div className="speed-control" role="group" aria-label={t('hud.speed')}>
      <button className={`seg ${paused ? 'active' : ''}`} onClick={toggleSpeedPause} aria-pressed={paused}>
        {t('hud.speed.pause')}
      </button>
      {available.map((s) => (
        <button key={s} className={`seg ${!paused && speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)} aria-pressed={!paused && speed === s}>
          {t(SPEED_KEYS[s])}
        </button>
      ))}
    </div>
  );
}

function Toasts() {
  const toasts = useHud((h) => h.toasts);
  const drop = useHud((h) => h.dropToast);
  useEffect(() => {
    if (toasts.length === 0) return;
    const first = toasts[0];
    const timer = setTimeout(() => first && drop(first.id), 3500);
    return () => clearTimeout(timer);
  }, [toasts, drop]);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className="toast">
          {tDynamic(x.textKey, x.params)}
        </div>
      ))}
    </div>
  );
}

export function Hud() {
  const gold = useHud((h) => h.gold);
  const alerts = useHud((h) => h.alerts);
  const clientAlerts = useHud((h) => h.clientAlerts);
  const ca = useHud((h) => h.contextAction);
  const sync = useHud((h) => h.syncStatus);
  const viewMode = useUi((u) => u.viewMode);
  const push = useHud((h) => h.pushToast);

  useEffect(
    () =>
      onDomainEvents((events) => {
        for (const e of events) {
          if (e.type === 'revealFired') for (const r of e.reveals) push(`toast.reveal.${r}`);
          if (e.type === 'manualTip') push('toast.tip', { amount: goldToWholeFloor(e.amount) });
        }
      }),
    [push],
  );

  const rows = alertRows(alerts);
  return (
    <div className="hud">
      <div className="hud-top-left">
        <div className={`gold ${gold < 0 ? 'debt' : ''}`}>{t('hud.gold', { amount: goldToWholeFloor(gold).toLocaleString() })}</div>
        {gold < 0 && <div className="debt-warning">{t('hud.debt')}</div>}
        <div className="mode-label">{t(viewMode === 'ceo' ? 'hud.mode.ceo' : 'hud.mode.management')}</div>
        {sync === 'offline' || sync === 'pending' ? <div className="sync-badge">{t('hud.notSynced')}</div> : null}
      </div>
      <div className="hud-top-right">
        <SpeedControl />
        <button className="icon-button" onClick={() => useUi.getState().set({ financeOpen: true, selection: null, pickingSlot: null })} aria-label={t('hud.finance')}>
          ¤
        </button>
        <button className="icon-button" onClick={() => setPauseMenu(true)} aria-label={t('hud.pause')}>
          {t('hud.speed.pause')}
        </button>
      </div>
      <div className="alerts">
        {rows.map((r) => (
          <button key={r.key} className="alert" onClick={() => useUi.getState().set({ selection: { kind: 'business', id: r.objectId } })}>
            {r.text}
          </button>
        ))}
        {clientAlerts.map((a) => (
          <div key={a.key} className="alert client">
            {tDynamic(a.textKey)}
          </div>
        ))}
      </div>
      <Joystick />
      <div className="hud-right">
        <button className="icon-button" onClick={zoomIn} aria-label={t('hud.zoomIn')}>
          +
        </button>
        <button className="icon-button" onClick={zoomOut} aria-label={t('hud.zoomOut')}>
          −
        </button>
        {ca && (
          <button className="context-button" onClick={() => runContextAction(ca)}>
            {t(ACTION_KEYS[ca.kind])}
          </button>
        )}
      </div>
      <Toasts />
    </div>
  );
}
