// Procedural town – shared types. Render/bake only: never import from packages/sim.
// Units are metres. Map axes: x = east (right), z = south (towards the camera), like the game.

export type Vec2 = [number, number]; // [x, z]

export type RoadKind =
  | 'ring' | 'radial' | 'ramp' | 'highway'
  | 'singel' | 'quay' | 'gate' | 'lane' | 'branch';

export type Surface = 'asphalt' | 'klinkers' | 'concrete';

export type BuildingKind =
  | 'canal' | 'terrace' | 'herenhuis' | 'flat' | 'villa' | 'office' | 'warehouse' | 'tower' | 'landmark';

export interface BuildingRule {
  kind: BuildingKind;
  weight: number;
  width: [number, number];
  depth: [number, number];
  gap: [number, number];      // space to the next building along the road
  setback: [number, number];  // distance from kerb to facade
  pad: number;                // free margin around the plot (garden)
  perpendicularChance?: number; // flats turned 90° to the road
  palette: string[];
}

export interface ZoneRule {
  roadWidth: number;
  surface: Surface;
  branchSpacing: [number, number];
  branchLength: [number, number];
  curveJitter: number;   // how fast curvature changes
  curveMax: number;      // max curvature per 5 m step (rad)
  bothSidesChance: number;
  culDeSacChance: number;
  treeChance: number;
  streetTrees: boolean;
  buildings: BuildingRule[];
}

export interface LandmarkSpec {
  id: string;                 // stable id, e.g. "zuid:tower_a"
  kind: BuildingKind;         // usually 'tower' or 'landmark'
  recipe?: string;            // fixed recipe id in buildings.recipes.json
  anchor: 'centre' | 'world'; // offset from the generated centre, or absolute world position
  at: Vec2;
  width: number;
  depth: number;
  angleDeg: number;
  colour?: string;
}

export interface TownBrief {
  id: string;                 // region id, e.g. "utrecht_start"
  seed: string;               // hashed with hashSeed()
  size: Vec2;                 // metres [width, depth]
  centre: { x: [number, number]; z: [number, number] }; // fraction of size
  singel: { halfWidth: [number, number]; halfDepth: [number, number]; waterWidth: number; squareness: number };
  ring: { extraWidth: [number, number]; extraDepth: [number, number]; roadWidth: number };
  river: { widthInside: number; widthOutside: number; amplitude: [number, number] };
  radials: { count: [number, number]; width: number };
  gates: Array<'N' | 'S' | 'E' | 'W'>;   // bridges over the singel into the centre
  highway: { width: number; points: Vec2[] }; // fractions of size, smoothed with Catmull-Rom
  core: { laneWidth: number; laneSpacing: [number, number]; crossLanes: number; riverBridges: number };
  parks: { count: number; radius: [number, number]; districts: string[] };
  sectors: Array<{ fromDeg: number; toDeg: number; district: string }>; // angle from centre, 0 = east, 90 = south
  defaultDistrict: string;
  zones: Record<string, ZoneRule>; // keys: "core", "<district>_inner", "<district>_outer"
  landmarks: LandmarkSpec[];
}

export interface Road {
  id: string;
  kind: RoadKind;
  zone: string;
  width: number;
  surface: Surface;
  points: Vec2[];
  parent?: string;
}

export interface Building {
  id: string;           // stable: "<roadId>/<L|R><n>" or the landmark id
  roadId: string | null;
  lockedRoadId?: string | null; // set on a locked building after --force: the road it belonged to in the previous bake
  zone: string;
  kind: BuildingKind;
  x: number; z: number; angle: number; // angle in radians, facade parallel to the road
  width: number; depth: number;
  colour: string;
  seed: number;         // hashSeed(id) – feed this to the building generator
  recipe?: string;      // fixed recipe (landmarks / overrides)
  locked?: boolean;
}

export interface Bridge { id: string; roadId: string; x: number; z: number; angle: number; length: number; width: number; over: 'river' | 'singel' | 'highway' }
export interface Sign { id: string; kind: 'yield' | 'speed30' | 'highway' | 'centre'; x: number; z: number }
export interface Park { id: string; centre: Vec2; outline: Vec2[]; pond: { x: number; z: number; rx: number; rz: number; angle: number } }
export interface Junction { id: string; at: Vec2; roads: [string, string]; type: 'tee' | 'roundabout' | 'ramp' }
export interface Water { id: string; kind: 'river' | 'singel'; points: Vec2[]; widths: number[] }

export interface TownData {
  version: 1;
  briefId: string;
  seed: number;
  size: Vec2;
  centre: Vec2;
  zoneGrid: { cell: number; cols: number; rows: number; zones: string[]; data: number[] }; // index into zones
  water: Water[];
  highway: Road;
  roads: Road[];
  junctions: Junction[];
  roundabouts: Vec2[];
  culDeSacs: Vec2[];
  plaza: Vec2; // market square, kept free of buildings
  bridges: Bridge[];
  signs: Sign[];
  parks: Park[];
  buildings: Building[];
  trees: Array<[number, number, number]>; // x, z, radius
  warnings: string[];
}

/** town-overrides.json: hand edits that survive re-bakes (keyed by stable building/road id). */
export interface TownOverrides {
  buildings: Record<string, {
    recipe?: string;      // use a fixed recipe from buildings.recipes.json
    kind?: BuildingKind;
    colour?: string;
    seed?: number;        // reroll just this house
    lock?: boolean;       // keep footprint+position when the town is re-generated
    remove?: boolean;     // empty plot (garden, parking, future business)
    at?: Vec2;            // where the house was when you made the override; used to detect a moved id
    note?: string;
  }>;
  roads: Record<string, { name?: string; surface?: Surface; width?: number; note?: string }>;
}
