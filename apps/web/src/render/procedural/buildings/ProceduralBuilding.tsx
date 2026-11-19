/**
 * Renders a procedural toy-style Dutch building.
 *  - Up to eight static meshes with shared materials.
 *  - Movers: hanging signs swing, flags wave, laundry sways, lamps/neon flicker.
 *  - Chimney smoke puffs.
 * Props:
 *  - lit:      night windows glow
 *  - litLevel: 0..1 brightness of the glow (for example: how busy the pub is)
 *  - mood:     0..1, low = struggling: signs hang crooked and lamps dim
 *  - nudge:    change the number to give swinging parts a push (a van drove by)
 *  - animate:  false = static (far zoom, low-power)
 */
import { useEffect, useMemo, useRef, type ComponentProps } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BuildingRecipe, Detail, MeshGroup } from './buildingRecipe';
import { getBuildingMeshes, type MoverOut } from './buildingGeometry';
import { getBuildingMaterials, type BuildingMaterials } from './buildingMaterials';
import { generateStreet, type StreetOptions } from './randomBuilding';

type GroupProps = Omit<ComponentProps<'group'>, 'children'>;

const GROUP_ORDER: MeshGroup[] = ['brick', 'plaster', 'roof', 'trim', 'gloss', 'glass', 'sign'];
const PUFFS = 6;
let puffGeo: THREE.SphereGeometry | null = null;
let puffMat: THREE.MeshStandardMaterial | null = null;
function puffAssets(): [THREE.SphereGeometry, THREE.MeshStandardMaterial] {
  if (!puffGeo) puffGeo = new THREE.SphereGeometry(1, 10, 8);
  if (!puffMat) puffMat = new THREE.MeshStandardMaterial({ color: '#eef0f2', roughness: 1 });
  return [puffGeo, puffMat];
}

/** Pure animation maths, shared with the preview. Returns the rotation angle of a mover. */
export function moverAngle(m: MoverOut, t: number, impulse: number, mood: number): number {
  const w = Math.PI * 2 * m.freq;
  let a = 0;
  switch (m.kind) {
    case 'swing':
      a = Math.sin(t * w + m.phase) * m.amp * (1 + 5 * impulse) + Math.sin(t * 7 + m.phase) * 0.12 * impulse;
      break;
    case 'wave':
      a = Math.sin(t * w + m.phase) * m.amp + Math.sin(t * w * 2.3 + m.phase) * m.amp * 0.35;
      break;
    case 'sway':
      a = Math.sin(t * w + m.phase) * m.amp * (1 + 2 * impulse);
      break;
    case 'flicker':
      a = 0;
      break;
  }
  if (m.tag === 'sign') a += (1 - mood) * 0.35;
  return a;
}

export function flickerLevel(t: number, phase: number, mood: number): number {
  const f = 0.88 + 0.08 * Math.sin(t * 13 + phase) * Math.sin(t * 7.3 + phase * 2) + (Math.sin(t * 3.1 + phase) > 0.985 ? -0.35 : 0);
  return Math.max(0.2, f * (0.55 + 0.45 * mood));
}

/** Smoke puff k of n at time t: [dx, dy, dz, scale]. */
export function puffState(t: number, k: number, phase: number): [number, number, number, number] {
  const p = (t * 0.28 + k / PUFFS + phase) % 1;
  const s = (0.1 + 0.32 * p) * Math.sqrt(Math.max(0, 1 - p));
  return [Math.sin(p * 4 + phase * 6) * 0.15 + p * 0.35, p * 1.9, Math.cos(p * 3 + phase) * 0.1, s];
}

function materialFor(grp: MeshGroup, m: BuildingMaterials): THREE.Material {
  return grp === 'lit' ? m.litOn : m[grp];
}

export interface ProceduralBuildingProps extends GroupProps {
  recipe: BuildingRecipe;
  ownerColour: string;
  lit?: boolean;
  litLevel?: number;
  mood?: number;
  nudge?: number;
  animate?: boolean;
  detail?: Detail;
}

export function ProceduralBuilding({ recipe, ownerColour, lit = false, litLevel = 1, mood = 1, nudge = 0, animate = true, detail = 'high', ...group }: ProceduralBuildingProps) {
  const meshes = useMemo(() => getBuildingMeshes(recipe, ownerColour, detail), [recipe, ownerColour, detail]);
  const m = getBuildingMaterials();
  const litMat = useMemo(() => m.litOn.clone(), [m]);
  const flickerMat = useMemo(() => m.litOn.clone(), [m]);
  useEffect(
    () => () => {
      litMat.dispose();
      flickerMat.dispose();
    },
    [litMat, flickerMat],
  );
  const moverRefs = useRef<(THREE.Group | null)[]>([]);
  const puffRefs = useRef<(THREE.Mesh | null)[]>([]);
  const impulse = useRef({ value: 0, last: nudge });
  const [pGeo, pMat] = puffAssets();
  const g = meshes.geometries;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const imp = impulse.current;
    if (nudge !== imp.last) {
      imp.last = nudge;
      imp.value = 1;
    }
    imp.value *= Math.exp(-2.2 * Math.min(dt, 0.1));
    litMat.color.setScalar(lit ? 0.45 + 0.55 * Math.max(0, Math.min(1, litLevel)) : 1);
    flickerMat.color.setScalar(animate ? flickerLevel(t, 0.3, mood) : 0.55 + 0.45 * mood);
    meshes.movers.forEach((mv, i) => {
      const obj = moverRefs.current[i];
      if (!obj) return;
      obj.quaternion.setFromAxisAngle(mv.axis, animate ? moverAngle(mv, t, imp.value, mood) : (1 - mood) * (mv.tag === 'sign' ? 0.35 : 0));
    });
    meshes.anchors.forEach((a, ai) => {
      for (let k = 0; k < PUFFS; k++) {
        const p = puffRefs.current[ai * PUFFS + k];
        if (!p) continue;
        p.visible = animate;
        if (!animate) continue;
        const [dx, dy, dz, s] = puffState(t, k, a.phase);
        p.position.set(a.position.x + dx, a.position.y + dy, a.position.z + dz);
        p.scale.setScalar(s);
      }
    });
  });

  return (
    <group {...group}>
      {GROUP_ORDER.map((grp) => {
        const geo = g[grp];
        return geo ? <mesh key={grp} geometry={geo} material={materialFor(grp, m)} /> : null;
      })}
      {g.lit && <mesh geometry={g.lit} material={lit ? litMat : m.glass} />}
      {meshes.movers.map((mv, i) => (
        <group key={`mv${i}`} position={mv.pivot} ref={(el) => void (moverRefs.current[i] = el)}>
          {(Object.keys(mv.geometries) as MeshGroup[]).map((grp) => {
            const geo = mv.geometries[grp];
            if (!geo) return null;
            const mat = grp === 'lit' ? (mv.kind === 'flicker' ? flickerMat : lit ? litMat : m.glass) : materialFor(grp, m);
            return <mesh key={grp} geometry={geo} material={mat} />;
          })}
        </group>
      ))}
      {meshes.anchors.map((a, ai) =>
        Array.from({ length: PUFFS }, (_, k) => <mesh key={`p${ai}_${k}`} geometry={pGeo} material={pMat} position={a.position} ref={(el) => void (puffRefs.current[ai * PUFFS + k] = el)} />),
      )}
    </group>
  );
}

export interface ProceduralStreetProps extends GroupProps {
  seed: number;
  /** Street front length in metres. Houses are placed along +X, facing +Z. */
  length: number;
  district?: string;
  ownerColour?: string;
  lit?: boolean;
  animate?: boolean;
  detail?: Detail;
}

/** Filler row of houses for a street segment. Seed it with hashSeed(segmentId). */
export function ProceduralStreet({ seed, length, district = 'old_town', ownerColour = '#888888', lit = false, animate = true, detail = 'high', ...group }: ProceduralStreetProps) {
  const opts: StreetOptions = useMemo(() => ({ district }), [district]);
  const houses = useMemo(() => generateStreet(seed, length, opts), [seed, length, opts]);
  return (
    <group {...group}>
      {houses.map((h, i) => (
        <ProceduralBuilding key={i} recipe={h.recipe} ownerColour={ownerColour} lit={lit} animate={animate} detail={detail} position={[h.offset, 0, -h.recipe.depth / 2]} />
      ))}
    </group>
  );
}
