// Vehicles with visible cargo crates (11.3, 12.9, 17.2). Automatic Vehicles get their heading
// from movement here (the Simulation avoids trigonometry). The manually driven van is drawn by
// the Physics_Layer instead.
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import type * as THREE from 'three';
import type { SimState, Vehicle } from '@hr/sim';
import { bridge } from '../store/simBridge';
import { useUi } from '../store/stores';
import { ownerColor, palette, theme } from './theme';
import { MODEL_MAP, type GltfEntry } from './assets/modelMap';
import { GltfVehicle } from './assets/GltfVehicle';
import { ProceduralVanBody } from './procedural/van/ProceduralVanBody';

/** GLB for a vehicle model key, preferring an owner variant (e.g. `vehicle_van_player`). */
export function vehicleGltf(modelKey: string, owner: string): GltfEntry | null {
  const m = MODEL_MAP[`${modelKey}_${owner}`] ?? MODEL_MAP[modelKey];
  return m?.kind === 'gltf' ? m : null;
}

/** The drawn vehicle: generated GLB when mapped, else the placeholder van. */
export function VehicleBody({ modelKey, owner, color, crates, wobble }: { modelKey: string; owner: string; color: string; crates: number; wobble?: RefObject<THREE.Group | null> }) {
  // TEMP: the player's van is the procedural van (render/procedural/van) so we can judge it in play.
  if (owner === 'player') return <ProceduralVanBody color={color} crates={crates} {...(wobble ? { wobble } : {})} />;
  const gltf = vehicleGltf(modelKey, owner);
  const box = <VanBody color={color} crates={crates} {...(wobble ? { wobble } : {})} />;
  return gltf ? <GltfVehicle entry={gltf} crates={crates} fallback={box} {...(wobble ? { wobble } : {})} /> : box;
}

export function VanBody({ color, crates, wobble }: { color: string; crates: number; wobble?: RefObject<THREE.Group | null> }) {
  const crateList = Array.from({ length: Math.min(8, crates) }, (_, i) => i);
  return (
    <group ref={wobble ?? null}>
      <mesh position={[0, 0.75, 0.2]}>
        <boxGeometry args={[1.7, 0.9, 2.4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.15, -1.05]}>
        <boxGeometry args={[1.6, 1.0, 0.9]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.3, -1.52]}>
        <boxGeometry args={[1.3, 0.45, 0.05]} />
        <meshStandardMaterial color="#cfe8ff" />
      </mesh>
      {[
        [-0.85, -1.0],
        [0.85, -1.0],
        [-0.85, 1.0],
        [0.85, 1.0],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x as number, 0.35, z as number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.35, 0.35, 0.3, 12]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      ))}
      {crateList.map((i) => (
        <mesh key={i} position={[(i % 2) * 0.6 - 0.3, 1.45 + Math.floor(i / 4) * 0.45, 0.9 - Math.floor((i % 4) / 2) * 0.6]}>
          <boxGeometry args={[0.55, 0.42, 0.55]} />
          <meshStandardMaterial color={palette.crate} />
        </mesh>
      ))}
    </group>
  );
}

/** Last rendered heading per Vehicle; the Physics_Layer starts from it for a seamless takeover. */
export const renderHeadings = new Map<string, number>();

export function crateCount(v: Vehicle): number {
  const reg = bridge.reg;
  let n = 0;
  for (const [res, st] of Object.entries(v.cargo)) n += Math.ceil(st.amount / (reg?.resources[res]?.crateUnits ?? 10));
  return n;
}

function VehicleMesh({ id, owner, colorToken, modelKey, cargoCrates }: { id: string; owner: string; colorToken: string | undefined; modelKey: string; cargoCrates: number }) {
  const group = useRef<THREE.Group>(null);
  const heading = useRef(0);
  const crates = useRef(-1);
  const crateGroup = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const loop = bridge.loop;
    const g = group.current;
    if (!loop || !g) return;
    const v = loop.sim.state.vehicles[id];
    if (!v) return;
    g.visible = v.control !== 'manual';
    const p = loop.pose(id);
    const prev = loop.prevPoses.get(id);
    const cur = loop.currPoses.get(id);
    if (!p) return;
    if (prev && cur && (Math.abs(cur.x - prev.x) > 1e-4 || Math.abs(cur.z - prev.z) > 1e-4)) {
      const target = Math.atan2(cur.x - prev.x, cur.z - prev.z) + Math.PI; // model faces -z
      let diff = target - heading.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      heading.current += diff * Math.min(1, dt * 10);
    } else if (v.control !== 'auto') heading.current = v.pose.heading;
    g.position.set(p.x, 0, p.z);
    g.rotation.y = heading.current;
    if (v.control !== 'manual') renderHeadings.set(id, heading.current);
    // crates: show/hide pre-built crate meshes
    const n = crateCount(v);
    if (n !== crates.current && crateGroup.current) {
      crates.current = n;
      crateGroup.current.children.forEach((c, i) => (c.visible = i < n));
    }
  });
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useUi.getState().set({ selection: { kind: 'vehicle', id } });
  };
  const color = ownerColor(owner, colorToken);
  const gltf = owner === 'player' || vehicleGltf(modelKey, owner); // TEMP: player van is procedural
  return (
    <group ref={group} onClick={onClick} scale={theme.vehicleScale}>
      {gltf ? <VehicleBody modelKey={modelKey} owner={owner} color={color} crates={cargoCrates} /> : <VanBody color={color} crates={0} />}
      <group ref={crateGroup} visible={!gltf}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} visible={false} position={[(i % 2) * 0.6 - 0.3, 1.45 + Math.floor(i / 4) * 0.45, 0.9 - Math.floor((i % 4) / 2) * 0.6]}>
            <boxGeometry args={[0.55, 0.42, 0.55]} />
            <meshStandardMaterial color={palette.crate} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Vehicles({ state }: { state: SimState }) {
  return (
    <group>
      {Object.values(state.vehicles).map((v) => (
        <VehicleMesh key={v.id} id={v.id} owner={v.owner} colorToken={state.competitors[v.owner]?.colorToken} modelKey={bridge.reg?.vehicles[v.defId]?.modelKey ?? 'vehicle_van'} cargoCrates={crateCount(v)} />
      ))}
    </group>
  );
}
