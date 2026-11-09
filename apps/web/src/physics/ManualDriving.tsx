// Physics_Layer (13): lazy-loaded Rapier world mounted only during Manual_Driving. Arcade
// handling from the Vehicle Definition; cargo is simulation data and is never touched here.
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { bridge } from '../store/simBridge';
import { useHud, useSession } from '../store/stores';
import { inputState } from '../input/inputState';
import { camState } from '../render/cameraState';
import { ownerColor, screenToWorld, theme } from '../render/theme';
import { VanBody, crateCount, renderHeadings } from '../render/Vehicles';
import { clampManualVelocity, newUprightState, stickToDrive, updateUpright } from './uprightMonitor';

const up = new THREE.Vector3();
const fwd = new THREE.Vector3();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

function Van({ vehicleId }: { vehicleId: string }) {
  const body = useRef<RapierRigidBody>(null);
  const wobble = useRef<THREE.Group>(null);
  const squash = useRef(0);
  const monitor = useRef(newUprightState());
  const loop = bridge.loop;
  const v = loop?.sim.state.vehicles[vehicleId];
  const def = v ? loop?.sim.reg.vehicles[v.defId] : undefined;
  // Start pose is captured once per takeover; later sim updates come from the body itself.
  const start = useMemo(() => ({ x: v?.pose.x ?? 0, z: v?.pose.z ?? 0, heading: renderHeadings.get(vehicleId) ?? v?.pose.heading ?? 0 }), [vehicleId]);

  useEffect(() => {
    // Once per Tick the loop asks for the latest pose (2.9).
    inputState.physicsBeforeTick = (sim) => {
      const b = body.current;
      if (!b) return;
      const t = b.translation();
      const lv = b.linvel();
      quat.set(b.rotation().x, b.rotation().y, b.rotation().z, b.rotation().w);
      euler.setFromQuaternion(quat);
      sim.submit({ type: 'manualVehicleUpdate', vehicleId, x: t.x, z: t.z, heading: euler.y, speed: Math.hypot(lv.x, lv.z) }, 'physics');
    };
    return () => {
      inputState.physicsBeforeTick = null;
      camState.physicsPose = null;
      const b = body.current;
      if (b) {
        quat.set(b.rotation().x, b.rotation().y, b.rotation().z, b.rotation().w);
        euler.setFromQuaternion(quat);
        renderHeadings.set(vehicleId, euler.y);
      }
    };
  }, [vehicleId]);

  useFrame((_, rawDt) => {
    const b = body.current;
    const lp = bridge.loop;
    if (!b || !lp || !def) return;
    const dt = Math.min(0.05, rawDt);
    const r = b.rotation();
    quat.set(r.x, r.y, r.z, r.w);
    fwd.set(0, 0, -1).applyQuaternion(quat);
    up.set(0, 1, 0).applyQuaternion(quat);
    fwd.y = 0;
    fwd.normalize();

    // Input: PC keys (W/S throttle, A/D steer) or the touch stick (desired direction)
    const keys = inputState.keys;
    let throttle = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    let steer = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0);
    if (throttle === 0 && steer === 0 && (inputState.stickX !== 0 || inputState.stickY !== 0)) {
      const want = screenToWorld(inputState.stickX, inputState.stickY);
      const d = stickToDrive(want.x, want.z, fwd.x, fwd.z);
      throttle = d.throttle;
      steer = d.steer;
    }

    const h = def.handling;
    const lv = b.linvel();
    const speed = Math.hypot(lv.x, lv.z);
    const forwardSpeed = lv.x * fwd.x + lv.z * fwd.z;
    // Throttle impulse along the van's forward vector
    const accel = h.acceleration * throttle * dt * b.mass();
    b.applyImpulse({ x: fwd.x * accel, y: 0, z: fwd.z * accel }, true);
    // Loose steering: only part of the sideways velocity is removed, so the van drifts
    const latX = lv.x - fwd.x * forwardSpeed;
    const latZ = lv.z - fwd.z * forwardSpeed;
    const grip = (1 - h.steeringLooseness) * 0.35;
    let nvx = lv.x - latX * grip;
    let nvz = lv.z - latZ * grip;
    if (throttle === 0) {
      nvx *= 0.94; // roll to a stop so Load/Unload/Exit become available
      nvz *= 0.94;
    }
    const capped = clampManualVelocity(nvx, nvz, def.speed, lp.sim.reg.config.manualSpeedBonus);
    b.setLinvel({ x: capped.vx, y: lv.y, z: capped.vz }, true);
    const turn = steer * h.turnRate * Math.min(1, speed / 3) * Math.sign(forwardSpeed || 1);
    const av = b.angvel();
    b.setAngvel({ x: av.x, y: turn, z: av.z }, true);

    // Body roll (visual spring) and collision squash
    if (wobble.current) {
      const roll = -steer * h.bodyRoll * Math.min(1, speed / def.speed);
      wobble.current.rotation.z += (roll - wobble.current.rotation.z) * 0.15;
      squash.current *= 0.9;
      const sq = Math.sin(performance.now() / 40) * squash.current;
      wobble.current.scale.set(1 + sq, 1 - sq, 1 + sq);
    }

    // Upright / out-of-bounds resets with cargo intact (13.14, 13.15)
    const t = b.translation();
    camState.physicsPose = { x: t.x, z: t.z };
    const cache = lp.sim.paths();
    const verdict = updateUpright(monitor.current, up.y, cache.drivable(t.x, t.z), dt * 1000);
    if (verdict !== 'ok') {
      const rp = cache.nearestRoadPoint(t.x, t.z);
      if (rp) {
        b.setTranslation({ x: rp.x, y: 1, z: rp.z }, true);
        euler.set(0, euler.setFromQuaternion(quat).y, 0);
        quat.setFromEuler(euler);
        b.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        lp.sim.submit({ type: 'resetVehicle', vehicleId, x: rp.x, z: rp.z, heading: euler.y }, 'physics');
      }
    }
  });

  if (!v || !def) return null;
  const color = ownerColor(v.owner);
  return (
    <RigidBody
      ref={body}
      type="dynamic"
      position={[start.x, 0.6, start.z]}
      rotation={[0, start.heading, 0]}
      colliders={false}
      mass={def.handling.mass}
      restitution={def.handling.bounciness}
      linearDamping={0.4}
      angularDamping={2}
      onCollisionEnter={() => {
        squash.current = Math.min(0.18, squash.current + 0.12);
      }}
    >
      <CuboidCollider args={[0.9 * theme.vehicleScale, 0.7 * theme.vehicleScale, 1.6 * theme.vehicleScale]} position={[0, 0.8, 0]} />
      <group scale={theme.vehicleScale}>
        <VanBody color={color} crates={crateCount(v)} wobble={wobble} />
      </group>
    </RigidBody>
  );
}

/** Kinematic stand-ins for the other Vehicles so you can bump into them comically. */
function OtherVehicles({ exclude }: { exclude: string }) {
  const loop = bridge.loop;
  const ids = loop ? Object.keys(loop.sim.state.vehicles).filter((id) => id !== exclude) : [];
  return (
    <>
      {ids.map((id) => (
        <KinematicVan key={id} id={id} />
      ))}
    </>
  );
}

function KinematicVan({ id }: { id: string }) {
  const body = useRef<RapierRigidBody>(null);
  useFrame(() => {
    const p = bridge.loop?.pose(id);
    if (p && body.current) body.current.setNextKinematicTranslation({ x: p.x, y: 0.8, z: p.z });
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false}>
      <CuboidCollider args={[1.1, 0.8, 2]} />
    </RigidBody>
  );
}

function StaticWorld() {
  const loop = bridge.loop;
  if (!loop) return null;
  const reg = loop.sim.reg;
  const s = loop.sim.state;
  const b = loop.sim.paths().bounds();
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[w / 2 + 20, 0.5, d / 2 + 20]} position={[cx, -0.5, cz]} friction={0.6} />
      {Object.values(s.businesses).map((biz) => {
        const p = reg.world.plots[biz.plotId]?.def;
        return p ? <CuboidCollider key={biz.id} args={[p.w / 2, 2, p.d / 2]} position={[p.x, 2, p.z]} restitution={0.7} /> : null;
      })}
    </RigidBody>
  );
}

class PhysicsBoundary extends Component<{ children: ReactNode; vehicleId: string }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    // Rapier failed (13.16): disable driving, hand the van back; Humans keep delivering.
    useSession.getState().set({ physicsFailed: true });
    useHud.getState().pushToast('toast.physicsFailed');
    bridge.loop?.sim.submit({ type: 'endManualDriving', vehicleId: this.props.vehicleId });
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function ManualDriving({ vehicleId }: { vehicleId: string }) {
  const paused = bridge.loop?.paused ?? false;
  return (
    <PhysicsBoundary vehicleId={vehicleId}>
      <Physics gravity={[0, -20, 0]} paused={paused} timeStep="vary">
        <StaticWorld />
        <OtherVehicles exclude={vehicleId} />
        <Van vehicleId={vehicleId} />
      </Physics>
    </PhysicsBoundary>
  );
}
