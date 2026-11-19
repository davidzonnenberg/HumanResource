/**
 * Procedural van recipe: plain data, no three.js.
 * Units are metres. The van faces +X, up is +Y, its right side is +Z.
 * Ground is y = 0. Every tunable lives here so it can move to packages/content.
 */
export type Vec3 = [number, number, number];

/** '#rrggbb', or an owner-derived colour that is resolved at render time. */
export type PartColour = string;

interface PartBase {
  pos: Vec3;
  /** Euler rotation in radians, applied X then Y then Z. */
  rot?: Vec3;
  colour: PartColour;
  /** Also add a copy mirrored to the other side (z -> -z). */
  mirrorZ?: boolean;
  segments?: number;
}

export interface BoxPart extends PartBase {
  shape: 'box' | 'roundedBox';
  size: Vec3;
  /** Corner radius for roundedBox. */
  radius?: number;
}

export interface CylinderPart extends PartBase {
  shape: 'cylinder';
  radius: number;
  length: number;
  axis: 'x' | 'y' | 'z';
}

export type VanPart = BoxPart | CylinderPart;

export interface WheelSpec {
  radius: number;
  width: number;
  /** Wheel centres relative to the van root. Index order: FL, FR, RL, RR. */
  anchors: Vec3[];
  /** Indexes of anchors that steer. */
  steering: number[];
  maxSteerRad: number;
  tyreColour: PartColour;
  rimColour: PartColour;
  hubColour: PartColour;
  /** Spokes make spinning visible. */
  spokes: number;
}

export interface RigSpec {
  /** Steer angle per rad/s of heading change (auto vans). */
  steerPerTurnRate: number;
  /** Higher is snappier (1/s). */
  steerSmoothing: number;
  motionSmoothing: number;
  bodySmoothing: number;
  /** Roll per (turn rate x speed). */
  rollPerLateral: number;
  maxRollRad: number;
  /** Nose-up pitch per m/s^2. */
  pitchPerAccel: number;
  maxPitchRad: number;
  bobAmplitude: number;
  bobFrequencyHz: number;
  /** Speed (m/s) at which the bob reaches full amplitude. */
  bobFullSpeed: number;
  /** Max vertical squash on impact (0.15 = 15%). */
  squashAmount: number;
  /** Squash decay per second. */
  squashDecay: number;
  /** Larger jumps per frame count as a teleport: no spin, no lean. */
  teleportDistance: number;
}

export interface VanRecipe {
  parts: VanPart[];
  wheels: WheelSpec;
  rig: RigSpec;
}

const DARK = '#3b3a42';
const GLASS = '#9fd3ff';
const TRIM = '#4a4a52';

export const DEFAULT_VAN_RECIPE: VanRecipe = {
  parts: [
    // Chassis skirt
    { shape: 'roundedBox', size: [2.2, 0.24, 1.12], pos: [0, 0.37, 0], radius: 0.06, colour: DARK },
    // Wheel wells (dark recesses behind the wheels)
    { shape: 'cylinder', radius: 0.31, length: 1.13, axis: 'z', pos: [0.74, 0.31, 0], colour: '#26252b' },
    { shape: 'cylinder', radius: 0.31, length: 1.13, axis: 'z', pos: [-0.7, 0.31, 0], colour: '#26252b' },
    // Cargo box and cab
    { shape: 'roundedBox', size: [1.45, 1.05, 1.18], pos: [-0.38, 0.98, 0], radius: 0.13, colour: 'owner' },
    { shape: 'roundedBox', size: [0.8, 0.78, 1.14], pos: [0.72, 0.86, 0], radius: 0.15, colour: 'owner' },
    // Windscreen and cab side windows
    { shape: 'box', size: [0.04, 0.36, 0.94], pos: [1.1, 1.02, 0], rot: [0, 0, 0.22], colour: GLASS },
    { shape: 'box', size: [0.42, 0.3, 0.02], pos: [0.74, 1.03, 0.572], colour: GLASS, mirrorZ: true },
    // Side stripe and round logo badge on the cargo box
    { shape: 'box', size: [1.3, 0.12, 0.02], pos: [-0.38, 0.72, 0.592], colour: 'ownerLight', mirrorZ: true },
    { shape: 'cylinder', radius: 0.22, length: 0.02, axis: 'z', pos: [-0.38, 1.12, 0.595], colour: '#fff4e0', mirrorZ: true },
    { shape: 'cylinder', radius: 0.14, length: 0.025, axis: 'z', pos: [-0.38, 1.12, 0.6], colour: 'ownerDark', mirrorZ: true },
    // Rear doors seam and handle
    { shape: 'box', size: [0.02, 0.9, 0.02], pos: [-1.105, 0.98, 0], colour: 'ownerDark' },
    { shape: 'box', size: [0.03, 0.05, 0.14], pos: [-1.11, 0.95, 0.1], colour: TRIM },
    // Bumpers, grille, lights, mirrors
    { shape: 'roundedBox', size: [0.16, 0.17, 1.18], pos: [1.15, 0.43, 0], radius: 0.06, colour: TRIM },
    { shape: 'roundedBox', size: [0.14, 0.17, 1.18], pos: [-1.13, 0.43, 0], radius: 0.06, colour: TRIM },
    { shape: 'box', size: [0.03, 0.14, 0.5], pos: [1.125, 0.62, 0], colour: '#2c2c33' },
    { shape: 'cylinder', radius: 0.085, length: 0.04, axis: 'x', pos: [1.12, 0.66, 0.4], colour: '#fff3b0', mirrorZ: true },
    { shape: 'box', size: [0.03, 0.16, 0.1], pos: [-1.108, 0.74, 0.5], colour: '#e03131', mirrorZ: true },
    { shape: 'roundedBox', size: [0.08, 0.12, 0.14], pos: [0.98, 1.0, 0.64], radius: 0.03, colour: 'ownerDark', mirrorZ: true },
    // Roof rack with a crate
    { shape: 'box', size: [1.2, 0.05, 0.06], pos: [-0.38, 1.54, 0.42], colour: TRIM, mirrorZ: true },
    { shape: 'box', size: [0.06, 0.05, 0.9], pos: [-0.85, 1.54, 0], colour: TRIM },
    { shape: 'box', size: [0.06, 0.05, 0.9], pos: [0.09, 1.54, 0], colour: TRIM },
    { shape: 'roundedBox', size: [0.42, 0.26, 0.42], pos: [-0.5, 1.7, 0], radius: 0.03, colour: '#c58b4b' },
  ],
  wheels: {
    radius: 0.28,
    width: 0.2,
    anchors: [
      [0.74, 0.28, 0.5],
      [0.74, 0.28, -0.5],
      [-0.7, 0.28, 0.5],
      [-0.7, 0.28, -0.5],
    ],
    steering: [0, 1],
    maxSteerRad: 0.55,
    tyreColour: '#2b2a30',
    rimColour: '#d9d6de',
    hubColour: '#f2c94c',
    spokes: 3,
  },
  rig: {
    steerPerTurnRate: 0.6,
    steerSmoothing: 10,
    motionSmoothing: 8,
    bodySmoothing: 6,
    rollPerLateral: 0.012,
    maxRollRad: 0.09,
    pitchPerAccel: 0.012,
    maxPitchRad: 0.05,
    bobAmplitude: 0.015,
    bobFrequencyHz: 2.2,
    bobFullSpeed: 4,
    squashAmount: 0.15,
    squashDecay: 6,
    teleportDistance: 5,
  },
};
