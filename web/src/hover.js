// Pencils and leaves that get pushed by the cursor and spring back.
// Each part pivots at its base. A cursor sweeping past pushes it in the direction of
// travel, so the effect depends on the movement, not just on being over the object.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const HIT_RADIUS = 0.04; // fraction of the viewport height
const PUSH = 42; // sideways acceleration per screen-height/second of cursor speed
const MAX_CURSOR_SPEED = 4; // screen heights per second
const MAX_STEP = 1 / 30;

const degrees = THREE.MathUtils.degToRad;
const PART_TYPES = [
  { match: /^PencilCup_(Pencil_\d+|Ruler)$/, maxTilt: degrees(7), frequency: 15, damping: 0.2 },
  { match: /^Plant_Leaf_\d+$/, maxTilt: degrees(20), frequency: 10, damping: 0.3 },
];

function segmentDistance2D(a, b, c, d) {
  const toSegment = (p, s, e) => {
    const ex = e.x - s.x, ey = e.y - s.y;
    const len = ex * ex + ey * ey;
    const t = len ? THREE.MathUtils.clamp(((p.x - s.x) * ex + (p.y - s.y) * ey) / len, 0, 1) : 0;
    return Math.hypot(p.x - s.x - ex * t, p.y - s.y - ey * t);
  };
  const side = (p, s, e) => (e.x - s.x) * (p.y - s.y) - (e.y - s.y) * (p.x - s.x);
  const crosses = side(a, c, d) * side(b, c, d) < 0 && side(c, a, b) * side(d, a, b) < 0;
  if (crosses) return 0;
  return Math.min(toSegment(a, c, d), toSegment(b, c, d), toSegment(c, a, b), toSegment(d, a, b));
}

function farthestPoint(object, from) {
  const point = new THREE.Vector3();
  const best = from.clone();
  let bestDistance = 0;
  object.traverse((o) => {
    const position = o.geometry?.attributes.position;
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
      const distance = point.distanceTo(from);
      if (distance > bestDistance) {
        bestDistance = distance;
        best.copy(point);
      }
    }
  });
  return best;
}

export function createHover(root) {
  const parts = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const type = PART_TYPES.find((t) => t.match.test(object.name));
    if (!type) return;
    const base = object.getWorldPosition(new THREE.Vector3());
    // Slightly different springs keep the parts from moving in lockstep.
    const variation = 0.85 + ((parts.length * 0.37) % 1) * 0.3;
    parts.push({
      object,
      type,
      base,
      tip: farthestPoint(object, base),
      rest: object.quaternion.clone(),
      toParent: object.parent.getWorldQuaternion(new THREE.Quaternion()).invert(),
      stiffness: (type.frequency * variation) ** 2,
      resistance: 2 * type.damping * type.frequency * variation,
      tilt: new THREE.Vector2(),
      spin: new THREE.Vector2(),
    });
  });

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const cursor = new THREE.Vector2();
  const lastCursor = new THREE.Vector2();
  let hasCursor = false;
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return; // touch behavior is still to be decided
    cursor.set(e.clientX, e.clientY);
    if (!hasCursor) lastCursor.copy(cursor);
    hasCursor = true;
  });

  const screenBase = new THREE.Vector2();
  const screenTip = new THREE.Vector2();
  const projected = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const swing = new THREE.Quaternion();
  const push = new THREE.Vector2();

  const toScreen = (world, out, camera, width, height) => {
    projected.copy(world).project(camera);
    return out.set((projected.x * 0.5 + 0.5) * width, (0.5 - projected.y * 0.5) * height);
  };

  function update(camera, elapsed, enabled = true) {
    const dt = Math.min(elapsed, MAX_STEP);
    if (dt <= 0) return;
    const width = innerWidth, height = innerHeight;
    camera.getWorldDirection(forward).setY(0).normalize();
    right.crossVectors(forward, UP);

    // Cursor speed in screen heights per second. Moving up the screen reads as moving
    // away from the camera, so the desk behaves like the plane under the cursor.
    let speedX = (cursor.x - lastCursor.x) / height / elapsed;
    let speedY = (cursor.y - lastCursor.y) / height / elapsed;
    const speed = Math.hypot(speedX, speedY);
    if (speed > MAX_CURSOR_SPEED) {
      speedX *= MAX_CURSOR_SPEED / speed;
      speedY *= MAX_CURSOR_SPEED / speed;
    }
    const moved = enabled && speed > 0 && !reduceMotion.matches;
    const radius = HIT_RADIUS * height;

    for (const part of parts) {
      push.set(0, 0);
      if (moved) {
        toScreen(part.base, screenBase, camera, width, height);
        toScreen(part.tip, screenTip, camera, width, height);
        const distance = segmentDistance2D(lastCursor, cursor, screenBase, screenTip);
        if (distance < radius) {
          const strength = PUSH * (1 - distance / radius) ** 2;
          push.set(
            (right.x * speedX - forward.x * speedY) * strength,
            (right.z * speedX - forward.z * speedY) * strength,
          );
        }
      }

      part.spin.x += (push.x - part.stiffness * part.tilt.x - part.resistance * part.spin.x) * dt;
      part.spin.y += (push.y - part.stiffness * part.tilt.y - part.resistance * part.spin.y) * dt;
      part.tilt.addScaledVector(part.spin, dt);
      if (part.tilt.length() > part.type.maxTilt) {
        part.tilt.setLength(part.type.maxTilt);
        part.spin.multiplyScalar(0.5);
      }

      const angle = part.tilt.length();
      if (angle > 1e-5) {
        // Turning around up × tilt leans the top of the part in the tilt direction.
        axis.set(part.tilt.y, 0, -part.tilt.x).normalize().applyQuaternion(part.toParent);
        part.object.quaternion.copy(swing.setFromAxisAngle(axis, angle)).multiply(part.rest);
      } else {
        part.object.quaternion.copy(part.rest);
      }
    }
    lastCursor.copy(cursor);
  }

  return { update, parts };
}
