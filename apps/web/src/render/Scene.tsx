// The 3D scene. No scene changes or loading screens between CEO_Mode and Management_View (15.1).
import { Canvas } from '@react-three/fiber';
import { lazy, Suspense } from 'react';
import { bridge } from '../store/simBridge';
import { useSession, useSimVersion, useUi } from '../store/stores';
import { CameraController } from './CameraController';
import { Building, Ground, Plots, Roads, UnloadingZones } from './World';
import { Figures } from './Figures';
import { Vehicles } from './Vehicles';
import { HumanLabels, ManagementOverlay } from './Overlays';
import { AdaptiveDpr } from './AdaptiveDpr';
import { camCfg, palette } from './theme';

const ManualDriving = lazy(() => import('../physics/ManualDriving'));

function WorldContent() {
  useSimVersion((v) => v.v); // refresh static-ish content at <= 5 Hz
  const loop = bridge.loop;
  const physicsFailed = useSession((s) => s.physicsFailed);
  if (!loop) return null;
  const reg = loop.sim.reg;
  const s = loop.sim.state;
  return (
    <>
      <Ground reg={reg} districts={s.districts} />
      <Roads reg={reg} />
      <Plots reg={reg} state={s} />
      <UnloadingZones reg={reg} state={s} />
      {Object.values(s.businesses).map((b) => (
        <Building key={b.id} reg={reg} state={s} b={b} open={s.ceo.insideBusinessId === b.id} />
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
      <color attach="background" args={[palette.sky ?? '#bde3ff']} />
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
