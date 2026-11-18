// Opening/closing the phone and routing phone keys (ceo-phone Requirements 9, 10).
import { bridge } from '../../store/simBridge';
import { useHud } from '../../store/stores';
import { inputState } from '../../input/inputState';
import { usePhone } from './phoneStore';
import { canOpenPhone, phoneKeyAction } from './phoneKeys';
import type { AppId } from './phoneNav';

/** Stops CEO movement from keys that were held when the phone opened. */
function releaseMovement(recompute: () => void): void {
  inputState.keys.clear();
  recompute();
}

let recomputeMove: () => void = () => undefined;
/** keyboard.ts registers its recomputeMove here (avoids an import cycle). */
export function registerRecompute(f: () => void): void {
  recomputeMove = f;
}

function allowedToOpen(): boolean {
  const loop = bridge.loop;
  if (!loop) return true;
  if (canOpenPhone(loop.sim.state, loop.sim.reg)) return true;
  useHud.getState().pushToast('phone.toast.stopFirst');
  return false;
}

export function togglePhone(): void {
  const p = usePhone.getState();
  if (p.open) return p.setOpen(false);
  if (!allowedToOpen()) return;
  releaseMovement(recomputeMove);
  p.setOpen(true);
}

/** Deep links and app taps: opens the phone on an app (9.3 still applies). */
export function openPhoneApp(app: AppId, opts?: { tab?: string; id?: string }): void {
  if (!usePhone.getState().open && !allowedToOpen()) return;
  releaseMovement(recomputeMove);
  usePhone.getState().openApp(app, opts);
}

/** Moves focus between focusable controls inside the phone (arrow keys / WASD). */
function moveFocus(dir: 1 | -1): void {
  const root = document.querySelector<HTMLElement>('[data-phone-root]');
  if (!root) return;
  const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"], input, select')].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (items.length === 0) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = items[(i + dir + items.length) % items.length];
  next?.focus();
}

/** Cycles the bottom tabs of the current app. */
function cycleTab(dir: 1 | -1): void {
  const root = document.querySelector<HTMLElement>('[data-phone-root] [data-phone-tabs]');
  if (!root) return;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('button')];
  if (tabs.length === 0) return;
  const cur = tabs.findIndex((b) => b.getAttribute('aria-current') === 'page');
  const next = tabs[(cur + dir + tabs.length) % tabs.length];
  next?.click();
  next?.focus();
}

/**
 * Handles a keydown while the phone has focus. Returns true when the game must not handle the key.
 */
export function handlePhoneKey(e: KeyboardEvent): boolean {
  const a = phoneKeyAction(e.key.toLowerCase(), e.shiftKey);
  const p = usePhone.getState();
  switch (a.kind) {
    case 'pass':
      return false;
    case 'native':
      return true;
    case 'swallow':
      return true;
    case 'back':
      e.preventDefault();
      p.back();
      if (!usePhone.getState().open) (document.querySelector('.game-canvas canvas') as HTMLElement | null)?.focus();
      return true;
    case 'home':
      p.home();
      return true;
    case 'recents':
      p.showRecents();
      return true;
    case 'shade':
      return true; // the notification shade arrives in ceo-phone task 2
    case 'tab':
      e.preventDefault();
      cycleTab(a.dir);
      return true;
    case 'focus':
      e.preventDefault();
      moveFocus(a.dir);
      return true;
  }
}
