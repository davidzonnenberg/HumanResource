/**
 * Recommended scene lighting for the toy look: warm sun, cool sky fill
 * (blue-ish shade on the dark side), warm bounce from the ground, and a
 * soft sky gradient background. No shadows.
 */
import * as THREE from 'three';

export function createToyLights(night = false): THREE.Group {
  const g = new THREE.Group();
  g.name = 'toyLights';
  const hemi = new THREE.HemisphereLight(night ? '#5a6a9a' : '#cfe0ff', night ? '#2a2630' : '#c9b08a', night ? 0.7 : 1.7);
  const sun = new THREE.DirectionalLight(night ? '#9fb4ff' : '#ffe2b8', night ? 0.45 : 2.6);
  sun.position.set(-6, 14, 10);
  const fill = new THREE.DirectionalLight(night ? '#40507a' : '#a9c8ff', night ? 0.25 : 0.65);
  fill.position.set(8, 6, -6);
  g.add(hemi, sun, fill);
  return g;
}

/** Vertical gradient for scene.background. */
export function makeSkyGradient(night = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas not available');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  if (night) {
    grad.addColorStop(0, '#141a33');
    grad.addColorStop(1, '#3a3f66');
  } else {
    grad.addColorStop(0, '#8cc4f2');
    grad.addColorStop(0.7, '#cfe6fa');
    grad.addColorStop(1, '#fbeedb');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
