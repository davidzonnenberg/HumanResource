/**
 * Builds a toy-style Dutch building from a recipe (v4).
 *
 * Look: soft clay parts, thick cream outlines, raised bricks and slates,
 * baked AO (ground + wall contact + undersides), a hand-made warp (lean,
 * bulge, ridge sag, taper), moulded tube rims on curved gables.
 * Character: archetype props, things in windows, one focal point per house,
 * clear identity markers for important buildings, weathering.
 * Output: up to eight merged geometries (one per material group), animated
 * movers (signs, flags, laundry, lamps) and smoke anchors.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { totalEaveHeight, type ArchKind, type BuildingRecipe, type Detail, type MeshGroup, type WindowLife } from './buildingRecipe';
import { axisRotate, ballGeo, Collector, MESH_GROUPS, roundCylGeo, rrectShape, slabGeo, v2, type AnchorOut, type MoverOut } from './collector';
import { addAwning, addBalcony, addBayWindow, addBigSign, addDoor, addGableStone, addLantern, addNiche, addRoundWindow, addWallAnchor, addWindow, windowBody, type WindowOpts } from './facade';
import { densifyPath, densifyPolygon, gableLayout, offsetPolygon, type Pt } from './gables';
import {
  addApron,
  addBankPortico,
  addBarrel,
  addBeerMug,
  addBeerSign,
  addBike,
  addBirdNest,
  addChippedPlaster,
  addCoatOfArms,
  addCrateStack,
  addEuroMedallion,
  addFlag,
  addGardenStrip,
  addIvy,
  addKliko,
  addLaundry,
  addLinkedInBanner,
  addMoss,
  addNeonCup,
  addParcel,
  addPigeon,
  addPosters,
  addSatellite,
  addSolarPanels,
  addSynergyPlate,
  addTeKoop,
  addWeeds,
  addXmasLights,
  addYearStone,
  synergyLogo,
} from './props';

export { MESH_GROUPS } from './collector';
export type { AnchorOut, MoverOut } from './collector';

export interface BuildingMeshes {
  geometries: Partial<Record<MeshGroup, THREE.BufferGeometry>>;
  movers: MoverOut[];
  anchors: AnchorOut[];
  /** Local bounding box (includes props that stick out). Use recipe width x depth for hitboxes. */
  bounds: THREE.Box3;
  /** Local point on the pavement in front of the main door (null if none). */
  door: THREE.Vector3 | null;
  eaveHeight: number;
  triangles: number;
}

interface Spot {
  x: number;
  y: number;
  z: number;
}

function buildBuilding(r: BuildingRecipe, ownerHex: string, detail: Detail): BuildingMeshes {
  const W = r.width;
  const D = r.depth;
  const hw = W / 2;
  const eave = totalEaveHeight(r);
  const c = new Collector(r, ownerHex, detail, eave);
  const wall = c.wall;
  const P = r.props;
  const flat = r.gable.kind === 'flat';
  const modern = r.windows.style === 'modern';
  const floors = r.floorHeights.length;
  const floorBases: number[] = [];
  {
    let y = r.groundFloorHeight;
    for (const fh of r.floorHeights) {
      floorBases.push(y);
      y += fh;
    }
  }
  const sills: Spot[] = [];
  const pickLife = (): WindowLife | null => (r.windowLife.kinds.length && c.chance(r.windowLife.share) ? c.pick(r.windowLife.kinds) : null);
  const win = (): WindowOpts => {
    const boarded = c.chance(r.boarded);
    return {
      style: r.windows.style,
      arch: r.windows.arch,
      shutters: r.windows.shutters,
      flower: !boarded && c.chance(r.windows.flowerBoxes),
      lit: !boarded && c.chance(r.litFraction),
      life: pickLife(),
      boarded,
    };
  };
  let door: THREE.Vector3 | null = null;
  const front = () => new THREE.Matrix4().makeTranslation(0, 0, D / 2);

  // ---------- body (building space) ----------
  const bodyR = Math.max(0.04, Math.min(r.bodyRadius, 0.3, W * 0.08));
  c.face.identity();
  c.slab(wall, 'brick', W, eave, D, 0, eave / 2, 0, { r: bodyR, b: bodyR, smooth: false, segments: 4 });
  c.slab('trim', 'ledge', W + 0.14, 0.42, D + 0.14, 0, 0.21, 0, { r: 0.08, b: Math.min(0.08, bodyR), segments: 3 });
  const ov = Math.max(0.06, Math.min(0.45, r.corniceOverhang));
  if (flat) {
    c.slab('trim', 'ledge', W + 0.1, 0.12, D + 0.1, 0, eave + 0.02, 0, { r: 0.05, b: Math.min(0.06, bodyR), segments: 3 });
  } else {
    for (const y of floorBases) c.slab('trim', 'band', W + 0.14, 0.16, D + 0.14, 0, y, 0, { r: 0.06, b: 0.05, segments: 3 });
    c.slab('trim', 'band', W + ov, 0.14, D + ov, 0, eave - 0.12, 0, { r: 0.05, b: 0.04 });
    c.slab('trim', 'band', W + 2 * ov, 0.22, D + 1.5 * ov, 0, eave + 0.03, 0, { r: 0.08, b: 0.06 });
    // fake shadow under the cornice
    c.inFrame(front(), () => c.plate(wall, c.shade('brick', -0.2), rrectShape(W - 2 * bodyR, 0.32, 0.12, c.q), 0.006, 0.004, 0, 0, eave - 0.36, false));
  }

  // corners
  if (r.corners === 'quoins') {
    let k = 0;
    for (let y = 0.6; y < eave - 0.3; y += 0.34, k++) {
      const len = (k % 2 ? 0.34 : 0.56) + c.jit(0.04);
      for (const s of [-1, 1]) c.slab('trim', c.shade('band', c.jit(0.05)), len, 0.27, len * 0.8, s * (hw - len / 2 + 0.05), y, D / 2 - (len * 0.8) / 2 + 0.05, { r: 0.05, b: 0.035 });
    }
  } else if (r.corners === 'pilaster') {
    for (const s of [-1, 1]) {
      c.slab('trim', 'band', 0.34, eave - 0.45, 0.34, s * (hw - 0.12), 0.42 + (eave - 0.45) / 2, D / 2 - 0.12, { r: 0.06, b: 0.05 });
      for (const y of floorBases) c.slab('trim', 'band', 0.46, 0.14, 0.46, s * (hw - 0.12), y - 0.1, D / 2 - 0.12, { r: 0.05 });
    }
  }

  if (r.drainpipe) {
    const s = c.chance(0.5) ? -1 : 1;
    const x = s * (hw + 0.09);
    const z = D / 2 - 0.35;
    c.cyl('trim', 'ledge', 0.055, eave - 0.1, 'y', x, eave / 2, z, 0.02);
    c.slab('trim', 'ledge', 0.2, 0.22, 0.2, x, eave - 0.18, z, { r: 0.05 });
    c.slab('trim', 'ledge', 0.16, 0.1, 0.26, x, 0.08, z + 0.06, { r: 0.04 });
    for (let y = 1; y < eave - 0.5; y += 1.1) c.slab('trim', 'ledge', 0.14, 0.06, 0.14, x, y, z, { b: 0.015 });
  }

  // ---------- front facade ----------
  c.face = front();
  const bays = Math.max(1, Math.round(r.bays));
  const bw = W / bays;
  const doorBay = Math.min(bays - 1, Math.max(0, r.ground.doorBay ?? Math.floor(bays / 2)));
  const bayU = (i: number, n: number) => -hw + (W / n) * (i + 0.5);
  const Hg = r.groundFloorHeight;
  const doorU = bayU(doorBay, bays);
  const sink = { set: (v: THREE.Vector3) => (door = v.applyMatrix4(c.face)) };
  let doorW = 0.9;

  if (r.ground.kind === 'door') {
    const steps = Math.max(0, Math.min(3, Math.round(r.ground.steps)));
    for (let b = 0; b < bays; b++) {
      const u = bayU(b, bays);
      if (b === doorBay) {
        doorW = Math.min(bw * 0.52, modern ? 1.0 : 1.05);
        addDoor(c, u, doorW, Math.min(Hg * 0.62, 2.0) - steps * 0.08, { steps, arch: r.ground.doorArch, modern, neeNee: P.neeNee, doormat: P.doormat, fade: r.weathering > 0.5 ? (r.weathering - 0.5) * 0.9 : 0 }, sink);
      } else if (modern) {
        addWindow(c, u, Hg * 0.5, Math.min(bw * 0.78, 2.2), Hg * 0.62, win());
      } else {
        const o = win();
        addWindow(c, u, Hg * 0.54, Math.min(bw * 0.52, 0.95), Math.min(Hg * 0.5, 1.45), o);
        sills.push({ x: u, y: Hg * 0.54 - Math.min(Hg * 0.5, 1.45) / 2 - 0.1, z: 0.25 });
      }
    }
    // identity at the door
    if (r.identity === 'bank') addBankPortico(c, doorU, Hg, steps, r.signText);
    if (r.identity === 'municipality') {
      for (const s of [-1, 1]) addCoatOfArms(c, doorU + s * (doorW / 2 + 0.75), Hg * 0.62, 1);
      if (r.signText) {
        c.slab('trim', 'trim', 2.2, 0.42, 0.1, doorU, Hg + 0.32, 0.05, { r: 0.1, b: 0.03 });
        c.signText(r.signText, 2.0, 0.3, doorU, Hg + 0.32, 0.105, c.shade('ledge', -0.3));
      }
    }
    if (r.identity === 'synergy') synergyLogo(c, doorU, Hg - 0.25 + (modern ? 0.35 : 0), 0.3, 0.12, '#d9b04a');
    if (r.identity === 'pub') addBeerSign(c, hw - 0.3, Hg + 0.1, 1.15);
  } else if (r.ground.kind === 'shop' || r.ground.kind === 'pub') {
    const top = Hg - 0.5;
    c.slab('trim', 'accent', W - 0.04, 0.46, 0.2, 0, top + 0.16, 0.1, { r: 0.06 });
    c.slab('trim', 'trim', W + 0.04, 0.1, 0.26, 0, top + 0.43, 0.13, { r: 0.04 });
    c.slab('trim', 'trim', W - 0.5, 0.3, 0.05, 0, top + 0.16, 0.22, { r: 0.1, rz: c.jit(0.015) });
    if (r.signText) c.signText(r.signText, W - 0.8, 0.24, 0, top + 0.16, 0.25, c.shade('accent', -0.35));
    for (let b = 0; b <= bays; b++) {
      const u = -hw + 0.11 + ((W - 0.22) * b) / bays;
      c.slab('trim', 'accent', 0.22, top, 0.2, u, top / 2, 0.1, { r: 0.05 });
      c.slab('trim', 'trim', 0.3, 0.12, 0.26, u, top - 0.06, 0.13, { r: 0.04 });
      c.slab('trim', 'trim', 0.3, 0.12, 0.26, u, 0.1, 0.13, { r: 0.04 });
    }
    let neonDone = false;
    for (let b = 0; b < bays; b++) {
      const u = bayU(b, bays);
      if (b === doorBay) {
        const dw = Math.min(bw - 0.42, 0.95);
        doorW = dw;
        const dh = top - 0.32;
        c.plate('glass', 'glass', rrectShape(dw, dh, 0.01, c.q), 0.02, 0.01, 0, u, dh / 2 + 0.05, false);
        c.slab('gloss', c.shade('accent', -0.3), dw, dh * 0.5, 0.08, u, dh * 0.25 + 0.05, 0.04, { r: 0.03 });
        const lit = r.ground.kind === 'pub' || c.chance(r.litFraction);
        c.slab(lit ? 'lit' : 'glass', lit ? 'lit' : 'glass', dw * 0.7, dh * 0.38, 0.02, u, dh * 0.72, 0.03, { b: 0, r: 0.02, smooth: false });
        c.ball('gloss', '#e0b04a', 0.05, u + dw * 0.32, dh * 0.5, 0.11);
        c.slab('trim', c.shade('accent', -0.3), dw + 0.16, 0.12, 0.14, u, dh + 0.1, 0.07, { r: 0.04 });
        door = new THREE.Vector3(u, 0, 0.9).applyMatrix4(c.face);
        if (r.ground.kind === 'pub') {
          addLantern(c, u - dw / 2 - 0.3, Hg * 0.6);
          addLantern(c, u + dw / 2 + 0.3, Hg * 0.6);
        }
      } else {
        c.slab('trim', 'accent', bw - 0.24, 0.5, 0.12, u, 0.35, 0.06, { r: 0.04 });
        const lit = r.ground.kind === 'pub' ? c.chance(Math.max(r.litFraction, 0.7)) : c.chance(r.litFraction);
        const wy = 0.65 + (top - 0.75) / 2;
        addWindow(c, u, wy, bw - 0.5, top - 0.9, { style: 'grid', arch: 'none', flower: false, shutters: false, lit, frame: 'accent', head: false, life: r.ground.kind === 'pub' ? null : pickLife() });
        if (r.identity === 'coffee' && !neonDone) {
          addNeonCup(c, u, wy - 0.2, 0.06);
          neonDone = true;
        }
      }
    }
    if (r.ground.awning) addAwning(c, W - 0.1, top - 0.02);
    if (r.identity === 'pub') {
      addBeerSign(c, hw - 0.3, Hg + 0.1, 1.15);
      addBeerMug(c, -hw + 0.55, top + 0.75, 0.42, 0.85);
    }
  } else {
    for (let b = 0; b < bays; b++) {
      const u = bayU(b, bays);
      const dw = bw - 0.45;
      const dh = Hg - 0.75;
      const planks = Math.max(3, Math.round(dw / 0.22));
      for (let p = 0; p < planks; p++) {
        c.slab('trim', c.shade('door', (c.rng() - 0.5) * 0.14), dw / planks - 0.02, dh + c.jit(0.04), 0.08, u - dw / 2 + (dw / planks) * (p + 0.5), dh / 2 + 0.42, 0.04, { r: 0.02, b: 0.015 });
      }
      const ang = Math.atan2(dh * 0.8, dw);
      c.slab('trim', c.shade('door', -0.25), Math.hypot(dw, dh * 0.8) - 0.2, 0.13, 0.05, u, dh / 2 + 0.42, 0.1, { rz: ang, b: 0.015 });
      for (const yy of [0.18, 0.82]) c.slab('trim', c.shade('door', -0.25), dw, 0.13, 0.05, u, 0.42 + dh * yy, 0.1, { b: 0.015 });
      const ring = new THREE.Shape(rrectShape(dw + 0.3, dh + 0.3, 0.1, c.q).getPoints());
      ring.holes.push(new THREE.Path(rrectShape(dw, dh, 0.05, c.q).getPoints()));
      c.plate('trim', 'trim', ring, 0.18, 0.09, 0.035, u, dh / 2 + 0.42);
      if (b === doorBay) door = new THREE.Vector3(u, 0, 1.2).applyMatrix4(c.face);
    }
    if (r.ground.sign) {
      c.slab('trim', 'accent', W * 0.72, 0.56, 0.12, 0, Hg + 0.02, 0.18, { r: 0.16, rz: c.jit(0.02) });
      c.slab('trim', 'trim', W * 0.62, 0.36, 0.05, 0, Hg + 0.02, 0.25, { r: 0.1 });
      if (r.signText) c.signText(r.signText, W * 0.55, 0.28, 0, Hg + 0.02, 0.28, c.shade('accent', -0.3));
    }
    if (r.identity === 'brewery') {
      const side = doorU > 0 ? -1 : 1;
      addBarrel(c, doorU + side * (bw / 2 + 0.05), 0.5, 1.3);
      addCrateStack(c, doorU - side * (bw / 2 + 0.1), 0.45);
      c.inFrame(c.face.clone().multiply(new THREE.Matrix4().makeTranslation(-W * 0.36 - 0.15, Hg - 0.3, 0.35)), () => {
        c.cyl('trim', '#9a6234', 0.32, 0.6, 'x', 0, 0, 0, 0.08);
        for (const dx of [-0.2, 0.2]) c.torus('trim', '#4a4046', 0.33, 0.025, 'x', dx, 0, 0);
      });
    }
  }

  // ---------- upper floors with one focal slot ----------
  const ub = Math.max(1, Math.round(r.windows.upperBays ?? bays));
  const midBay = ub % 2 ? (ub - 1) / 2 : ub / 2 - (c.chance(0.5) ? 1 : 0);
  const g = gableLayout(r.gable.kind, hw, r.gable.height);
  const gableHasWindow = !!g.outline && r.gable.window && g.windowCentreY !== null;
  let slot: { floor: number; bay: number } | null = null;
  if (floors > 0) {
    switch (r.focal) {
      case 'bayWindow':
      case 'gableStone':
        slot = { floor: 0, bay: midBay };
        break;
      case 'balcony':
      case 'niche':
        slot = { floor: floors - 1, bay: midBay };
        break;
      case 'roundWindow':
        if (!gableHasWindow) slot = { floor: floors - 1, bay: midBay };
        break;
      default:
        break;
    }
  }
  r.floorHeights.forEach((fh, i) => {
    const base = floorBases[i] ?? 0;
    const ww = modern ? Math.min((W / ub) * 0.78, 2.2) : Math.min((W / ub) * 0.5, 0.95);
    const wh = modern ? fh * 0.62 : Math.min(fh * 0.52, 1.4);
    for (let b = 0; b < ub; b++) {
      const u = bayU(b, ub);
      const yc = base + fh * 0.52;
      if (slot && slot.floor === i && slot.bay === b) {
        switch (r.focal) {
          case 'bayWindow':
            addBayWindow(c, u, base, fh, (W / ub) * 0.9, win());
            break;
          case 'gableStone':
            addGableStone(c, u, yc);
            break;
          case 'balcony':
            addBalcony(c, u, base, fh, Math.max(1.4, (W / ub) * 0.95), modern || flat, P.mattress, win());
            break;
          case 'niche':
            addNiche(c, u, yc, Math.min(ww, 0.8), wh, r.archetype === 'grand');
            break;
          case 'roundWindow':
            addRoundWindow(c, u, yc, Math.min(W / ub - 0.3, fh * 0.6, 1.2), c.chance(r.litFraction));
            break;
          default:
            break;
        }
        continue;
      }
      addWindow(c, u, yc, ww, wh, win());
      sills.push({ x: u, y: yc - wh / 2 - 0.1, z: 0.25 });
    }
  });
  if (r.focal === 'bigSign') addBigSign(c, W * 0.82, Hg + 0.32, r.signText);

  // ---------- facade props ----------
  if (r.props.wallAnchors && !flat) {
    for (const y of floorBases) for (const s of [-1, 1]) addWallAnchor(c, s * (hw - (r.corners === 'none' ? 0.32 : 0.75)), y + 0.32);
  }
  if (wall === 'brick' && c.imp > 0) {
    const n = Math.round(3 + 9 * c.imp);
    const gaps: number[] = [];
    for (let b = 1; b < ub; b++) gaps.push(-hw + (W / ub) * b);
    if (r.corners === 'none') gaps.push(-hw + 0.28, hw - 0.28);
    for (let k = 0; k < n && gaps.length > 0; k++) {
      const gx = c.pick(gaps);
      const y = 0.6 + c.rng() * (eave - 1.0);
      c.slab('brick', c.shade('brick', (c.rng() - 0.5) * 0.25), 0.26 + c.rng() * 0.08, 0.09, 0.05, gx + (c.rng() - 0.5) * 0.12, y, 0.02, { r: 0.03, b: 0.015, rz: c.jit(0.06) });
    }
  }
  if (wall === 'plaster' && r.weathering > 0.3) addChippedPlaster(c, W, eave);
  if (r.weathering > 0.4) addMoss(c, W);
  const props = c.q.props;
  if (props) {
    const otherSide = doorU > 0 ? -1 : 1;
    if (P.ivy) addIvy(c, otherSide * (hw - 0.3), -hw + 0.05, hw - 0.05, Math.min(eave - 0.3, 1.6 + c.rng() * eave * 0.6));
    if (P.bike) addBike(c, Math.max(-hw + 0.6, Math.min(hw - 0.6, otherSide * (hw - 0.75))), r.apron ? 0.7 : 0.45, P.flatTyreBike);
    if (P.kliko) addKliko(c, Math.max(-hw + 0.35, Math.min(hw - 0.35, doorU - otherSide * (doorW / 2 + 0.55))), 0.45);
    if (P.gardenStrip && r.ground.kind === 'door') {
      const a = doorU + otherSide * (doorW / 2 + 0.45);
      const b2 = otherSide * (hw - 0.15);
      addGardenStrip(c, Math.min(a, b2), Math.max(a, b2));
    }
    if (P.parcel) addParcel(c, doorU + otherSide * (doorW / 2 + 0.3), 0.35 + r.ground.steps * 0.3);
    if (P.posters) addPosters(c, doorU + otherSide * (doorW / 2 + 0.7), 1.3, 0.7);
    if (P.synergyPlate) addSynergyPlate(c, doorU - otherSide * (doorW / 2 + 0.45), 1.45);
    if (P.weeds) addWeeds(c, W, eave);
    if (P.laundry && floors > 0) addLaundry(c, 0, (floorBases[floors - 1] ?? Hg) + 0.3, W * 0.6);
    if (P.satellite) addSatellite(c, otherSide * (hw - 0.45), eave - 0.75);
    if (P.kingsFlag || r.identity === 'municipality') {
      const cols = r.identity === 'municipality' ? ['#c0392b', '#ffffff', '#2f5fa8'] : ['#f08c00'];
      addFlag(c, -otherSide * (hw - 0.6), Hg + 0.3, cols);
    }
    if (P.teKoop && floors > 0) addTeKoop(c, ub > 1 ? -hw + W / ub : 0, Hg + 0.45);
    if (P.linkedInBanner && floors > 0) addLinkedInBanner(c, -otherSide * (hw - 0.75), eave - 0.25, Math.min(2.6, eave - Hg - 0.6));
    if (P.xmasLights) addXmasLights(c, W - 0.2, eave - 0.2, true);
    if (P.pigeon && sills.length) {
      const s = c.pick(sills);
      addPigeon(c, s.x + 0.2, s.y + 0.03, s.z);
    }
  }

  // side walls
  if (r.sideWindows) {
    const per = Math.max(1, Math.floor((D - 1.2) / 2));
    for (const side of [1, -1]) {
      c.inFrame(new THREE.Matrix4().makeRotationY((side * Math.PI) / 2).setPosition(side * hw, 0, 0), () => {
        r.floorHeights.forEach((fh, i) => {
          const base = floorBases[i] ?? 0;
          for (let k = 0; k < per; k++) {
            const u = -D / 2 + 0.6 + ((D - 1.2) / per) * (k + 0.5);
            addWindow(c, u, base + fh * 0.52, modern ? 1.0 : 0.62, Math.min(fh * 0.46, 1.1), { ...win(), flower: false, shutters: false });
          }
        });
      });
    }
  }

  if (r.apron) {
    c.face = new THREE.Matrix4().makeTranslation(0, 0, D / 2 + 0.07);
    addApron(c, W, r.identity === 'pub');
  }

  // ---------- gable and roof (building space) ----------
  c.face.identity();
  const oh = 0.2;
  let hoist: Spot | null = null;
  if (g.outline) {
    const outline = densifyPolygon(g.outline, c.q.maxEdge);
    const ridge = g.ridgeHeight;
    const roofLen = D - 0.22;
    const zBack = -D / 2 - 0.12;
    const zMid = zBack + roofLen / 2;
    const tri = densifyPolygon(
      [
        [-hw - oh, 0],
        [hw + oh, 0],
        [0, ridge],
      ],
      c.q.maxEdge,
    );
    const core = new THREE.ExtrudeGeometry(new THREE.Shape(tri.map(v2)), { depth: roofLen, steps: Math.ceil(roofLen / c.q.maxEdge), bevelEnabled: false });
    core.translate(0, eave + 0.08, zBack);
    c.add('roof', core, c.shade('roof', -0.3), false);
    const L = Math.hypot(hw + oh, ridge);
    const a = Math.atan2(ridge, hw + oh);
    if (r.roof.tiles && c.q.tiles) {
      const n = Math.max(3, Math.round(L / 0.36));
      const missing = Math.max(0, r.weathering - 0.6) * 0.25;
      for (const s of [1, -1]) {
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const px = s * (hw + oh) * (1 - t);
          const py = eave + 0.08 + ridge * t;
          const nx = s * Math.sin(a);
          const ny = Math.cos(a);
          let z = zBack - 0.03;
          let first = true;
          while (z < zBack + roofLen + 0.02) {
            const want = first && i % 2 ? 0.3 : 0.5 + c.rng() * 0.35;
            const len = Math.min(want, zBack + roofLen + 0.03 - z);
            first = false;
            if (len > 0.08 && !c.chance(missing)) {
              const lift = 0.06 + c.rng() * 0.02 + c.jit(0.015);
              c.slab('roof', c.shade('roof', (i % 2 ? 0.05 : -0.04) + (c.rng() - 0.5) * 0.1), (L / n) * 1.28, 0.085, len - 0.025, px + nx * lift, py + ny * lift, z + len / 2, {
                rz: (s > 0 ? Math.PI - a : a) + c.jit(0.05),
                rx: c.jit(0.04),
                r: 0.035,
                b: 0.03,
              });
              if (c.chance(0.04 * c.imp + 0.08 * r.weathering)) c.ball('roof', c.shade('#7a9a4a', c.jit(0.1)), 0.1 + c.rng() * 0.08, px + nx * 0.13, py + ny * 0.13, z + len / 2, 0.4);
            }
            z += len;
          }
        }
      }
    }
    c.slab('roof', c.shade('roof', -0.15), 0.28, 0.24, roofLen + 0.15, 0, eave + 0.12 + ridge, zMid, { r: 0.12, b: 0.06 });
    for (const s of [1, -1]) {
      c.slab('trim', 'band', L + 0.1, 0.16, 0.16, (s * (hw + oh)) / 2, eave + 0.1 + ridge / 2, D / 2 - 0.2, { rz: s > 0 ? Math.PI - a : a, r: 0.06, b: 0.05 });
    }
    const back = new THREE.ExtrudeGeometry(
      new THREE.Shape(
        densifyPolygon(
          [
            [-hw, 0],
            [hw, 0],
            [0, ridge * 0.98],
          ],
          c.q.maxEdge,
        ).map(v2),
      ),
      { depth: 0.12, bevelEnabled: false },
    );
    back.translate(0, eave, -D / 2 - 0.02);
    c.add(wall, back, 'brick', false);
    const panel = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(v2)), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 1 });
    panel.translate(0, eave, D / 2 - 0.18);
    c.add(wall, panel, 'brick', false);
    // rim: moulded tube on curved gables, chunky ring on step gables
    if (r.gable.rim) {
      if (r.gable.kind === 'step') {
        const ring = new THREE.Shape(offsetPolygon(outline, 0.17).map(v2));
        ring.holes.push(new THREE.Path(outline.map(v2)));
        const rim = new THREE.ExtrudeGeometry(ring, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 1 });
        rim.translate(0, eave, D / 2 - 0.14);
        c.add('trim', rim, 'trim', false);
      } else {
        const path = densifyPath(g.outline, 0.12);
        const zf = D / 2 - 0.04;
        const pts = path.map(([x, y]: Pt) => new THREE.Vector3(x, eave + y, zf));
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        const segs = Math.max(24, Math.round(curve.getLength() / 0.06));
        const tube = new THREE.TubeGeometry(curve, segs, 0.14, c.q.tubeRadial, false);
        c.add('trim', tube, 'trim', false);
        for (const s of [-1, 1]) c.ball('trim', 'trim', 0.15, s * hw, eave + 0.02, zf);
      }
    }
    for (const [x, y] of g.caps) {
      const isTop = x === 0;
      const half = g.outline[Math.floor(g.outline.length / 2) - 1]?.[0] ?? 0.3;
      const w = (isTop ? Math.max(0.5, Math.abs(half) * 2 + 0.3) : 0.42) + c.jit(0.04);
      const cx = isTop ? 0 : x - Math.sign(x) * 0.08;
      c.slab('trim', c.shade('trim', c.jit(0.04)), w, 0.26 + c.jit(0.03), 0.44, cx + c.jit(0.03), eave + y + 0.13, D / 2 - 0.02, { r: 0.1, b: 0.06, rz: c.jit(0.06) });
    }
    if (r.gable.finials) {
      const fr = Math.max(0.15, W * 0.04);
      g.finials.forEach(([x, y]) => {
        const rr = (x === 0 ? fr * 1.35 : fr) * (1 + c.jit(0.06));
        c.slab('trim', 'trim', rr * 1.7, 0.16, rr * 1.7, x, eave + y + 0.14, D / 2 - 0.04, { r: 0.06, b: 0.05 });
        c.ball('trim', 'trim', rr, x, eave + y + 0.22 + rr * 0.8, D / 2 - 0.04, 0.85);
      });
    }
    c.face = front();
    let hoistY = eave + r.gable.height * 0.72;
    let gableWinBottom = Infinity;
    if (gableHasWindow && g.windowCentreY !== null) {
      const yc = eave + g.windowCentreY;
      if (r.focal === 'roundWindow') {
        const d = Math.min(g.windowMaxWidth, 1.0, r.gable.height * 0.32);
        addRoundWindow(c, 0, yc, d, c.chance(r.litFraction));
        hoistY = yc + d / 2 + 0.45;
        gableWinBottom = yc - d / 2 - 0.15;
      } else {
        const ww = Math.min(g.windowMaxWidth, 0.8);
        const wh = Math.min(0.85, r.gable.height * 0.28);
        const arch: ArchKind = r.gable.kind === 'bell' || r.gable.kind === 'neck' ? 'round' : r.windows.arch;
        addWindow(c, 0, yc, ww, wh, { ...win(), arch, flower: false, shutters: false, style: modern ? 'cross' : r.windows.style });
        hoistY = yc + wh / 2 + 0.45;
        gableWinBottom = yc - wh / 2 - 0.2;
        if (r.gable.ornaments && g.windowMaxWidth > 1.1) {
          for (const s of [-1, 1]) {
            c.ball('trim', 'trim', 0.16, s * (ww / 2 + 0.42), yc, 0.08, 1.3, 0.45);
            c.ball('trim', 'band', 0.09, s * (ww / 2 + 0.42), yc, 0.13, 1.3, 0.45);
          }
        }
      }
    }
    if (P.yearStone && gableWinBottom - eave > 0.7) addYearStone(c, 0, eave + 0.42);
    if (r.gable.hoistBeam) {
      hoistY = Math.min(hoistY, eave + r.gable.height - 0.35);
      c.slab('trim', 'ledge', 0.18, 0.18, 0.8, 0, hoistY, 0.35, { r: 0.05, rx: c.jit(0.05) });
      c.torus('trim', '#2e2a2c', 0.08, 0.025, 'x', 0, hoistY - 0.15, 0.66);
      c.cyl('trim', '#c9a66b', 0.015, 0.6, 'y', 0, hoistY - 0.5, 0.7, 0.005);
      hoist = { x: 0, y: hoistY + 0.09, z: 0.45 };
    }
    if (props && P.birdNest) {
      const spot = hoist ?? (sills.length ? c.pick(sills) : null);
      if (spot) addBirdNest(c, spot.x, spot.y + 0.02, spot.z);
    }
    if (props && P.pigeon && hoist) addPigeon(c, hoist.x, hoist.y, hoist.z + 0.15);
    c.face.identity();
    if (r.chimney) {
      const cx = hw * 0.48;
      const roofY = eave + 0.08 + ridge * (1 - cx / (hw + oh));
      const ch = 1.0 + c.jit(0.2);
      const lean = c.jit(0.06);
      c.slab(wall, 'brick', 0.5, ch, 0.5, cx, roofY + ch / 2 - 0.15, -D / 4, { r: 0.05, b: 0.04, smooth: false, rz: lean });
      c.slab('trim', 'band', 0.64, 0.14, 0.64, cx - lean * ch * 0.5, roofY + ch - 0.12, -D / 4, { r: 0.06, rz: lean });
      c.cyl('trim', '#b8653f', 0.09, 0.32 + c.jit(0.06), 'y', cx - lean * ch * 0.5 - 0.1, roofY + ch + 0.08, -D / 4, 0.03);
      c.cyl('trim', '#b8653f', 0.08, 0.24 + c.jit(0.06), 'y', cx - lean * ch * 0.5 + 0.12, roofY + ch + 0.04, -D / 4 + 0.05, 0.03);
      if (r.archetype !== 'abandoned') c.anchor('smoke', cx - lean * ch * 0.5 - 0.1, roofY + ch + 0.3, -D / 4, false);
    }
    if (r.roof.dormers && ridge > 1.4 && hw > 1.8) {
      for (const s of [1, -1]) {
        const xr = s * hw * 0.48;
        const roofY = eave + 0.08 + ridge * (1 - Math.abs(xr) / (hw + oh));
        c.slab(wall, 'brick', 0.9, 0.95, 1.0, xr, roofY + 0.2, 0, { r: 0.05, b: 0.04, smooth: false });
        c.slab('roof', c.shade('roof', -0.05), 1.15, 0.12, 1.25, xr - s * 0.05, roofY + 0.72, 0, { rz: s * 0.18, r: 0.05, b: 0.04 });
        c.inFrame(new THREE.Matrix4().makeRotationY((s * Math.PI) / 2).setPosition(xr + s * 0.45, 0, 0), () =>
          windowBody(c, 0, roofY + 0.2, 0.5, 0.48, { ...win(), arch: 'none', flower: false, shutters: false, sill: false }),
        );
      }
    }
  } else if (flat) {
    // modern flat roof: slab, slim coping, optional roof box and solar panels
    c.slab('roof', c.shade('roof', -0.1), W - 0.15, 0.12, D - 0.15, 0, eave + 0.1, 0, { smooth: false });
    c.slab('trim', 'trim', W + 0.08, 0.14, 0.16, 0, eave + 0.18, D / 2 - 0.02, { r: 0.05 });
    c.slab('trim', 'trim', W + 0.08, 0.14, 0.16, 0, eave + 0.18, -D / 2 + 0.02, { r: 0.05 });
    for (const s of [-1, 1]) c.slab('trim', 'trim', 0.16, 0.14, D + 0.08, s * (hw + 0.0), eave + 0.18, 0, { r: 0.05 });
    if (c.chance(0.5)) c.slab(wall, 'brick', Math.min(2, W * 0.35), 1.0, Math.min(2, D * 0.3), -hw * 0.4, eave + 0.6, -D / 4, { r: 0.12, b: 0.1, smooth: false });
    if (props && P.solarPanels) addSolarPanels(c, W * 0.5, D, eave);
  } else {
    // classic cornice house: flat roof behind a parapet with a heavy cornice
    c.slab('roof', 'roof', W - 0.1, 0.1, D - 0.1, 0, eave + 0.1, 0, { smooth: false });
    c.slab(wall, 'brick', W, 0.7, 0.18, 0, eave + 0.45, D / 2 - 0.09, { smooth: false });
    c.slab('trim', 'band', W + 2 * ov, 0.22, 0.42 + ov, 0, eave + 0.86, D / 2 - 0.05, { r: 0.08, b: 0.06 });
    c.slab('trim', 'band', W + ov, 0.12, 0.3, 0, eave + 0.18, D / 2 - 0.02, { r: 0.05 });
    const n = Math.max(3, Math.round(W / 0.9));
    for (let i = 0; i < n; i++) c.slab('trim', 'band', 0.16, 0.2, 0.2, -hw + 0.35 + ((W - 0.7) * i) / (n - 1), eave + 0.62, D / 2 + 0.02, { r: 0.05 });
    if (r.chimney) {
      c.slab(wall, 'brick', 0.5, 0.9, 0.5, hw * 0.5, eave + 0.55, -D / 4, { smooth: false, rz: c.jit(0.05) });
      if (r.archetype !== 'abandoned') c.anchor('smoke', hw * 0.5, eave + 1.15, -D / 4, false);
    }
    if (r.identity === 'bank') {
      c.face = front();
      addEuroMedallion(c, 0, eave + 1.0 + 0.3 + 0.65, 0.65);
      c.face.identity();
    }
    if (props && P.solarPanels) addSolarPanels(c, W * 0.5, D, eave);
  }

  // ---------- extras (building space) ----------
  for (const e of r.extras) {
    for (const m of e.mirrorX ? [1, -1] : [1]) {
      let geo: THREE.BufferGeometry;
      const [s0, s1, s2] = e.size;
      switch (e.shape) {
        case 'box':
          geo = new THREE.BoxGeometry(s0, s1, s2);
          break;
        case 'roundedBox':
          geo = slabGeo(s0, s1, s2, Math.min(0.06, Math.min(s0, s1) * 0.25), Math.min(0.04, Math.min(s0, s1, s2) * 0.3), c.q, true);
          break;
        case 'cylinder':
          geo = roundCylGeo(s0, s1, Math.min(0.05, s0 * 0.3), c.q);
          axisRotate(geo, e.axis ?? 'y');
          break;
        case 'sphere':
          geo = ballGeo(s0, c.q);
          if (s1) geo.scale(1, s1, 1);
          break;
        case 'dome':
          geo = new THREE.SphereGeometry(s0, c.q.sphere[0] + 4, c.q.sphere[1], 0, Math.PI * 2, 0, Math.PI / 2);
          if (s1) geo.scale(1, s1, 1);
          break;
        case 'torus':
          geo = new THREE.TorusGeometry(s0, s1, 8, c.q.radial);
          if ((e.axis ?? 'y') === 'y') geo.rotateX(Math.PI / 2);
          if (e.axis === 'x') geo.rotateY(Math.PI / 2);
          break;
        case 'cone':
          geo = new THREE.ConeGeometry(s0, s1, c.q.radial);
          axisRotate(geo, e.axis ?? 'y');
          break;
      }
      if (e.rot) {
        geo.rotateX(e.rot[0]);
        geo.rotateY(m * e.rot[1]);
        geo.rotateZ(m * e.rot[2]);
      }
      geo.translate(m * e.pos[0], e.pos[1], e.pos[2]);
      c.add(e.group ?? 'trim', geo, e.colour, false);
    }
  }

  // ---------- merge ----------
  const bounds = new THREE.Box3();
  let triangles = 0;
  const mergeBuckets = (buckets: Record<MeshGroup, THREE.BufferGeometry[]>, offset: THREE.Vector3 | null) => {
    const out: Partial<Record<MeshGroup, THREE.BufferGeometry>> = {};
    for (const grp of MESH_GROUPS) {
      const list = buckets[grp];
      if (list.length === 0) continue;
      if (grp === 'brick' || grp === 'roof' || grp === 'plaster') list.forEach((geo) => worldUv(geo, grp === 'roof'));
      const merged = mergeGeometries(list, false);
      list.forEach((geo) => geo.dispose());
      if (!merged) throw new Error(`building merge failed for group ${grp}`);
      merged.computeBoundingBox();
      if (merged.boundingBox) bounds.union(merged.boundingBox);
      if (offset) merged.translate(-offset.x, -offset.y, -offset.z);
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      triangles += merged.getAttribute('position').count / 3;
      out[grp] = merged;
    }
    return out;
  };
  const geometries = mergeBuckets(c.parts, null);
  const movers: MoverOut[] = c.movers.map((m) => ({ kind: m.kind, tag: m.tag, pivot: m.pivot, axis: m.axis, amp: m.amp, freq: m.freq, phase: m.phase, geometries: mergeBuckets(m.parts, m.pivot) }));
  return { geometries, movers, anchors: c.anchors, bounds, door, eaveHeight: eave, triangles };
}

/** World-space UVs (1 unit = 1 m), oriented per face so normal maps stay "raised". */
function worldUv(g: THREE.BufferGeometry, roof: boolean): void {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const nx = n.getX(i);
    const ny = n.getY(i);
    const nz = n.getZ(i);
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    let u: number;
    let v: number;
    if (roof) {
      if (az > ax && az > ay) {
        u = nz > 0 ? x : -x;
        v = y;
      } else {
        u = nx >= 0 ? -z : z;
        v = y * 1.15 + Math.abs(x) * 0.85;
      }
    } else if (ay >= ax && ay >= az) {
      u = x;
      v = -z;
    } else if (ax >= az) {
      u = nx > 0 ? -z : z;
      v = y;
    } else {
      u = nz > 0 ? x : -x;
      v = y;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const cache = new Map<string, BuildingMeshes>();

/** Cached per recipe content + owner colour + detail. Treat recipes as immutable. */
export function getBuildingMeshes(recipe: BuildingRecipe, ownerHex: string, detail: Detail = 'high'): BuildingMeshes {
  const key = `${detail}|${ownerHex.toLowerCase()}|${JSON.stringify(recipe)}`;
  let m = cache.get(key);
  if (!m) {
    m = buildBuilding(recipe, ownerHex, detail);
    cache.set(key, m);
  }
  return m;
}

export function clearBuildingCache(): void {
  cache.forEach((m) => {
    Object.values(m.geometries).forEach((g) => g?.dispose());
    m.movers.forEach((mv) => Object.values(mv.geometries).forEach((g) => g?.dispose()));
  });
  cache.clear();
}
