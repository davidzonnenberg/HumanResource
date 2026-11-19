/**
 * House "characters" and neighbourhood styles. Pure data.
 * An archetype is a matching set of choices (shape, colours, props, focal point),
 * so a street reads as designed. A district sets the street-wide height,
 * width range, wonkiness and which archetypes live there.
 */
import type { ArchKind, FocalKind, GroundKind, IdentityKind, PropFlags, WindowLife, WindowStyle } from './buildingRecipe';
import type { GableKind } from './gables';

export type Weighted<T> = ReadonlyArray<readonly [T, number]>;
export type Range = readonly [number, number];

export interface Archetype {
  id: string;
  /** Scheme tags from palettes.ts; the scheme decides brick or plaster. */
  schemes: readonly string[];
  gables: Weighted<GableKind>;
  ground: Weighted<GroundKind>;
  /** Typical upper floor height (m) and ground floor height. */
  floorHeight: Range;
  groundHeight: Range;
  /** Multiplies the district's width range: < 1 thin houses, > 1 chubby. */
  widthMul: Range;
  corners: Weighted<'quoins' | 'pilaster' | 'none'>;
  windowStyle: Weighted<WindowStyle>;
  arch: Weighted<ArchKind>;
  flowerBoxes: Range;
  shutters: number;
  steps: Weighted<number>;
  /** Added to the district imperfection. */
  imperfectionBias: number;
  weathering: Range;
  focals: Weighted<FocalKind>;
  identity: IdentityKind;
  signTexts: readonly string[];
  windowLife: Range;
  lifeKinds: readonly WindowLife[];
  boarded: Range;
  /** Chance per prop. */
  props: Partial<Record<keyof PropFlags, number>>;
  litFraction: Range;
  taper: Range;
  bodyRadius: Range;
  corniceOverhang: Range;
  chimney: number;
  drainpipe: number;
  awning: number;
  hoistBeam: number;
}

const base: Omit<Archetype, 'id'> = {
  schemes: ['classic'],
  gables: [
    ['bell', 3],
    ['neck', 3],
    ['step', 2],
    ['triangle', 2],
  ],
  ground: [['door', 1]],
  floorHeight: [2.5, 2.8],
  groundHeight: [2.7, 3],
  widthMul: [0.9, 1.1],
  corners: [
    ['none', 3],
    ['quoins', 1],
  ],
  windowStyle: [
    ['cross', 3],
    ['grid', 2],
  ],
  arch: [
    ['none', 4],
    ['segment', 1],
  ],
  flowerBoxes: [0, 0.4],
  shutters: 0.15,
  steps: [
    [1, 2],
    [2, 2],
  ],
  imperfectionBias: 0,
  weathering: [0.1, 0.4],
  focals: [
    ['none', 2],
    ['gableStone', 1],
  ],
  identity: 'none',
  signTexts: [],
  windowLife: [0.2, 0.4],
  lifeKinds: ['plant', 'cat', 'lamp'],
  boarded: [0, 0],
  props: { wallAnchors: 0.6, doormat: 0.4, bike: 0.2 },
  litFraction: [0.3, 0.6],
  taper: [-0.02, 0.03],
  bodyRadius: [0.08, 0.16],
  corniceOverhang: [0.15, 0.3],
  chimney: 0.5,
  drainpipe: 0.6,
  awning: 0,
  hoistBeam: 0.3,
};

const A = (id: string, a: Partial<Omit<Archetype, 'id'>>): Archetype => ({ ...base, ...a, id, props: { ...base.props, ...(a.props ?? {}) } });

export const ARCHETYPES: Record<string, Archetype> = {
  merchant: A('merchant', {
    schemes: ['classic', 'grand'],
    gables: [
      ['bell', 4],
      ['neck', 3],
      ['spout', 1],
    ],
    floorHeight: [2.7, 3.0],
    widthMul: [0.85, 1.0],
    shutters: 0.5,
    hoistBeam: 0.9,
    focals: [
      ['gableStone', 3],
      ['roundWindow', 1],
      ['niche', 1],
    ],
    props: { yearStone: 0.7, wallAnchors: 0.9, pigeon: 0.4, birdNest: 0.2 },
    taper: [0.01, 0.04],
  }),
  grand: A('grand', {
    schemes: ['grand', 'classic'],
    gables: [
      ['cornice', 3],
      ['bell', 2],
      ['step', 1],
    ],
    floorHeight: [3.0, 3.3],
    groundHeight: [3.1, 3.4],
    widthMul: [1.15, 1.4],
    corners: [
      ['quoins', 2],
      ['pilaster', 2],
    ],
    windowStyle: [['grid', 1]],
    arch: [
      ['round', 2],
      ['segment', 1],
      ['none', 1],
    ],
    steps: [
      [2, 1],
      [3, 2],
    ],
    imperfectionBias: -0.25,
    weathering: [0, 0.2],
    focals: [
      ['niche', 2],
      ['roundWindow', 2],
      ['balcony', 1],
    ],
    props: { yearStone: 0.5, pigeon: 0.3, doormat: 0, bike: 0.05 },
    corniceOverhang: [0.3, 0.45],
    bodyRadius: [0.06, 0.12],
  }),
  grandma: A('grandma', {
    schemes: ['classic', 'pastel'],
    flowerBoxes: [0.8, 1],
    shutters: 0.4,
    focals: [
      ['bayWindow', 2],
      ['none', 1],
      ['gableStone', 1],
    ],
    lifeKinds: ['lace', 'cat', 'plant', 'lace'],
    windowLife: [0.5, 0.8],
    props: { gardenStrip: 0.8, doormat: 0.9, wallAnchors: 0.5, xmasLights: 0.1, kingsFlag: 0.15 },
    widthMul: [0.8, 0.95],
    bodyRadius: [0.12, 0.22],
  }),
  family: A('family', {
    schemes: ['classic', 'pastel'],
    focals: [
      ['bayWindow', 1],
      ['none', 2],
      ['balcony', 1],
    ],
    lifeKinds: ['drawing', 'plant', 'lamp', 'cat'],
    windowLife: [0.3, 0.6],
    props: { kliko: 0.8, bike: 0.7, parcel: 0.4, kingsFlag: 0.3, neeNee: 0.5, laundry: 0.2, doormat: 0.6, xmasLights: 0.1 },
    widthMul: [1.0, 1.2],
    floorHeight: [2.4, 2.6],
  }),
  student_squat: A('student_squat', {
    schemes: ['squat', 'faded'],
    gables: [
      ['triangle', 2],
      ['neck', 1],
      ['spout', 2],
    ],
    imperfectionBias: 0.25,
    weathering: [0.5, 0.9],
    flowerBoxes: [0, 0.2],
    focals: [['balcony', 3], ['none', 1]],
    lifeKinds: ['person', 'lamp', 'scarf', 'drawing'],
    windowLife: [0.4, 0.7],
    boarded: [0, 0.15],
    props: { posters: 0.9, bike: 0.9, flatTyreBike: 0.6, mattress: 0.8, laundry: 0.6, satellite: 0.4, kliko: 0.5, weeds: 0.5, doormat: 0, wallAnchors: 0.3 },
    litFraction: [0.5, 0.8],
  }),
  abandoned: A('abandoned', {
    schemes: ['faded'],
    imperfectionBias: 0.35,
    weathering: [0.8, 1],
    flowerBoxes: [0, 0],
    focals: [['none', 1]],
    windowLife: [0, 0],
    boarded: [0.5, 0.9],
    props: { teKoop: 0.8, weeds: 1, pigeon: 0.6, birdNest: 0.4, wallAnchors: 0.6, doormat: 0, bike: 0.1, flatTyreBike: 0.5 },
    litFraction: [0, 0],
    chimney: 0.3,
  }),
  hip_coffee: A('hip_coffee', {
    schemes: ['dark', 'modern'],
    gables: [
      ['cornice', 2],
      ['triangle', 1],
      ['bell', 1],
    ],
    ground: [['shop', 1]],
    windowStyle: [
      ['plain', 2],
      ['modern', 1],
    ],
    focals: [['bigSign', 2], ['none', 1]],
    identity: 'coffee',
    signTexts: ['KOFFIE'],
    lifeKinds: ['lamp', 'plant'],
    props: { bike: 0.6, posters: 0.2, wallAnchors: 0.2 },
    imperfectionBias: -0.15,
    weathering: [0, 0.15],
    awning: 0.3,
  }),
  shopkeeper: A('shopkeeper', {
    schemes: ['classic', 'pastel'],
    ground: [['shop', 1]],
    focals: [['bigSign', 2], ['none', 1], ['gableStone', 1]],
    identity: 'shop',
    signTexts: ['BAKKERIJ', 'KAAS', 'BLOEMEN', 'FIETSEN', 'KAPPER', 'BOEKEN', 'ANTIEK', 'SNACKBAR', 'WIJN', 'TOKO'],
    props: { bike: 0.5, kliko: 0.3, parcel: 0.3 },
    awning: 0.8,
  }),
  artist: A('artist', {
    schemes: ['pastel', 'squat'],
    flowerBoxes: [0.6, 1],
    focals: [['balcony', 2], ['roundWindow', 1]],
    lifeKinds: ['plant', 'plant', 'lamp', 'drawing'],
    windowLife: [0.4, 0.7],
    props: { ivy: 0.6, gardenStrip: 0.6, bike: 0.5, laundry: 0.3 },
    imperfectionBias: 0.1,
    bodyRadius: [0.14, 0.24],
  }),
  sports_fan: A('sports_fan', {
    schemes: ['classic', 'faded'],
    focals: [['none', 2], ['balcony', 1]],
    lifeKinds: ['scarf', 'scarf', 'person', 'lamp'],
    windowLife: [0.3, 0.6],
    props: { satellite: 0.9, kingsFlag: 0.7, kliko: 0.6, bike: 0.4, posters: 0.2 },
  }),
  consultant: A('consultant', {
    schemes: ['synergy', 'modern', 'grand'],
    gables: [
      ['cornice', 2],
      ['flat', 2],
      ['bell', 1],
    ],
    windowStyle: [
      ['modern', 2],
      ['grid', 1],
    ],
    imperfectionBias: -0.3,
    weathering: [0, 0.05],
    focals: [['balcony', 1], ['none', 1]],
    identity: 'synergy',
    signTexts: ['SYNERGY CONSULTING', 'SYNERGY'],
    lifeKinds: ['plant', 'person'],
    props: { synergyPlate: 0.9, linkedInBanner: 0.4, doormat: 0, bike: 0, wallAnchors: 0 },
    bodyRadius: [0.16, 0.28],
  }),
  warehouse_loft: A('warehouse_loft', {
    schemes: ['classic', 'faded'],
    gables: [
      ['spout', 4],
      ['triangle', 1],
    ],
    ground: [['warehouse', 1]],
    floorHeight: [2.8, 3.1],
    groundHeight: [3.2, 3.5],
    widthMul: [1.1, 1.4],
    corners: [['pilaster', 2], ['none', 1]],
    windowStyle: [['grid', 1]],
    arch: [['segment', 3], ['none', 1]],
    shutters: 0.8,
    hoistBeam: 1,
    focals: [['none', 2], ['gableStone', 1]],
    lifeKinds: ['lamp', 'plant'],
    props: { wallAnchors: 1, pigeon: 0.5, weeds: 0.3 },
    weathering: [0.3, 0.7],
    taper: [-0.03, 0],
  }),
  modern_townhouse: A('modern_townhouse', {
    schemes: ['modern'],
    gables: [
      ['flat', 3],
      ['triangle', 1],
    ],
    windowStyle: [['modern', 1]],
    arch: [['none', 1]],
    corners: [['none', 1]],
    flowerBoxes: [0, 0],
    shutters: 0,
    steps: [[1, 1]],
    imperfectionBias: -0.4,
    weathering: [0, 0.05],
    focals: [['balcony', 2], ['none', 1]],
    lifeKinds: ['plant', 'lamp'],
    props: { bike: 0.5, parcel: 0.6, kliko: 0.4, solarPanels: 0.6, wallAnchors: 0, doormat: 0.3 },
    bodyRadius: [0.2, 0.3],
    corniceOverhang: [0.06, 0.12],
    chimney: 0,
    drainpipe: 0.2,
    hoistBeam: 0,
  }),
  modern_block: A('modern_block', {
    schemes: ['modern'],
    gables: [['flat', 1]],
    floorHeight: [2.8, 3.0],
    widthMul: [1.3, 1.6],
    windowStyle: [['modern', 1]],
    arch: [['none', 1]],
    corners: [['none', 1]],
    flowerBoxes: [0, 0],
    shutters: 0,
    steps: [[1, 1]],
    imperfectionBias: -0.45,
    weathering: [0, 0.05],
    focals: [['balcony', 3], ['none', 1]],
    lifeKinds: ['plant', 'lamp', 'person'],
    props: { bike: 0.6, solarPanels: 0.8, linkedInBanner: 0.15, wallAnchors: 0, doormat: 0 },
    bodyRadius: [0.22, 0.3],
    corniceOverhang: [0.06, 0.1],
    chimney: 0,
    drainpipe: 0,
    hoistBeam: 0,
  }),
};

export interface DistrictStyle {
  id: string;
  /** Upper floors per house. A street picks one base value from this range. */
  floors: Range;
  /** Chance that a house differs by one floor from its street. */
  heightJitter: number;
  widths: Range;
  imperfection: Range;
  archetypes: Weighted<string>;
}

export const DISTRICTS: Record<string, DistrictStyle> = {
  centre: {
    id: 'centre',
    floors: [3, 4],
    heightJitter: 0.2,
    widths: [4.4, 6.4],
    imperfection: [0.3, 0.55],
    archetypes: [
      ['merchant', 4],
      ['grand', 3],
      ['shopkeeper', 2],
      ['consultant', 1],
      ['hip_coffee', 1],
      ['grandma', 1],
    ],
  },
  old_town: {
    id: 'old_town',
    floors: [2, 3],
    heightJitter: 0.3,
    widths: [3.4, 5.6],
    imperfection: [0.45, 0.85],
    archetypes: [
      ['grandma', 3],
      ['family', 3],
      ['merchant', 2],
      ['shopkeeper', 2],
      ['artist', 2],
      ['sports_fan', 1],
      ['student_squat', 1],
    ],
  },
  rundown: {
    id: 'rundown',
    floors: [1, 3],
    heightJitter: 0.45,
    widths: [3.2, 5.2],
    imperfection: [0.65, 0.95],
    archetypes: [
      ['student_squat', 4],
      ['abandoned', 3],
      ['sports_fan', 2],
      ['family', 1],
    ],
  },
  harbour: {
    id: 'harbour',
    floors: [3, 4],
    heightJitter: 0.25,
    widths: [5, 7],
    imperfection: [0.45, 0.85],
    archetypes: [
      ['warehouse_loft', 5],
      ['abandoned', 1],
      ['artist', 1],
      ['hip_coffee', 1],
    ],
  },
  modern: {
    id: 'modern',
    floors: [3, 5],
    heightJitter: 0.25,
    widths: [5, 7.5],
    imperfection: [0.05, 0.25],
    archetypes: [
      ['modern_townhouse', 3],
      ['modern_block', 3],
      ['consultant', 2],
      ['hip_coffee', 1],
    ],
  },
};
