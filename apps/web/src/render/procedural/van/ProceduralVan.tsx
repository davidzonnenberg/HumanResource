/**
 * Procedural van with a wheel rig:
 *   root (pose) -> body (roll, pitch, bob, squash)
 *              -> wheel pivot x N (suspension) -> steer -> spin -> wheel mesh
 * Wheels are NOT children of the body, so the body leans over them.
 * All per-frame work happens in useFrame on refs; nothing goes into React state.
 */
import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { VAN_MATERIAL, getVanBodyGeometry, getVanWheelGeometry } from './vanGeometry';
import { createVanRigState, stepVanRig, type VanMotion } from './vanRig';
import type { VanRecipe } from './vanRecipe';

export interface ProceduralVanProps {
  /** models.json key, used for geometry caching. */
  modelKey: string;
  recipe: VanRecipe;
  /** Owner colour, '#rrggbb'. */
  ownerColour: string;
  /** Updated every frame by the caller (simBridge interpolation or the Rapier body). */
  motion: MutableRefObject<VanMotion>;
  /** Set false when a parent group already places the van; `motion` then only feeds the rig. */
  applyPose?: boolean;
}

export function ProceduralVan({ modelKey, recipe, ownerColour, motion, applyPose = true }: ProceduralVanProps) {
  const bodyGeometry = useMemo(() => getVanBodyGeometry(modelKey, recipe, ownerColour), [modelKey, recipe, ownerColour]);
  const wheelGeometry = useMemo(() => getVanWheelGeometry(modelKey, recipe.wheels), [modelKey, recipe.wheels]);
  const steering = useMemo(() => new Set(recipe.wheels.steering), [recipe.wheels.steering]);

  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const pivots = useRef<(Group | null)[]>([]);
  const steers = useRef<(Group | null)[]>([]);
  const spins = useRef<(Group | null)[]>([]);
  const rig = useRef(createVanRigState());

  useFrame((_, delta) => {
    const m = motion.current;
    const s = rig.current;
    stepVanRig(s, m, Math.min(delta, 0.1), recipe.rig, recipe.wheels);

    if (applyPose && root.current) {
      root.current.position.set(m.x, m.y ?? 0, m.z);
      root.current.rotation.y = m.heading;
    }
    if (body.current) {
      const sq = s.squash * recipe.rig.squashAmount;
      body.current.rotation.x = s.roll;
      body.current.rotation.z = s.pitch;
      body.current.position.y = s.bob;
      body.current.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    }
    recipe.wheels.anchors.forEach((a, i) => {
      const pivot = pivots.current[i];
      const steer = steers.current[i];
      const spin = spins.current[i];
      if (pivot) pivot.position.y = a[1] - (m.compression?.[i] ?? 0);
      if (steer) steer.rotation.y = steering.has(i) ? s.steer : 0;
      if (spin) spin.rotation.z = s.wheelAngle;
    });
  });

  return (
    <group ref={root}>
      <group ref={body}>
        <mesh geometry={bodyGeometry} material={VAN_MATERIAL} />
      </group>
      {recipe.wheels.anchors.map((a, i) => (
        <group key={i} ref={(el) => { pivots.current[i] = el; }} position={a}>
          <group ref={(el) => { steers.current[i] = el; }}>
            <group ref={(el) => { spins.current[i] = el; }}>
              <mesh geometry={wheelGeometry} material={VAN_MATERIAL} />
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}
