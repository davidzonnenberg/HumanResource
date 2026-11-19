/**
 * Dutch toy-building recipe (v4): plain data, no three.js.
 * Units: metres. Origin: centre of the footprint at ground level.
 * The street facade faces +Z. Width along X, depth along Z, up is +Y.
 */
import type { GableKind } from './gables';

/** '#rrggbb', a key of `colours`, or 'owner' / 'ownerDark' / 'ownerLight'. */
export type ColourToken = string;

export interface BuildingColours {
  /** Wall colour (brick tint, or plaster colour when facade = 'plaster'). */
  brick: ColourToken;
  /** String courses, cornice, quoins, pilasters (the thick cream bands). */
  band: ColourToken;
  /** Window frames, gable rim, finials, step caps. */
  trim: ColourToken;
  /** Plinth, sills, steps, drainpipe (dark stone). */
  ledge: ColourToken;
  roof: ColourToken;
  glass: ColourToken;
  lit: ColourToken;
  door: ColourToken;
  /** Shopfront, awning, sign, shutters. Usually 'owner' for player buildings. */
  accent: ColourToken;
}

export type GroundKind = 'door' | 'shop' | 'pub' | 'warehouse';
/** 'gloss' = shiny paint and brass; 'sign' = painted letters from the sign atlas. */
export type MeshGroup = 'brick' | 'plaster' | 'roof' | 'trim' | 'gloss' | 'glass' | 'lit' | 'sign';
export type WindowStyle = 'cross' | 'grid' | 'plain' | 'modern';
export type ArchKind = 'none' | 'round' | 'segment';
export type Detail = 'high' | 'low';
/** One hero element per house. */
export type FocalKind = 'none' | 'roundWindow' | 'bayWindow' | 'niche' | 'balcony' | 'gableStone' | 'bigSign';
/** Clear identifiers for important buildings. */
export type IdentityKind = 'none' | 'pub' | 'bank' | 'municipality' | 'brewery' | 'coffee' | 'synergy' | 'shop';
export type WindowLife = 'cat' | 'plant' | 'lamp' | 'person' | 'scarf' | 'drawing' | 'lace';

export interface PropFlags {
  ivy: boolean;
  bike: boolean;
  flatTyreBike: boolean;
  wallAnchors: boolean;
  kliko: boolean;
  /** Geveltuintje: narrow strip of hollyhocks against the facade. */
  gardenStrip: boolean;
  doormat: boolean;
  parcel: boolean;
  laundry: boolean;
  satellite: boolean;
  kingsFlag: boolean;
  xmasLights: boolean;
  birdNest: boolean;
  pigeon: boolean;
  posters: boolean;
  /** Needs focal 'balcony'. */
  mattress: boolean;
  teKoop: boolean;
  weeds: boolean;
  neeNee: boolean;
  yearStone: boolean;
  synergyPlate: boolean;
  linkedInBanner: boolean;
  solarPanels: boolean;
}

export const NO_PROPS: PropFlags = {
  ivy: false,
  bike: false,
  flatTyreBike: false,
  wallAnchors: false,
  kliko: false,
  gardenStrip: false,
  doormat: false,
  parcel: false,
  laundry: false,
  satellite: false,
  kingsFlag: false,
  xmasLights: false,
  birdNest: false,
  pigeon: false,
  posters: false,
  mattress: false,
  teKoop: false,
  weeds: false,
  neeNee: false,
  yearStone: false,
  synergyPlate: false,
  linkedInBanner: false,
  solarPanels: false,
};

export interface ExtraPart {
  /**
   * box / roundedBox: size = [w, h, d]
   * cylinder (rounded edges): [radius, length, 0]
   * sphere: [radius, yScale (0 = 1), 0]
   * dome (half sphere): [radius, yScale (0 = 1), 0]
   * torus: [radius, tube, 0]
   * cone: [radius, height, 0]
   */
  shape: 'box' | 'roundedBox' | 'cylinder' | 'sphere' | 'dome' | 'torus' | 'cone';
  size: [number, number, number];
  pos: [number, number, number];
  rot?: [number, number, number];
  axis?: 'x' | 'y' | 'z';
  colour: ColourToken;
  group?: MeshGroup;
  mirrorX?: boolean;
}

export interface BuildingRecipe {
  style: 'dutch_row';
  /** Informational: which archetype / district produced it (designer mode uses these). */
  archetype: string;
  district: string;
  width: number;
  depth: number;
  bays: number;
  groundFloorHeight: number;
  floorHeights: number[];
  facade: 'brick' | 'plaster';
  corners: 'quoins' | 'pilaster' | 'none';
  /** -0.06..0.06: > 0 upper floors wider than the ground floor, < 0 narrower. */
  taper: number;
  /** How far the eave cornice sticks out (m), 0.08..0.45. */
  corniceOverhang: number;
  /** Rounding of the main body edges (m), 0.04..0.3. Higher = more pillowy. */
  bodyRadius: number;
  gable: {
    kind: GableKind;
    height: number;
    rim: boolean;
    finials: boolean;
    window: boolean;
    hoistBeam: boolean;
    ornaments: boolean;
  };
  ground: {
    kind: GroundKind;
    doorBay?: number;
    steps: number;
    doorArch: boolean;
    awning: boolean;
    sign: boolean;
  };
  windows: {
    upperBays?: number;
    style: WindowStyle;
    arch: ArchKind;
    flowerBoxes: number;
    shutters: boolean;
  };
  roof: { tiles: boolean; dormers: boolean };
  focal: FocalKind;
  identity: IdentityKind;
  /** Text from SIGN_TEXTS for shop fronts, big signs and identity plates. */
  signText: string | null;
  props: PropFlags;
  /** Share of windows with something in them, and what can appear. */
  windowLife: { share: number; kinds: WindowLife[] };
  /** Share of windows boarded up (rundown). */
  boarded: number;
  /** 0..1 streaks, moss, faded doors, chipped plaster, missing tiles. */
  weathering: number;
  sideWindows: boolean;
  chimney: boolean;
  drainpipe: boolean;
  apron: boolean;
  /** 0..1 lean, bulge, ridge sag, crooked windows. 0 = straight. */
  imperfection: number;
  colours: BuildingColours;
  litFraction: number;
  seed: number;
  extras: ExtraPart[];
}

const baseColours: BuildingColours = {
  brick: '#8a3f2c',
  band: '#f0d9ae',
  trim: '#f4e3c1',
  ledge: '#6b5d5f',
  roof: '#5d6170',
  glass: '#33557e',
  lit: '#ffcf70',
  door: '#6b3f2a',
  accent: 'owner',
};

/** The reference canal house: bell gable, thick cream rim, ball finials, flower boxes. */
export const PRESET_CANAL_BELL: BuildingRecipe = {
  style: 'dutch_row',
  archetype: 'merchant',
  district: 'old_town',
  width: 4.4,
  depth: 6,
  bays: 3,
  groundFloorHeight: 2.8,
  floorHeights: [2.6],
  facade: 'brick',
  corners: 'none',
  taper: 0.02,
  corniceOverhang: 0.2,
  bodyRadius: 0.12,
  gable: { kind: 'bell', height: 3.4, rim: true, finials: true, window: true, hoistBeam: false, ornaments: false },
  ground: { kind: 'door', steps: 2, doorArch: false, awning: false, sign: false },
  windows: { upperBays: 2, style: 'cross', arch: 'none', flowerBoxes: 0.8, shutters: false },
  roof: { tiles: true, dormers: false },
  focal: 'gableStone',
  identity: 'none',
  signText: null,
  props: { ...NO_PROPS, bike: true, wallAnchors: true, doormat: true, yearStone: true },
  windowLife: { share: 0.4, kinds: ['plant', 'cat', 'lace'] },
  boarded: 0,
  weathering: 0.3,
  sideWindows: true,
  chimney: false,
  drainpipe: true,
  apron: false,
  imperfection: 0.6,
  colours: { ...baseColours, brick: '#7a3a2c' },
  litFraction: 0.5,
  seed: 1,
  extras: [],
};

export const PRESET_PUB_COSY_LOCAL: BuildingRecipe = {
  ...PRESET_CANAL_BELL,
  archetype: 'pub',
  width: 5.2,
  depth: 7,
  bays: 3,
  floorHeights: [2.6, 2.4],
  corners: 'quoins',
  taper: 0.03,
  corniceOverhang: 0.25,
  gable: { kind: 'step', height: 3.2, rim: true, finials: false, window: true, hoistBeam: true, ornaments: false },
  ground: { kind: 'pub', steps: 0, doorArch: false, awning: true, sign: true },
  windows: { style: 'grid', arch: 'segment', flowerBoxes: 0.7, shutters: true },
  focal: 'none',
  identity: 'pub',
  signText: 'COSY LOCAL',
  props: { ...NO_PROPS, ivy: true, bike: true, wallAnchors: true, pigeon: true, birdNest: true },
  windowLife: { share: 0.5, kinds: ['lamp', 'plant', 'person'] },
  weathering: 0.35,
  chimney: true,
  apron: true,
  imperfection: 0.7,
  colours: { ...baseColours, brick: '#9c4a32', accent: 'owner' },
  litFraction: 0.8,
  seed: 11,
};

export const PRESET_SPORTS_PUB: BuildingRecipe = {
  ...PRESET_CANAL_BELL,
  archetype: 'sports_fan',
  width: 5.8,
  depth: 7,
  bays: 4,
  floorHeights: [2.6],
  facade: 'plaster',
  corners: 'pilaster',
  bodyRadius: 0.18,
  gable: { kind: 'neck', height: 3, rim: true, finials: true, window: true, hoistBeam: false, ornaments: true },
  ground: { kind: 'pub', steps: 0, doorArch: false, awning: true, sign: true },
  windows: { style: 'cross', arch: 'none', flowerBoxes: 0, shutters: false },
  focal: 'none',
  identity: 'pub',
  signText: 'SPORTCAFÉ',
  props: { ...NO_PROPS, satellite: true, kingsFlag: true, posters: true },
  windowLife: { share: 0.5, kinds: ['scarf', 'person'] },
  apron: true,
  imperfection: 0.45,
  colours: { ...baseColours, brick: '#f2e3c6', trim: '#ffffff', accent: '#2f6fa8' },
  seed: 12,
};

export const PRESET_MUNICIPALITY: BuildingRecipe = {
  ...PRESET_CANAL_BELL,
  archetype: 'grand',
  district: 'centre',
  width: 9,
  depth: 8,
  bays: 3,
  groundFloorHeight: 3.4,
  floorHeights: [3.2],
  corners: 'quoins',
  taper: 0,
  corniceOverhang: 0.35,
  bodyRadius: 0.1,
  gable: { kind: 'step', height: 4.6, rim: true, finials: false, window: true, hoistBeam: false, ornaments: true },
  ground: { kind: 'door', steps: 3, doorArch: true, awning: false, sign: false },
  windows: { upperBays: 3, style: 'grid', arch: 'round', flowerBoxes: 0, shutters: false },
  roof: { tiles: true, dormers: true },
  focal: 'none',
  identity: 'municipality',
  signText: 'GEMEENTE',
  props: { ...NO_PROPS, pigeon: true },
  windowLife: { share: 0.2, kinds: ['person', 'plant'] },
  weathering: 0.15,
  sideWindows: true,
  drainpipe: false,
  apron: true,
  imperfection: 0.3,
  colours: { ...baseColours, brick: '#a95638', band: '#f4e3c1', door: '#7a3a22', roof: '#6d7380' },
  litFraction: 0.3,
  seed: 21,
  extras: [
    // Clock in the gable (eave = 6.6)
    { shape: 'cylinder', size: [0.55, 0.16, 0], axis: 'z', pos: [0, 10.15, 4.16], colour: 'trim' },
    { shape: 'cylinder', size: [0.44, 0.18, 0], axis: 'z', pos: [0, 10.15, 4.2], colour: '#fffaf0' },
    { shape: 'torus', size: [0.44, 0.05, 0], axis: 'z', pos: [0, 10.15, 4.3], colour: '#7a3a22' },
    { shape: 'roundedBox', size: [0.06, 0.3, 0.04], pos: [0, 10.27, 4.33], colour: '#3a2a22' },
    { shape: 'roundedBox', size: [0.22, 0.06, 0.04], pos: [0.09, 10.15, 4.33], colour: '#3a2a22' },
    // Bell turret on the left roof slope
    { shape: 'cylinder', size: [0.75, 1.2, 0], pos: [-2.9, 8.2, 1.2], colour: 'band' },
    { shape: 'cylinder', size: [0.62, 1.0, 0], pos: [-2.9, 9.2, 1.2], colour: 'brick', group: 'brick' },
    { shape: 'torus', size: [0.66, 0.1, 0], pos: [-2.9, 9.72, 1.2], colour: 'trim' },
    { shape: 'dome', size: [0.7, 0.9, 0], pos: [-2.9, 9.75, 1.2], colour: 'trim' },
    { shape: 'cylinder', size: [0.08, 0.5, 0], pos: [-2.9, 10.6, 1.2], colour: 'ledge' },
    { shape: 'dome', size: [0.3, 1.3, 0], pos: [-2.9, 10.75, 1.2], rot: [Math.PI, 0, 0], colour: '#a8682e', group: 'gloss' },
    { shape: 'sphere', size: [0.07, 0, 0], pos: [-2.9, 10.42, 1.2], colour: '#7a4a1e' },
    { shape: 'cylinder', size: [0.03, 0.9, 0], pos: [-2.9, 11.3, 1.2], colour: 'ledge' },
  ],
};

export const PRESET_BANK: BuildingRecipe = {
  ...PRESET_CANAL_BELL,
  archetype: 'grand',
  district: 'centre',
  width: 7,
  depth: 7,
  bays: 3,
  groundFloorHeight: 3.4,
  floorHeights: [3],
  facade: 'plaster',
  corners: 'quoins',
  taper: 0,
  corniceOverhang: 0.4,
  bodyRadius: 0.08,
  gable: { kind: 'cornice', height: 0, rim: true, finials: false, window: false, hoistBeam: false, ornaments: false },
  ground: { kind: 'door', steps: 3, doorArch: true, awning: false, sign: false },
  windows: { upperBays: 4, style: 'grid', arch: 'round', flowerBoxes: 0, shutters: false },
  roof: { tiles: false, dormers: false },
  focal: 'none',
  identity: 'bank',
  signText: 'BANK',
  props: { ...NO_PROPS },
  windowLife: { share: 0.15, kinds: ['person', 'lamp'] },
  weathering: 0.05,
  sideWindows: false,
  drainpipe: false,
  apron: true,
  imperfection: 0.2,
  colours: { ...baseColours, brick: '#d8d0bf', band: '#f6efe0', trim: '#ffffff', ledge: '#6b6f78', door: '#1f4f63' },
  litFraction: 0.2,
  seed: 31,
};

export const PRESET_SUPPLIER: BuildingRecipe = {
  ...PRESET_CANAL_BELL,
  archetype: 'warehouse_loft',
  district: 'harbour',
  width: 7,
  depth: 9,
  bays: 3,
  groundFloorHeight: 3.4,
  floorHeights: [2.8],
  corners: 'pilaster',
  taper: -0.02,
  gable: { kind: 'spout', height: 3.8, rim: true, finials: false, window: true, hoistBeam: true, ornaments: false },
  ground: { kind: 'warehouse', steps: 0, doorArch: false, awning: false, sign: true },
  windows: { style: 'grid', arch: 'segment', flowerBoxes: 0, shutters: true },
  focal: 'none',
  identity: 'brewery',
  signText: 'BROUWERIJ',
  props: { ...NO_PROPS, ivy: true, wallAnchors: true, weeds: true, pigeon: true },
  windowLife: { share: 0.1, kinds: ['lamp'] },
  weathering: 0.6,
  sideWindows: false,
  imperfection: 0.8,
  colours: { ...baseColours, brick: '#6e3a30', door: '#8a5a2e', accent: '#2f6b4f' },
  litFraction: 0.2,
  seed: 41,
};

/** Future cult HQ: friendly on the outside. */
export const PRESET_SYNERGY_OFFICE: BuildingRecipe = {
  ...PRESET_CANAL_BELL,
  archetype: 'consultant',
  district: 'modern',
  width: 7.5,
  depth: 8,
  bays: 3,
  groundFloorHeight: 3.2,
  floorHeights: [3, 3, 3],
  facade: 'plaster',
  corners: 'none',
  taper: 0.02,
  corniceOverhang: 0.12,
  bodyRadius: 0.28,
  gable: { kind: 'flat', height: 0, rim: false, finials: false, window: false, hoistBeam: false, ornaments: false },
  ground: { kind: 'door', steps: 1, doorArch: false, awning: false, sign: false },
  windows: { upperBays: 3, style: 'modern', arch: 'none', flowerBoxes: 0, shutters: false },
  roof: { tiles: false, dormers: false },
  focal: 'balcony',
  identity: 'synergy',
  signText: 'SYNERGY',
  props: { ...NO_PROPS, linkedInBanner: true, solarPanels: true, synergyPlate: true },
  windowLife: { share: 0.3, kinds: ['plant', 'person'] },
  weathering: 0,
  sideWindows: false,
  drainpipe: false,
  apron: true,
  imperfection: 0.05,
  colours: { ...baseColours, brick: '#f4f1ea', band: '#e6dcc8', trim: '#c9a66b', ledge: '#3a3540', roof: '#4a4552', door: '#2b2b2e', accent: '#6a4fa8' },
  litFraction: 0.6,
  seed: 51,
};

export const BUILDING_PRESETS: Record<string, BuildingRecipe> = {
  house_canal_bell: PRESET_CANAL_BELL,
  pub_cosy_local: PRESET_PUB_COSY_LOCAL,
  pub_sports: PRESET_SPORTS_PUB,
  municipality: PRESET_MUNICIPALITY,
  bank: PRESET_BANK,
  supplier_beer: PRESET_SUPPLIER,
  synergy_office: PRESET_SYNERGY_OFFICE,
};

export function totalEaveHeight(r: BuildingRecipe): number {
  return r.groundFloorHeight + r.floorHeights.reduce((a, b) => a + b, 0);
}
