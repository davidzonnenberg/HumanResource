// Physics_Layer (13): lazy-loaded Rapier world mounted only during Manual_Driving. Arcade
// handling from the Vehicle Definition; cargo is simulation data and is never touched here.
import { CuboidCollider, Physics, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { bridge } from '../store/simBridge';
import { useHud, useSession } from '../store/stores';
import { inputState } from '../input/inputState';
import { camState } from '../render/cameraState';
import { ownerColor, screenToWorld, theme } from '../render/theme';
import { VehicleBody, crateCount, renderHeadings, vehicleGltf } from '../render/Vehicles';
import { sidewalkBoxes } from '../render/World';
import { allFootprints, footprint, footprintVersion } from '../render/footprints';
import { newUprightState, stickToDrive, updateUpright } from './uprightMonitor';
import { driveStep } from './handling';

const up = new THREE.Vector3();
const fwd = new THREE.Vector3();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const suspQuat = new THREE.Quaternion();
const wheelPt = new THREE.Vector3();

// Ray-cast suspension: one spring per wheel, so each wheel follows the surface under it (one
// wheel on a curb lifts that corner, both wheels lift the side). The chassis collider floats
// above the springs, so it only touches walls and buildings, never the curb edge.
const GRAVITY = 20;
const VS = theme.vehicleScale;
/** Wheel corners in van-body units; multiplied by the vehicle's size (vehicleScale x model scale). */
const WHEELS: readonly (readonly [number, number])[] = [
  [-0.85, -1.0],
  [0.85, -1.0],
  [-0.85, 1.0],
  [0.85, 1.0],
];

/** World size of a vehicle: theme scale times its GLB `scale` knob, so the hitbox follows the model. */
function vehicleSize(modelKey: string, owner: string): number {
  return VS * (vehicleGltf(modelKey, owner)?.scale ?? 1);
}
const RAY_TOP = 0.9; // ray origin above the body origin (the van's ground contact)
const SPRING = 260; // per-wheel stiffness, as acceleration per metre of compression
const DAMPER = 22; // per-wheel damping, as acceleration per m/s along the spring
const REST = RAY_TOP + GRAVITY / SPRING; // rest length: at equilibrium the body origin sits on the surface
const MAX_RAY = REST + 0.45;
const CHASSIS_BOTTOM = 0.45; // above the curb height, so curbs are driven over, not crashed into
// TEMP driving diagnostics (dev builds only, about once a second). Remove once driving is fixed.
let debugElapsed = 0;
function driveDebug(dt: number, data: () => Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  debugElapsed += dt;
  if (debugElapsed < 1) return;
  debugElapsed = 0;
  console.info('[drive]', data());
}

// ---- Tyre marks while drifting / spinning donuts (render only, fade by shrinking) ----------------
const MAX_MARKS = 300;
const MARK_LIFE = 6; // seconds
const MARK_SPACING = 0.3; // world units between marks per wheel
const marks = { x: new Float32Array(MAX_MARKS), z: new Float32Array(MAX_MARKS), yaw: new Float32Array(MAX_MARKS), born: new Float32Array(MAX_MARKS).fill(-1e9), next: 0 };
const lastMark = new Map<number, { x: number; z: number }>();

function addSkidMark(x: number, z: number, yaw: number, wheel: number): void {
  const prev = lastMark.get(wheel);
  if (prev && Math.hypot(x - prev.x, z - prev.z) < MARK_SPACING) return;
  lastMark.set(wheel, { x, z });
  const i = marks.next;
  marks.x[i] = x;
  marks.z[i] = z;
  marks.yaw[i] = yaw;
  marks.born[i] = performance.now() / 1000;
  marks.next = (i + 1) % MAX_MARKS;
}

const markObj = new THREE.Object3D();
function TyreMarks() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(0.32, 0.45).rotateX(-Math.PI / 2), []);
  useEffect(
    () => () => {
      marks.born.fill(-1e9);
      lastMark.clear();
    },
    [],
  );
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const now = performance.now() / 1000;
    let n = 0;
    for (let i = 0; i < MAX_MARKS; i++) {
      const age = now - (marks.born[i] ?? -1e9);
      if (age > MARK_LIFE) continue;
      const k = 1 - age / MARK_LIFE;
      markObj.position.set(marks.x[i] ?? 0, 0.07, marks.z[i] ?? 0);
      markObj.rotation.set(0, marks.yaw[i] ?? 0, 0);
      markObj.scale.set(k, 1, 0.6 + 0.4 * k);
      markObj.updateMatrix();
      m.setMatrixAt(n++, markObj.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[geo, undefined, MAX_MARKS]} frustumCulled={false} renderOrder={2}>
      <meshBasicMaterial color="#2b2320" transparent opacity={0.45} depthWrite={false} polygonOffset polygonOffsetFactor={-3} />
    </instancedMesh>
  );
}

function Van({ vehicleId }: { vehicleId: string }) {
  const body = useRef<RapierRigidBody>(null);
  const wobble = useRef<THREE.Group>(null);
  const squash = useRef(0);
  // Heading cached every frame while the body is alive. The unmount cleanup reads this instead of
  // calling Rapier, because the physics world may already be freed by then (crash fix).
  const lastHeading = useRef<number | null>(null);
  const monitor = useRef(newUprightState());
  const { rapier } = useRapier();
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier]);
  const loop = bridge.loop;
  const v = loop?.sim.state.vehicles[vehicleId];
  const def = v ? loop?.sim.reg.vehicles[v.defId] : undefined;
  const size = def && v ? vehicleSize(def.modelKey, v.owner) : VS;

  useBeforePhysicsStep((world) => {
    const b = body.current;
    if (!b) return;
    const dt = Math.min(0.05, Math.max(1 / 240, world.timestep));
    const r = b.rotation();
    suspQuat.set(r.x, r.y, r.z, r.w);
    const t = b.translation();
    const share = b.mass() / WHEELS.length;
    for (const [wx, wz] of WHEELS) {
      wheelPt.set(wx * size, RAY_TOP, wz * size).applyQuaternion(suspQuat);
      ray.origin = { x: t.x + wheelPt.x, y: t.y + wheelPt.y, z: t.z + wheelPt.z };
      const hit = world.castRay(ray, MAX_RAY, true, undefined, undefined, undefined, b);
      if (!hit) continue; // wheel in the air
      const compression = REST - hit.timeOfImpact;
      if (compression <= 0) continue;
      const contact = { x: ray.origin.x, y: ray.origin.y - hit.timeOfImpact, z: ray.origin.z };
      const vy = b.velocityAtPoint(contact).y;
      const accel = Math.max(0, SPRING * compression - DAMPER * vy);
      b.applyImpulseAtPoint({ x: 0, y: accel * share * dt, z: 0 }, contact, true);
    }
  });
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
      // Never touch the Rapier body here. On exit the physics world is torn down around this
      // cleanup, and reading a freed body passes a null pointer into the WASM side (the crash).
      inputState.physicsBeforeTick = null;
      inputState.driftHeld = false;
      camState.physicsPose = null;
      if (lastHeading.current !== null) renderHeadings.set(vehicleId, lastHeading.current);
    };
  }, [vehicleId]);

  useFrame((_, rawDt) => {
    const b = body.current;
    const lp = bridge.loop;
    if (!b || !lp || !def) return;
    const dt = Math.min(0.05, rawDt);
    const r = b.rotation();
    quat.set(r.x, r.y, r.z, r.w);
    euler.setFromQuaternion(quat);
    lastHeading.current = euler.y;
    fwd.set(0, 0, -1).applyQuaternion(quat);
    up.set(0, 1, 0).applyQuaternion(quat);
    fwd.y = 0;
    fwd.normalize();

    // Input: PC keys (W/S throttle, A/D steer, Space handbrake) or the touch stick + drift button
    const keys = inputState.keys;
    const gasKey = keys.has('w') || keys.has('arrowup');
    const brakeKey = keys.has('s') || keys.has('arrowdown');
    let throttle = (gasKey ? 1 : 0) - (brakeKey ? 1 : 0);
    let steer = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0);
    const handbrake = keys.has(' ') || inputState.driftHeld;
    if (!gasKey && !brakeKey && steer === 0 && (inputState.stickX !== 0 || inputState.stickY !== 0)) {
      const want = screenToWorld(inputState.stickX, inputState.stickY);
      const d = stickToDrive(want.x, want.z, fwd.x, fwd.z);
      throttle = d.throttle;
      steer = d.steer;
    }

    // Arcade handling from the Vehicle Definition (physics/handling.ts). The result is written as
    // velocity directly: never mix an impulse with a later setLinvel from a stale velocity read.
    const h = def.handling;
    const lv = b.linvel();
    const speed = Math.hypot(lv.x, lv.z);
    const out = driveStep(h, lv.x, lv.z, fwd.x, fwd.z, { throttle, steer, gasAndBrake: gasKey && brakeKey, handbrake }, dt);
    b.setLinvel({ x: out.vx, y: lv.y, z: out.vz }, true);
    const av = b.angvel();
    b.setAngvel({ x: av.x, y: out.yawRate, z: av.z }, true);
    if (out.mode !== 'drive') {
      const tp = b.translation();
      for (const side of [-1, 1]) {
        wheelPt.set(side * 0.85 * size, 0, 1.0 * size).applyQuaternion(quat); // rear wheels
        addSkidMark(tp.x + wheelPt.x, tp.z + wheelPt.z, euler.y, side);
      }
    }

    // Body roll (visual spring, stronger while sliding) and collision squash
    if (wobble.current) {
      const slide = out.mode === 'drive' ? 1 : 1.8;
      const roll = -Math.sign(out.yawRate) * Math.min(1, Math.abs(out.yawRate) / h.turnRate) * h.bodyRoll * slide * Math.min(1, speed / h.manualTopSpeed + (out.mode === 'donut' ? 0.6 : 0));
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
    driveDebug(dt, () => {
      const cv = b.linvel();
      const simVan = lp.sim.state.vehicles[vehicleId];
      return {
        keys: [...keys].join(''),
        throttle,
        steer,
        stick: [+inputState.stickX.toFixed(2), +inputState.stickY.toFixed(2)],
        vel: [+cv.x.toFixed(2), +cv.z.toFixed(2)],
        speed: +Math.hypot(cv.x, cv.z).toFixed(2),
        body: [+t.x.toFixed(2), +t.z.toFixed(2)],
        simPose: simVan ? [+simVan.pose.x.toFixed(2), +simVan.pose.z.toFixed(2)] : null,
        simControl: simVan?.control ?? null,
        simDriving: lp.sim.state.ceo.drivingVehicleId,
        drivable: cache.drivable(t.x, t.z),
        upY: +up.y.toFixed(2),
        verdict,
      };
    });
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
      <CuboidCollider args={[0.9 * size, 0.5 * size, 1.6 * size]} position={[0, CHASSIS_BOTTOM + 0.5 * size, 0]} />
      <group scale={theme.vehicleScale}>
        <VehicleBody modelKey={def.modelKey} owner={v.owner} color={color} crates={crateCount(v)} wobble={wobble} />
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
  const v = bridge.loop?.sim.state.vehicles[id];
  const def = v ? bridge.loop?.sim.reg.vehicles[v.defId] : undefined;
  const size = v && def ? vehicleSize(def.modelKey, v.owner) : VS;
  useFrame(() => {
    const p = bridge.loop?.pose(id);
    if (p && body.current) body.current.setNextKinematicTranslation({ x: p.x, y: 0.8, z: p.z });
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false}>
      <CuboidCollider args={[0.9 * size, 0.7 * size, 1.6 * size]} position={[0, 0.7 * size - 0.8, 0]} />
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
        // Hitbox of the drawn model (scaled GLB bounds), or the plot for placeholder boxes
        const f = footprint(biz.id);
        const p = reg.world.plots[biz.plotId]?.def;
        const box = f ?? (p ? { minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2, height: 4 } : null);
        if (!box) return null;
        const hh = Math.max(1, box.height) / 2;
        return (
          <CuboidCollider
            key={`${biz.id}:${footprintVersion()}`}
            args={[(box.maxX - box.minX) / 2, hh, (box.maxZ - box.minZ) / 2]}
            position={[(box.minX + box.maxX) / 2, hh, (box.minZ + box.maxZ) / 2]}
            restitution={0.7}
          />
        );
      })}
      {/* landmarks / filler buildings (render-only, hitbox from their model) */}
      {[...allFootprints()].filter(([id]) => id.startsWith('landmark:')).map(([id, box]) => {
        const hh = Math.max(1, box.height) / 2;
        return (
          <CuboidCollider
            key={`${id}:${footprintVersion()}`}
            args={[(box.maxX - box.minX) / 2, hh, (box.maxZ - box.minZ) / 2]}
            position={[(box.minX + box.maxX) / 2, hh, (box.minZ + box.maxZ) / 2]}
            restitution={0.7}
          />
        );
      })}
      {/* raised sidewalks: the wheel rays ride up onto them */}
      {sidewalkBoxes(reg).map((sw, i) => (
        <CuboidCollider key={`sw${i}`} args={[sw.w / 2, sw.h / 2, sw.d / 2]} position={[sw.x, sw.h / 2, sw.z]} />
      ))}
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
      <Physics gravity={[0, -GRAVITY, 0]} paused={paused} timeStep="vary">
        <StaticWorld />
        <OtherVehicles exclude={vehicleId} />
        <Van vehicleId={vehicleId} />
      </Physics>
      <TyreMarks />
    </PhysicsBoundary>
  );
}
