// Static world: ground per District, roads, plots, buildings with removable roof/front wall for
// the interior view (14.3), owner colours and names (16.1–16.3, 17.2, 48.9).
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Business, DefinitionRegistry, SimState } from '@hr/sim';
import { frontSign } from '@hr/sim';
import { ownerColor, palette } from './theme';
import { pubLayout } from './layout';
import { modelFor } from './assets/modelMap';
import { useUi } from '../store/stores';

const ROAD_W = 6;

function polygonBox(poly: readonly (readonly [number, number])[]) {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
}

export function Ground({ reg, districts }: { reg: DefinitionRegistry; districts: SimState['districts'] }) {
  return (
    <group>
      {reg.world.districtOrder.map((id) => {
        const d = reg.world.districts[id];
        if (!d) return null;
        const b = polygonBox(d.def.bounds);
        const unlocked = districts[id]?.unlocked === true;
        return (
          <mesh key={id} position={[b.cx, -0.05, b.cz]} receiveShadow={false}>
            <boxGeometry args={[b.w, 0.1, b.d]} />
            <meshStandardMaterial color={unlocked ? palette.ground : palette.groundLocked} />
          </mesh>
        );
      })}
    </group>
  );
}

export function Roads({ reg }: { reg: DefinitionRegistry }) {
  const segments = useMemo(
    () =>
      reg.world.edges.map((e) => {
        const a = reg.world.nodes[e.a];
        const b = reg.world.nodes[e.b];
        if (!a || !b) return null;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const angle = Math.atan2(b.x - a.x, b.z - a.z);
        return { id: e.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, len: len + ROAD_W, angle };
      }),
    [reg],
  );
  return (
    <group>
      {segments.map((s) =>
        s ? (
          <group key={s.id} position={[s.x, 0.01, s.z]} rotation={[0, s.angle, 0]}>
            <mesh>
              <boxGeometry args={[ROAD_W, 0.04, s.len]} />
              <meshStandardMaterial color={palette.road} />
            </mesh>
            <mesh position={[0, 0.025, 0]}>
              <boxGeometry args={[0.18, 0.01, Math.max(0, s.len - ROAD_W)]} />
              <meshStandardMaterial color={palette.roadLine} />
            </mesh>
          </group>
        ) : null,
      )}
    </group>
  );
}

function select(kind: 'business' | 'plot', id: string) {
  return (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useUi.getState().set({ selection: { kind, id } });
  };
}

export function Plots({ reg, state }: { reg: DefinitionRegistry; state: SimState }) {
  return (
    <group>
      {Object.values(state.plots).map((p) => {
        if (p.status === 'occupied') return null;
        const def = reg.world.plots[p.id]?.def;
        if (!def) return null;
        const locked = !state.districts[p.districtId]?.unlocked;
        const color = locked ? palette.groundLocked : p.status === 'for_sale' ? palette.plotForSale : palette.plotEmpty;
        return (
          <group key={p.id} position={[def.x, 0.03, def.z]}>
            <mesh {...(locked ? {} : { onClick: select('plot', p.id) })}>
              <boxGeometry args={[def.w, 0.06, def.d]} />
              <meshStandardMaterial color={color} />
            </mesh>
            {p.status === 'for_sale' && (
              <group position={[def.w / 2 - 1.5, 0, (frontSign(reg, p.id) * def.d) / 2 - frontSign(reg, p.id) * 1.2]}>
                <mesh position={[0, 0.8, 0]}>
                  <boxGeometry args={[0.15, 1.6, 0.15]} />
                  <meshStandardMaterial color="#6b4f2a" />
                </mesh>
                <mesh position={[0, 1.6, 0]}>
                  <boxGeometry args={[1.6, 0.9, 0.12]} />
                  <meshStandardMaterial color={palette.highlight} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}

const WALL = 0.25;

export function Building({ reg, state, b, open }: { reg: DefinitionRegistry; state: SimState; b: Business; open: boolean }) {
  const def = reg.businesses[b.defId];
  const plot = reg.world.plots[b.plotId]?.def;
  if (!def || !plot) return null;
  const model = modelFor(def.modelKey);
  const height = model.kind === 'primitive' ? model.size[1] : 3.5;
  const color = ownerColor(b.owner, state.competitors[b.owner]?.colorToken);
  const s = frontSign(reg, b.plotId);
  const { w, d } = plot;
  const pub = def.pub;
  const layout = pub ? pubLayout(reg, b.plotId, pub.seats) : null;
  return (
    <group onClick={select('business', b.id)}>
      <group position={[plot.x, 0, plot.z]}>
        {/* floor */}
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[w, 0.1, d]} />
          <meshStandardMaterial color={palette.wallInside} />
        </mesh>
        {/* back wall */}
        <mesh position={[0, height / 2, (-s * d) / 2 + (s * WALL) / 2]}>
          <boxGeometry args={[w, height, WALL]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* side walls */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[(side * (w - WALL)) / 2, height / 2, 0]}>
            <boxGeometry args={[WALL, height, d]} />
            <meshStandardMaterial color={color} />
          </mesh>
        ))}
        {/* front wall with a door gap; hidden in the interior view */}
        {!open &&
          [-1, 1].map((side) => (
            <mesh key={`f${side}`} position={[side * (w / 4 + 0.6), height / 2, (s * d) / 2 - (s * WALL) / 2]}>
              <boxGeometry args={[w / 2 - 1.2, height, WALL]} />
              <meshStandardMaterial color={color} />
            </mesh>
          ))}
        {/* roof; removed when the CEO is inside (14.3) */}
        {!open && (
          <mesh position={[0, height + 0.15, 0]}>
            <boxGeometry args={[w + 0.6, 0.3, d + 0.6]} />
            <meshStandardMaterial color={b.owner === 'player' ? palette.roof : color} />
          </mesh>
        )}
      </group>
      {layout && (
        <group>
          <mesh position={[layout.bar.x, 0.55, layout.bar.z]}>
            <boxGeometry args={[layout.bar.w, 1.1, 0.8]} />
            <meshStandardMaterial color={palette.bar} />
          </mesh>
          {layout.seats.map((st, i) => (
            <mesh key={i} position={[st.x + 0.7, 0.4, st.z]}>
              <cylinderGeometry args={[0.45, 0.45, 0.8, 10]} />
              <meshStandardMaterial color={palette.table} />
            </mesh>
          ))}
        </group>
      )}
      <Html position={[plot.x, height + 1.4, plot.z]} center distanceFactor={40} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="world-label" style={{ borderColor: color }}>
          {b.name}
        </div>
      </Html>
    </group>
  );
}

export function UnloadingZones({ reg, state }: { reg: DefinitionRegistry; state: SimState }) {
  return (
    <group>
      {Object.values(state.businesses).map((b) => {
        const z = reg.world.plots[b.plotId]?.def.unloadingZone;
        if (!z || !state.districts[reg.world.plots[b.plotId]?.districtId ?? '']?.unlocked) return null;
        return (
          <mesh key={b.id} position={[z.x, 0.045, z.z]}>
            <boxGeometry args={[z.w, 0.01, z.d]} />
            <meshStandardMaterial color={palette.unloadingZone} transparent opacity={0.25} />
          </mesh>
        );
      })}
    </group>
  );
}
