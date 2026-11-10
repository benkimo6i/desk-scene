// The monitor, laptop and phone screens. Each is dark until the cursor is over its device, then
// lights up flat in the screen's color. Only the screen face changes: a glow spilling onto the
// desk didn't match the flat light of the lamp and sun (user, 2026-11-09).
import * as THREE from 'three';

const ON_SECONDS = 0.15;
const OFF_SECONDS = 0.4;

const SCREENS = [
  { object: 'Monitor', mesh: 'Monitor_Screen' },
  { object: 'Laptop', mesh: 'Laptop_Screen' },
  { object: 'Phone', mesh: 'Phone_Screen' },
];

const ease = (x) => x * x * (3 - 2 * x);

export function createScreens() {
  const off = new THREE.Color();
  const on = new THREE.Color();
  const entries = SCREENS.map((screen) => ({ ...screen, material: new THREE.MeshBasicMaterial(), level: 0 }));
  const byMesh = Object.fromEntries(entries.map((entry) => [entry.mesh, entry]));

  const paint = (entry) => entry.material.color.lerpColors(off, on, ease(entry.level));

  return {
    // The material for a screen mesh, by its name.
    materialFor: (name) => byMesh[name]?.material,

    // Pick targets: hovering anywhere on a device counts.
    targets: () => Object.fromEntries(entries.map((entry) => [entry.object, entry])),

    setColors(offColor, onColor) {
      off.set(offColor);
      on.set(onColor);
      entries.forEach(paint);
    },

    // hovered is the pick target under the cursor (one of these entries, or something else).
    update(dt, hovered, instant) {
      for (const entry of entries) {
        const target = entry === hovered ? 1 : 0;
        const step = instant ? 1 : dt / (target ? ON_SECONDS : OFF_SECONDS);
        const level = THREE.MathUtils.clamp(entry.level + Math.sign(target - entry.level) * step, 0, 1);
        if (level !== entry.level) {
          entry.level = level;
          paint(entry);
        }
      }
    },

    get lit() { return entries.some(({ level }) => level > 0); },
  };
}
