// Management_View overlays (15.8, 11.7, 19.6): owner-coloured markers, Route lines, the
// first-view highlight. Human name labels in CEO_Mode at close zoom (7.24).
import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { displayName, type DefinitionRegistry, type SimState } from '@hr/sim';
import { bridge, onDomainEvents } from '../store/simBridge';
import { useUi } from '../store/stores';
import { camCfg, ownerColor, palette } from './theme';

export function ManagementOverlay({ reg, state }: { reg: DefinitionRegistry; state: SimState }) {
  const viewMode = useUi((u) => u.viewMode);
  const [highlightUntil, setHighlightUntil] = useState(0);
  useEffect(
    () =>
      onDomainEvents((events) => {
        if (events.some((e) => e.type === 'revealFired' && e.triggerId === 'first_management_view')) setHighlightUntil(performance.now() + 10_000);
      }),
    [],
  );
  if (viewMode !== 'management') return null;
  const highlight = performance.now() < highlightUntil;
  return (
    <group>
      {Object.values(state.businesses).map((b) => {
        const p = reg.world.plots[b.plotId]?.def;
        if (!p) return null;
        const color = ownerColor(b.owner, state.competitors[b.owner]?.colorToken);
        const hl = highlight && b.owner !== 'player';
        return (
          <mesh key={b.id} position={[p.x, 7, p.z]} rotation={[-Math.PI / 2, 0, 0]} onClick={(e) => (e.stopPropagation(), useUi.getState().set({ selection: { kind: 'business', id: b.id } }))}>
            <circleGeometry args={[hl ? 4 : 3, 24]} />
            <meshBasicMaterial color={hl ? palette.highlight : color} transparent opacity={0.85} />
          </mesh>
        );
      })}
      {Object.values(state.plots).map((pl) => {
        if (pl.status !== 'for_sale' || !state.districts[pl.districtId]?.unlocked) return null;
        const p = reg.world.plots[pl.id]?.def;
        if (!p) return null;
        return (
          <mesh key={pl.id} position={[p.x, 6, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[2.4, highlight ? 4 : 3, 24]} />
            <meshBasicMaterial color={palette.plotForSale} />
          </mesh>
        );
      })}
      {Object.values(state.routes).map((r) => {
        const pts = r.stops
          .map((s) => state.businesses[s.businessId])
          .map((b) => (b ? reg.world.plots[b.plotId]?.def.unloadingZone : undefined))
          .filter((z): z is NonNullable<typeof z> => z !== undefined)
          .map((z) => [z.x, 0.6, z.z] as [number, number, number]);
        if (pts.length < 2) return null;
        const first = pts[0] as [number, number, number];
        const bottleneck = state.metrics.routesBottleneck[r.id] === true;
        return <Line key={r.id} points={[...pts, first]} color={bottleneck ? palette.bottleneck : ownerColor(r.owner, state.competitors[r.owner]?.colorToken)} lineWidth={3} dashed dashSize={2} gapSize={1} />;
      })}
    </group>
  );
}

/** Up to 12 nearest Human name labels in CEO_Mode at the Person/Business bands. */
export function HumanLabels() {
  const max = camCfg.labelMaxCount;
  const groups = useRef<(THREE.Group | null)[]>([]);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  useFrame(() => {
    const loop = bridge.loop;
    if (!loop) return;
    const s = loop.sim.state;
    const show = useUi.getState().viewMode === 'ceo' && useUi.getState().cameraDistance <= camCfg.labelMaxDistance;
    const ceo = loop.pose('ceo') ?? { x: 0, z: 0 };
    const near = show
      ? Object.values(s.humans)
          .filter((h) => h.owner === 'player' && h.location.kind !== 'onVehicle')
          .map((h) => ({ h, p: loop.pose(h.id) }))
          .filter((x): x is { h: (typeof x)['h']; p: NonNullable<(typeof x)['p']> } => x.p !== undefined)
          .sort((a, b) => Math.hypot(a.p.x - ceo.x, a.p.z - ceo.z) - Math.hypot(b.p.x - ceo.x, b.p.z - ceo.z))
          .slice(0, max)
      : [];
    for (let i = 0; i < max; i++) {
      const g = groups.current[i];
      const el = labels.current[i];
      const item = near[i];
      if (!g || !el) continue;
      g.visible = item !== undefined;
      el.style.display = item ? 'block' : 'none';
      if (item) {
        g.position.set(item.p.x, 1.9, item.p.z);
        const name = displayName(item.h);
        if (el.textContent !== name) el.textContent = name;
      }
    }
  });
  return (
    <group>
      {Array.from({ length: max }, (_, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)}>
          <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className="name-label" ref={(el) => void (labels.current[i] = el)} />
          </Html>
        </group>
      ))}
    </group>
  );
}
