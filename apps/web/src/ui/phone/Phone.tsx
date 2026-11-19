// CEO Phone shell (ceo-phone Requirements 1, 9–13): frame, status bar, screen area, nav bar.
// A side panel docked right at most 40% of the width on PC and landscape phones (no bottom sheet,
// no full-screen drag). Navigation state lives in phoneStore; data comes from throttled selectors.
import { useEffect, useRef, type PointerEvent } from 'react';
import { t } from '../../text/t';
import { bridge } from '../../store/simBridge';
import { useSession, useSimVersion } from '../../store/stores';
import { ownerColor } from '../../render/theme';
import { usePhone } from './phoneStore';
import { topScreen } from './phoneNav';
import { useInstalledApps } from './useInstalledApps';
import { startPhoneFeed } from './phoneFeed';
import { NotificationShade } from './NotificationShade';
import { usePhoneSettings, resolvedDark, resolvedReducedMotion } from './phoneSettings';
import { canOpenPhone } from './phoneKeys';
import { formatElapsed } from './elapsed';
import { HomeScreen } from './HomeScreen';
import { AppShell } from './AppShell';
import { RecentsScreen } from './RecentsScreen';

const SPEED_ICON: Record<number, string> = { 1: '1×', 2: '2×', 4: '4×' };

export function Phone() {
  const open = usePhone((s) => s.open);
  const stack = usePhone((s) => s.stack);
  const nav = usePhone();
  const settings = usePhoneSettings((s) => s.settings);
  const shadeOpen = usePhone((s) => s.shadeOpen);
  const installed = useInstalledApps();
  const speed = useSession((s) => s.gameSpeed);
  const speedPaused = useSession((s) => s.speedPaused);
  useSession((s) => s.devTesting);
  useSimVersion((v) => v.v); // 5 Hz refresh for the elapsed time and the driving check
  const root = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; id: number } | null>(null);
  const shadeSwipe = useRef<{ y: number; id: number } | null>(null);
  const swipedShade = useRef(false);

  // Collect Alerts and reveals into the notification ring while the phone is closed too (6.2).
  useEffect(() => startPhoneFeed(), []);

  // Close when the van starts moving while the phone is open (9.4).
  const loop = bridge.loop;
  const mayStayOpen = loop ? canOpenPhone(loop.sim.state, loop.sim.reg) : true;
  useEffect(() => {
    if (open && !mayStayOpen) usePhone.getState().setOpen(false);
  }, [open, mayStayOpen]);

  // Focus in on open, back to the canvas on close (13.5).
  useEffect(() => {
    if (open) {
      const first = root.current?.querySelector<HTMLElement>('button');
      first?.focus();
    } else {
      (document.querySelector('.game-canvas canvas') as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  if (!open) return null;
  const top = topScreen({ ...nav, stack });
  const tps = loop?.sim.reg.config.ticksPerSecond ?? 10;
  const elapsed = formatElapsed(loop?.sim.state.tick ?? 0, tps);
  const dark = resolvedDark(settings);
  const calm = resolvedReducedMotion(settings);

  let screen;
  if (top.kind === 'recents') screen = <RecentsScreen installed={installed} />;
  else if (top.kind === 'app') {
    const app = installed.find((a) => a.id === top.app);
    screen = app ? <AppShell app={app} tab={top.tab} id={top.id} /> : <HomeScreen installed={installed} elapsed={elapsed} />;
  } else screen = <HomeScreen installed={installed} elapsed={elapsed} />;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const r = root.current?.getBoundingClientRect();
    if (r && e.clientX - r.left < 24) swipe.current = { x: e.clientX, id: e.pointerId };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    swipe.current = null;
    if (s && s.id === e.pointerId && e.clientX - s.x > 50) nav.back();
  };

  return (
    <div
      ref={root}
      className="phone"
      data-phone-root
      data-theme={dark ? 'dark' : 'light'}
      data-text={settings.textSize}
      data-motion={calm ? 'reduced' : 'full'}
      style={{ ['--case' as string]: ownerColor('player') }}
      role="dialog"
      aria-label={t('phone.title')}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div className="ph-screen">
        {/* Status bar: tap or swipe down opens the notification shade (6.5). */}
        <button
          type="button"
          className="ph-status"
          aria-expanded={shadeOpen}
          aria-label={t('phone.shade.toggle')}
          onPointerDown={(e) => (shadeSwipe.current = { y: e.clientY, id: e.pointerId })}
          onPointerUp={(e) => {
            const s = shadeSwipe.current;
            shadeSwipe.current = null;
            if (s && s.id === e.pointerId && e.clientY - s.y > 30) {
              swipedShade.current = true;
              nav.openShade();
            }
          }}
          onClick={() => {
            if (swipedShade.current) swipedShade.current = false;
            else nav.toggleShade();
          }}
        >
          <span aria-label={t('phone.status.elapsed')}>{elapsed}</span>
          <span className="ph-cam" aria-hidden="true" />
          <span>
            {settings.dnd && <span aria-label={t('phone.status.dnd')}>🔕 </span>}
            <span aria-label={t('phone.status.speed')}>{speedPaused ? '⏸' : (SPEED_ICON[speed] ?? '1×')}</span> <span aria-hidden="true">🔋</span>
          </span>
        </button>
        <div className="ph-main" aria-live="polite">
          {screen}
        </div>
        {shadeOpen && <NotificationShade />}
        <nav className="ph-nav" aria-label={t('phone.nav')}>
          <button type="button" aria-label={t('phone.back')} onClick={nav.back}>
            ◀
          </button>
          <button type="button" aria-label={t('phone.home')} onClick={nav.home}>
            ●
          </button>
          <button type="button" aria-label={t('phone.recents')} onClick={nav.showRecents}>
            ■
          </button>
        </nav>
      </div>
    </div>
  );
}
