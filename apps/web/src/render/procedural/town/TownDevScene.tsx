// Dev scenes for the procedural town, no sim and no save.
//   ?dev=1&town=roads   T4: every road, the water and the bridges of the whole town at once
//   ?dev=1&town=full    T5 + T6: buildings at three LODs, trees and shadows, driven by the quality preset
//                       (?q=low or ?q=high forces a preset; otherwise Auto measures this device)
// Pan with the arrow keys or the right mouse button; zoom with the wheel. Draw calls and triangles go to
// `window.__townStats`, `document.body.dataset.townStats` and the console (see RenderStats).
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { QualityProbe } from '../../QualityProbe';
import { useQuality, useQualityStore } from '../../qualityStore';
import { loadTown, loadTownIndex, type LoadedTown } from './townLoader';
import { RenderStats, TownScene } from './TownScene';
import { TownWorld } from './TownWorld';
import type { TownChunkIndex } from './townTypes';

const TOWN_ID = 'start_city';
type Controls = ComponentRef<typeof OrbitControls>;

export function TownRoadsScene() {
  const [town, setTown] = useState<LoadedTown | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadTown(TOWN_ID).then(setTown, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <pre className="screen">{error}</pre>;
  if (!town) return <div className="screen center" aria-busy="true" />;
  const [w, d] = town.index.size;
  const cx = w / 2, cz = d / 2;
  return (
    <Canvas className="game-canvas" dpr={[1, 1.5]} camera={{ fov: 40, near: 5, far: 4000, position: [cx, 1100, cz + 700] }} gl={{ antialias: true }}>
      <color attach="background" args={['#bde3ff']} />
      <hemisphereLight args={['#ffffff', '#6b8f4e', 0.9]} />
      <directionalLight position={[cx + 300, 600, cz + 200]} intensity={1.2} />
      <OrbitControls target={[cx, 0, cz]} maxPolarAngle={Math.PI / 2.05} />
      <TownScene index={town.index} chunks={town.chunks} />
      <RenderStats />
    </Canvas>
  );
}

/** Copies the orbit target to a ref the town reads as its focus point, and enables arrow-key panning. */
function FocusFromControls({ controls, focus }: { controls: RefObject<Controls | null>; focus: RefObject<{ x: number; z: number }> }) {
  useEffect(() => { controls.current?.listenToKeyEvents(window as unknown as HTMLElement); }, [controls]);
  useFrame(() => {
    const t = controls.current?.target;
    if (t && focus.current) { focus.current.x = t.x; focus.current.z = t.z; }
  });
  return null;
}

function TownFull({ index }: { index: TownChunkIndex }) {
  const quality = useQuality();
  const [w, d] = index.size;
  const start = useMemo(() => ({ x: index.shared.centre[0] ?? w / 2, z: index.shared.centre[1] ?? d / 2 }), [index, w, d]);
  const focus = useRef({ ...start });
  const controls = useRef<Controls>(null);
  return (
    <Canvas
      key={quality.shadows} // a different shadow setting needs fresh materials
      className="game-canvas"
      dpr={[1, quality.pixelRatioCap ?? 2]}
      shadows={quality.shadows === 'map' ? 'percentage' : false}
      camera={{ fov: 40, near: 2, far: 3000, position: [start.x, 150, start.z + 130] }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#bde3ff']} />
      <OrbitControls ref={controls} target={[start.x, 0, start.z]} maxPolarAngle={Math.PI / 2.05} minDistance={8} maxDistance={900} />
      <FocusFromControls controls={controls} focus={focus} />
      <QualityProbe />
      <TownWorld index={index} briefId={TOWN_ID} focus={focus} quality={quality} />
      <RenderStats />
    </Canvas>
  );
}

export function TownFullScene() {
  const [index, setIndex] = useState<TownChunkIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    const store = useQualityStore.getState();
    if (q === 'low' || q === 'high') store.setChoice(q);
    // No profile and no storage here: the store lives in memory. In the game it is loaded from the device.
    useQualityStore.setState({ loaded: true });
    loadTownIndex(TOWN_ID).then(setIndex, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <pre className="screen">{error}</pre>;
  if (!index) return <div className="screen center" aria-busy="true" />;
  return <TownFull index={index} />;
}
