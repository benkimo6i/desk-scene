// The monitor, laptop and phone screens. Each is dark until the cursor is over its device,
// then lights up and washes the desk around it in a soft glow of the screen's color.
// The glow is drawn by the toon shader (see GLOW in main.js), not by a light, so it stays
// soft instead of snapping to the color ramp's hard steps.
import * as THREE from 'three';
import { measureScreen } from './picker.js';

const ON_SECONDS = 0.15;
const OFF_SECONDS = 0.4;

// reach: how far the glow spreads from the screen's center, in metres.
const SCREENS = [
  { object: 'Monitor', mesh: 'Monitor_Screen', reach: 0.75 },
  { object: 'Laptop', mesh: 'Laptop_Screen', reach: 0.55 },
  { object: 'Phone', mesh: 'Phone_Screen', reach: 0.3, flat: true },
];

export const GLOW_COUNT = SCREENS.length;

// Shader uniforms shared by every toon material.
export const GLOW = {
  uGlowPos: { value: SCREENS.map(() => new THREE.Vector3()) }, // view space
  uGlowDir: { value: SCREENS.map(() => new THREE.Vector3(0, 0, 1)) }, // view space, out of the screen
  uGlowLevel: { value: new THREE.Vector3() },
  uGlowReach: { value: new THREE.Vector3(...SCREENS.map(({ reach }) => reach)) },
  uGlowColor: { value: new THREE.Color() },
  uGlowStrength: { value: 0 },
};

const ease = (x) => x * x * (3 - 2 * x);

export function createScreens() {
  const off = new THREE.Color();
  const on = new THREE.Color();
  const entries = SCREENS.map((screen) => ({ ...screen, material: new THREE.MeshBasicMaterial(), level: 0, center: null, normal: null }));
  const byMesh = Object.fromEntries(entries.map((entry) => [entry.mesh, entry]));
  const point = new THREE.Vector3();

  const paint = (entry) => entry.material.color.lerpColors(off, on, ease(entry.level));

  return {
    // The material for a screen mesh, by its name.
    materialFor: (name) => byMesh[name]?.material,

    // Pick targets: hovering anywhere on a device counts.
    targets: () => Object.fromEntries(entries.map((entry) => [entry.object, entry])),

    // Measures where each screen sits, once the desk has loaded.
    place(root) {
      for (const entry of entries) {
        const { center, normal } = measureScreen(root.getObjectByName(entry.mesh), entry.flat);
        Object.assign(entry, { center, normal });
      }
    },

    setColors(offColor, onColor, strength) {
      off.set(offColor);
      on.set(onColor);
      GLOW.uGlowColor.value.set(onColor);
      GLOW.uGlowStrength.value = strength;
      entries.forEach(paint);
    },

    // hovered is the pick target under the cursor (one of these entries, or something else).
    update(dt, hovered, camera, instant) {
      const view = camera.matrixWorldInverse;
      entries.forEach((entry, i) => {
        const target = entry === hovered ? 1 : 0;
        const step = instant ? 1 : dt / (target ? ON_SECONDS : OFF_SECONDS);
        const level = THREE.MathUtils.clamp(entry.level + Math.sign(target - entry.level) * step, 0, 1);
        if (level !== entry.level) {
          entry.level = level;
          paint(entry);
        }
        GLOW.uGlowLevel.value.setComponent(i, ease(entry.level));
        if (!entry.center) return;
        GLOW.uGlowPos.value[i].copy(entry.center).applyMatrix4(view);
        GLOW.uGlowDir.value[i].copy(entry.normal).transformDirection(view);
      });
    },

    get lit() { return entries.some(({ level }) => level > 0); },
  };
}
