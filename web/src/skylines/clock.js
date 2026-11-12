// A tower clock that keeps real time in its city: a cream face and two dark hands. The
// minute hand steps once a minute and the hour hand creeps with it, like a real tower clock.
// The hands sit on the city-light camera layer, so the ink pass leaves them crisp.
import * as THREE from 'three';
import { hazeMaterial, setHaze } from './atmosphere.js';
import { CITY_LAYER } from './cityLights.js';

const MINUTE = 60000;
const HAND_DEPTH = 0.01; // just in front of the face

// spec is { x, y, r, zone } in skyline units; z puts the face in front of its tower.
export function createClock({ x, y, r, zone }, layer, z) {
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 32), hazeMaterial());
  face.position.set(x, y, z);
  const handMaterial = hazeMaterial();
  const hand = (length, width) => {
    const geometry = new THREE.PlaneGeometry(width, length);
    geometry.translate(0, length / 2 - width / 2, 0); // turns about its base, at the face's center
    const mesh = new THREE.Mesh(geometry, handMaterial);
    mesh.position.set(x, y, z + HAND_DEPTH);
    mesh.layers.set(CITY_LAYER);
    return mesh;
  };
  const hourHand = hand(r * 0.52, r * 0.14);
  const minuteHand = hand(r * 0.8, r * 0.1);
  layer.add(face, hourHand, minuteHand);

  const time = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', hour: 'numeric', minute: 'numeric' });
  let shownMinute = -1;
  return {
    face,
    update(now = Date.now()) {
      const minute = Math.floor(now / MINUTE);
      if (minute === shownMinute) return;
      shownMinute = minute;
      const { hour, minute: m } = Object.fromEntries(time.formatToParts(now).map(({ type, value }) => [type, Number(value)]));
      minuteHand.rotation.z = -(m / 60) * Math.PI * 2;
      hourHand.rotation.z = -(((hour % 12) + m / 60) / 12) * Math.PI * 2;
    },
    apply(faceColor, handColor) {
      setHaze(face.material, faceColor, faceColor);
      setHaze(handMaterial, handColor, handColor);
    },
  };
}
