// Animated figures (Humans, Customers, CEO) and crates, instanced and updated in useFrame from
// interpolated poses (3.6, 4.13, 5.7, 9.6, 9.7, 11.3, 15.11, 49.8).
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Customer, DefinitionRegistry, Human, SimState } from '@hr/sim';
import { plotCenter } from '@hr/sim';
import { bridge } from '../store/simBridge';
import { pubLayout } from './layout';
import { camCfg, palette } from './theme';
import { useUi } from '../store/stores';

const MAX_HUMANS = 128;
const MAX_CUSTOMERS = 256;
const MAX_CRATES = 400;
const tmp = new THREE.Object3D();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** World position of a Customer derived from its state progress (no coordinates in the sim). */
function customerPos(reg: DefinitionRegistry, s: SimState, c: Customer, alpha: number): { x: number; z: number } | null {
  const pub = s.businesses[c.pubId];
  const def = pub ? reg.businesses[pub.defId]?.pub : undefined;
  if (!pub || !def) return null;
  const L = pubLayout(reg, pub.plotId, def.seats);
  const seat = L.seats[c.seat] ?? L.door;
  const tps = reg.config.ticksPerSecond;
  const tick = s.tick + alpha;
  if (c.state === 'entering') {
    const dur = def.enterSeconds * tps;
    const t = 1 - Math.max(0, Math.min(1, (c.stateUntil - tick) / dur));
    return { x: lerp(L.door.x, seat.x, t), z: lerp(L.door.z, seat.z, t) };
  }
  if (c.state === 'leaving') {
    const dur = def.leaveSeconds * tps;
    const t = 1 - Math.max(0, Math.min(1, (c.stateUntil - tick) / dur));
    const out = { x: L.door.x, z: L.door.z + (L.door.z - plotCenter(reg, pub.plotId).z > 0 ? 2.5 : -2.5) };
    if (t < 0.6) return { x: lerp(seat.x, L.door.x, t / 0.6), z: lerp(seat.z, L.door.z, t / 0.6) };
    return { x: lerp(L.door.x, out.x, (t - 0.6) / 0.4), z: lerp(L.door.z, out.z, (t - 0.6) / 0.4) };
  }
  return seat;
}

/** Staff animate at their task location: bartenders at the bar, servers between bar and table. */
function staffPos(reg: DefinitionRegistry, s: SimState, h: Human, base: { x: number; z: number }, idx: number, alpha: number): { x: number; z: number } {
  if (h.location.kind !== 'at' || !h.location.insideBusinessId || h.status !== 'working') return base;
  const b = s.businesses[h.location.insideBusinessId];
  const def = b ? reg.businesses[b.defId]?.pub : undefined;
  const slotJob = h.assignment && b ? b.jobSlots.find((x) => x.slotId === h.assignment?.slotId)?.jobId : undefined;
  if (!b || !def) return base;
  const L = pubLayout(reg, b.plotId, def.seats);
  const bar = L.barSpot(idx);
  if (slotJob === 'bartender') return bar;
  if (slotJob === 'server') {
    const task = h.task;
    if (task?.kind === 'carry') {
      const c = s.customers[task.customerId];
      const seat = c ? L.seats[c.seat] : undefined;
      if (seat) {
        const speed = reg.jobs.server?.movementSpeed ?? 2.5;
        const dur = (def.serveDistance / speed) * reg.config.ticksPerSecond;
        const t = 1 - Math.max(0, Math.min(1, (task.doneTick - (s.tick + alpha)) / dur));
        return { x: lerp(bar.x, seat.x, t), z: lerp(bar.z + 1.2, seat.z, t) };
      }
    }
    return { x: bar.x + 1.5, z: bar.z + 1.4 };
  }
  return base;
}

export function Figures() {
  const humans = useRef<THREE.InstancedMesh>(null);
  const customers = useRef<THREE.InstancedMesh>(null);
  const crates = useRef<THREE.InstancedMesh>(null);
  const ceo = useRef<THREE.Mesh>(null);
  const capsule = useMemo(() => new THREE.CapsuleGeometry(0.3, 0.6, 4, 8), []);
  const crateGeo = useMemo(() => new THREE.BoxGeometry(0.55, 0.45, 0.55), []);
  const humanColor = useMemo(() => new THREE.Color(palette.human), []);

  useFrame(({ clock }) => {
    const loop = bridge.loop;
    const reg = bridge.reg;
    if (!loop || !reg || !humans.current || !customers.current || !crates.current || !ceo.current) return;
    const s = loop.sim.state;
    const alpha = loop.paused ? 1 : loop.alpha;
    const bob = clock.elapsedTime * 8;

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
      const p = staffPos(reg, s, h, base, idx, alpha);
      const moving = h.location.kind === 'walking' || h.task?.kind === 'carry';
      tmp.position.set(p.x, 0.65 + (moving ? Math.abs(Math.sin(bob + n)) * 0.12 : 0), p.z);
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
        if (!p) continue;
        const sitting = cu.state === 'waiting' || cu.state === 'drinking';
        tmp.position.set(p.x, sitting ? 0.55 : 0.6 + Math.abs(Math.sin(bob * 1.2 + c)) * 0.1, p.z);
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
      if (!plot) continue;
      for (const [res, stock] of Object.entries(b.storage)) {
        const units = reg.resources[res]?.crateUnits ?? 10;
        const count = Math.min(24, Math.ceil(stock.amount / units));
        for (let i = 0; i < count && k < MAX_CRATES; i++) {
          const col = i % 6;
          const layer = Math.floor(i / 12);
          const row = Math.floor((i % 12) / 6);
          tmp.position.set(plot.x + plot.w / 2 - 0.9 - row * 0.65, 0.35 + layer * 0.48, plot.z - plot.d / 2 + 0.9 + col * 0.62);
          tmp.scale.setScalar(1);
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
    if (cp) ceo.current.position.set(cp.x, 0.75 + (loop.paused ? 0 : 0), cp.z);
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
