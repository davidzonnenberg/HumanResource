// T5: the town's buildings at three levels of detail, chosen from the distance to the focus point (the camera's ground
// target) and the quality preset (T6).
//   LOD0  procedural recipe at detail `low`: only the nearest few, at most `maxNewBuildingsPerFrame` mounted per frame
//   LOD1  instanced box + roof with a window texture: one draw call for all walls, one for all roofs
//   LOD2  every building of a far chunk merged into one mesh
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, InstancedMesh, MeshLambertMaterial, Object3D, RepeatWrapping,
  SRGBColorSpace, type Group, type Mesh,
} from 'three';
import type { Quality } from '../../quality';
import { ProceduralBuilding } from '../buildings/ProceduralBuilding';
import { buildChunkLod2, lod1Box, lod1Roof, type InstancedShape } from './townBuildingMesh';
import {
  applyChunkOverrides, buildingYaw, chunkIsFar, distanceToChunk, pickLod0, recipeForTownBuilding, shapeOf, type FixedRecipes,
} from './townBuildings';
import { meshToGeometry, useDisposable } from './TownScene';
import type { Building, TownChunk, TownOverrides } from './townTypes';

/** Size of one window cell on the facade texture, in metres. */
const CELL_W = 3.2, CELL_H = 3;

let facade: MeshLambertMaterial | null = null;

/** Wall material for the instanced LOD1: a window texture whose scale follows the instance size (see the shader patch). */
function facadeMaterial(): MeshLambertMaterial {
  if (facade) return facade;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 58, 64, 6); // floor band
    g.fillStyle = '#ffffff'; g.fillRect(14, 12, 36, 40); // frame
    g.fillStyle = '#35506e'; g.fillRect(17, 15, 30, 34); // glass
    g.fillStyle = '#7fa6c9'; g.fillRect(17, 15, 30, 11); // sky reflection
    g.fillStyle = '#ffffff'; g.fillRect(31, 15, 2, 34); // mullion
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new MeshLambertMaterial({ map: tex });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAxis;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#if defined( USE_INSTANCING ) && defined( USE_MAP )
  vec3 isc = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
  vec2 span = aAxis < 0.5 ? vec2( isc.z, isc.y ) : ( aAxis < 1.5 ? vec2( isc.x, isc.y ) : vec2( 0.0 ) );
  vMapUv = uv * span / vec2( ${CELL_W.toFixed(1)}, ${CELL_H.toFixed(1)} );
#endif`,
      );
  };
  m.customProgramCacheKey = () => 'townFacade';
  facade = m;
  return m;
}

function instancedGeometry(s: InstancedShape): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(s.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(s.normals, 3));
  g.setAttribute('uv', new Float32BufferAttribute(s.uvs, 2));
  g.setAttribute('aAxis', new Float32BufferAttribute(s.axes, 1));
  g.setIndex(s.indices);
  return g;
}

function Lod0Building({ b, fixed, shadows }: { b: Building; fixed: FixedRecipes; shadows: boolean }) {
  const recipe = useMemo(() => recipeForTownBuilding(b, fixed), [b, fixed]);
  const ref = useRef<Group>(null);
  useEffect(() => {
    ref.current?.traverse((o) => { if ((o as Mesh).isMesh) o.castShadow = shadows; });
  }, [shadows, recipe]);
  return (
    <group ref={ref} position={[b.x, 0, b.z]} rotation={[0, buildingYaw(b), 0]}>
      <ProceduralBuilding recipe={recipe} ownerColour={b.colour} animate={false} detail="low" />
    </group>
  );
}

function FarChunk({ buildings, fixed, shadows }: { buildings: readonly Building[]; fixed: FixedRecipes; shadows: boolean }) {
  const geometry = useMemo(() => meshToGeometry(buildChunkLod2(buildings, fixed)), [buildings, fixed]);
  useDisposable([geometry]);
  return (
    <mesh geometry={geometry} castShadow={shadows}>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

export interface TownBuildingsProps {
  chunks: TownChunk[];
  chunkSize: number;
  /** Ground point the camera looks at (updated by the host every frame). */
  focus: MutableRefObject<{ x: number; z: number }>;
  quality: Quality;
  overrides: TownOverrides;
  fixed: FixedRecipes;
}

const dummy = new Object3D();
const tint = new Color();

export function TownBuildings({ chunks, chunkSize, focus, quality, overrides, fixed }: TownBuildingsProps) {
  const per = useMemo(
    () => chunks.map((c) => ({ key: `${c.cx}:${c.cz}`, cx: c.cx, cz: c.cz, buildings: applyChunkOverrides(c.buildings, overrides) })),
    [chunks, overrides],
  );
  const flat = useMemo(() => per.flatMap((p, ci) => p.buildings.map((b) => ({ b, ci }))), [per]);
  const byId = useMemo(() => new Map(flat.map((f) => [f.b.id, f.b])), [flat]);
  const boxGeo = useMemo(() => instancedGeometry(lod1Box()), []);
  const roofGeo = useMemo(() => instancedGeometry(lod1Roof()), []);
  useDisposable([boxGeo, roofGeo]);
  const shadows = quality.shadows === 'map';
  const walls = useMemo(() => {
    const m = new InstancedMesh(boxGeo, facadeMaterial(), Math.max(1, flat.length));
    m.frustumCulled = false;
    return m;
  }, [boxGeo, flat.length]);
  const roofs = useMemo(() => {
    const m = new InstancedMesh(roofGeo, facadeMaterial(), Math.max(1, flat.length));
    m.frustumCulled = false;
    return m;
  }, [roofGeo, flat.length]);
  useEffect(() => { walls.castShadow = roofs.castShadow = shadows; }, [walls, roofs, shadows]);
  useEffect(() => () => { walls.dispose(); roofs.dispose(); }, [walls, roofs]);

  const [farKeys, setFarKeys] = useState<string>('');
  const [lod0, setLod0] = useState<string[]>([]);
  const mounted = useRef(new Set<string>());
  const state = useRef({ x: NaN, z: NaN, t: 0, pending: false, dirty: true, farKey: '' });
  const coloured = useRef<Uint8Array>(new Uint8Array(0));

  // New data or a new quality: everything is recomputed on the next frame.
  useEffect(() => {
    mounted.current.clear();
    coloured.current = new Uint8Array(flat.length);
    state.current.dirty = true;
    setLod0([]);
  }, [flat, quality, walls, roofs]);

  useFrame((_, dt) => {
    const f = focus.current, s = state.current;
    s.t += dt;
    const moved = !(Math.hypot(f.x - s.x, f.z - s.z) <= 2);
    if (!(moved || s.t > 0.5 || s.dirty || s.pending)) return;
    s.x = f.x; s.z = f.z; s.t = 0; s.dirty = false;

    const far = new Set<string>();
    for (const p of per) if (chunkIsFar(distanceToChunk(p.cx, p.cz, chunkSize, f.x, f.z), quality)) far.add(p.key);

    // LOD0: nearest buildings inside the LOD0 distance of the chunks that are not far, within the building cap.
    const cands: Array<{ id: string; d: number }> = [];
    for (const { b, ci } of flat) {
      if (far.has(per[ci]!.key)) continue;
      const d = Math.hypot(b.x - f.x, b.z - f.z);
      if (d < quality.lod0Distance * 1.1) cands.push({ id: b.id, d });
    }
    const desired = pickLod0(cands, mounted.current, quality);
    const want = new Set(desired);
    let changed = false;
    for (const id of [...mounted.current]) if (!want.has(id)) { mounted.current.delete(id); changed = true; }
    let added = 0;
    for (const id of desired) {
      if (mounted.current.has(id)) continue;
      if (added >= quality.maxNewBuildingsPerFrame) break; // the rest waits for the next frame
      mounted.current.add(id); added++; changed = true;
    }
    s.pending = desired.some((id) => !mounted.current.has(id));

    // LOD1 instances: everything that is neither LOD0 nor in a far chunk.
    flat.forEach(({ b, ci }, i) => {
      const hidden = far.has(per[ci]!.key) || mounted.current.has(b.id);
      const sh = shapeOf(b, fixed);
      const yaw = buildingYaw(b);
      if (hidden) {
        dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(0, 0, 0);
        dummy.updateMatrix(); walls.setMatrixAt(i, dummy.matrix); roofs.setMatrixAt(i, dummy.matrix);
        return;
      }
      dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(b.width, sh.eave, b.depth);
      dummy.updateMatrix(); walls.setMatrixAt(i, dummy.matrix);
      if (sh.rise > 0) {
        dummy.position.set(b.x, sh.eave, b.z);
        if (sh.ridge === 'depth') { dummy.rotation.set(0, yaw, 0); dummy.scale.set(b.width, sh.rise, b.depth); }
        else { dummy.rotation.set(0, yaw + Math.PI / 2, 0); dummy.scale.set(b.depth, sh.rise, b.width); }
      } else dummy.scale.set(0, 0, 0);
      dummy.updateMatrix(); roofs.setMatrixAt(i, dummy.matrix);
      if (!coloured.current[i]) {
        walls.setColorAt(i, tint.set(sh.wall));
        roofs.setColorAt(i, tint.set(sh.roof));
        coloured.current[i] = 1;
        if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
        if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
      }
    });
    walls.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;

    if (changed) setLod0([...mounted.current].sort());
    const key = [...far].sort().join('|');
    if (key !== s.farKey) { s.farKey = key; setFarKeys(key); }
  });

  const far = useMemo(() => new Set(farKeys ? farKeys.split('|') : []), [farKeys]);
  return (
    <group>
      <primitive object={walls} />
      <primitive object={roofs} />
      {per.map((p) => (far.has(p.key) ? <FarChunk key={p.key} buildings={p.buildings} fixed={fixed} shadows={shadows} /> : null))}
      {lod0.map((id) => {
        const b = byId.get(id);
        return b ? <Lod0Building key={id} b={b} fixed={fixed} shadows={shadows} /> : null;
      })}
    </group>
  );
}
