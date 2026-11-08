// What the cursor is over, and where a screen sits in the room.
import * as THREE from 'three';

// A screen's center, facing direction and size, in world space. A flat screen (the phone)
// faces straight up.
export function measureScreen(mesh, flat = false) {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.attributes.position;
  const worldUp = new THREE.Vector3(0, 1, 0);
  const normal = flat ? worldUp.clone() : new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal, 0)
    .transformDirection(mesh.matrixWorld);
  const up = flat ? new THREE.Vector3(0, 0, -1).transformDirection(mesh.matrixWorld)
    : worldUp.clone().addScaledVector(normal, -worldUp.dot(normal)).normalize();
  const right = new THREE.Vector3().crossVectors(up, normal);
  const corners = Array.from({ length: position.count }, (_, i) => new THREE.Vector3()
    .fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  const center = corners.reduce((sum, c) => sum.add(c), new THREE.Vector3()).multiplyScalar(1 / corners.length);
  const extent = (axis) => {
    const values = corners.map((c) => c.dot(axis));
    return Math.max(...values) - Math.min(...values);
  };
  return { center, normal, up, right, width: extent(right), height: extent(up) };
}

const isVisible = (object) => {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
};

// Returns the target for the first named object under the cursor, or null.
// objects maps an object name to its target; a hit on any child counts for its parent.
export function createPicker(targets, objects) {
  const raycaster = new THREE.Raycaster();
  const point = new THREE.Vector2();
  return (camera, clientX, clientY) => {
    point.set((clientX / innerWidth) * 2 - 1, 1 - (clientY / innerHeight) * 2);
    raycaster.setFromCamera(point, camera);
    const hit = raycaster.intersectObjects(targets, true).find((h) => isVisible(h.object));
    for (let o = hit?.object; o; o = o.parent) {
      if (objects[o.name]) return objects[o.name];
    }
    return null;
  };
}
