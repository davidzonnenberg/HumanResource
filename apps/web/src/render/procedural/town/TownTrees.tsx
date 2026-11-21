// T6: trees from the bake as instanced meshes. Near the focus point they are low-poly trees, farther out flat discs
// (the camera looks down, so a disc reads like a billboard), beyond the far distance they are not drawn.
// Both distances come from the quality preset. Two draw calls for all trees.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { Quality } from '../../quality';
import { treeDiscMesh, treeMesh } from './townBuildingMesh';
import { meshToGeometry, useDisposable } from './TownScene';
import type { TownChunk } from './townTypes';

const dummy = new Object3D();

export function TownTrees({ chunks, focus, quality }: { chunks: readonly TownChunk[]; focus: MutableRefObject<{ x: number; z: number }>; quality: Quality }) {
  const trees = useMemo(() => chunks.flatMap((c) => c.trees), [chunks]);
  const treeGeo = useMemo(() => meshToGeometry(treeMesh()), []);
  const discGeo = useMemo(() => meshToGeometry(treeDiscMesh()), []);
  useDisposable([treeGeo, discGeo]);
  const mat = useMemo(() => new MeshLambertMaterial({ vertexColors: true }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  const near = useMemo(() => {
    const m = new InstancedMesh(treeGeo, mat, Math.max(1, trees.length));
    m.frustumCulled = false;
    return m;
  }, [treeGeo, mat, trees.length]);
  const far = useMemo(() => {
    const m = new InstancedMesh(discGeo, mat, Math.max(1, trees.length));
    m.frustumCulled = false;
    return m;
  }, [discGeo, mat, trees.length]);
  useEffect(() => { near.castShadow = quality.shadows === 'map'; }, [near, quality.shadows]);
  useEffect(() => () => { near.dispose(); far.dispose(); }, [near, far]);
  const last = useRef({ x: NaN, z: NaN, t: 0 });
  useEffect(() => { last.current.x = NaN; }, [near, far, quality]); // new instances or quality: place everything on the next frame

  useFrame((_, dt) => {
    const f = focus.current, l = last.current;
    l.t += dt;
    if (Math.hypot(f.x - l.x, f.z - l.z) <= 4 && l.t < 1) return;
    l.x = f.x; l.z = f.z; l.t = 0;
    trees.forEach(([x, z, r], i) => {
      const d = Math.hypot(x - f.x, z - f.z);
      const isNear = d < quality.treeMeshDistance, isFar = !isNear && d < quality.treeFarDistance;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(isNear ? r : 0, isNear ? r : 0, isNear ? r : 0);
      dummy.updateMatrix(); near.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(isFar ? r : 0, 1, isFar ? r : 0);
      dummy.updateMatrix(); far.setMatrixAt(i, dummy.matrix);
    });
    near.instanceMatrix.needsUpdate = true;
    far.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <primitive object={near} />
      <primitive object={far} />
    </group>
  );
}
