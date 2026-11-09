import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { nextDprFactor } from './dprRule';

/** Lowers the pixel ratio in small steps when the 10 s rolling FPS drops below 30 (41.5). */
export function AdaptiveDpr() {
  const setDpr = useThree((s) => s.setDpr);
  const frames = useRef<number[]>([]);
  const factor = useRef(1);
  const lastChange = useRef(0);
  useFrame(() => {
    const now = performance.now();
    const f = frames.current;
    f.push(now);
    while (f.length > 0 && (f[0] as number) < now - 10_000) f.shift();
    if (f.length < 30) return;
    const fps = (f.length / Math.max(1, now - (f[0] as number))) * 1000;
    const next = nextDprFactor(factor.current, fps, now - lastChange.current);
    if (next !== factor.current) {
      factor.current = next;
      lastChange.current = now;
      setDpr(Math.min(2, window.devicePixelRatio) * next);
    }
  });
  return null;
}
