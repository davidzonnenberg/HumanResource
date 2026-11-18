// Renders a generated GLB vehicle (ComfyUI -> `npm run models:optimize` -> /models/*.glb).
// Auto-fitted in van-body units (the group around it applies theme.vehicleScale): centred, wheels
// on the ground, length fitted to VAN_LENGTH, facing -z like the placeholder van. `scale`,
// `offset` and `rotationY` on the modelMap entry tune it; rotationY = Math.PI if it drives backwards.
// Cargo crates ride on a roof rack so the load stays visible (11.3).
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Suspense, useMemo, type ReactNode, type RefObject } from 'react';
import { Box3, Material, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type * as THREE from 'three';
import type { GltfEntry } from './modelMap';
import { DEFAULT_BRIGHTNESS, ModelBoundary } from './GltfBuilding';
import { palette } from '../theme';

/** Length of the placeholder van in body units; the GLB is scaled to match. */
export const VAN_LENGTH = 3.1;

function tuned(m: Material, brightness: number, anisotropy: number): Material {
  const c = m.clone();
  if (c instanceof MeshStandardMaterial) {
    c.color.multiplyScalar(brightness);
    c.metalness = 0;
    c.roughness = 1;
    if (c.map) c.map.anisotropy = anisotropy;
  }
  return c;
}

function crateSlots(n: number, roof: number) {
  return Array.from({ length: Math.min(8, n) }, (_, i) => [(i % 2) * 0.6 - 0.3, roof + 0.22 + Math.floor(i / 4) * 0.45, 0.6 - Math.floor((i % 4) / 2) * 0.6] as const);
}

function Model({ entry, crates }: { entry: GltfEntry; crates: number }) {
  const { scene } = useGLTF(entry.url, false, true);
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const placed = useMemo(() => {
    const obj = scene.clone(true);
    const brightness = entry.brightness ?? DEFAULT_BRIGHTNESS;
    const anisotropy = Math.min(8, maxAnisotropy);
    obj.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.material = Array.isArray(o.material) ? o.material.map((m: Material) => tuned(m, brightness, anisotropy)) : tuned(o.material as Material, brightness, anisotropy);
    });
    const box = new Box3().setFromObject(obj);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const quarterTurn = Math.abs(Math.sin(entry.rotationY)) > 0.7;
    const length = quarterTurn ? size.x : size.z;
    const k = (VAN_LENGTH / length) * entry.scale;
    return { obj, k, height: size.y * k, inner: [-center.x, -box.min.y, -center.z] as [number, number, number] };
  }, [scene, entry, maxAnisotropy]);
  return (
    <>
      <group position={entry.offset} rotation={[0, entry.rotationY, 0]} scale={placed.k}>
        <primitive object={placed.obj} position={placed.inner} />
      </group>
      {crateSlots(crates, placed.height).map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[0.55, 0.42, 0.55]} />
          <meshStandardMaterial color={palette.crate} />
        </mesh>
      ))}
    </>
  );
}

/** GLB vehicle with the placeholder van as loading/error fallback. `wobble` wraps it for body roll. */
export function GltfVehicle({ entry, crates, wobble, fallback }: { entry: GltfEntry; crates: number; wobble?: RefObject<THREE.Group | null>; fallback: ReactNode }) {
  return (
    <ModelBoundary url={entry.url} fallback={fallback}>
      <Suspense fallback={fallback}>
        <group ref={wobble ?? null}>
          <Model entry={entry} crates={crates} />
        </group>
      </Suspense>
    </ModelBoundary>
  );
}
