// Canvas gestures: wheel and pinch zoom (15.2), one-finger / mouse drag pan in Management_View
// (15.9). Two-finger twist is ignored: the camera never rotates (15.12).
import { useUi } from '../store/stores';
import { camState, zoomBy } from '../render/cameraState';
import { camCfg, SCREEN_RIGHT, SCREEN_UP } from '../render/theme';

export function installGestures(el: HTMLElement): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;

  const worldPerPixel = () => (2 * camState.distance * Math.tan((camCfg.fovDeg * Math.PI) / 360)) / Math.max(1, el.clientHeight);

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoomBy(Math.exp(e.deltaY * camCfg.wheelZoomFactor));
  };
  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onMove = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && d > 0) zoomBy(pinchDist / d);
      pinchDist = d;
      return;
    }
    if (useUi.getState().viewMode !== 'management') return;
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) return;
    const wpp = worldPerPixel();
    const dx = (cur.x - prev.x) * wpp;
    const dy = (cur.y - prev.y) * wpp;
    camState.panDx += -SCREEN_RIGHT.x * dx + SCREEN_UP.x * dy;
    camState.panDz += -SCREEN_RIGHT.z * dx + SCREEN_UP.z * dy;
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  return () => {
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
}
