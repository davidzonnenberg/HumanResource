// Static world: ground per District, roads, plots, buildings with removable roof/front wall for
// the interior view (14.3), owner colours and names (16.1–16.3, 17.2, 48.9).
import { Html, useTexture } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BoxGeometry, CanvasTexture, Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Business, DefinitionRegistry, SimState } from '@hr/sim';
import { frontSign } from '@hr/sim';
import { ownerColor, palette } from './theme';
import { pubLayout } from './layout';
import { MODEL_MAP, modelFor } from './assets/modelMap';
import { roadBrickTexture } from './assets/brickTexture';
import { makeRoadField, roadFieldGlsl } from './assets/roadField';
import type { RoadField } from './assets/roadField';
import { GltfBuilding, gltfMaxHeight, ModelBoundary } from './assets/GltfBuilding';
import { useUi } from '../store/stores';
import { footprint, footprintVersion, setFootprint } from './footprints';

import { ROAD_W, SIDEWALK_W } from './roadConstants';

function polygonBox(poly: readonly (readonly [number, number])[]) {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
}

// Road network + curb rectangles as shader uniforms (see assets/roadField.ts).
function useRoadField(reg: DefinitionRegistry): RoadField {
  return useMemo(() => {
    const segs = reg.world.edges.flatMap((e) => {
      const a = reg.world.nodes[e.a];
      const b = reg.world.nodes[e.b];
      return a && b ? [{ ax: a.x, az: a.z, bx: b.x, bz: b.z }] : [];
    });
    const rects = buildStrips(reg).map((r) => ({ x: r.x, z: r.z, hw: r.w / 2, hd: r.d / 2 }));
    return makeRoadField(segs, rects);
  }, [reg]);
}

// Organic ground: two grass tiles (green + dry yellow) and a dirt tile, mixed per pixel by
// world-space noise with soft edges, so there are no hard cuts. One material, no extra geometry.
const GRASS_A_URL = '/textures/tile_grass_a.jpg';
const GRASS_B_URL = '/textures/tile_grass_b.jpg';
const DIRT_URL = '/textures/tile_dirt.jpg';
const GROUND_TILE = 8; // world units per repeat of a ground tile
const GRASS_TINT = 'vec3(1.0) * 1.7'; // new grass tiles are already muted; lift for the dim lights
const NOISE_GLSL = `
float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gHash(i), gHash(i+vec2(1,0)), f.x), mix(gHash(i+vec2(0,1)), gHash(i+vec2(1,1)), f.x), f.y);
}
float gFbm(vec2 p){ return 0.55*gNoise(p) + 0.3*gNoise(p*2.1+7.3) + 0.15*gNoise(p*4.3+19.1); }
`;

function GroundMaterial({ field }: { field: RoadField }) {
  const [ta, tb, td] = useTexture([GRASS_A_URL, GRASS_B_URL, DIRT_URL], (t) => {
    for (const tex of Array.isArray(t) ? t : [t]) {
      tex.wrapS = tex.wrapT = RepeatWrapping;
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 8;
    }
  });
  const material = useMemo(() => {
    const m = new MeshStandardMaterial();
    m.onBeforeCompile = (shader) => {
      shader.uniforms.tA = { value: ta };
      shader.uniforms.tB = { value: tb };
      shader.uniforms.tD = { value: td };
      shader.uniforms.uSeg = field.uSeg;
      shader.uniforms.uRect = field.uRect;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec2 vGW;\nuniform sampler2D tA;\nuniform sampler2D tB;\nuniform sampler2D tD;\n${NOISE_GLSL}\n${roadFieldGlsl(ROAD_W / 2, ROAD_TILE_SIZE / 12)}`,
        )
        .replace(
          '#include <map_fragment>',
          `vec2 gp = vGW / ${GROUND_TILE.toFixed(1)};
          vec3 ca = texture2D(tA, gp).rgb * ${GRASS_TINT};
          vec3 cb = texture2D(tB, gp * 0.9 + 0.37).rgb * 1.7;
          vec3 cd = texture2D(tD, gp * 0.8 + 0.61).rgb * vec3(1.0, 0.85, 0.75);
          float mb = smoothstep(0.35, 0.65, gFbm(vGW * 0.05));      // dry patches
          float md = smoothstep(0.68, 0.78, gFbm(vGW * 0.09 + 31.0)); // worn dirt (small patches)
          float tone = 0.8 + 0.4 * gFbm(vGW * 0.3 + 5.0); // gentle light/dark mottling so flat tiles are not dull
          // earth that hugs the road with a ragged, noisy fade into the grass
          float edge = 1.0 - smoothstep(0.0, 1.5 + 1.8 * gFbm(vGW * 0.6 + 3.0), roadSd(vGW));
          md = max(md, edge * 0.9);
          diffuseColor.rgb *= mix(mix(ca, cb, mb), cd, md) * tone;`,
        );
    };
    return m;
  }, [ta, tb, td, field]);
  return <primitive object={material} attach="material" />;
}

export function Ground({ reg, districts }: { reg: DefinitionRegistry; districts: SimState['districts'] }) {
  const field = useRoadField(reg);
  return (
    <group>
      {reg.world.districtOrder.map((id) => {
        const d = reg.world.districts[id];
        if (!d) return null;
        const b = polygonBox(d.def.bounds);
        const unlocked = districts[id]?.unlocked === true;
        const flat = <meshStandardMaterial color={unlocked ? palette.ground : palette.groundLocked} />;
        return (
          <mesh key={id} position={[b.cx, -0.05, b.cz]} receiveShadow={false}>
            <boxGeometry args={[b.w, 0.1, b.d]} />
            {unlocked ? (
              <ModelBoundary url={GRASS_A_URL} fallback={flat}>
                <Suspense fallback={flat}>
                  <GroundMaterial field={field} />
                </Suspense>
              </ModelBoundary>
            ) : (
              flat
            )}
          </mesh>
        );
      })}
    </group>
  );
}
// Road surface: procedural herringbone clay bricks (see assets/brickTexture.ts), seamless at any scale.
const ROAD_TILE_SIZE = 3.9; // world units per texture tile (12 brick units, so a brick is ~0.65 x 0.33)
const ROAD_TINT = new Color(1.25, 1.25, 1.25); // scene lights are dim
// Road box whose UVs come from WORLD x/z. Where roads overlap at a junction the top faces are
// coplanar, so identical world-space UVs make them look identical (no flicker, no visible seam).
function roadGeometry(width: number, length: number, x: number, z: number, angle: number) {
  const g = new BoxGeometry(width, 0.04, length);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  if (!pos || !uv) return g;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    uv.setXY(i, (x + lx * cos + lz * sin) / ROAD_TILE_SIZE, (z - lx * sin + lz * cos) / ROAD_TILE_SIZE);
  }
  uv.needsUpdate = true;
  return g;
}

function makeRoadMaterial(field: RoadField) {
  const m = new MeshStandardMaterial({ map: roadBrickTexture(), color: ROAD_TINT });
  m.customProgramCacheKey = () => 'road-bricks';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSeg = field.uSeg;
    shader.uniforms.uRect = field.uRect;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vGW;\n${roadFieldGlsl(ROAD_W / 2, ROAD_TILE_SIZE / 12)}`)
      .replace('#include <map_fragment>', 'float rt;\nif (roadBrickFade(vGW, rt)) discard;\n#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.17, 0.10), clamp(rt * (0.3 + 0.8 * rNoise(vGW * 4.0)), 0.0, 0.85)); // dusty near the edge');
  };
  return m;
}
interface RoadSegment {
  id: string;
  x: number;
  z: number;
  len: number;
  angle: number;
  geometry: BoxGeometry;
}

function RoadSegments({ segments, field }: { segments: (RoadSegment | null)[]; field: RoadField }) {
  const material = useMemo(() => makeRoadMaterial(field), [field]);
  return (
    <group>
      {segments.map((s) =>
        s ? (
          <group key={s.id} position={[s.x, 0.01, s.z]} rotation={[0, s.angle, 0]}>
            <mesh geometry={s.geometry}>
              <primitive object={material} attach="material" />
            </mesh>
          </group>
        ) : null,
      )}
    </group>
  );
}

export function Roads({ reg }: { reg: DefinitionRegistry }) {
  const segments = useMemo(
    () =>
      reg.world.edges.map((e): RoadSegment | null => {
        const a = reg.world.nodes[e.a];
        const b = reg.world.nodes[e.b];
        if (!a || !b) return null;
        const len = Math.hypot(b.x - a.x, b.z - a.z) + ROAD_W;
        const angle = Math.atan2(b.x - a.x, b.z - a.z);
        const x = (a.x + b.x) / 2;
        const z = (a.z + b.z) / 2;
        return { id: e.id, x, z, len, angle, geometry: roadGeometry(ROAD_W, len, x, z, angle) };
      }),
    [reg],
  );
  const field = useRoadField(reg);
  return <RoadSegments segments={segments} field={field} />;
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

/** Placeholder buildings fill their plot, so their hitbox is the plot rectangle. */
function PlotFootprint({ id, x, z, w, d, h }: { id: string; x: number; z: number; w: number; d: number; h: number }) {
  useLayoutEffect(() => setFootprint(id, { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h }), [id, x, z, w, d, h]);
  return null;
}

export function Building({ reg, state, b, open }: { reg: DefinitionRegistry; state: SimState; b: Business; open: boolean }) {
  const def = reg.businesses[b.defId];
  const plot = reg.world.plots[b.plotId]?.def;
  if (!def || !plot) return null;
  const model = modelFor(def.modelKey);
  const height = model.kind === 'primitive' ? model.size[1] : 3.5;
  // A generated GLB is the building's outside; inside (CEO entered) the box interior is shown instead.
  const gltf = model.kind === 'gltf' && !open ? model : null;
  const labelHeight = gltf ? gltfMaxHeight(gltf) : height;
  const color = ownerColor(b.owner, state.competitors[b.owner]?.colorToken);
  const s = frontSign(reg, b.plotId);
  const { w, d } = plot;
  const pub = def.pub;
  const layout = pub ? pubLayout(reg, b.plotId, pub.seats) : null;
  const shell = (
    <>
      {!open && <PlotFootprint id={b.id} x={plot.x} z={plot.z} w={w} d={d} h={height} />}
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
        {/* front wall with a door gap; a low knee wall in the interior view so the camera sees in */}
        {[-1, 1].map((side) => {
          const fh = open ? 0.45 : height;
          return (
            <mesh key={`f${side}`} position={[side * (w / 4 + 0.6), fh / 2, (s * d) / 2 - (s * WALL) / 2]}>
              <boxGeometry args={[w / 2 - 1.2, fh, WALL]} />
              <meshStandardMaterial color={color} />
            </mesh>
          );
        })}
        {/* interior door: a mat marks where to stand to Leave */}
        {open && (
          <mesh position={[0, 0.12, (s * d) / 2 - s * (WALL + 0.6)]}>
            <boxGeometry args={[2.2, 0.03, 1.2]} />
            <meshStandardMaterial color={palette.doormat} />
          </mesh>
        )}
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
    </>
  );
  return (
    <group onClick={select('business', b.id)}>
      {gltf ? <GltfBuilding entry={gltf} plot={plot} frontSign={s} fallback={shell} onFootprint={(f) => setFootprint(b.id, f)} /> : shell}
      <BuildingLabel id={b.id} fallback={{ x: plot.x, z: plot.z, top: labelHeight }} name={b.name} color={color} />
    </group>
  );
}

/**
 * Name tag above the DRAWN model: centred on its hitbox (which follows the fitted, scaled model) and
 * lifted from its real top, so it never floats over the empty rest of the plot. Falls back to the plot
 * until the model has reported its footprint.
 */
function BuildingLabel({ id, fallback, name, color }: { id: string; fallback: { x: number; z: number; top: number }; name: string; color: string }) {
  const [at, setAt] = useState(fallback);
  const seen = useRef(-1);
  useFrame(() => {
    const v = footprintVersion();
    if (v === seen.current) return;
    seen.current = v;
    const f = footprint(id);
    if (!f) return;
    const next = { x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2, top: f.height };
    setAt((old) => (old.x === next.x && old.z === next.z && old.top === next.top ? old : next));
  });
  return (
    <Html position={[at.x, at.top + 1.2, at.z]} center distanceFactor={40} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className="world-label" style={{ borderColor: color }}>
        {name}
      </div>
    </Html>
  );
}

// ---- Landmarks / filler buildings (render-only, no sim Business yet) ---------------------------
export interface LandmarkDef {
  id: string;
  district: string;
  modelKey: string;
  x: number;
  z: number;
  w: number;
  d: number;
  /** +1: front door faces +z (towards the camera), -1: faces -z. */
  facing: number;
}

/** Footprint id for a landmark, kept apart from Business ids. */
export const landmarkFootprintId = (id: string): string => `landmark:${id}`;

export function Landmarks({ list, districts }: { list: readonly LandmarkDef[]; districts: SimState['districts'] }) {
  const shadow = useMemo(() => gradientTexture('radial'), []);
  return (
    <group>
      {list.map((l) => {
        if (!districts[l.district]?.unlocked) return null;
        const model = MODEL_MAP[l.modelKey];
        const plot = { x: l.x, z: l.z, w: l.w, d: l.d };
        const fid = landmarkFootprintId(l.id);
        const h = model?.kind === 'gltf' ? (model.maxHeight ?? 14) * 0.6 : 6;
        const box = (
          <>
            <PlotFootprint id={fid} x={l.x} z={l.z} w={l.w * 0.8} d={l.d * 0.8} h={h} />
            <mesh position={[l.x, h / 2, l.z]}>
              <boxGeometry args={[l.w * 0.8, h, l.d * 0.8]} />
              <meshStandardMaterial color={palette.wallInside} />
            </mesh>
          </>
        );
        const f = footprint(fid);
        const sb = f ? { x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2, w: f.maxX - f.minX, d: f.maxZ - f.minZ } : plot;
        return (
          <group key={l.id}>
            <mesh position={[sb.x, 0.075, sb.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
              <planeGeometry args={[sb.w + 4, sb.d + 4]} />
              <meshBasicMaterial map={shadow} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
            </mesh>
            {model?.kind === 'gltf' ? <GltfBuilding entry={model} plot={plot} frontSign={l.facing} fallback={box} onFootprint={(fp) => setFootprint(fid, fp)} /> : box}
          </group>
        );
      })}
    </group>
  );
}

export function UnloadingZones({ reg, state }: { reg: DefinitionRegistry; state: SimState }) {
  if (!state.ceo.drivingVehicleId) return null; // only shown while the CEO is doing deliveries
  const strips = buildStrips(reg);
  return (
    <group>
      {Object.values(state.businesses).map((b) => {
        const z = reg.world.plots[b.plotId]?.def.unloadingZone;
        if (!z || !state.districts[reg.world.plots[b.plotId]?.districtId ?? '']?.unlocked) return null;
        // Raised sidewalks would hide the part of the zone that overlaps them: keep the road side only.
        let zMin = z.z - z.d / 2;
        let zMax = z.z + z.d / 2;
        for (const sw of strips) {
          if (sw.axis !== 'x' || Math.abs(sw.x - z.x) > sw.w / 2 + z.w / 2) continue;
          const s0 = sw.z - sw.d / 2;
          const s1 = sw.z + sw.d / 2;
          if (zMin < s1 && zMax > s0) {
            if (sw.z < z.z) zMin = Math.max(zMin, s1);
            else zMax = Math.min(zMax, s0);
          }
        }        if (zMax - zMin < 0.2) return null;
        return (
          <mesh key={b.id} position={[z.x, 0.045, (zMin + zMax) / 2]}>
            <boxGeometry args={[z.w, 0.01, zMax - zMin]} />
            <meshStandardMaterial color={palette.unloadingZone} transparent opacity={0.25} />
          </mesh>
        );
      })}
    </group>
  );
}


// ---- Raised sidewalks + fake contact shadows (no shadow maps) ----------------------------------
const CURB_H = 0.24;
const CURB_COLOR = new Color('#c89b88');
const SIDEWALK_TINT = new Color(1.55, 1.45, 1.4); // same bricks as the road, a bit lighter

// A sidewalk strip along one side of a road. `side` is the direction (+1/-1, along z for axis 'x',
// along x for axis 'z') from the strip to the road.
interface Strip {
  id: string;
  axis: 'x' | 'z';
  x: number;
  z: number;
  w: number; // extent along x
  d: number; // extent along z
  side: number;
}
interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const stripCache = new WeakMap<DefinitionRegistry, Strip[]>();

// Roads run along x or z. Merge collinear segments, then lay a strip beside every road edge and
// cut it where another road crosses. Strips are extended by one width at the ends so corners close.
function buildStrips(reg: DefinitionRegistry): Strip[] {
  const cached = stripCache.get(reg);
  if (cached) return cached;
  const half = ROAD_W / 2;
  const eps = 0.01;
  const hor = new Map<number, [number, number][]>();
  const ver = new Map<number, [number, number][]>();
  for (const e of reg.world.edges) {
    const a = reg.world.nodes[e.a];
    const b = reg.world.nodes[e.b];
    if (!a || !b) continue;
    if (Math.abs(a.z - b.z) < eps) {
      const l = hor.get(a.z) ?? [];
      l.push([Math.min(a.x, b.x) - half, Math.max(a.x, b.x) + half]);
      hor.set(a.z, l);
    } else if (Math.abs(a.x - b.x) < eps) {
      const l = ver.get(a.x) ?? [];
      l.push([Math.min(a.z, b.z) - half, Math.max(a.z, b.z) + half]);
      ver.set(a.x, l);
    }
  }
  const merge = (list: [number, number][]) => {
    const sorted = [...list].sort((p, q) => p[0] - q[0]);
    const out: [number, number][] = [];
    for (const iv of sorted) {
      const last = out[out.length - 1];
      if (last && iv[0] <= last[1] + eps) last[1] = Math.max(last[1], iv[1]);
      else out.push([iv[0], iv[1]]);
    }
    return out;
  };
  const roads: Box[] = [];
  for (const [z, l] of hor) for (const [x0, x1] of merge(l)) roads.push({ x0, x1, z0: z - half, z1: z + half });
  for (const [x, l] of ver) for (const [z0, z1] of merge(l)) roads.push({ x0: x - half, x1: x + half, z0, z1 });

  const strips: Strip[] = [];
  const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - eps && a1 > b0 + eps;
  // cut [lo,hi] along the strip axis by every road box that overlaps the strip's cross range
  const cut = (lo: number, hi: number, cross0: number, cross1: number, axis: 'x' | 'z') => {
    let parts: [number, number][] = [[lo, hi]];
    for (const r of roads) {
      const cr0 = axis === 'x' ? r.z0 : r.x0;
      const cr1 = axis === 'x' ? r.z1 : r.x1;
      if (!overlap(cross0, cross1, cr0, cr1)) continue;
      const r0 = axis === 'x' ? r.x0 : r.z0;
      const r1 = axis === 'x' ? r.x1 : r.z1;
      parts = parts.flatMap(([p0, p1]): [number, number][] => {
        if (r1 <= p0 || r0 >= p1) return [[p0, p1]];
        const out: [number, number][] = [];
        if (r0 > p0) out.push([p0, r0]);
        if (r1 < p1) out.push([r1, p1]);
        return out;
      });
    }
    return parts.filter(([p0, p1]) => p1 - p0 > 0.3);
  };
  let n = 0;
  for (const r of roads) {
    const horizontal = Math.abs(r.z1 - r.z0 - ROAD_W) < eps && r.x1 - r.x0 >= r.z1 - r.z0 - eps;
    if (horizontal) {
      for (const side of [-1, 1]) {
        const c0 = side < 0 ? r.z1 : r.z0 - SIDEWALK_W; // strip on the +z side has the road at -z
        const c1 = c0 + SIDEWALK_W;
        for (const [p0, p1] of cut(r.x0 - SIDEWALK_W, r.x1 + SIDEWALK_W, c0, c1, 'x')) {
          strips.push({ id: `s${n++}`, axis: 'x', x: (p0 + p1) / 2, z: (c0 + c1) / 2, w: p1 - p0, d: SIDEWALK_W, side });
        }
      }
    } else {
      for (const side of [-1, 1]) {
        const c0 = side < 0 ? r.x1 : r.x0 - SIDEWALK_W;
        const c1 = c0 + SIDEWALK_W;
        for (const [p0, p1] of cut(r.z0 - SIDEWALK_W, r.z1 + SIDEWALK_W, c0, c1, 'z')) {
          strips.push({ id: `s${n++}`, axis: 'z', x: (c0 + c1) / 2, z: (p0 + p1) / 2, w: SIDEWALK_W, d: p1 - p0, side });
        }
      }
    }
  }
  stripCache.set(reg, strips);
  return strips;
}
/** Raised sidewalk boxes (centre + size) for colliders and walking height. Render-only data. */
export function sidewalkBoxes(reg: DefinitionRegistry): readonly { x: number; z: number; w: number; d: number; h: number }[] {
  return buildStrips(reg).map((r) => ({ x: r.x, z: r.z, w: r.w, d: r.d, h: CURB_H }));
}

/** Height of the walking surface at (x, z): the curb height on a sidewalk, else 0. */
export function groundHeightAt(reg: DefinitionRegistry, x: number, z: number): number {
  for (const r of buildStrips(reg)) if (Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2) return CURB_H;
  return 0;
}

function sidewalkGeometry(r: Strip) {
  const g = new BoxGeometry(r.w, CURB_H, r.d);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  if (pos && uv) {
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (r.x + pos.getX(i)) / ROAD_TILE_SIZE, (r.z + pos.getZ(i)) / ROAD_TILE_SIZE);
    }
    uv.needsUpdate = true;
  }
  return g;
}

function gradientTexture(kind: 'radial' | 'linear') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = kind === 'radial' ? ctx.createRadialGradient(32, 32, 4, 32, 32, 32) : ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(kind === 'radial' ? 0.55 : 0.35, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

function SidewalkTopMaterial() {
  const map = roadBrickTexture();
  return <meshStandardMaterial attach="material-2" map={map} color={SIDEWALK_TINT} />;
}
export function Sidewalks({ reg }: { reg: DefinitionRegistry }) {
  const items = useMemo(() => buildStrips(reg).map((r) => ({ r, geometry: sidewalkGeometry(r) })), [reg]);
  const shadow = useMemo(() => gradientTexture('linear'), []);
  return (
    <group>
      {items.map(({ r, geometry }) => {
        const horizontal = r.axis === 'x';
        // road-side edge of the strip, and where the soft shadow strip goes (on the road, at the curb foot)
        const sx = horizontal ? r.x : r.x + r.side * (SIDEWALK_W / 2 + 0.7);
        const sz = horizontal ? r.z + r.side * (SIDEWALK_W / 2 + 0.7) : r.z;
        const angle = horizontal ? (r.side > 0 ? 0 : Math.PI) : r.side > 0 ? Math.PI / 2 : -Math.PI / 2;
        return (
          <group key={r.id}>
            <mesh geometry={geometry} position={[r.x, CURB_H / 2, r.z]}>
              <meshStandardMaterial attach="material-0" color={CURB_COLOR} />
              <meshStandardMaterial attach="material-1" color={CURB_COLOR} />
              <SidewalkTopMaterial />
              <meshStandardMaterial attach="material-3" color={CURB_COLOR} />
              <meshStandardMaterial attach="material-4" color={CURB_COLOR} />
              <meshStandardMaterial attach="material-5" color={CURB_COLOR} />
            </mesh>
            <mesh position={[sx, 0.052, sz]} rotation={[-Math.PI / 2, 0, angle]} renderOrder={2}>
              <planeGeometry args={[horizontal ? r.w : r.d, 1.4]} />
              <meshBasicMaterial map={shadow} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
// Soft dark blob under a building so it sits on the ground instead of floating.
export function BuildingShadows({ reg, state }: { reg: DefinitionRegistry; state: SimState }) {
  const tex = useMemo(() => gradientTexture('radial'), []);
  return (
    <group>
      {Object.values(state.businesses).map((b) => {
        const p = reg.world.plots[b.plotId]?.def;
        if (!p) return null;
        const f = footprint(b.id); // hug the drawn model, not the whole plot
        const box = f ? { x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2, w: f.maxX - f.minX, d: f.maxZ - f.minZ } : p;
        return (
          <mesh key={b.id} position={[box.x, 0.075, box.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
            <planeGeometry args={[box.w + 4, box.d + 4]} />
            <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
          </mesh>
        );
      })}
    </group>
  );
}