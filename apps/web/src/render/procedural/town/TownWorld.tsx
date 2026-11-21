// T5 + T6: the whole procedural town as the game will draw it: only the chunks within the quality's radius of the
// focus point are loaded and built, buildings at three LODs, trees by distance, a shadow map on High.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { DirectionalLight } from 'three';
import type { Quality } from '../../quality';
import { chunksInRadius } from './townBuildings';
import { loadTownChunk } from './townLoader';
import { fixedRecipes, townOverrides } from './townRecipes';
import { TownBuildings } from './TownBuildingLods';
import { ChunkRoadMesh, SharedTownMesh, TownGround, TownSigns } from './TownScene';
import { TownTrees } from './TownTrees';
import type { TownChunk, TownChunkIndex } from './townTypes';

/** Directional light with a shadow map that follows the focus point (High preset). */
function Sun({ focus, shadows }: { focus: MutableRefObject<{ x: number; z: number }>; shadows: boolean }) {
  const light = useRef<DirectionalLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const { x, z } = focus.current;
    l.target.position.set(x, 0, z);
    l.target.updateMatrixWorld();
    l.position.set(x + 60, 120, z + 40);
  });
  return (
    <>
      <directionalLight
        ref={light}
        intensity={1.2}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={160}
        shadow-camera-bottom={-160}
        shadow-camera-near={10}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
      />
      {light.current && <primitive object={light.current.target} />}
    </>
  );
}

export interface TownWorldProps {
  index: TownChunkIndex;
  briefId: string;
  focus: MutableRefObject<{ x: number; z: number }>;
  quality: Quality;
}

export function TownWorld({ index, briefId, focus, quality }: TownWorldProps) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.enabled = quality.shadows === 'map';
  }, [gl, quality.shadows]);

  // Which chunks are built: `chunkRadius` rings around the focus. Checked a few times a second.
  const [files, setFiles] = useState<string[]>([]);
  const filesKey = useRef('');
  const timer = useRef(1);
  const byCell = useMemo(() => new Map(index.chunks.map((c) => [`${c.cx}:${c.cz}`, c.file])), [index]);
  useFrame((_, dt) => {
    timer.current += dt;
    if (timer.current < 0.25 && filesKey.current) return;
    timer.current = 0;
    const want = chunksInRadius(focus.current.x, focus.current.z, quality.chunkRadius, index.chunkSize)
      .map(([cx, cz]) => byCell.get(`${cx}:${cz}`))
      .filter((f): f is string => !!f)
      .sort();
    const key = want.join('|');
    if (key === filesKey.current) return;
    filesKey.current = key;
    setFiles(want);
  });

  const [chunks, setChunks] = useState<TownChunk[]>([]);
  useEffect(() => {
    let live = true;
    void Promise.all(files.map((f) => loadTownChunk(briefId, f))).then((list) => { if (live) setChunks(list); });
    return () => { live = false; };
  }, [files, briefId]);

  const overrides = useMemo(() => townOverrides(), []);
  const fixed = useMemo(() => fixedRecipes(), []);
  const shadows = quality.shadows === 'map';
  return (
    <group>
      <hemisphereLight args={['#ffffff', '#6b8f4e', 0.9]} />
      <Sun focus={focus} shadows={shadows} />
      <TownGround size={index.size} receiveShadow={shadows} />
      <SharedTownMesh shared={index.shared} receiveShadow={shadows} />
      {chunks.map((c) => <ChunkRoadMesh key={c.cx + ':' + c.cz} chunk={c} receiveShadow={shadows} />)}
      <TownSigns chunks={chunks} />
      <TownTrees chunks={chunks} focus={focus} quality={quality} />
      <TownBuildings chunks={chunks} chunkSize={index.chunkSize} focus={focus} quality={quality} overrides={overrides} fixed={fixed} />
    </group>
  );
}
