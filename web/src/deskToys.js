// Small cursor interactions on the desk: keys press under the cursor, and the chair
// swivels when the cursor sweeps across it.
import * as THREE from 'three';

const KEY_DEPTH = 0.00105; // just short of flush with the keyboard body
const KEY_DOWN_SECONDS = 0.05;
const KEY_UP_SECONDS = 0.2;
const KEY_MARGIN = 0.0012;
const CHAIR_PUSH = 34;
const CHAIR_MAX = THREE.MathUtils.degToRad(12);
const CHAIR_FREQUENCY = 8;
const CHAIR_DAMPING = 0.24;

// The keys are one merged mesh, so group its vertices back into separate keys.
function splitKeys(mesh) {
  const position = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const parent = Array.from({ length: position.count }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const union = (a, b) => { parent[find(a)] = find(b); };
  const samePlace = new Map();
  for (let i = 0; i < position.count; i++) {
    const id = [position.getX(i), position.getY(i), position.getZ(i)].map((v) => Math.round(v * 1e5)).join();
    if (samePlace.has(id)) union(i, samePlace.get(id));
    else samePlace.set(id, i);
  }
  for (let i = 0; i < index.count; i += 3) {
    union(index.getX(i), index.getX(i + 1));
    union(index.getX(i), index.getX(i + 2));
  }
  const groups = new Map();
  for (let i = 0; i < position.count; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  return [...groups.values()].map((vertices) => {
    const xs = vertices.map((v) => position.getX(v));
    const zs = vertices.map((v) => position.getZ(v));
    return {
      vertices,
      rest: vertices.map((v) => position.getY(v)),
      left: Math.min(...xs) - KEY_MARGIN,
      right: Math.max(...xs) + KEY_MARGIN,
      back: Math.min(...zs) - KEY_MARGIN,
      front: Math.max(...zs) + KEY_MARGIN,
      press: 0,
    };
  });
}

export function createDeskToys(root) {
  const keysMesh = root.getObjectByName('Keyboard_Keys');
  const chair = root.getObjectByName('Chair');
  keysMesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const keys = splitKeys(keysMesh);
  const chairRest = chair.quaternion.clone();
  const raycaster = new THREE.Raycaster();
  const screenPoint = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const swing = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const keyboardOrigin = new THREE.Vector3();
  let angle = 0, spin = 0, lastX = null;

  function keyUnderCursor() {
    keysMesh.getWorldPosition(keyboardOrigin);
    plane.setFromNormalAndCoplanarPoint(up, keyboardOrigin);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    keysMesh.worldToLocal(hit);
    return keys.find((k) => hit.x > k.left && hit.x < k.right && hit.z > k.back && hit.z < k.front) ?? null;
  }

  function update(camera, elapsed, pointer, active) {
    const dt = Math.min(elapsed, 0.05);
    const tracking = active && pointer;
    let over = null, overChair = false;
    if (tracking) {
      screenPoint.set((pointer.x / innerWidth) * 2 - 1, 1 - (pointer.y / innerHeight) * 2);
      raycaster.setFromCamera(screenPoint, camera);
      over = keyUnderCursor();
      overChair = raycaster.intersectObject(chair, true).length > 0;
    }

    const position = keysMesh.geometry.attributes.position;
    let changed = false;
    for (const key of keys) {
      const target = key === over ? 1 : 0;
      if (key.press === target) continue;
      const step = dt / (target ? KEY_DOWN_SECONDS : KEY_UP_SECONDS);
      key.press = target ? Math.min(key.press + step, 1) : Math.max(key.press - step, 0);
      key.vertices.forEach((v, i) => position.setY(v, key.rest[i] - key.press * KEY_DEPTH));
      changed = true;
    }
    if (changed) position.needsUpdate = true;

    if (elapsed > 0) {
      const speed = tracking && lastX !== null ? (pointer.x - lastX) / innerHeight / elapsed : 0;
      lastX = tracking ? pointer.x : null;
      const push = overChair ? THREE.MathUtils.clamp(speed, -4, 4) * CHAIR_PUSH : 0;
      spin += (push - CHAIR_FREQUENCY ** 2 * angle - 2 * CHAIR_DAMPING * CHAIR_FREQUENCY * spin) * dt;
      angle = THREE.MathUtils.clamp(angle + spin * dt, -CHAIR_MAX, CHAIR_MAX);
      chair.quaternion.copy(swing.setFromAxisAngle(up, angle)).multiply(chairRest);
    }
  }

  return {
    update,
    keys,
    get chairAngle() { return angle; },
    get moving() { return Math.abs(angle) > 1e-4 || keys.some((key) => key.press > 0); },
  };
}
