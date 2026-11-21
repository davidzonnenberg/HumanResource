// T6: quality presets, the first-launch probe and the per-device setting.
import { describe, expect, it } from 'vitest';
import {
  AUTO_LOW_FPS, DEFAULT_PRESET, PROBE_MS, PROBE_WARMUP_MS, presetForFps, QUALITY, QualityProbe, resolveQuality,
} from '../src/render/quality';
import { DEFAULT_QUALITY_SETTINGS, parseQualitySettings, useQualityStore } from '../src/render/qualityStore';

describe('presets (handover section 7)', () => {
  it('Low is for phones: 1.5 pixel ratio, 1 ring, LOD0 at 35 m, no shadows, 40 m tree meshes, 4 new buildings per frame', () => {
    const q = QUALITY.low;
    expect(q).toMatchObject({ pixelRatioCap: 1.5, chunkRadius: 1, lod0Distance: 35, shadows: 'off', treeMeshDistance: 40, maxNewBuildingsPerFrame: 4 });
  });
  it('High is for PCs: device pixel ratio, 2 rings, LOD0 at 80 m, shadow map, 150 m tree meshes, 16 new buildings per frame', () => {
    const q = QUALITY.high;
    expect(q).toMatchObject({ pixelRatioCap: null, chunkRadius: 2, lod0Distance: 80, shadows: 'map', treeMeshDistance: 150, maxNewBuildingsPerFrame: 16 });
  });
  it('High is never cheaper than Low on any distance or count', () => {
    for (const k of ['chunkRadius', 'lod0Distance', 'lod1Distance', 'maxLod0Buildings', 'treeMeshDistance', 'treeFarDistance', 'maxNewBuildingsPerFrame'] as const) {
      expect(QUALITY.high[k], k).toBeGreaterThanOrEqual(QUALITY.low[k]);
    }
    expect(QUALITY.low.lod0Distance).toBeLessThan(QUALITY.low.lod1Distance);
    expect(QUALITY.high.lod0Distance).toBeLessThan(QUALITY.high.lod1Distance);
  });
});

describe('resolveQuality and the probe', () => {
  it('a manual choice wins; Auto uses the measurement, and Low until there is one', () => {
    expect(resolveQuality('high', 'low').preset).toBe('high');
    expect(resolveQuality('low', 'high').preset).toBe('low');
    expect(resolveQuality('auto', 'high').preset).toBe('high');
    expect(resolveQuality('auto', 'low').preset).toBe('low');
    expect(resolveQuality('auto', null).preset).toBe(DEFAULT_PRESET);
    expect(DEFAULT_PRESET).toBe('low');
  });

  it('picks Low below 50 fps and High from 50 fps', () => {
    expect(presetForFps(AUTO_LOW_FPS - 0.1)).toBe('low');
    expect(presetForFps(AUTO_LOW_FPS)).toBe('high');
    expect(presetForFps(144)).toBe('high');
  });

  function run(dtMs: number, maxMs = 20_000): { preset: string | null; at: number } {
    const p = new QualityProbe();
    let t = 0;
    while (t < maxMs) {
      t += dtMs;
      const r = p.push(dtMs);
      if (r) return { preset: r, at: t };
    }
    return { preset: null, at: t };
  }

  it('measures ~3 s after a short warm-up: 60 fps gives High, 30 fps gives Low', () => {
    const fast = run(1000 / 60);
    expect(fast.preset).toBe('high');
    expect(fast.at).toBeGreaterThanOrEqual(PROBE_MS + PROBE_WARMUP_MS - 1e-6);
    expect(fast.at).toBeLessThan(PROBE_MS + PROBE_WARMUP_MS + 100);
    expect(run(1000 / 30).preset).toBe('low');
    expect(run(1000 / 45).preset).toBe('low');
    expect(run(1000 / 55).preset).toBe('high');
  });

  it('a long stall (tab in the background, level loading) restarts the measurement', () => {
    const p = new QualityProbe();
    for (let i = 0; i < 100; i++) p.push(1000 / 30); // 3.3 s at 30 fps, not yet done...
    p.push(2000); // ...a stall wipes it
    let r: string | null = null, n = 0;
    while (!r && n++ < 1000) r = p.push(1000 / 60);
    expect(r).toBe('high'); // decided by the 60 fps after the stall, not the 30 fps before it
  });

  it('ignores bad frame times and keeps its answer', () => {
    const p = new QualityProbe();
    expect(p.push(0)).toBeNull();
    expect(p.push(NaN)).toBeNull();
    expect(p.push(-5)).toBeNull();
    let r: string | null = null;
    for (let i = 0; i < 400 && !r; i++) r = p.push(1000 / 60);
    expect(r).toBe('high');
    expect(p.push(100)).toBe('high');
  });
});

describe('per-device setting', () => {
  it('parse falls back field by field', () => {
    expect(parseQualitySettings(undefined)).toEqual(DEFAULT_QUALITY_SETTINGS);
    expect(parseQualitySettings({ choice: 'ultra', detected: 'high' })).toEqual({ choice: 'auto', detected: 'high' });
    expect(parseQualitySettings({ choice: 'low', detected: 'medium' })).toEqual({ choice: 'low', detected: null });
    expect(parseQualitySettings({ choice: 'high', detected: 'low' })).toEqual({ choice: 'high', detected: 'low' });
  });

  it('picking Auto clears the measurement so it is measured again; Low and High keep it', () => {
    const s = useQualityStore;
    s.setState({ choice: 'auto', detected: null, loaded: true });
    s.getState().setDetected('high');
    expect(s.getState().detected).toBe('high');
    s.getState().setChoice('low');
    expect(s.getState()).toMatchObject({ choice: 'low', detected: 'high' });
    s.getState().setChoice('auto');
    expect(s.getState()).toMatchObject({ choice: 'auto', detected: null });
  });
});
