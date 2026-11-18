// CEO Phone key routing (ceo-phone Requirements 9, 10). Pure decision functions + a small handler.
// While the phone has focus it captures WASD/arrows, Tab, Enter, Space and Esc (the human-resource-mvp
// 18.6 Tab cycle is suspended); Q, P and the Game_Speed keys (1 2 3 0 [ ]) keep working.
import type { DefinitionRegistry, SimState } from '@hr/sim';

export type PhoneKeyAction =
  | { kind: 'back' }
  | { kind: 'home' }
  | { kind: 'recents' }
  | { kind: 'shade' }
  | { kind: 'tab'; dir: 1 | -1 }
  | { kind: 'focus'; dir: 1 | -1 }
  | { kind: 'native' } // Enter / Space: let the focused button activate itself
  | { kind: 'swallow' } // captured but no phone action (E, V, ...)
  | { kind: 'pass' }; // let the game handle it (P, Q, speed keys)

const PASS = new Set(['p', 'q', '1', '2', '3', '0', '[', ']']);
const FOCUS_NEXT = new Set(['arrowdown', 'arrowright', 's', 'd']);
const FOCUS_PREV = new Set(['arrowup', 'arrowleft', 'w', 'a']);

/** What a key does while the phone has focus. `key` is KeyboardEvent.key lower-cased. */
export function phoneKeyAction(key: string, shift: boolean): PhoneKeyAction {
  if (PASS.has(key)) return { kind: 'pass' };
  if (key === 'escape' || key === 'backspace') return { kind: 'back' };
  if (key === 'h') return { kind: 'home' };
  if (key === 'r') return { kind: 'recents' };
  if (key === 'n') return { kind: 'shade' };
  if (key === 'tab') return { kind: 'tab', dir: shift ? -1 : 1 };
  if (FOCUS_NEXT.has(key)) return { kind: 'focus', dir: 1 };
  if (FOCUS_PREV.has(key)) return { kind: 'focus', dir: -1 };
  if (key === 'enter' || key === ' ') return { kind: 'native' };
  return { kind: 'swallow' };
}

/** While driving, the phone opens only when the van is stopped (9.3). */
export function canOpenPhone(state: SimState, reg: DefinitionRegistry): boolean {
  const vid = state.ceo.drivingVehicleId;
  if (!vid) return true;
  const v = state.vehicles[vid];
  return !v || v.pose.speed < reg.config.stoppedSpeed;
}

/** True when keyboard focus is inside the phone root. */
export function phoneHasFocus(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.querySelector('[data-phone-root]');
  return !!root && !!document.activeElement && root.contains(document.activeElement);
}
