// Lays out every filler street of a world: blockers from the registry (roads, plots, unloading
// zones, landmarks), gaps, and the generated houses. Pure, so it can be tested without React.
import type { DefinitionRegistry } from '@hr/sim';
import { ROAD_W, SIDEWALK_W } from '../../roadConstants';
import { blockerRects, layoutStreet, type FillerStreet, type PlacedHouse, type Rect, type StreetConfig } from './streets';

export interface LandmarkRect {
  district: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export const STREET_CONFIG: StreetConfig = {
  roadHalf: ROAD_W / 2 + SIDEWALK_W,
  frontOffset: ROAD_W / 2 + SIDEWALK_W + 0.1,
  bandDepth: 8.5, // generateStreet makes houses 6 to 8 m deep
  margin: 0.5,
};

/** Everything that keeps houses away from one street (see streets.ts blockerRects). */
export function blockersFor(reg: DefinitionRegistry, street: FillerStreet, landmarks: readonly LandmarkRect[]): Rect[] {
  const plots = Object.values(reg.world.plots).filter((p) => p.districtId === street.district);
  return blockerRects(
    {
      roads: reg.world.edges.flatMap((e) => {
        const a = reg.world.nodes[e.a];
        const b = reg.world.nodes[e.b];
        return a && b && a.districtId === street.district && b.districtId === street.district ? [{ ax: a.x, az: a.z, bx: b.x, bz: b.z }] : [];
      }),
      plots: plots.flatMap((p) => [p.def, ...(p.def.unloadingZone ? [p.def.unloadingZone] : [])]),
      landmarks: landmarks.filter((l) => l.district === street.district),
    },
    STREET_CONFIG,
  );
}

export function layoutFillerStreets(reg: DefinitionRegistry, streets: readonly FillerStreet[], landmarks: readonly LandmarkRect[]): PlacedHouse[] {
  return streets.flatMap((street) => layoutStreet(street, blockersFor(reg, street, landmarks), STREET_CONFIG));
}