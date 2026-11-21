// T6: measures the frame rate for ~3 s on first launch (and again after "Auto" is picked) and stores the preset.
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { QualityProbe as Probe } from './quality';
import { useQualityStore } from './qualityStore';

export function QualityProbe() {
  const needed = useQualityStore((s) => s.loaded && s.choice === 'auto' && s.detected === null);
  const probe = useRef<Probe | null>(null);
  useFrame((_, dt) => {
    if (!needed) { probe.current = null; return; }
    probe.current ??= new Probe();
    const preset = probe.current.push(dt * 1000);
    if (preset) {
      probe.current = null;
      useQualityStore.getState().setDetected(preset);
    }
  });
  return null;
}
