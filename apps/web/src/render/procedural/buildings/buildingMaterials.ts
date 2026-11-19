/**
 * Shared materials for every procedural building, with the toy shading:
 *  - soft 4-step light ramp on trim (MeshToonMaterial) – toon-ish, not cel-shaded;
 *  - fresnel rim light on everything, so rounded parts pop;
 *  - a slight "wax" self-glow on albedo (soft plastic / clay feel);
 *  - wall weathering in the shader: damp band near the ground, lighter tops,
 *    low-frequency patches of slightly different bricks.
 * Configure once with configureBuildingShading() before the first getBuildingMaterials().
 */
import * as THREE from 'three';
import { makeBrickTextures, makePlasterTextures, makeSignAtlas, makeSlateTextures } from './buildingTextures';

export interface ToyShading {
  /** Use the soft light ramp on trim parts. */
  toon: boolean;
  /** Rim light strength, 0..1. */
  rim: number;
  /** Self-glow on albedo, 0..0.2. */
  wax: number;
  /** Damp band, patches and top fade on walls. */
  weathering: boolean;
}

let shading: ToyShading = { toon: true, rim: 0.35, wax: 0.07, weathering: true };

export interface BuildingMaterials {
  brick: THREE.Material;
  plaster: THREE.Material;
  roof: THREE.Material;
  trim: THREE.Material;
  gloss: THREE.Material;
  glass: THREE.Material;
  sign: THREE.Material;
  /** Template for glowing windows / lamps; ProceduralBuilding clones it per instance. */
  litOn: THREE.MeshBasicMaterial;
}

let materials: BuildingMaterials | null = null;

export function configureBuildingShading(s: Partial<ToyShading>): void {
  shading = { ...shading, ...s };
  if (materials) {
    Object.values(materials).forEach((m: THREE.Material) => m.dispose());
    materials = null;
  }
}

export function getBuildingShading(): ToyShading {
  return { ...shading };
}

const NOISE = /* glsl */ `
float toyHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float toyNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(toyHash(i), toyHash(i + vec2(1.0, 0.0)), u.x), mix(toyHash(i + vec2(0.0, 1.0)), toyHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

const WEATHER = /* glsl */ `
{
  float toyDamp = smoothstep(0.05, 1.3, vToyY);
  vec3 dampTint = diffuseColor.rgb * vec3(0.78, 0.8, 0.72);
  diffuseColor.rgb = mix(dampTint, diffuseColor.rgb, toyDamp);
  float p1 = toyNoise(vMapUv * 0.55);
  float p2 = toyNoise(vMapUv * 2.3 + 7.3);
  diffuseColor.rgb *= 0.91 + 0.13 * p1 + 0.05 * (p2 - 0.5);
  diffuseColor.rgb *= 1.0 + 0.05 * smoothstep(5.0, 10.0, vToyY);
}`;

function toyfy<T extends THREE.Material>(mat: T, opts: { rim: number; wax: number; weather: boolean }): T {
  const key = `toy|${opts.rim}|${opts.wax}|${opts.weather}`;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uToyRim = { value: opts.rim };
    sh.uniforms.uToyWax = { value: opts.wax };
    sh.vertexShader = 'varying float vToyY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vToyY = position.y;');
    let fs = 'uniform float uToyRim;\nuniform float uToyWax;\nvarying float vToyY;\n' + NOISE + '\n' + sh.fragmentShader;
    if (opts.weather) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + WEATHER);
    fs = fs.replace(
      '#include <opaque_fragment>',
      `{
        vec3 toyView = normalize(vViewPosition);
        float toyF = pow(1.0 - clamp(abs(dot(normalize(normal), toyView)), 0.0, 1.0), 2.6);
        outgoingLight += vec3(1.0, 0.95, 0.88) * toyF * uToyRim * (0.35 + 0.65 * diffuseColor.rgb);
        outgoingLight += diffuseColor.rgb * uToyWax;
      }
      #include <opaque_fragment>`,
    );
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

function toonRamp(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([150, 196, 232, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export function getBuildingMaterials(): BuildingMaterials {
  if (materials) return materials;
  const s = shading;
  const brick = makeBrickTextures();
  const slate = makeSlateTextures();
  const plaster = makePlasterTextures();
  const soft = { rim: s.rim, wax: s.wax, weather: false };
  const trim = s.toon
    ? new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
  materials = {
    brick: toyfy(new THREE.MeshStandardMaterial({ vertexColors: true, map: brick.map, normalMap: brick.normalMap, normalScale: new THREE.Vector2(1.15, 1.15), roughness: 0.9 }), { ...soft, weather: s.weathering }),
    plaster: toyfy(new THREE.MeshStandardMaterial({ vertexColors: true, map: plaster.map, normalMap: plaster.normalMap, roughness: 0.92 }), { ...soft, weather: s.weathering }),
    roof: toyfy(new THREE.MeshStandardMaterial({ vertexColors: true, map: slate.map, normalMap: slate.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.62 }), soft),
    trim: toyfy(trim, soft),
    gloss: toyfy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.15 }), { ...soft, wax: s.wax * 0.5 }),
    glass: toyfy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.15 }), { ...soft, wax: 0 }),
    sign: toyfy(new THREE.MeshStandardMaterial({ vertexColors: true, map: makeSignAtlas(), alphaTest: 0.5, roughness: 0.6 }), soft),
    litOn: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  return materials;
}
