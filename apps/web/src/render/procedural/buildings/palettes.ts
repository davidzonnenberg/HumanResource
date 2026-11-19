/**
 * Curated colour schemes: wall, bands, trim, door and roof are chosen together,
 * so houses look designed instead of randomly painted. Pure data.
 * Tags: 'brick' / 'plaster' tell the wall type; the rest is mood
 * (classic, pastel, faded, squat, modern, dark, synergy).
 */
export interface ColourScheme {
  id: string;
  tags: readonly string[];
  wall: string;
  band: string;
  trim: string;
  ledge: string;
  roof: string;
  door: string;
  accent: string;
}

export const SCHEMES: readonly ColourScheme[] = [
  // classic brick
  { id: 'amsterdam_red', tags: ['brick', 'classic'], wall: '#8a3f2c', band: '#f0d9ae', trim: '#f4e3c1', ledge: '#5b4f52', roof: '#5d6170', door: '#2e5e4e', accent: '#2e5e4e' },
  { id: 'canal_brown', tags: ['brick', 'classic'], wall: '#6e3a30', band: '#ead2a5', trim: '#fff4e0', ledge: '#4a3f44', roof: '#4f5361', door: '#1f3b3a', accent: '#7a2e2a' },
  { id: 'warm_orange', tags: ['brick', 'classic'], wall: '#b4623f', band: '#f0d9ae', trim: '#ffffff', ledge: '#6b5d5f', roof: '#a34d33', door: '#2f6fa8', accent: '#2f6fa8' },
  { id: 'merchant_dark', tags: ['brick', 'classic', 'grand'], wall: '#5a3a32', band: '#e8c48f', trim: '#f4e3c1', ledge: '#3d3539', roof: '#3c3f4a', door: '#6b1f1f', accent: '#6b1f1f' },
  { id: 'blue_trim', tags: ['brick', 'classic'], wall: '#9c4a32', band: '#f0d9ae', trim: '#8fc1e8', ledge: '#5b4f52', roof: '#4f5361', door: '#2f6fa8', accent: '#2f6fa8' },
  { id: 'mustard_trim', tags: ['brick', 'classic'], wall: '#7a3a2c', band: '#ead2a5', trim: '#f2b84b', ledge: '#6b5d5f', roof: '#5d6170', door: '#2e7d6b', accent: '#2e7d6b' },
  { id: 'red_trim', tags: ['brick', 'classic'], wall: '#a95638', band: '#f4e3c1', trim: '#e05a4f', ledge: '#5b4f52', roof: '#6a5a55', door: '#e05a4f', accent: '#f4e3c1' },
  { id: 'grand_sand', tags: ['plaster', 'grand'], wall: '#e9dcc0', band: '#fff8ea', trim: '#ffffff', ledge: '#7a6c66', roof: '#4f5361', door: '#1f3b3a', accent: '#1f3b3a' },
  // pastel plaster
  { id: 'mint', tags: ['plaster', 'pastel'], wall: '#a8d5ba', band: '#fff4e0', trim: '#ffffff', ledge: '#6b7f73', roof: '#5d6170', door: '#c0392b', accent: '#c0392b' },
  { id: 'butter', tags: ['plaster', 'pastel'], wall: '#f1d483', band: '#fff8e8', trim: '#ffffff', ledge: '#7a6c5a', roof: '#a34d33', door: '#2f6fa8', accent: '#2f6fa8' },
  { id: 'sky', tags: ['plaster', 'pastel'], wall: '#9cc3e6', band: '#f6efe0', trim: '#ffffff', ledge: '#5b6a7a', roof: '#4f5361', door: '#e0a43a', accent: '#e0a43a' },
  { id: 'peach', tags: ['plaster', 'pastel'], wall: '#eeb08f', band: '#fff4e0', trim: '#fffaf0', ledge: '#7a5c50', roof: '#6a5a55', door: '#1f6f63', accent: '#1f6f63' },
  { id: 'lilac', tags: ['plaster', 'pastel'], wall: '#c9b0d6', band: '#fbf3ff', trim: '#ffffff', ledge: '#6f6378', roof: '#4f5361', door: '#2e7d6b', accent: '#2e7d6b' },
  // faded / rundown
  { id: 'faded_brick', tags: ['brick', 'faded'], wall: '#7a5048', band: '#c9bba0', trim: '#d8cfc0', ledge: '#5f5a58', roof: '#5a5a5e', door: '#6b6b5e', accent: '#8a7a5a' },
  { id: 'grimy_plaster', tags: ['plaster', 'faded'], wall: '#b8b0a0', band: '#a8a090', trim: '#cfc8b8', ledge: '#5f5a58', roof: '#55565c', door: '#4a5a4a', accent: '#7a4a3a' },
  { id: 'squat_brick', tags: ['brick', 'squat'], wall: '#8a4a3a', band: '#c9b090', trim: '#e05a4f', ledge: '#4a4446', roof: '#4f5361', door: '#7a3fa8', accent: '#2f9e44' },
  { id: 'squat_paint', tags: ['plaster', 'squat'], wall: '#5f8f6f', band: '#d8c8a0', trim: '#f2b84b', ledge: '#3d3539', roof: '#55565c', door: '#e05a4f', accent: '#7a3fa8' },
  // modern
  { id: 'white_modern', tags: ['plaster', 'modern'], wall: '#eeeae4', band: '#d8d4ce', trim: '#3a3a3e', ledge: '#4a4a4e', roof: '#6a6a70', door: '#2f2f33', accent: '#e0a43a' },
  { id: 'anthracite', tags: ['plaster', 'modern', 'dark'], wall: '#3a3b40', band: '#2e2f33', trim: '#1f2023', ledge: '#2a2b2e', roof: '#55565c', door: '#c9a66b', accent: '#e05a4f' },
  { id: 'concrete', tags: ['plaster', 'modern'], wall: '#b9b6b0', band: '#a5a29c', trim: '#2f3033', ledge: '#6a6862', roof: '#5c5d62', door: '#2f6fa8', accent: '#2f6fa8' },
  { id: 'timber', tags: ['plaster', 'modern'], wall: '#c49a6c', band: '#a07850', trim: '#2f2f33', ledge: '#3a3a3e', roof: '#4a4b50', door: '#2f2f33', accent: '#2e7d6b' },
  // special
  { id: 'hip_black', tags: ['plaster', 'dark'], wall: '#2b2b2e', band: '#3a3a3e', trim: '#1f1f22', ledge: '#1a1a1c', roof: '#3c3f4a', door: '#1f1f22', accent: '#ff6fae' },
  { id: 'synergy_white', tags: ['plaster', 'synergy'], wall: '#f4f1ea', band: '#e6dcc8', trim: '#c9a66b', ledge: '#3a3540', roof: '#4a4552', door: '#2b2b2e', accent: '#6a4fa8' },
];

export function schemesWithTags(tags: readonly string[]): ColourScheme[] {
  return SCHEMES.filter((s) => tags.some((t) => s.tags.includes(t)));
}

export function schemeById(id: string): ColourScheme | undefined {
  return SCHEMES.find((s) => s.id === id);
}
