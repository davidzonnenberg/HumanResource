// T6: render quality presets (docs/procedural-town-handover.md, section 7). Pure data and rules, no three, no DOM.
// One `Quality` object that the render code reads. Stored per device (qualityStore.ts), never in SimState or a save.

export type QualityPreset = 'low' | 'high';
/** What the player picks in Settings: a preset, or `auto` (the preset measured on this device). */
export type QualityChoice = 'auto' | QualityPreset;

export interface Quality {
  preset: QualityPreset;
  /** Cap for the device pixel ratio; null = use the device's. */
  pixelRatioCap: number | null;
  /** How many chunk rings around the camera are built: 1 = 3 x 3 chunks, 2 = 5 x 5. */
  chunkRadius: number;
  /** Buildings closer than this (m) get the full procedural recipe (LOD0). */
  lod0Distance: number;
  /** Closer than this: box and roof with a facade texture (LOD1). Beyond: merged chunk mesh (LOD2). */
  lod1Distance: number;
  /** Most LOD0 buildings at once (each one is several draw calls). */
  maxLod0Buildings: number;
  /** 'off' = no shadows; 'map' = a shadow map that follows the camera. */
  shadows: 'off' | 'map';
  /** Trees closer than this (m) are meshes; farther ones are flat discs. */
  treeMeshDistance: number;
  /** Trees farther than this (m) are not drawn at all. */
  treeFarDistance: number;
  /** New LOD0 buildings built per frame (the rest wait for the next frame). */
  maxNewBuildingsPerFrame: number;
}

export const QUALITY: Record<QualityPreset, Quality> = {
  low: {
    preset: 'low', pixelRatioCap: 1.5, chunkRadius: 1, lod0Distance: 35, lod1Distance: 250, maxLod0Buildings: 5,
    shadows: 'off', treeMeshDistance: 40, treeFarDistance: 400, maxNewBuildingsPerFrame: 4,
  },
  high: {
    preset: 'high', pixelRatioCap: null, chunkRadius: 2, lod0Distance: 80, lod1Distance: 400, maxLod0Buildings: 24,
    shadows: 'map', treeMeshDistance: 150, treeFarDistance: 650, maxNewBuildingsPerFrame: 16,
  },
};

/** Budgets the Low preset is tested against (section 7): measured on a mid-range Android phone. */
export const LOW_BUDGET = { drawCalls: 150, triangles: 400_000, frameMs: 16 } as const;

/** Below this many frames per second the first-launch measurement picks Low. */
export const AUTO_LOW_FPS = 50;
/** The measurement runs this long (ms), after a short warm-up that is not counted. */
export const PROBE_MS = 3000;
export const PROBE_WARMUP_MS = 500;

/** The preset used before a measurement exists: safe on every device. */
export const DEFAULT_PRESET: QualityPreset = 'low';

export function resolveQuality(choice: QualityChoice, detected: QualityPreset | null): Quality {
  const preset: QualityPreset = choice === 'auto' ? (detected ?? DEFAULT_PRESET) : choice;
  return QUALITY[preset];
}

export function presetForFps(fps: number): QualityPreset {
  return fps < AUTO_LOW_FPS ? 'low' : 'high';
}

/**
 * Frame-rate probe. Feed it the time between frames (ms); it returns the preset once PROBE_MS of frames have been
 * counted (after the warm-up), and null before that. A long stall (tab in the background, > 250 ms) restarts it,
 * so a hiccup while the game loads does not decide the preset.
 */
export class QualityProbe {
  private elapsed = 0;
  private counted = 0;
  private frames = 0;
  private done: QualityPreset | null = null;

  push(dtMs: number): QualityPreset | null {
    if (this.done) return this.done;
    if (!(dtMs > 0)) return null;
    if (dtMs > 250) { this.elapsed = 0; this.counted = 0; this.frames = 0; return null; }
    this.elapsed += dtMs;
    if (this.elapsed <= PROBE_WARMUP_MS) return null;
    this.counted += dtMs;
    this.frames += 1;
    if (this.counted < PROBE_MS) return null;
    this.done = presetForFps((this.frames / this.counted) * 1000);
    return this.done;
  }
}
