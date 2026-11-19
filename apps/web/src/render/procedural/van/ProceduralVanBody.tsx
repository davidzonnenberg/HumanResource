// Adapter that drops the procedural van into the game's vehicle slot (same contract as VanBody /
// GltfVehicle: body units, faces -z, wheels on y = 0, parent group applies theme.vehicleScale).
// The rig motion is read from the parent's world pose, so it works for sim-driven vans and for
// the Rapier body during manual driving.
import { useFrame } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import { Euler, Quaternion, Vector3, type Group } from 'three';
import { palette, theme } from '../../theme';
import { ProceduralVan } from './ProceduralVan';
import { DEFAULT_VAN_RECIPE } from './vanRecipe';
import type { VanMotion } from './vanRig';

/** Procedural van is ~2.5 m long; the game van is 3.1 body units. */
const FIT = 1.25;
const WORLD_PER_UNIT = theme.vehicleScale * FIT;
/** Roof height (body units) where cargo crates sit. */
const ROOF = 1.75 * FIT;

const wp = new Vector3();
const wq = new Quaternion();
const we = new Euler(0, 0, 0, 'YXZ');

function crateSlots(n: number) {
  return Array.from({ length: Math.min(8, n) }, (_, i) => [(i % 2) * 0.6 - 0.3, ROOF + 0.22 + Math.floor(i / 4) * 0.45, 0.6 - Math.floor((i % 4) / 2) * 0.6] as const);
}

export function ProceduralVanBody({ color, crates, wobble }: { color: string; crates: number; wobble?: RefObject<Group | null> }) {
  const outer = useRef<Group>(null);
  const motion = useRef<VanMotion>({ x: 0, z: 0, heading: 0 });

  useFrame(() => {
    const g = outer.current;
    if (!g) return;
    g.getWorldPosition(wp);
    g.getWorldQuaternion(wq);
    we.setFromQuaternion(wq);
    // Game vans face -z at rotation 0; the procedural van faces +X at heading 0.
    // Van-local metres, so wheel spin matches the drawn wheel size.
    motion.current.x = wp.x / WORLD_PER_UNIT;
    motion.current.z = wp.z / WORLD_PER_UNIT;
    motion.current.heading = we.y + Math.PI / 2;
  });

  return (
    <group ref={wobble ?? null}>
      <group ref={outer}>
        <group rotation={[0, Math.PI / 2, 0]} scale={FIT}>
          <ProceduralVan modelKey="van_small" recipe={DEFAULT_VAN_RECIPE} ownerColour={color} motion={motion} applyPose={false} />
        </group>
        {crateSlots(crates).map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]}>
            <boxGeometry args={[0.55, 0.42, 0.55]} />
            <meshStandardMaterial color={palette.crate} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
