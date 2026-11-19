// Animated figures (Humans, Customers, CEO) and crates, instanced and updated in useFrame from
// interpolated poses (3.6, 4.13, 5.7, 9.6, 9.7, 11.3, 15.11, 49.8).
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Customer, DefinitionRegistry, Human, SimState } from '@hr/sim';
import { plotCenter, unitsPerContainer } from '@hr/sim';
import { bridge } from '../store/simBridge';
import { pubLayout } from './layout';
import { camCfg, palette } from './theme';
import { useUi } from '../store/stores';
import { groundHeightAt } from './World';
import { exteriorDoorPoint } from './footprints';

const MAX_HUMANS = 128;
const MAX_CUSTOMERS = 256;
const MAX_CRATES = 400;
const tmp = new THREE.Object3D();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * World position of a Customer derived from its state progress (no coordinates in the sim).
 * `indoor` says whether that point is inside the pub: outside you only see Customers walking up to
 * the door (then they "teleport" in), inside only the part after the door (14.3).
 */
function customerPos(reg: DefinitionRegistry, s: SimState, c: Customer, alpha: number): { x: number; z: number; indoor: boolean } | null {
  const pub = s.businesses[c.pubId];
  const def = pub ? reg.businesses[pub.defId]?.pub : undefined;
  if (!pub || !def) return null;
  const L = pubLayout(reg, pub.plotId, pub.defId);
  const seat = L.seats[c.seat] ?? L.door;
  const tps = reg.config.ticksPerSecond;
  const tick = s.tick + alpha;
  const outward = L.door.z - plotCenter(reg, pub.plotId).z > 0 ? 1 : -1;
  const street = { x: L.door.x, z: L.door.z + outward * 3 };
  // Outside, the drawn model's door can sit in front of the plot edge: walk to that instead.
  const outsideDoor = exteriorDoorPoint(pub.id, outward) ?? L.door;
  if (c.state === 'entering') {
    const dur = def.enterSeconds * tps;
    const t = 1 - Math.max(0, Math.min(1, (c.stateUntil - tick) / dur));
    if (t < 0.4) {
      const k = t / 0.4;
      return { x: lerp(street.x, outsideDoor.x, k), z: lerp(street.z, outsideDoor.z + outward * 0.3, k), indoor: false };
    }
    const k = (t - 0.4) / 0.6;
    return { x: lerp(L.door.x, seat.x, k), z: lerp(L.door.z, seat.z, k), indoor: true };
  }
  if (c.state === 'leaving') {
    const dur = def.leaveSeconds * tps;
    const t = 1 - Math.max(0, Math.min(1, (c.stateUntil - tick) / dur));
    if (t < 0.6) return { x: lerp(seat.x, L.door.x, t / 0.6), z: lerp(seat.z, L.door.z, t / 0.6), indoor: true };
    const k = (t - 0.6) / 0.4;
    return { x: lerp(outsideDoor.x, street.x, k), z: lerp(outsideDoor.z + outward * 0.3, street.z, k), indoor: false };
  }
  return { x: seat.x, z: seat.z, indoor: true };
}
/**
 * Bar_Workers animate from their task and the layout anchors (14.10, 55.4): pouring at the Tap they reserved,
 * walking bar <-> table for orders and drinks, and cleaning at the clean spot while nothing is due.
 */
function staffPos(reg: DefinitionRegistry, s: SimState, h: Human, base: { x: number; z: number }, idx: number, alpha: number): { x: number; z: number } {
  if (h.location.kind !== 'at' || !h.location.insideBusinessId || h.status !== 'working') return base;
  const b = s.businesses[h.location.insideBusinessId];
  const def = b ? reg.businesses[b.defId]?.pub : undefined;
  const slotJob = h.assignment && b ? b.jobSlots.find((x) => x.slotId === h.assignment?.slotId)?.jobId : undefined;
  if (!b || !def || !slotJob || !reg.jobs[slotJob]?.service) return base;
  const L = pubLayout(reg, b.plotId, b.defId);
  const task = h.task;
  if (task?.kind === 'pour') return L.taps[task.tap ?? 0] ?? L.barSpot(idx);
  if (task?.kind === 'carry' || task?.kind === 'takeOrder') {
    const c = s.customers[task.customerId];
    const seat = c ? L.seats[c.seat] : undefined;
    if (seat) {
      const speed = reg.jobs[slotJob]?.movementSpeed ?? 2.5;
      const dur = (Math.sqrt((seat.x - L.bar.x) ** 2 + (seat.z - L.bar.z) ** 2) / speed) * reg.config.ticksPerSecond;
      const t = 1 - Math.max(0, Math.min(1, (task.doneTick - (s.tick + alpha)) / Math.max(1, dur)));
      return { x: lerp(L.bar.x, seat.x, t), z: lerp(L.bar.z + 1.2, seat.z, t) };
    }
  }
  return L.cleanSpot;
}
export function Figures() {
  const humans = useRef<THREE.InstancedMesh>(null);
  const customers = useRef<THREE.InstancedMesh>(null);
  const crates = useRef<THREE.InstancedMesh>(null);
  const ceo = useRef<THREE.Mesh>(null);
  const capsule = useMemo(() => new THREE.CapsuleGeometry(0.3, 0.6, 4, 8), []);
  const crateGeo = useMemo(() => new THREE.BoxGeometry(0.55, 0.45, 0.55), []);
  const humanColor = useMemo(() => new THREE.Color(palette.human), []);
  const ceoLift = useRef(0); // smoothed curb height under the CEO

  useFrame(({ clock }) => {
    const loop = bridge.loop;
    const reg = bridge.reg;
    if (!loop || !reg || !humans.current || !customers.current || !crates.current || !ceo.current) return;
    const s = loop.sim.state;
    const alpha = loop.paused ? 1 : loop.alpha;
    const bob = clock.elapsedTime * 8;
    // Interior view (14.3): inside a Business only its own people and crates; outside, nobody who is
    // inside a building, so work is only seen by walking in.
    const room = s.ceo.insideBusinessId;
    const indoor = room !== null;
    const lift = (x: number, z: number) => (indoor ? 0 : groundHeightAt(reg, x, z));

    // Humans (individual named Humans only; Headcount_Fill is not drawn, 49.8)
    let n = 0;
    const perBusiness = new Map<string, number>();
    for (const h of Object.values(s.humans)) {
      if (n >= MAX_HUMANS) break;
      if (h.location.kind === 'onVehicle') continue;
      const base = loop.pose(h.id);
      if (!base) continue;
      const bid = h.location.kind === 'at' ? (h.location.insideBusinessId ?? '') : '';
      const idx = perBusiness.get(bid) ?? 0;
      perBusiness.set(bid, idx + 1);
      const insideOf = h.location.kind === 'at' ? h.location.insideBusinessId : null;
      if (insideOf !== room) continue;
      const p = staffPos(reg, s, h, base, idx, alpha);
      const moving = h.location.kind === 'walking' || h.task?.kind === 'carry';
      tmp.position.set(p.x, lift(p.x, p.z) + 0.65 + (moving ? Math.abs(Math.sin(bob + n)) * 0.12 : 0), p.z);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      humans.current.setMatrixAt(n, tmp.matrix);
      humans.current.setColorAt(n, humanColor);
      n++;
    }
    humans.current.count = n;
    humans.current.instanceMatrix.needsUpdate = true;
    if (humans.current.instanceColor) humans.current.instanceColor.needsUpdate = true;

    // Customers, aggregated away when far out (15.11)
    let c = 0;
    const far = useUi.getState().cameraDistance > (camCfg.bands.find((b) => b.id === 'street')?.max ?? 60);
    const all = Object.values(s.customers);
    if (!(far && all.length > camCfg.aggregationThreshold)) {
      for (const cu of all) {
        if (c >= MAX_CUSTOMERS) break;
        const p = customerPos(reg, s, cu, alpha);
        if (!p || (room ? cu.pubId !== room || !p.indoor : p.indoor)) continue;
        const sitting = cu.state === 'waiting' || cu.state === 'drinking';
        tmp.position.set(p.x, lift(p.x, p.z) + (sitting ? 0.55 : 0.6) + (sitting ? 0 : Math.abs(Math.sin(bob * 1.2 + c)) * 0.1), p.z);
        tmp.scale.set(0.9, sitting ? 0.8 : 0.9, 0.9);
        tmp.updateMatrix();
        customers.current.setMatrixAt(c, tmp.matrix);
        c++;
      }
    }
    customers.current.count = c;
    customers.current.instanceMatrix.needsUpdate = true;

    // Storage crates in owned Businesses: stacked at the back wall, scaled to the fill (9.6, 9.7)
    let k = 0;
    for (const b of Object.values(s.businesses)) {
      const plot = reg.world.plots[b.plotId]?.def;
      if (!plot || b.id !== room) continue; // crates are storage inside: only in the interior view
      for (const [res, stock] of Object.entries(b.storage)) {
        const units = unitsPerContainer(reg, s, res);
        const count = Math.min(24, Math.ceil(stock.amount / units));
        for (let i = 0; i < count && k < MAX_CRATES; i++) {
          const col = i % 6;
          const layer = Math.floor(i / 12);
          const row = Math.floor((i % 12) / 6);
          tmp.position.set(plot.x + plot.w / 2 - 0.9 - row * 0.65, 0.35 + layer * 0.48, plot.z - plot.d / 2 + 0.9 + col * 0.62);
          if (reg.resources[res]?.container.kind === 'keg') tmp.scale.set(0.85, 1.4, 0.85);
          else tmp.scale.setScalar(1);
          tmp.updateMatrix();
          crates.current.setMatrixAt(k++, tmp.matrix);
        }
      }
    }
    crates.current.count = k;
    crates.current.instanceMatrix.needsUpdate = true;

    // CEO (hidden while driving)
    const cp = loop.pose('ceo');
    ceo.current.visible = s.ceo.drivingVehicleId === null;
    if (cp) {
      ceoLift.current += (lift(cp.x, cp.z) - ceoLift.current) * Math.min(1, 0.35); // ease up/down the curb
      ceo.current.position.set(cp.x, 0.75 + ceoLift.current, cp.z);
    }
  });

  return (
    <group>
      <instancedMesh ref={humans} args={[capsule, undefined, MAX_HUMANS]} frustumCulled={false}>
        <meshStandardMaterial color={palette.human} />
      </instancedMesh>
      <instancedMesh ref={customers} args={[capsule, undefined, MAX_CUSTOMERS]} frustumCulled={false}>
        <meshStandardMaterial color={palette.customer} />
      </instancedMesh>
      <instancedMesh ref={crates} args={[crateGeo, undefined, MAX_CRATES]} frustumCulled={false}>
        <meshStandardMaterial color={palette.crate} />
      </instancedMesh>
      <mesh ref={ceo} geometry={capsule} scale={[1.15, 1.2, 1.15]}>
        <meshStandardMaterial color={palette.ceo} />
      </mesh>
    </group>
  );
}
