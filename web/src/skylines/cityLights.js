// Night light on the city, in the same flat style as the room: each tower gets a hard-edged
// lit side and lit windows. It sits on its own camera layer, so outlines skip it.
import * as THREE from 'three';
import { hazeMaterial, setHaze } from './atmosphere.js';

export const CITY_LAYER = 1;
const LIT_SIDE_DEPTH = 0.02; // in front of its tower, behind the next tower
const WINDOW_DEPTH = 0.04;
const LIT_SIDE_FADE = 0.5;

function windowGeometry(windows) {
  const positions = [], indices = [];
  windows.forEach(({ x, y, w, h }, i) => {
    positions.push(x - w / 2, y - h / 2, 0, x + w / 2, y - h / 2, 0, x + w / 2, y + h / 2, 0, x - w / 2, y + h / 2, 0);
    const v = i * 4;
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

// haze is the fade range for each tower row: the far row first, then the front row.
export function createCityLights(farHaze, frontHaze) {
  const litSides = [hazeMaterial(...farHaze), hazeMaterial(...frontHaze)];
  const core = hazeMaterial();
  const rest = hazeMaterial();
  const meshes = [];

  const add = (layer, geometry, material, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = z;
    mesh.layers.set(CITY_LAYER);
    layer.add(mesh);
    meshes.push(mesh);
  };

  return {
    addTower(layer, row, litGeometry, windows, z) {
      add(layer, litGeometry, litSides[row], z + LIT_SIDE_DEPTH);
      add(layer, windowGeometry(windows.filter((w) => w.core)), core, z + WINDOW_DEPTH);
      add(layer, windowGeometry(windows.filter((w) => !w.core)), rest, z + WINDOW_DEPTH);
    },
    // city is { lit, frontLit, allLights } for a lit period, and undefined by day.
    apply(city, windowColor, haze) {
      for (const mesh of meshes) mesh.visible = Boolean(city) && (mesh.material !== rest || city.allLights);
      if (!city) return;
      setHaze(litSides[0], city.lit, haze, LIT_SIDE_FADE);
      setHaze(litSides[1], city.frontLit, haze, LIT_SIDE_FADE);
      setHaze(core, windowColor, windowColor);
      setHaze(rest, windowColor, windowColor);
    },
  };
}
