// The 3D scene. No scene changes or loading screens between CEO_Mode and Management_View (15.1).
// Inside a Business (14.3) only that interior is drawn, Stardew-style, on a dark backdrop.
import { Canvas } from '@react-three/fiber';
import { lazy, Suspense } from 'react';
import { bridge } from '../store/simBridge';
import { useSession, useSimVersion, useUi } from '../store/stores';
import { CameraController } from './CameraController';
import { Building, BuildingShadows, Ground, Landmarks, Plots, Roads, Sidewalks, UnloadingZones, type LandmarkDef } from './World';
import { landmarks } from '@hr/content';
import { FillerStreets } from './procedural/buildings/FillerStreets';
import { Figures } from './Figures';
import { Vehicles } from './Vehicles';
import { HumanLabels, ManagementOverlay } from './Overlays';
import { AdaptiveDpr } from './AdaptiveDpr';
import { camCfg, palette } from './theme';

const ManualDriving = lazy(() => import('../physics/ManualDriving'));

function Backdrop() {
  useSimVersion((v) => v.v);
  const inside = bridge.loop?.sim.state.ceo.insideBusinessId ?? null;
  return <color attach="background" args={[inside ? palette.interiorBackdrop : (palette.sky ?? '#bde3ff')]} />;
}

function WorldContent() {
  useSimVersion((v) => v.v); // refresh static-ish content at <= 5 Hz
  const loop = bridge.loop;
  const physicsFailed = useSession((s) => s.physicsFailed);
  if (!loop) return null;
  const reg = loop.sim.reg;
  const s = loop.sim.state;
  const inside = s.ceo.insideBusinessId ? s.businesses[s.ceo.insideBusinessId] : undefined;
  if (inside) return <Building reg={reg} state={s} b={inside} open />;
  return (
    <>
      <Ground reg={reg} districts={s.districts} />
      <Roads reg={reg} />
      <Sidewalks reg={reg} />
      <Plots reg={reg} state={s} />
      <BuildingShadows reg={reg} state={s} />
      <Landmarks list={landmarks as LandmarkDef[]} districts={s.districts} />
      <UnloadingZones reg={reg} state={s} />
      <FillerStreets reg={reg} districts={s.districts} />
      {Object.values(s.businesses).map((b) => (
        <Building key={b.id} reg={reg} state={s} b={b} open={false} />
      ))}
      <Vehicles state={s} />
      <ManagementOverlay reg={reg} state={s} />
      {s.ceo.drivingVehicleId && !physicsFailed && (
        <Suspense fallback={null}>
          <ManualDriving vehicleId={s.ceo.drivingVehicleId} />
        </Suspense>
      )}
    </>
  );
}

export function Scene() {
  return (
    <Canvas
      className="game-canvas"
      dpr={[1, 2]}
      camera={{ fov: camCfg.fovDeg, near: 0.5, far: 1200, position: [0, 20, 20] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => useUi.getState().set({ selection: null })}
    >
      <Backdrop />
      <hemisphereLight args={['#ffffff', '#6b8f4e', 0.9]} />
      <directionalLight position={[30, 60, 20]} intensity={1.2} />
      <CameraController />
      <AdaptiveDpr />
      <WorldContent />
      <Figures />
      <HumanLabels />
    </Canvas>
  );
}
