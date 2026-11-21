import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useQuality, useQualityStore } from './qualityStore';
import { nextDprFactor } from './dprRule';

/**
 * Lowers the pixel ratio in small steps when the 10 s rolling FPS drops below 30 (41.5). The quality preset (T6)
 * sets the ceiling: Low caps the device pixel ratio at 1.5, High uses the device's (max 2).
 */
export function AdaptiveDpr() {
  const setDpr = useThree((s) => s.setDpr);
  const frames = useRef<number[]>([]);
  const factor = useRef(1);
  const cap = Math.min(2, useQuality().pixelRatioCap ?? 2);
  const known = useQualityStore((s) => s.loaded && (s.choice !== 'auto' || s.detected !== null));
  const capRef = useRef(cap);
  capRef.current = cap;
  useEffect(() => {
    if (known) setDpr(Math.min(cap, window.devicePixelRatio) * factor.current);
  }, [known, cap, setDpr]);
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
      setDpr(Math.min(capRef.current, window.devicePixelRatio) * next);
    }
  });
  return null;
}
