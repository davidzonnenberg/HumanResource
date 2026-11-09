// Floating left-thumb joystick in the left 40% of the screen (14.1). Touch only.
import { useRef, useState, type PointerEvent } from 'react';
import { joystick, stickVector } from './joystickState';
import { recomputeMove } from './keyboard';

const RADIUS = 60;

export function Joystick() {
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const [view, setView] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    origin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    joystick.active = true;
    joystick.x = 0;
    joystick.y = 0;
    setView({ ox: e.clientX, oy: e.clientY, kx: 0, ky: 0 });
    recomputeMove();
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const o = origin.current;
    if (!o || o.id !== e.pointerId) return;
    const v = stickVector(e.clientX - o.x, e.clientY - o.y, RADIUS);
    joystick.x = v.x;
    joystick.y = v.y;
    setView({ ox: o.x, oy: o.y, kx: v.x * RADIUS, ky: -v.y * RADIUS });
    recomputeMove();
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (origin.current?.id !== e.pointerId) return;
    origin.current = null;
    joystick.active = false;
    joystick.x = 0;
    joystick.y = 0;
    setView(null);
    recomputeMove();
  };

  return (
    <div className="joystick-zone" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {view && (
        <div className="joystick-base" style={{ left: view.ox - RADIUS, top: view.oy - RADIUS, width: RADIUS * 2, height: RADIUS * 2 }}>
          <div className="joystick-knob" style={{ transform: `translate(${view.kx}px, ${view.ky}px)` }} />
        </div>
      )}
    </div>
  );
}
