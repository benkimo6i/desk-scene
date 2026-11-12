// Drag the notebook's cover to open or close it. The cover turns about the coil, following the
// cursor; let go past halfway and it settles open (to the left, resting on the phone), otherwise
// it falls back shut. The pen can draw on the page only while it is open (penDrawing.js).
import * as THREE from 'three';

const FLAT = Math.PI; // open with nothing in the way: flat on the desk
const LIMIT_PRECISION = 1e-4; // radians, when finding where the cover comes to rest
const SAMPLES = 12; // per side of each obstacle's top, when testing it against the cover
const MIN_REACH = 0.04; // m: a grab right by the coil still turns the cover at a usable rate
const SETTLE_RATE = 12; // per second: how fast the cover eases to rest after a drag
const clamp = THREE.MathUtils.clamp;

// restOn: objects the open cover lands on (the phone), so it stops on top of them.
export function createNotebook(root, element, getCamera, { reduceMotion, blocked, restOn = [] }) {
  const cover = root.getObjectByName('Notebook_Cover');
  const parts = [];
  cover.traverse((o) => { if (o.isMesh) parts.push(o); });
  root.updateMatrixWorld(true);

  // The hinge is the cover's local Y in Blender, which is -Z here: opening turns +X (the
  // board) up and over, so the angle runs about +Z.
  const closed = cover.quaternion.clone();
  const turn = new THREE.Quaternion();
  const AXIS = new THREE.Vector3(0, 0, 1);
  // The plane the cover turns in, in world space, measured with the cover shut.
  const pivot = cover.getWorldPosition(new THREE.Vector3());
  const shut = cover.getWorldQuaternion(new THREE.Quaternion());
  const across = new THREE.Vector3(1, 0, 0).applyQuaternion(shut); // toward the board, shut
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(shut);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(AXIS.clone().applyQuaternion(shut), pivot);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const OPEN = openLimit();
  let angle = 0, target = 0, grabOffset = 0;
  let dragging = false, over = false, settling = false, swallowClick = false;

  // How far the cover opens: flat, or less when it would land on something (restOn). Points
  // across the top of each obstacle must stay below the board's underside, which, with the
  // cover turned over, is its highest local y.
  function openLimit() {
    const toCover = new THREE.Matrix4().copy(cover.matrixWorld).invert();
    const board = new THREE.Box3();
    const local = new THREE.Matrix4();
    for (const part of parts) {
      part.geometry.computeBoundingBox();
      board.union(part.geometry.boundingBox.clone().applyMatrix4(local.multiplyMatrices(toCover, part.matrixWorld)));
    }
    const points = [];
    for (const object of restOn) {
      const box = new THREE.Box3().setFromObject(object);
      for (let i = 0; i <= SAMPLES; i++) for (let j = 0; j <= SAMPLES; j++) {
        points.push(new THREE.Vector3(
          THREE.MathUtils.lerp(box.min.x, box.max.x, i / SAMPLES), box.max.y, THREE.MathUtils.lerp(box.min.z, box.max.z, j / SAMPLES)));
      }
    }
    const parentWorld = cover.parent.matrixWorld;
    const coverWorld = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const clears = (a) => {
      q.copy(closed).multiply(turn.setFromAxisAngle(AXIS, a));
      coverWorld.multiplyMatrices(parentWorld, local.compose(cover.position, q, cover.scale)).invert();
      return points.every((point) => {
        p.copy(point).applyMatrix4(coverWorld);
        const under = p.x >= board.min.x && p.x <= board.max.x && p.z >= board.min.z && p.z <= board.max.z;
        return !under || p.y >= board.max.y;
      });
    };
    if (clears(FLAT)) return FLAT;
    // The cover only rises as the angle drops, so bisect for the widest angle that clears.
    let low = FLAT / 2, high = FLAT;
    if (import.meta.env.DEV && !clears(low)) console.warn('The notebook cover cannot open past upright; something in restOn is too close to the coil');
    while (high - low > LIMIT_PRECISION) {
      const middle = (low + high) / 2;
      if (clears(middle)) low = middle;
      else high = middle;
    }
    return low;
  }

  function setAngle(value) {
    angle = value;
    cover.quaternion.copy(closed).multiply(turn.setFromAxisAngle(AXIS, angle));
  }

  function ray(clientX, clientY) {
    ndc.set((clientX / innerWidth) * 2 - 1, 1 - (clientY / innerHeight) * 2);
    raycaster.setFromCamera(ndc, getCamera());
  }

  // The cursor in the plane the cover turns in: x across the desk from the coil (toward the
  // shut board), y up from it.
  function cursorAt(clientX, clientY) {
    ray(clientX, clientY);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    hit.sub(pivot);
    return { x: hit.dot(across), y: hit.dot(up) };
  }

  // The cover follows how far across the cursor is, as if pulled by the point that was
  // grabbed (reach from the coil): a straight drag left or right turns it smoothly. Using the
  // cursor's angle about the coil instead made flat drags jump from shut to open at the coil.
  let reach = MIN_REACH;
  const angleAt = ({ x }) => Math.acos(clamp(x / reach, -1, 1));

  // Whether the cursor is on the cover. Nothing stands between it and the camera, so only the
  // cover is tested, which keeps this cheap enough for every frame.
  function isOver(pointer) {
    ray(pointer.x, pointer.y);
    return raycaster.intersectObjects(parts, false).length > 0;
  }

  element.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    if (!over || blocked() || e.pointerType === 'touch' || e.button !== 0) return;
    const start = cursorAt(e.clientX, e.clientY);
    if (start === null) return;
    dragging = swallowClick = true;
    settling = false;
    reach = Math.max(Math.hypot(start.x, start.y), MIN_REACH);
    grabOffset = angle - angleAt(start);
    try { element.setPointerCapture(e.pointerId); } catch { /* the drag still works without capture */ }
  });
  element.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const next = cursorAt(e.clientX, e.clientY);
    if (next !== null) setAngle(clamp(angleAt(next) + grabOffset, 0, OPEN));
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    target = angle > OPEN / 2 ? OPEN : 0;
    settling = true;
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);

  return {
    update(elapsed, pointer, active) {
      over = dragging || (active && !!pointer && isOver(pointer));
      if (!settling) return;
      const step = reduceMotion() ? 1 : 1 - Math.exp(-Math.min(elapsed, 0.05) * SETTLE_RATE);
      const next = angle + (target - angle) * step;
      if (Math.abs(target - next) < 1e-3) {
        setAngle(target);
        settling = false;
      } else {
        setAngle(next);
      }
    },
    get open() { return !dragging && !settling && angle === OPEN; },
    openAngle: OPEN,
    get dragging() { return dragging; },
    get over() { return over; },
    get moving() { return dragging || settling; },
    takeClick() {
      const taken = swallowClick;
      swallowClick = false;
      return taken;
    },
  };
}
