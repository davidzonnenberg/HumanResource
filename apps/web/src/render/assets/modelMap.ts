// Asset mapping (16.4): every model key maps to a placeholder primitive or a glTF. Swapping a
// placeholder for a Kenney/KayKit model is a one-line change here.
// glTF entries are auto-fitted to the plot (see GltfBuilding.tsx). Tuning knobs per model:
//   scale     multiplier on the auto-fit size (1 = fit the plot / maxHeight)
//   maxHeight tallest the fitted model may be, in world units (default 14)
//   offset    extra [x, y, z] shift;  rotationY  extra turn in radians (Math.PI = turn it around)
//   brightness multiplier on the texture colour (default 2.2; raise if too dark, lower if washed out)
export type GltfEntry = {
  kind: 'gltf';
  url: string;
  scale: number;
  offset: [number, number, number];
  rotationY: number;
  maxHeight?: number;
  brightness?: number;
};

export type ModelEntry =
  | { kind: 'primitive'; shape: 'capsule' | 'box' | 'van' | 'crate' | 'flat'; size: [number, number, number]; color: string }
  | GltfEntry;

export const MODEL_MAP: Record<string, ModelEntry> = {
  human: { kind: 'primitive', shape: 'capsule', size: [0.32, 0.7, 0.32], color: 'human' },
  customer: { kind: 'primitive', shape: 'capsule', size: [0.3, 0.62, 0.3], color: 'customer' },
  ceo: { kind: 'primitive', shape: 'capsule', size: [0.36, 0.78, 0.36], color: 'ceo' },
  crate_beer: { kind: 'primitive', shape: 'crate', size: [0.55, 0.45, 0.55], color: 'crate' },
  // A Keg is the same box, taller and narrower (a display and pricing unit only, 58.1).
  keg_beer: { kind: 'primitive', shape: 'crate', size: [0.45, 0.7, 0.45], color: 'crate' },
  crate_hops: { kind: 'primitive', shape: 'crate', size: [0.55, 0.45, 0.55], color: 'crate' },
  crate_malt: { kind: 'primitive', shape: 'crate', size: [0.55, 0.45, 0.55], color: 'crate' },
  // Test models (files in apps/web/public/models, made by `npm run models:optimize`).
  building_pub: { kind: 'gltf', url: '/models/ComfyUI_00012.glb', scale: 0.9, offset: [0, 0, 0], rotationY: 0, brightness: 3.6 },
  building_pub_rival: { kind: 'gltf', url: '/models/ComfyUI_00010.glb', scale: 1, offset: [0, 0, 0], rotationY: 0 },
  building_supplier: { kind: 'primitive', shape: 'box', size: [1, 4.5, 1], color: 'owner' },
  // Landmark (render-only for now, placed by content/data/maps/landmarks.json). Taller cap than a
  // canal house (default maxHeight 14) so the clock tower is not squashed.
  building_town_hall: { kind: 'gltf', url: '/models/cityhall_00002.glb', scale: 1, offset: [0, 0, 0], rotationY: 0, maxHeight: 22, brightness: 2.6 },
  building_brewery: { kind: 'primitive', shape: 'box', size: [1, 4.2, 1], color: 'owner' },
  building_warehouse: { kind: 'primitive', shape: 'box', size: [1, 3.0, 1], color: 'owner' },
  // Offices: placeholder boxes until real models exist (60.4).
  building_municipality: { kind: 'primitive', shape: 'box', size: [1, 4.0, 1], color: 'owner' },
  building_bank: { kind: 'primitive', shape: 'box', size: [1, 3.6, 1], color: 'owner' },
  building_job_centre: { kind: 'primitive', shape: 'box', size: [1, 3.2, 1], color: 'owner' },
  building_market_depot: { kind: 'primitive', shape: 'box', size: [1, 2.6, 1], color: 'owner' },
  plot_empty: { kind: 'primitive', shape: 'flat', size: [1, 0.05, 1], color: 'plotEmpty' },
  plot_for_sale: { kind: 'primitive', shape: 'flat', size: [1, 0.05, 1], color: 'plotForSale' },
  vehicle_van: { kind: 'primitive', shape: 'van', size: [1.8, 1.5, 3.2], color: 'owner' },
  // Owner variant: `<modelKey>_<owner>` wins for that owner (render-only, see Vehicles.tsx vehicleGltf).
  // scale 1 = fitted to the placeholder van's length; rotationY Math.PI if it drives backwards.
  // `scale` also scales the van's physics hitbox and wheel positions (physics/ManualDriving.tsx).
  // The player's van is procedural for now (Vehicles.tsx VehicleBody); the old GLB van is the rival's.
  vehicle_van_cmp_rival: { kind: 'gltf', url: '/models/van_00001.glb', scale: 1.1, offset: [0, 0, 0], rotationY: Math.PI, brightness: 2.2 },
};

export function modelFor(key: string): ModelEntry {
  const m = MODEL_MAP[key];
  if (!m) throw new Error(`No model mapping for "${key}"`);
  return m;
}
