// Press and drag the pen to write on the loose sheet. The tip follows the cursor across
// the desk, and ink lands only on the sheet. Ink stays until the page reloads.
import * as THREE from 'three';

const PEN_HALF_LENGTH = 0.07; // from the pen's center to its tip
const GRAB_PIXELS = 16; // the pen is thin, so it has a forgiving reach on screen
const LIFT_SECONDS = 0.16;
const RETURN_SECONDS = 0.35;
const WRITING_TILT = new THREE.Vector3(0.35, 0.9, 0.25).normalize();
const DESK_LIMITS = { left: -0.85, right: 0.85, back: -0.4, front: 0.4 };
const CANVAS_WIDTH = 768;
const INK_THIN = 11;
const INK_THICK = 18;
const FAST_STROKE = 70; // canvas pixels per pointer event

const clamp = THREE.MathUtils.clamp;
const ease = (x) => x * x * (3 - 2 * x);

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

export function createPenDrawing(root, element, getCamera) {
  const pen = root.getObjectByName('Pen');
  const sheet = root.getObjectByName('LooseSheet_Sheet');
  root.updateMatrixWorld(true);
  const sheetBox = new THREE.Box3().setFromObject(sheet);
  const sheetTop = sheetBox.max.y;
  const sheetWidth = sheetBox.max.x - sheetBox.min.x;
  const sheetDepth = sheetBox.max.z - sheetBox.min.z;

  // Ink is drawn in white and tinted by the material, so it can follow the palette.
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = Math.round((CANVAS_WIDTH * sheetDepth) / sheetWidth);
  const context = canvas.getContext('2d');
  context.strokeStyle = '#fff';
  context.lineCap = context.lineJoin = 'round';
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ink = new THREE.Mesh(new THREE.PlaneGeometry(sheetWidth, sheetDepth).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  ink.position.set((sheetBox.min.x + sheetBox.max.x) / 2, sheetTop + 0.0003, (sheetBox.min.z + sheetBox.max.z) / 2);
  root.add(ink);

  const restPosition = pen.position.clone();
  const restQuaternion = pen.quaternion.clone();
  const writeQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), WRITING_TILT);
  const tipRest = new THREE.Vector3(0, -PEN_HALF_LENGTH, 0).applyQuaternion(restQuaternion).add(restPosition);
  const topRest = new THREE.Vector3(0, PEN_HALF_LENGTH, 0).applyQuaternion(restQuaternion).add(restPosition);
  const tip = tipRest.clone();
  const writePosition = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -sheetTop);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  let dragging = false, over = false, hold = 0, swallowClick = false, dirty = false;
  let last = null; // the previous ink point, while the tip is on the sheet
  let lastMiddle = null;

  // Moves the tip under the cursor and returns the point on the sheet, if it's on it.
  function aim(clientX, clientY) {
    ndc.set((clientX / innerWidth) * 2 - 1, 1 - (clientY / innerHeight) * 2);
    raycaster.setFromCamera(ndc, getCamera());
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    tip.set(clamp(hit.x, DESK_LIMITS.left, DESK_LIMITS.right), sheetTop, clamp(hit.z, DESK_LIMITS.back, DESK_LIMITS.front));
    const onSheet = hit.x > sheetBox.min.x && hit.x < sheetBox.max.x && hit.z > sheetBox.min.z && hit.z < sheetBox.max.z;
    if (!onSheet) return null;
    return {
      x: ((hit.x - sheetBox.min.x) / sheetWidth) * canvas.width,
      y: ((hit.z - sheetBox.min.z) / sheetDepth) * canvas.height,
    };
  }

  function drawTo(point) {
    if (!point) {
      last = lastMiddle = null;
      return;
    }
    if (!last) {
      last = lastMiddle = point;
      context.lineWidth = INK_THIN;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(point.x + 0.01, point.y);
      context.stroke();
      dirty = true;
      return;
    }
    const step = Math.hypot(point.x - last.x, point.y - last.y);
    if (step < 2) return;
    const middle = { x: (last.x + point.x) / 2, y: (last.y + point.y) / 2 };
    // Faster movement draws a slightly thinner line.
    context.lineWidth = THREE.MathUtils.lerp(INK_THICK, INK_THIN, clamp(step / FAST_STROKE, 0, 1));
    context.beginPath();
    context.moveTo(lastMiddle.x, lastMiddle.y);
    context.quadraticCurveTo(last.x, last.y, middle.x, middle.y);
    context.stroke();
    last = point;
    lastMiddle = middle;
    dirty = true;
  }

  element.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    if (!over || e.pointerType === 'touch' || e.button !== 0) return;
    dragging = swallowClick = true;
    try { element.setPointerCapture(e.pointerId); } catch { /* the drag still works without capture */ }
    drawTo(aim(e.clientX, e.clientY));
  });
  element.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const moves = e.getCoalescedEvents?.() ?? [];
    for (const move of moves.length ? moves : [e]) drawTo(aim(move.clientX, move.clientY));
  });
  const release = () => {
    dragging = false;
    last = lastMiddle = null;
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);

  function update(elapsed, pointer, active) {
    const camera = getCamera();
    const dt = Math.min(elapsed, 0.05);
    if (!dragging && active && pointer) {
      a.copy(tipRest).project(camera);
      b.copy(topRest).project(camera);
      const toPixels = (v) => ({ x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight });
      over = distanceToSegment(pointer, toPixels(a), toPixels(b)) < GRAB_PIXELS;
    } else if (!dragging) {
      over = false;
    }

    hold = clamp(hold + (dragging ? dt / LIFT_SECONDS : -dt / RETURN_SECONDS), 0, 1);
    if (hold > 0) {
      const e = ease(hold);
      writePosition.copy(tip).addScaledVector(WRITING_TILT, PEN_HALF_LENGTH);
      pen.position.lerpVectors(restPosition, writePosition, e);
      pen.quaternion.slerpQuaternions(restQuaternion, writeQuaternion, e);
    } else {
      pen.position.copy(restPosition);
      pen.quaternion.copy(restQuaternion);
      tip.copy(tipRest);
    }
    if (dirty) {
      texture.needsUpdate = true;
      dirty = false;
    }
  }

  return {
    ink,
    update,
    get dragging() { return dragging; },
    get moving() { return hold > 0; },
    get over() { return over; },
    setInk(color) { ink.material.color.set(color); },
    takeClick() {
      const taken = swallowClick;
      swallowClick = false;
      return taken;
    },
  };
}
