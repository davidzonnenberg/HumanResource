// Building hitboxes taken from what is actually drawn: the fitted, scaled GLB's bounding box, or
// the plot rectangle for placeholder buildings. Changing a model's scale/offset in modelMap.ts
// changes its hitbox too. Used by walking (input/walkCollision.ts) and driving (physics).

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

const byBusiness = new Map<string, Footprint>();
let version = 0;

export function setFootprint(businessId: string, f: Footprint): void {
  const old = byBusiness.get(businessId);
  if (old && old.minX === f.minX && old.maxX === f.maxX && old.minZ === f.minZ && old.maxZ === f.maxZ && old.height === f.height) return;
  byBusiness.set(businessId, f);
  version++;
}

export function footprint(businessId: string): Footprint | undefined {
  return byBusiness.get(businessId);
}

export function allFootprints(): ReadonlyMap<string, Footprint> {
  return byBusiness;
}

/** Bumped whenever a hitbox changes, so the physics colliders can be rebuilt. */
export function footprintVersion(): number {
  return version;
}

export function clearFootprints(): void {
  byBusiness.clear();
  version++;
}

/** Front-door point of the drawn building: centre of its road-facing edge (frontSign +1 = +z). */
export function exteriorDoorPoint(businessId: string, frontSign: number): { x: number; z: number } | undefined {
  const f = byBusiness.get(businessId);
  if (!f) return undefined;
  return { x: (f.minX + f.maxX) / 2, z: frontSign > 0 ? f.maxZ : f.minZ };
}
