// PWA update flow (42.3, 42.4). `onNeedRefresh` lets the app save before activating the new
// service worker. Save-before-update also happens on pagehide/hidden, which covers dismissal.
import { registerSW } from 'virtual:pwa-register';

export type UpdateHandler = (apply: () => void) => void;

export function setupPWA(onNeedRefresh: UpdateHandler): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      onNeedRefresh(() => void update(true));
    },
  });
}
