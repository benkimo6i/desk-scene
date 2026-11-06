// Camera move between the desk view and a blank screen filling the window, plus the
// hover and click targeting. Going in, the screen content fades to blank (fade 0 to 1),
// a flat screen floats up (lift 0 to 1), then the camera pushes in (t 0 to 1). Going back runs the same steps in reverse,
// so changing direction mid-move just works.
import * as THREE from 'three';

const DURATION = 1.2;
const FADE_SECONDS = 0.25;
const LIFT_SECONDS = 0.5;
const LIFT_TOWARD_CAMERA = 0.25; // share of the way from the desk to the camera
const LIFT_RAISE = 0.05;
const FILL = 0.985; // slightly past the edges, so no bezel shows at the swap
const APPROACH = 0.9; // metres in front of the screen where the path straightens out

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const liftEase = (x) => 1 + 1.6 * (x - 1) ** 3 + 0.6 * (x - 1) ** 2; // eases out with a slight settle
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

export function measureScreen(mesh, flat = false) {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.attributes.position;
  const worldUp = new THREE.Vector3(0, 1, 0);
  // A screen lying flat faces straight up, and its own top edge becomes "up" for the camera.
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
  return { center, normal, up, width: extent(right), height: extent(up) };
}

export function createFlight(screens, { requestFrames, reduceMotion }) {
  const measured = new Map(Object.entries(screens));
  const state = { t: 0, fade: 0, lift: 0, lifts: false, direction: 0, screen: null, onArrive: null };
  const end = new THREE.Vector3();
  const control = new THREE.Vector3();
  const endQuaternion = new THREE.Quaternion();
  const look = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  const isHome = () => state.t === 0 && state.fade === 0 && state.lift === 0;

  function apply(camera) {
    if (!state.screen) return;
    const s = measured.get(state.screen);
    const height = Math.min(s.height, s.width / camera.aspect) * FILL;
    const distance = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    end.copy(s.center).addScaledVector(s.normal, distance);
    control.copy(s.center).addScaledVector(s.normal, APPROACH);
    endQuaternion.setFromRotationMatrix(look.lookAt(end, s.center, s.up));
    const e = easeInOut(state.t);
    a.lerpVectors(camera.position, control, e);
    b.lerpVectors(control, end, e);
    camera.position.lerpVectors(a, b, e);
    camera.quaternion.slerp(endQuaternion, smooth(0, 0.65, state.t));
  }

  return {
    state,
    get atDesk() { return isHome() && state.direction === 0; },
    update(camera, elapsed) {
      const step = Math.min(elapsed, 0.05) * (reduceMotion.matches ? 100 : 1);
      if (state.direction > 0) {
        if (state.fade < 1) {
          state.fade = Math.min(state.fade + step / FADE_SECONDS, 1);
        } else if (state.lifts && state.lift < 1) {
          state.lift = Math.min(state.lift + step / LIFT_SECONDS, 1);
        } else {
          state.t = Math.min(state.t + step / DURATION, 1);
          if (state.t === 1) {
            state.direction = 0;
            const arrive = state.onArrive;
            state.onArrive = null;
            arrive?.();
          }
        }
      } else if (state.direction < 0) {
        if (state.t > 0) {
          state.t = Math.max(state.t - step / DURATION, 0);
        } else if (state.lift > 0) {
          state.lift = Math.max(state.lift - step / LIFT_SECONDS, 0);
        } else {
          state.fade = Math.max(state.fade - step / FADE_SECONDS, 0);
          if (state.fade === 0) state.direction = 0;
        }
      }
      apply(camera);
    },
    flyTo(page, onArrive) {
      if (isHome()) {
        state.screen = page.screen;
        state.lifts = Boolean(page.flat);
      }
      state.direction = 1;
      state.onArrive = onArrive;
      requestFrames();
    },
    flyHome() {
      if (isHome()) return;
      state.direction = -1;
      state.onArrive = null;
      requestFrames();
    },
    parkAt(page) {
      state.screen = page.screen;
      state.t = 1;
      state.fade = 1;
      state.lifts = Boolean(page.flat);
      state.lift = state.lifts ? 1 : 0;
      state.direction = 0;
    },
  };
}

// Floats a flat object up to face the camera, so the push runs straight in with no tip or roll.
export function createPhoneLift(phone, screen, eye) {
  phone.updateWorldMatrix(true, true);
  const restPosition = phone.position.clone();
  const restQuaternion = phone.quaternion.clone();
  const localCenter = phone.worldToLocal(screen.center.clone());
  const center = screen.center.clone().lerp(eye, LIFT_TOWARD_CAMERA);
  center.y += LIFT_RAISE;
  const normal = eye.clone().sub(center).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const up = worldUp.clone().addScaledVector(normal, -worldUp.dot(normal)).normalize();
  const right = new THREE.Vector3().crossVectors(up, normal);
  // Local axes of the phone: x right, y out of the screen, -z toward its top edge.
  const liftedQuaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, normal, up.clone().negate()),
  );
  const liftedPosition = center.clone().sub(localCenter.applyQuaternion(liftedQuaternion));
  return {
    screen: { ...screen, center, normal, up },
    apply(progress) {
      const e = liftEase(progress);
      phone.position.lerpVectors(restPosition, liftedPosition, e);
      phone.quaternion.slerpQuaternions(restQuaternion, liftedQuaternion, e);
    },
  };
}

const isVisible = (object) => {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
};

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
