// Renders a generated GLB building (ComfyUI -> `npm run models:optimize` -> /models/*.glb).
// The model is auto-fitted: centred on the plot, standing on the ground, front flush with the road,
// uniformly scaled to fit the plot footprint and a max height. `scale` / `offset` / `rotationY` /
// `maxHeight` on the modelMap entry then tune it per model without re-exporting.
// While loading, or if the file is missing/broken, `fallback` (the placeholder building) is shown.
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Component, Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Box3, Group, Material, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Footprint } from '../footprints';
import type { GltfEntry } from './modelMap';

export const DEFAULT_MAX_HEIGHT = 14;
// Baked textures are authored for a bright, image-based viewer; the game only has two plain lights, so
// they render dark. This multiplies the base colour (per-model `brightness` overrides it).
export const DEFAULT_BRIGHTNESS = 2.2;
const FOOTPRINT_FILL = 0.9;
const FRONT_MARGIN = 0.3;

export function gltfMaxHeight(entry: GltfEntry): number {
  return (entry.maxHeight ?? DEFAULT_MAX_HEIGHT) * entry.scale;
}

interface PlotBox {
  x: number;
  z: number;
  w: number;
  d: number;
}

// Also used for textures: shows `fallback` if the asset fails to load, so a bad file never blanks the scene.
export class ModelBoundary extends Component<{ url: string; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.warn(`[models] could not load ${this.props.url}; showing placeholder instead`, error);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Own copy of the material (textures stay shared): matte, brightened, sharper at oblique angles.
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

function GltfModel({ entry, plot, frontSign, onFootprint }: { entry: GltfEntry; plot: PlotBox; frontSign: number; onFootprint?: (f: Footprint) => void }) {
  const root = useRef<Group>(null);
  // Draco off (our files use meshopt; Draco would download a decoder from the internet).
  const { scene } = useGLTF(entry.url, false, true);
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());

  const placed = useMemo(() => {
    const obj = scene.clone(true); // shares geometry; materials are copied below
    const brightness = entry.brightness ?? DEFAULT_BRIGHTNESS;
    const anisotropy = Math.min(8, maxAnisotropy);
    obj.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.material = Array.isArray(o.material)
        ? o.material.map((m: Material) => tuned(m, brightness, anisotropy))
        : tuned(o.material as Material, brightness, anisotropy);
    });
    const box = new Box3().setFromObject(obj);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const rotationY = entry.rotationY + (frontSign < 0 ? Math.PI : 0);
    const quarterTurn = Math.abs(Math.sin(entry.rotationY)) > 0.7;
    const footW = quarterTurn ? size.z : size.x;
    const footD = quarterTurn ? size.x : size.z;
    const maxH = entry.maxHeight ?? DEFAULT_MAX_HEIGHT;
    const fit = Math.min((plot.w * FOOTPRINT_FILL) / footW, (plot.d * FOOTPRINT_FILL) / footD, maxH / size.y);
    const k = fit * entry.scale;
    // Front flush with the plot's road side so the door lines up with the entrance anchor.
    const zFront = plot.z + frontSign * (plot.d / 2 - (footD * k) / 2 - FRONT_MARGIN);
    return {
      obj,
      rotationY,
      k,
      pos: [plot.x + entry.offset[0], entry.offset[1], zFront + entry.offset[2]] as [number, number, number],
      inner: [-center.x, -box.min.y, -center.z] as [number, number, number],
    };
  }, [scene, entry, plot.x, plot.z, plot.w, plot.d, frontSign, maxAnisotropy]);

  // Hitbox = the placed model's world bounding box, so scale/offset changes move it too.
  useLayoutEffect(() => {
    const g = root.current;
    if (!g || !onFootprint) return;
    g.updateWorldMatrix(true, true);
    const b = new Box3().setFromObject(g);
    if (!b.isEmpty()) onFootprint({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, height: b.max.y });
  }, [placed, onFootprint]);

  return (
    <group ref={root} position={placed.pos} rotation={[0, placed.rotationY, 0]} scale={placed.k}>
      <primitive object={placed.obj} position={placed.inner} />
    </group>
  );
}

export function GltfBuilding(props: { entry: GltfEntry; plot: PlotBox; frontSign: number; fallback: ReactNode; onFootprint?: (f: Footprint) => void }) {
  const { fallback, ...rest } = props;
  return (
    <ModelBoundary url={props.entry.url} fallback={fallback}>
      <Suspense fallback={fallback}>
        <GltfModel {...rest} />
      </Suspense>
    </ModelBoundary>
  );
}
