// T4: the baked town's roads, water, bridges, roundabouts and signs as R3F meshes.
// One merged mesh per chunk, one for the shared parts (water, bridges, ...), one InstancedMesh per sign kind.
// The pieces are exported so TownWorld (T5/T6) can build only the chunks near the camera.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4 } from 'three';
import {
  buildChunkMesh, buildSharedMesh, buildSignMesh, SIGN_KINDS, signsByKind, type MeshData, type SignKind,
} from './townRoadMesh';
import type { TownChunk, TownChunkIndex, TownChunkShared, Vec2 } from './townTypes';

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** MeshData -> BufferGeometry. Palette colours are sRGB, vertex colours are read as linear by three. */
export function meshToGeometry(m: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(m.normals, 3));
  g.setAttribute('color', new Float32BufferAttribute(m.colors.map(toLinear), 3));
  g.setIndex(m.indices);
  g.computeBoundingSphere();
  return g;
}

export function useDisposable<T extends { dispose(): void }>(items: T[]): void {
  useEffect(() => () => { for (const i of items) i.dispose(); }, [items]);
}

export function SignInstances({ kind, signs }: { kind: SignKind; signs: ReadonlyArray<{ x: number; z: number }> }) {
  const geometry = useMemo(() => meshToGeometry(buildSignMesh(kind)), [kind]);
  useDisposable([geometry]);
  const ref = useMemo(() => {
    const mesh = new InstancedMesh(geometry, undefined, signs.length);
    const m = new Matrix4();
    signs.forEach((s, i) => mesh.setMatrixAt(i, m.makeTranslation(s.x, 0, s.z)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }, [geometry, signs]);
  return (
    <primitive object={ref}>
      <meshLambertMaterial vertexColors attach="material" />
    </primitive>
  );
}

/** Roads and highway pieces of one chunk: one draw call. */
export function ChunkRoadMesh({ chunk, receiveShadow = false }: { chunk: TownChunk; receiveShadow?: boolean }) {
  const geometry = useMemo(() => meshToGeometry(buildChunkMesh(chunk)), [chunk]);
  useDisposable([geometry]);
  return (
    <mesh geometry={geometry} receiveShadow={receiveShadow}>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

/** Water, bridges, roundabouts, cul-de-sacs, parks and plaza: the parts of the bake that are not chunked. */
export function SharedTownMesh({ shared, receiveShadow = false }: { shared: TownChunkShared; receiveShadow?: boolean }) {
  const geometry = useMemo(() => meshToGeometry(buildSharedMesh(shared)), [shared]);
  useDisposable([geometry]);
  return (
    <mesh geometry={geometry} receiveShadow={receiveShadow}>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

export function TownGround({ size, receiveShadow = false }: { size: Vec2; receiveShadow?: boolean }) {
  const [w, d] = size;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, d / 2]} receiveShadow={receiveShadow}>
      <planeGeometry args={[w + 600, d + 600]} />
      <meshLambertMaterial color="#a5d36f" />
    </mesh>
  );
}

export function TownSigns({ chunks }: { chunks: readonly TownChunk[] }) {
  const signs = useMemo(() => signsByKind(chunks.flatMap((c) => c.signs)), [chunks]);
  return <>{SIGN_KINDS.map((k) => (signs[k].length ? <SignInstances key={k} kind={k} signs={signs[k]} /> : null))}</>;
}

export interface TownSceneProps {
  index: TownChunkIndex;
  chunks: TownChunk[];
}

/** The whole town's roads at once (the `?town=roads` dev scene). */
export function TownScene({ index, chunks }: TownSceneProps) {
  return (
    <group>
      <TownGround size={index.size} />
      {chunks.map((c) => <ChunkRoadMesh key={c.cx + ':' + c.cz} chunk={c} />)}
      <SharedTownMesh shared={index.shared} />
      <TownSigns chunks={chunks} />
    </group>
  );
}

/**
 * Dev readout: draw calls and triangles of the last frame. On `window.__townStats`, in `document.body.dataset.townStats`
 * (so a headless run can read it) and every 5 s in the console.
 */
export function RenderStats() {
  const gl = useThree((s) => s.gl);
  useFrame((state) => {
    const t = Math.floor(state.clock.elapsedTime);
    const w = window as unknown as { __townStats?: { drawCalls: number; triangles: number; t: number } };
    if (w.__townStats?.t === t) return;
    const stats = { drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles, t };
    w.__townStats = stats;
    document.body.dataset.townStats = JSON.stringify(stats);
    if (t % 5 === 0) console.info('[town] draw calls', stats.drawCalls, 'triangles', stats.triangles);
  });
  return null;
}
