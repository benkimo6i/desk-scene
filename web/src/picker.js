// What the cursor is over.
import * as THREE from 'three';

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
