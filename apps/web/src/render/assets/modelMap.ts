// Asset mapping (16.4): every model key maps to a placeholder primitive or a glTF. Swapping a
// placeholder for a Kenney/KayKit model is a one-line change here.
export type ModelEntry =
  | { kind: 'primitive'; shape: 'capsule' | 'box' | 'van' | 'crate' | 'flat'; size: [number, number, number]; color: string }
  | { kind: 'gltf'; url: string; scale: number; offset: [number, number, number]; rotationY: number };

export const MODEL_MAP: Record<string, ModelEntry> = {
  human: { kind: 'primitive', shape: 'capsule', size: [0.32, 0.7, 0.32], color: 'human' },
  customer: { kind: 'primitive', shape: 'capsule', size: [0.3, 0.62, 0.3], color: 'customer' },
  ceo: { kind: 'primitive', shape: 'capsule', size: [0.36, 0.78, 0.36], color: 'ceo' },
  crate_beer: { kind: 'primitive', shape: 'crate', size: [0.55, 0.45, 0.55], color: 'crate' },
  building_pub: { kind: 'primitive', shape: 'box', size: [1, 3.4, 1], color: 'owner' },
  building_pub_rival: { kind: 'primitive', shape: 'box', size: [1, 3.8, 1], color: 'owner' },
  building_supplier: { kind: 'primitive', shape: 'box', size: [1, 4.5, 1], color: 'owner' },
  plot_empty: { kind: 'primitive', shape: 'flat', size: [1, 0.05, 1], color: 'plotEmpty' },
  plot_for_sale: { kind: 'primitive', shape: 'flat', size: [1, 0.05, 1], color: 'plotForSale' },
  vehicle_van: { kind: 'primitive', shape: 'van', size: [1.8, 1.5, 3.2], color: 'owner' },
};

export function modelFor(key: string): ModelEntry {
  const m = MODEL_MAP[key];
  if (!m) throw new Error(`No model mapping for "${key}"`);
  return m;
}
