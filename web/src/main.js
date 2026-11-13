// The desk scene. Rebuilds the Blender preview look in real time:
// two sun lights with the same strengths as Blender, a three-step colour ramp,
// and a screen-space pass for ink lines.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { CITY_LAYER, createCityLights } from './skylines/cityLights.js';
import { createClock } from './skylines/clock.js';
import { GRAIN_FINISH, GRAIN_GLSL, createSky, hazeMaterial, setHaze } from './skylines/atmosphere.js';
import { createDogHover } from './dogHover.js';
import { createHover } from './hover.js';
import { createPicker } from './picker.js';
import { createScreens } from './screens.js';
import { LAMP, PALETTES, initialPalette, periodAt, setBackground } from './palettes.js';
import { CITIES } from './cities.js';
import { createDeskToys } from './deskToys.js';
import { createPenDrawing } from './penDrawing.js';
import { createNotebook } from './notebook.js';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // redrawn only when something in the room moves
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color();

// Blender (x, y, z) -> three (x, z, -y)
const key = new THREE.DirectionalLight('#fff', 8);
key.position.set(-1, 0.55, 0.8).normalize().multiplyScalar(6).add(new THREE.Vector3(0, 0.7, 0));
key.target.position.set(0, 0.7, 0);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 20 });
key.shadow.camera.updateProjectionMatrix();
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.004;
key.shadow.radius = 1.2;
const fill = new THREE.DirectionalLight('#fff', 0.62);
fill.position.set(0.2, 1, 0.3);
scene.add(key, key.target, fill);

// The hidden room shell from Blender. It only blocks sunlight, so the sun reaches the
// room through the window alone. It never draws on camera or in the outline pass.
const shellMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
const shell = new THREE.Group();
scene.add(shell);

// marked adds the dog's dark nose, eye and pads, read from the mesh's vertex colors, and its
// breathing. The edge is drawn here, so it stays a clean curve between vertices.
function toonMaterial(tones, marked = false) {
  // Both sides cast shadows. With the default, walls cast from their room-facing side,
  // which is flush with the corner and lets a hairline of sun through.
  const m = new THREE.MeshLambertMaterial({ color: '#fff', shadowSide: THREE.DoubleSide });
  if (marked) m.customProgramCacheKey = () => 'marked'; // otherwise it shares the plain program
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, tones);
    if (marked) {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 color;
          uniform float uBreath;
          varying float vMark;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vMark = color.g;
          transformed += objectNormal * uBreath * color.r;`);
    }
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        ${marked ? 'varying float vMark; uniform vec3 uDark;' : ''}
        uniform vec3 uLit, uShadow, uDeep, uRimColor;
        uniform float uRim;
        ${GRAIN_GLSL}`)
      .replace('#include <opaque_fragment>', `
        float rim = (1.0 - abs(dot(normalize(vViewPosition), normal))) * step(0.0, normal.y);
        float n = grainAt(gl_FragCoord.xy / 1.5);
        float base = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        // Roughen only the sunlit edge; noise on the blue-to-blue step reads as blotches.
        float v = base + (n - 0.5) * 0.10;
        vec3 tone = base < 0.10 ? uDeep : (v < 0.30 ? uShadow : uLit);
        ${marked ? 'if (vMark > 0.5) tone = uDark * 0.7;' : ''}
        if (uRim > 0.5 && rim + (n - 0.5) * 0.04 > 0.66) tone = mix(tone, uRimColor, 0.55);
        outgoingLight = tone * ${GRAIN_FINISH};
        #include <opaque_fragment>`);
  };
  return m;
}
const rimColor = { value: new THREE.Color() };
const rimOn = { value: 0 }; // a soft warm lamp edge on the chair when the lamp is on
const newTones = () => ({
  uLit: { value: new THREE.Color() },
  uShadow: { value: new THREE.Color() },
  uDeep: { value: new THREE.Color() },
  uRim: { value: 0 },
  uRimColor: rimColor,
});
const TONES = Object.fromEntries(Object.keys(PALETTES.afternoon.materials).map((k) => [k, newTones()]));
const MATERIALS = Object.fromEntries(Object.entries(TONES).map(([k, v]) => [k, toonMaterial(v)]));
const chairMaterial = (name) => toonMaterial({ ...TONES[name], uRim: rimOn });
const CHAIR = { M_Main: chairMaterial('M_Main'), M_Dark: chairMaterial('M_Dark') };
const dogBreath = { value: 0 }; // how far the ribs have risen, in metres
const inkLine = { value: new THREE.Color() }; // the outline color, shared with the line pass
const DOG = toonMaterial({ ...TONES.M_Dog, uDark: TONES.M_Dark.uDeep, uBreath: dogBreath }, true);
const screens = createScreens();
const BULB = new THREE.MeshBasicMaterial();
const lampLight = new THREE.SpotLight('#fff', 0, 0, THREE.MathUtils.degToRad(40), 0, 0); // no falloff, so the pool ends on one clean edge
lampLight.shadow.mapSize.set(2048, 2048);
lampLight.castShadow = true; // left on, so toggling the lamp never recompiles the shaders
lampLight.shadow.camera.near = 0.02;
lampLight.shadow.camera.far = 6;
lampLight.shadow.bias = -0.0004;
lampLight.shadow.normalBias = 0.004;
scene.add(lampLight, lampLight.target);
const shellParts = [];
// Each layer fades toward the haze at its base: strongly far away, less so up close.
const LAYERS = [
  { name: 'far', distance: 95, haze: [3, 15], lowShare: 0.4 },
  { name: 'clouds', distance: 85, haze: [0, 1], lowShare: 0 },
  { name: 'front', distance: 80, haze: [2.5, 8], lowShare: 0.25 },
  { name: 'mid', distance: 75, haze: [7, 22], lowShare: 0.25 },
  { name: 'near', distance: 60, haze: [0, 1], lowShare: 0 },
];
const SKYLINE = LAYERS.map(({ haze }) => hazeMaterial(...haze));
// A city's backdrop (Seoul's mountain) sits behind its far layer in a darker tone, so it
// separates from the lighter buildings in front of it, like a ridge in silhouette. Accents
// share the tone.
const BACKDROP = hazeMaterial(...LAYERS[0].haze);
const BACKDROP_DEPTH = 0.6; // how far the backdrop moves from the far tone toward the middle tone
const BACKDROP_STEP = -0.04; // just behind the far layer's first shape
const FRONT_DEPTH = 0.55; // the front row's tone, from the middle tone toward the bridge's
let cityName = null;
let skyline = null; // the shown city's layers, with its night lights and drifting clouds
let sky = null;

// Ink lines come from a normals + depth buffer, so nothing is added to the models.
const size = new THREE.Vector2();
const colorRT = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
const normalRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
normalRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
// RGB holds the view normal, alpha holds an id per mesh. The id gives solid lines where
// two objects meet, even when one is a paper-thin sheet with no real depth step.
// The dog is built from separate parts on one skeleton (dog/build_dog_asset.py): each writes
// DOG_ID + part / 8, so the ink pass can tell a leg lying over the body from the crease where it
// grows out of it. Joint skin (a leg near the shoulder or hip, an ear's root) adds ROOT_STEP and
// draws no line where it grows out of the body, so legs and ears join it without one.
const ROOT_STEP = 0.04; // under half a part step (1 / 16)
const idMaterial = new THREE.ShaderMaterial({
  uniforms: { uId: { value: 0 }, uDog: { value: 0 }, uBreath: { value: 0 } },
  // The skinning chunks keep outlines on the dog when its bones move, and color carries its breath.
  vertexShader: `varying vec3 vN;
    varying float vRoot;
    attribute vec4 color;
    attribute float _root;
    uniform float uBreath, uDog;
    #include <common>
    #include <morphtarget_pars_vertex>
    #include <skinning_pars_vertex>
    void main() {
      #include <beginnormal_vertex>
      #include <morphnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      vN = normalize(normalMatrix * objectNormal);
      vRoot = uDog * _root; // smooth across triangles, so the open stretch ends cleanly
      #include <begin_vertex>
      #include <morphtarget_vertex>
      transformed += objectNormal * uBreath * uDog * color.r;
      #include <skinning_vertex>
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }`,
  fragmentShader: `#define ROOT_STEP ${ROOT_STEP.toFixed(3)}
    varying vec3 vN; varying float vRoot;
    uniform float uId;
    void main() {
      gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, uId + (vRoot > 0.5 ? ROOT_STEP : 0.0));
    }`,
});

const post = new THREE.ShaderMaterial({
  depthTest: false,
  depthWrite: false,
  uniforms: {
    tColor: { value: colorRT.texture },
    tNormal: { value: normalRT.texture },
    tDepth: { value: normalRT.depthTexture },
    uTexel: { value: new THREE.Vector2() },
    uInk: inkLine,
    uNear: { value: 0.1 },
    uFar: { value: 20 },
    tPrev: { value: null },
    uPrev: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    #define ROOT_STEP ${ROOT_STEP.toFixed(3)}
    varying vec2 vUv;
    uniform sampler2D tColor, tNormal, tDepth, tPrev;
    uniform float uPrev;
    uniform vec2 uTexel;
    uniform vec3 uInk;
    uniform float uNear, uFar;
    float depthAt(vec2 uv) {
      float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
      return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
    }
    // Between meshes, any change of id draws a line. Between the dog's parts: legs, tail and
    // ears always get one against each other. Against the body, an ear always does; a leg, the
    // tail or joint skin only where there is a depth step, where it lies over the body.
    float partOf(float a) { return a < 1.5 ? -1.0 : floor((a - 2.0) * 8.0 + 0.5); }
    float rootOf(float a) { return step(0.5 * ROOT_STEP, a - 2.0 - partOf(a) / 8.0); }
    float idEdge(float a, float b, float d, float db) {
      if (a < 1.5 || b < 1.5) return step(0.0005, abs(a - b));
      float pa = partOf(a), pb = partOf(b);
      if (pa == pb) return 0.0;
      if (pa > 0.0 && pb > 0.0) return 1.0;
      float other = pa > 0.0 ? a : b;
      if (partOf(other) >= 6.0 && rootOf(other) < 0.5) return 1.0;
      return step(0.012, abs(db - d) / d);
    }
    void main() {
      vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
      vec4 n = texture2D(tNormal, vUv);
      vec4 nl = texture2D(tNormal, vUv - dx), nr = texture2D(tNormal, vUv + dx);
      vec4 nd = texture2D(tNormal, vUv - dy), nu = texture2D(tNormal, vUv + dy);
      float edgeN = length(nr.xyz - nl.xyz) + length(nu.xyz - nd.xyz);
      float a = n.a;
      float d = depthAt(vUv);
      float dl = depthAt(vUv - dx), dr = depthAt(vUv + dx), dd = depthAt(vUv - dy), du = depthAt(vUv + dy);
      // Second difference: stays zero across a flat surface at any viewing angle.
      float lap = abs(dl + dr - 2.0 * d) + abs(dd + du - 2.0 * d);
      float edge = max(smoothstep(0.25, 0.5, edgeN), smoothstep(0.006, 0.014, lap / d));
      // Where joint skin meets the body, the crease draws nothing either, unless the joint lies in
      // front of a farther part of the body (a real depth step, as in the curled poses).
      float body = 0.0, joint = 0.0;
      for (int k = 0; k < 5; k++) {
        float s = k == 0 ? a : k == 1 ? nl.a : k == 2 ? nr.a : k == 3 ? nd.a : nu.a;
        if (partOf(s) == 0.0) body = 1.0;
        if (partOf(s) > 0.0 && rootOf(s) > 0.5) joint = 1.0;
      }
      float gap = max(max(abs(dl - d), abs(dr - d)), max(abs(dd - d), abs(du - d))) / d;
      if (body * joint > 0.5 && gap < 0.012) edge = 0.0;
      float idGap = max(max(idEdge(a, nl.a, d, dl), idEdge(a, nr.a, d, dr)), max(idEdge(a, nd.a, d, dd), idEdge(a, nu.a, d, du)));
      if (idGap > 0.0) edge = 1.0;
      vec3 c = mix(texture2D(tColor, vUv).rgb, uInk, edge * 0.8);
      if (uPrev > 0.0) c = mix(c, texture2D(tPrev, vUv).rgb, uPrev);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});
const screenScene = new THREE.Scene();
screenScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const screenCam = new THREE.Camera();

// Each loading stage cross-fades in: the last frame is held and fades out over the new one.
// Fading whole frames keeps ink lines and shadows right, which per-object opacity can't.
const STAGE_FADE = 0.3; // seconds
const heldFrames = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
let heldIndex = 0;
let fadeStart = -Infinity;
const updateFade = (now) => {
  post.uniforms.uPrev.value = THREE.MathUtils.clamp(1 - (now - fadeStart) / 1000 / STAGE_FADE, 0, 1);
};
const fadeDone = () => new Promise((done) => setTimeout(done, fadeStart + STAGE_FADE * 1000 - performance.now()));

let camera = new THREE.PerspectiveCamera();
const home = new THREE.Vector3();
const homeAim = new THREE.Vector3();
const mouse = new THREE.Vector2();
const eased = new THREE.Vector2();

// As the browser window narrows, the view keeps the room's window and the desk's laptop,
// monitor and phone in frame; the notebook, pen and the desk's right end may be cut (user,
// 2026-11-12). export_desk.py bakes these objects' boxes into the camera as fitBoxes, in
// this order.
const FIT_OBJECTS = ['Laptop', 'Monitor_Panel', 'Phone'];
// The part of the window that must stay: the right half of its main pane (Blender y 0.15 to
// the jamb at 0.6, sill to head), where the city's landmarks show. The pane's left mullion is
// already out of frame at the hero view.
const WINDOW_PANE = [new THREE.Vector3(-2.0, 0.35, -0.6), new THREE.Vector3(-2.0, 2.75, -0.15)];
const FIT_EDGE = 0.92; // leaves room for the cursor drift
const frameAim = new THREE.Vector3(); // always the hero aim: the camera never turns or tilts
const fitPoints = [];
const fitCheck = new THREE.Vector3();

// The kept points' leftmost and rightmost screen x (-1 to 1), with the lens unshifted.
function fitSpan() {
  camera.position.copy(home);
  camera.lookAt(frameAim);
  camera.updateMatrixWorld();
  let min = Infinity, max = -Infinity;
  for (const point of fitPoints) {
    const x = fitCheck.copy(point).project(camera).x;
    min = Math.min(min, x);
    max = Math.max(max, x);
  }
  return [min, max];
}

// The hero framing has room to spare on the right, so a narrower window first shifts the lens
// sideways (like cropping a wider photo: nothing rotates or tilts, so the scene keeps its
// composition), and only widens the lens, as little as it takes, when shifting isn't enough.
// Earlier versions turned the camera instead, which moved things as the browser resized.
const MAX_FOV = 100;
let baseFov = 0;
let viewShift = 0; // the last lens shift, in screen units (fitClouds needs the left edge)
function frameDesk() {
  baseFov ||= camera.fov;
  frameAim.copy(homeAim);
  camera.fov = baseFov;
  camera.filmOffset = 0;
  camera.updateProjectionMatrix();
  let [min, max] = fitSpan();
  while (max - min > 2 * FIT_EDGE && camera.fov < MAX_FOV) {
    camera.fov = Math.min(camera.fov + 1, MAX_FOV);
    camera.updateProjectionMatrix();
    [min, max] = fitSpan();
  }
  // How far the view must slide (in screen units) to bring both sides inside the edge.
  const shift = min < -FIT_EDGE ? min + FIT_EDGE : max > FIT_EDGE ? max - FIT_EDGE : 0;
  // three slides the frustum by near * filmOffset / filmWidth, and its half-width at near is
  // near * aspect * tan(fov / 2), so this filmOffset slides the view by shift screen units.
  camera.filmOffset = shift * camera.aspect * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.getFilmWidth();
  camera.updateProjectionMatrix();
  viewShift = shift;
  return shift;
}

function resize(w = innerWidth, h = innerHeight) {
  renderer.setSize(w, h, false);
  renderer.getDrawingBufferSize(size);
  colorRT.setSize(size.x, size.y);
  normalRT.setSize(size.x, size.y);
  heldFrames.forEach((target) => target.setSize(size.x, size.y));
  post.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (fitPoints.length) {
    frameDesk();
    fitClouds();
  }
}
addEventListener('resize', () => resize());
addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
});

const SUN_DISTANCE = 10;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const BREATH_DEPTH = 0.01, BREATH_SECONDS = 4.6;
let dogMixer = null;
let dogClips = {};
let dogParts = []; // the dog's meshes, one per part, sharing one skeleton
let dogHover = null;
let dogBlockers = []; // the chair sits between the camera and part of the bed
let pointerMoved = false;
const dogRay = new THREE.Raycaster();
const LAMP_TARGET = { lamp: true };
let deskReady = false; // the big pieces have landed and respond to the cursor
let hover = null;
let toys = null;
let pen = null;
let notebook = null;
let pick = null;
let hovered = null;
let pointer = null;
let lastFrame = performance.now();

let shadowsDirty = true;
const isRoomMoving = () => hover?.moving || toys?.moving || pen?.moving || notebook?.moving;

function requestFrames() {
  lastFrame = performance.now();
  renderer.setAnimationLoop(render);
}

function isOverDog() {
  if (!pointer || !dogHover.kind) return false;
  dogRay.setFromCamera({ x: (pointer.x / innerWidth) * 2 - 1, y: 1 - (pointer.y / innerHeight) * 2 }, camera);
  return dogParts.includes(dogRay.intersectObjects([...dogParts, ...dogBlockers], false)[0]?.object);
}

function updatePointerTarget() {
  hovered = pointer && !pen?.dragging && !notebook?.dragging ? pick(camera, pointer.x, pointer.y) : null;
}

// The dog holds one sleeping position per period, switched with the rest of the palette.
// "Away" leaves its bed empty, as if it were out for a walk.
// In development, ?pose=Name shows that clip in every period, for reviewing poses.
const REVIEW_POSE = import.meta.env.DEV ? new URLSearchParams(location.search).get('pose') : null;
function setDogPose(name, reaction) {
  if (!dogMixer) return;
  if (REVIEW_POSE && name !== 'Away') name = REVIEW_POSE;
  dogHover.settle();
  for (const part of dogParts) part.visible = name !== 'Away';
  // The donut lays its ears back along the neck (the ears' "Folded" shape key, build_dog_asset.py).
  for (const part of dogParts) {
    const folded = part.morphTargetDictionary?.Folded;
    if (folded !== undefined) part.morphTargetInfluences[folded] = name.startsWith('Donut') ? 1 : 0;
  }
  dogMixer.stopAllAction();
  if (dogClips[name]) dogMixer.clipAction(dogClips[name]).play();
  dogMixer.update(0);
  for (const part of dogParts) part.boundingSphere = part.boundingBox = null; // the hit test measures the pose afresh
  if (!reduceMotion.matches) dogHover.use(reaction);
  pointerMoved = true;
}

function render(now) {
  // The first frame's timestamp can come from just before the loop restarted.
  const elapsed = Math.max(now - lastFrame, 0) / 1000;
  lastFrame = now;
  updateFade(now);
  if (!deskReady) { // only the room so far
    eased.lerp(mouse, 0.06);
    camera.position.copy(home).add(new THREE.Vector3(eased.x * 0.09, -eased.y * 0.05, 0));
    camera.lookAt(frameAim);
    camera.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = shadowsDirty;
    shadowsDirty = false;
    drawFrame(null);
    return;
  }
  if (dogHover?.kind) {
    if (pointerMoved) dogHover.setActive(isOverDog(), now);
    pointerMoved = false;
    if (dogHover.update(now)) shadowsDirty = true;
  }
  dogBreath.value = reduceMotion.matches ? 0 : BREATH_DEPTH * (0.5 + 0.5 * Math.sin(now / 1000 * Math.PI * 2 / BREATH_SECONDS)) + (dogHover?.sigh(now) ?? 0);
  if (!pen?.dragging && !notebook?.dragging) eased.lerp(mouse, 0.06); // the view holds still while writing or turning the cover
  camera.position.copy(home).add(new THREE.Vector3(eased.x * 0.09, -eased.y * 0.05, 0));
  camera.lookAt(frameAim);
  camera.updateMatrixWorld();
  const free = !pen?.dragging && !notebook?.dragging; // toys and leaves ignore a drag in progress
  toys?.update(camera, elapsed, pointer, free);
  hover?.update(camera, elapsed, free);
  pen?.update(elapsed, pointer, true);
  notebook?.update(elapsed, pointer, !pen?.dragging && !pen?.over);
  updatePointerTarget();
  const item = hovered?.cells && pointer ? screens.itemAt(camera, [desk], pointer.x, pointer.y) : null;
  screens.hover(item ?? focusItem);
  // The pointer only marks what a click does something to: a menu item, a monitor dot or the
  // lamp. The rest of a screen lights up under the cursor; the monitor shows an up-down cursor
  // there, as it scrolls.
  if (pen?.dragging || notebook?.dragging) renderer.domElement.style.cursor = 'grabbing';
  else if (pen?.over || notebook?.over) renderer.domElement.style.cursor = 'grab';
  else if (item || hovered === LAMP_TARGET) renderer.domElement.style.cursor = 'pointer';
  else renderer.domElement.style.cursor = hovered?.carousel ? 'ns-resize' : ''; // the monitor scrolls
  screens.update(Math.min(elapsed, 0.05), hovered, reduceMotion.matches);
  driftClouds(elapsed);
  skyline?.clock?.update();
  renderer.shadowMap.needsUpdate = shadowsDirty || isRoomMoving();
  if (import.meta.env.DEV && window.__desk && renderer.shadowMap.needsUpdate) window.__desk.shadowRedraws += 1;
  shadowsDirty = false;
  drawFrame(null);
}

// Color, then normals and ids for the ink lines, then the composite into target (null is the screen).
function drawFrame(target) {
  renderer.setRenderTarget(colorRT);
  renderer.render(scene, camera);
  const bg = scene.background;
  scene.background = null;
  scene.overrideMaterial = idMaterial;
  shell.visible = false;
  if (pen) pen.ink.visible = false; // ink never draws outlines
  camera.layers.disable(CITY_LAYER); // nor do the city lights
  renderer.setRenderTarget(normalRT);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  shell.visible = true;
  if (pen) pen.ink.visible = true;
  camera.layers.enable(CITY_LAYER);
  scene.background = bg;
  renderer.setRenderTarget(target);
  renderer.render(screenScene, screenCam);
}

// Keeps what is on screen now, to fade from.
function holdFrame() {
  const held = heldFrames[heldIndex = 1 - heldIndex]; // never the target being read
  updateFade(performance.now());
  drawFrame(held);
  post.uniforms.tPrev.value = held.texture;
  fadeStart = performance.now();
  post.uniforms.uPrev.value = 1;
}

let nextId = 1;
const DOG_ID = 2; // above every mesh id, which stay at 1 or below
// Each dog part carries its ink number from Blender (build_dog.py: Body 0, ears 6 and up). glTF puts
// the node's custom properties on the mesh, or on its parent group when it has several primitives.
function dogPartOf(mesh) {
  const part = mesh.userData.dog_part ?? mesh.parent?.userData.dog_part;
  if (part === undefined) console.warn(`${mesh.name} has no dog_part; drawing it as the body`);
  return part ?? 0;
}
// Pieces built separately that read as one surface share an id, so no line draws where they
// meet: the window wall's pier, the wall under the window and above it (user, 2026-11-08).
// Their real edges, like the sill's front, still get lines from the normals and depth.
// Name prefix -> surface group; each group gets one id of its own.
const ONE_SURFACE = { WinWall_Pier: 'WinWall', WinWall_Sill: 'WinWall', WinWall_Head: 'WinWall' };
const sharedIds = {};
function tagForOutlines(mesh) {
  const prefix = Object.keys(ONE_SURFACE).find((name) => mesh.name.startsWith(name) || mesh.parent?.name.startsWith(name));
  const group = prefix && ONE_SURFACE[prefix];
  const id = group ? (sharedIds[group] ??= (nextId++ % 500 + 1) / 512) : (nextId++ % 500 + 1) / 512;
  const part = mesh.isSkinnedMesh ? dogPartOf(mesh) : -1;
  mesh.onBeforeRender = (_r, _s, _c, _g, material) => {
    if (material !== idMaterial) return;
    idMaterial.uniforms.uId.value = part < 0 ? id : DOG_ID + part / 8;
    idMaterial.uniforms.uDog.value = part < 0 ? 0 : 1; // only the dog has breath and root data
    idMaterial.uniforms.uBreath.value = dogBreath.value;
    idMaterial.uniformsNeedUpdate = true;
  };
}

// Each period starts with the lamp in its usual state, and a click can flip it from there.
let currentPalette = null;
let lampOn = false;
let lampPlaced = false; // dark until the lamp itself has loaded
function setLamp(on) {
  lampOn = on;
  lampLight.intensity = on && lampPlaced ? LAMP : 0;
  // No shadow work while the lamp is off, but its shadow map must always exist:
  // surfaces can't draw while a shadow texture is missing.
  lampLight.shadow.autoUpdate = on;
  lampLight.shadow.needsUpdate = true;
  shadowsDirty = true;
  rimOn.value = on && currentPalette.sun === 0 ? 1 : 0;
  BULB.color.set(on ? '#FFF3D6' : currentPalette.materials.M_Sheet[1]);
}

function applyPalette(name) {
  const p = PALETTES[name];
  paletteName = name;
  for (const [k, [lit, shadow, deep]] of Object.entries(p.materials)) {
    TONES[k].uLit.value.set(lit);
    TONES[k].uShadow.value.set(shadow);
    TONES[k].uDeep.value.set(deep);
  }
  scene.background.set(p.sky);
  key.intensity = p.sun;
  key.position.set(...p.sunFrom).normalize().multiplyScalar(SUN_DISTANCE).add(key.target.position);
  rimColor.value.set(p.materials.M_Main[0]);
  currentPalette = p;
  setDogPose(p.dogPose, p.dogHover);
  setLamp(p.lamp > 0);
  shadowsDirty = true;
  pen?.setInk(p.materials.M_Dark[0]);
  // A lit screen takes the period's lit color, the same as the lamp pool and sunlit surfaces.
  screens.setColors(p.materials.M_Dark[2], p.materials.M_Main[0]);
  post.uniforms.uInk.value.set(p.line);
  applySkyline(p);
  setBackground(name);
  showPick('Laptop', name);
}

// The skyline is flat layers well outside the window. Layers sit at different distances
// and scale to match, so they keep their composition but shift apart as the camera drifts.
const SKYLINE_BEARING = THREE.MathUtils.degToRad(41);
const SKYLINE_BASE = Math.tan(THREE.MathUtils.degToRad(24));
const SKYLINE_STEP = 0.02;
const TOWER_STEP = 0.06; // the far layer's towers fit a lit side and windows between them

function toShape(item) {
  const { pts, holes = [] } = Array.isArray(item) ? { pts: item } : item;
  const path = (list) => list.map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape(path(pts));
  shape.holes = holes.map((h) => new THREE.Path(path(h)));
  return shape;
}

function applySkyline(p) {
  // The bridge is now the nearest thing in view, so it takes the darkest tone.
  const [far, middle, bridge] = p.skyline;
  const front = new THREE.Color(middle).lerp(new THREE.Color(bridge), FRONT_DEPTH);
  [far, p.cloud, front, bridge, bridge].forEach((color, i) => setHaze(SKYLINE[i], color, p.haze, LAYERS[i].lowShare));
  setHaze(BACKDROP, new THREE.Color(far).lerp(new THREE.Color(middle), BACKDROP_DEPTH), p.haze, LAYERS[0].lowShare);
  if (!skyline) return;
  skyline.clouds.forEach(({ mesh }, i) => { mesh.visible = i < p.cloudCount; });
  skyline.lights.apply(p.city, p.materials.M_Main[0], p.haze); // windows match the lamp's lit color
  skyline.clock?.apply(p.materials.M_Main[0], p.line); // a lit cream face, hands in the ink color
  sky?.apply(p);
}

// Clouds cover only the skyline the camera can see, from just past the left edge of the
// frame to just behind the window's right edge, so every cloud in a period's count shows.
const CLOUD_MARGIN = 4;
const CLOUD_LIMIT = -24;
let cloudStart = CLOUD_LIMIT;

function fitClouds() {
  if (!skyline) return;
  const yaw = Math.atan2(home.z - frameAim.z, home.x - frameAim.x);
  // The view's left half, widened when frameDesk slides the lens left (viewShift < 0).
  const halfWidth = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * (1 - viewShift));
  const leftEdge = 60 * Math.tan(yaw - halfWidth - SKYLINE_BEARING);
  cloudStart = THREE.MathUtils.clamp(leftEdge - CLOUD_MARGIN, CLOUD_LIMIT, skyline.cloudEnd - 10);
}

function driftClouds(elapsed) {
  if (!skyline) return;
  const span = skyline.cloudEnd - cloudStart;
  for (const cloud of skyline.clouds) {
    if (!reduceMotion.matches) cloud.spot = (cloud.spot + (cloud.speed * elapsed) / span) % 1;
    cloud.mesh.position.x = cloudStart + cloud.spot * span;
  }
}

// Builds a city's layers (a skyline module: its shapes by layer, towers, clouds and CLOUD_END,
// and optionally a working clock, a backdrop and accents for its far layer) in place of the
// current city's. Accents (Tokyo Tower's bands) lie over the far towers in the backdrop tone,
// without ink lines.
function addSkyline({ default: shapes, towers, clouds, CLOUD_END, clock: clockSpec, backdrop = [], accents = [] }) {
  const group = new THREE.Group();
  const lights = createCityLights(LAYERS[0].haze, LAYERS[2].haze);
  const drifting = [];
  const dir = new THREE.Vector3(-Math.cos(SKYLINE_BEARING), 0, -Math.sin(SKYLINE_BEARING));
  LAYERS.forEach(({ name, distance }, i) => {
    const layer = new THREE.Group();
    layer.position.copy(home).addScaledVector(dir, distance);
    layer.position.y = home.y - distance * SKYLINE_BASE;
    layer.scale.setScalar(distance / 60);
    layer.lookAt(home.x, layer.position.y, home.z);
    const step = towers[name] ? TOWER_STEP : SKYLINE_STEP;
    shapes[name].forEach((item, order) => {
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(toShape(item), 8), SKYLINE[i]);
      mesh.position.z = order * step; // keeps overlapping buildings off a shared plane
      tagForOutlines(mesh);
      layer.add(mesh);
      if (name === 'clouds') drifting.push({ mesh, ...clouds[order] });
    });
    const row = Object.keys(towers).indexOf(name);
    if (row >= 0) {
      const first = shapes[name].length - towers[name].length;
      towers[name].forEach(({ lit, windows }, t) => {
        const litGeometry = lit.length ? new THREE.ShapeGeometry(toShape(lit)) : new THREE.BufferGeometry(); // a shaded wing has no lit side
        lights.addTower(layer, row, litGeometry, windows, (first + t) * step);
      });
    }
    group.add(layer);
  });
  backdrop.forEach((item) => {
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(toShape(item), 8), BACKDROP);
    mesh.position.z = BACKDROP_STEP;
    tagForOutlines(mesh);
    group.children[0].add(mesh);
  });
  accents.forEach((item) => {
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(toShape(item), 8), BACKDROP);
    mesh.position.z = shapes.far.length * TOWER_STEP;
    mesh.layers.set(CITY_LAYER);
    group.children[0].add(mesh);
  });
  let clock = null;
  if (clockSpec) {
    clock = createClock(clockSpec, group.children[0], shapes.far.length * TOWER_STEP); // in front of every far tower and its lights
    tagForOutlines(clock.face);
  }
  if (!sky) {
    sky = createSky(home);
    sky.mesh.layers.set(CITY_LAYER); // no outlines
    scene.add(sky.mesh);
  }
  if (skyline) {
    scene.remove(skyline.group);
    skyline.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material && !SKYLINE.includes(o.material) && o.material !== BACKDROP) o.material.dispose(); // night lights and clocks are per city
    });
  }
  scene.add(group);
  skyline = { group, lights, clock, clouds: drifting, cloudEnd: CLOUD_END };
  fitClouds();
  applySkyline(currentPalette);
}

// Showing another city also moves to its time of day. Picks made while a city is still
// loading give way to the latest one.
let cityRequest = 0;
async function setCity(name) {
  const request = ++cityRequest;
  const module = await CITIES[name].skyline();
  if (request !== cityRequest) return;
  cityName = name;
  screens.setZone(CITIES[name].zone);
  holdFrame(); // the change cross-fades, like the stages
  addSkyline(module);
  applyPalette(periodAt(name));
}

// The controls live on the screens: the monitor lists the cities, the laptop the times of day.
// The same controls are also real buttons in #controls, for keyboard and screen-reader users:
// hidden until focus reaches them (index.html). The focused button's item is outlined on its
// screen, as if hovered.
const menu = (options) => Object.entries(options).map(([key, { label }]) => ({ key, label }));
const panelPicks = {}; // device -> marks that device's pressed button
let focusItem = null;
function showPick(object, key) {
  screens.select(object, key);
  panelPicks[object]?.(key);
}
function pickCity(key) {
  showPick('Monitor', key);
  setCity(key);
}
// A time-of-day pick cross-fades, like a city pick (setCity).
function pickPalette(key) {
  holdFrame();
  applyPalette(key);
}
function setupMenus() {
  screens.setMenu('Monitor', menu(CITIES), cityName, pickCity);
  screens.setMenu('Laptop', menu(PALETTES), paletteName, pickPalette);

  const panel = document.createElement('div');
  panel.id = 'controls';
  const group = (object, title, items, current, pick) => {
    const box = document.createElement('div');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-labelledby', `controls-${object}`);
    const label = document.createElement('span');
    label.id = `controls-${object}`;
    label.textContent = title;
    const buttons = items.map(({ key, label: text }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.onclick = () => pick(key);
      b.onfocus = () => { focusItem = screens.item(object, key); };
      b.onblur = () => { focusItem = null; };
      b.dataset.key = key;
      return b;
    });
    box.append(label, ...buttons);
    panel.append(box);
    panelPicks[object] = (key) => buttons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.key === key));
    panelPicks[object](current);
  };
  group('Monitor', 'City', menu(CITIES), cityName, pickCity);
  group('Laptop', 'Time of day', menu(PALETTES), paletteName, pickPalette);
  document.body.append(panel);
}

// The scene arrives in stages, each fading in when it lands: the room, then the big pieces
// (which can be clicked from then on), then the small items and the dog, then the skyline.
// Everything joins one group, so lookups by name span the whole desk.
const MODELS = `${import.meta.env.BASE_URL}models/`;
export const fetchModel = (name) => fetch(`${MODELS}${name}.glb`).then((response) => {
  if (!response.ok) throw new Error(`${name}.glb: HTTP ${response.status}`);
  return response.arrayBuffer();
});
const loader = new GLTFLoader();
const desk = new THREE.Group();
scene.add(desk);
let paletteName = null;

function dress(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name.startsWith('Shell_')) {
      o.material = shellMaterial;
      o.castShadow = true;
      return;
    }
    tagForOutlines(o);
    const name = o.material.name;
    if (name === 'M_Bulb') {
      o.material = BULB;
      return;
    }
    if (name === 'M_Screen') {
      o.material = screens.attach(o);
      o.castShadow = true;
      return;
    }
    const isChair = o.name.startsWith('Chair_') || o.parent?.name.startsWith('Chair_');
    o.material = (name === 'M_Dog' && DOG) || (isChair && CHAIR[name]) || MATERIALS[name] || MATERIALS.M_Main;
    o.castShadow = o.receiveShadow = true;
  });
}

// Shaders compile before the stage shows, so the fade doesn't start with a stall.
async function addStage(buffer) {
  const gltf = await loader.parseAsync(buffer, MODELS);
  dress(gltf.scene);
  const roomShown = home.lengthSq() > 0;
  if (roomShown) await renderer.compileAsync(gltf.scene, camera, scene);
  await fadeDone(); // the previous stage finishes its fade first
  if (roomShown) holdFrame();
  const parts = [...gltf.scene.children];
  desk.add(...parts);
  desk.updateMatrixWorld(true);
  shadowsDirty = true;
  return gltf;
}

function showRoom(gltf) {
  desk.traverse((o) => { if (o.name.startsWith('Shell_')) shellParts.push(o); });
  shellParts.forEach((part) => shell.attach(part));

  const src = gltf.cameras[0];
  camera = src.clone();
  src.getWorldPosition(home);
  const forward = src.getWorldDirection(new THREE.Vector3());
  homeAim.copy(home).addScaledVector(forward, home.distanceTo(new THREE.Vector3(0, 0.8, 0)));
  camera.far = 220; // far enough for the skyline layers
  camera.layers.enable(CITY_LAYER);
  post.uniforms.uNear.value = camera.near;
  post.uniforms.uFar.value = camera.far;
  // The framing points come with the room, measured in Blender (export_desk.py), so the
  // camera is already aimed right before the desk arrives.
  const { fitBoxes } = src.userData;
  for (let i = 0; i < fitBoxes.length; i += 6) {
    const [x0, y0, z0, x1, y1, z1] = fitBoxes.slice(i, i + 6);
    for (const x of [x0, x1]) for (const z of [z0, z1]) fitPoints.push(new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1, z));
  }
  const [low, high] = WINDOW_PANE;
  for (const y of [low.y, high.y]) for (const z of [low.z, high.z]) fitPoints.push(new THREE.Vector3(low.x, y, z));
  resize();
  paletteName = initialPalette(cityName);
  applyPalette(paletteName);
  // The first frame draws now, and the canvas fades in over the page background or the room's
  // still (posters/, made with capturePoster below), which it matches.
  drawFrame(null);
  renderer.domElement.classList.add('shown');
  setupMenus();
  requestFrames();
}

function showDesk(gltf) {
  // The lamp sits at the bulb, shining out of the shade.
  const head = desk.getObjectByName('Lamp_Joint3');
  head.updateWorldMatrix(true, false);
  const aim = new THREE.Vector3(0, 1, 0).transformDirection(head.matrixWorld);
  head.getWorldPosition(lampLight.position).addScaledVector(aim, 0.06);
  lampLight.target.position.copy(lampLight.position).add(aim);
  lampLight.target.updateMatrixWorld();
  lampPlaced = true;

  const pickable = { Lamp: LAMP_TARGET, ...screens.targets() };
  toys = createDeskToys(desk);
  pick = createPicker([desk], pickable);
  applyPalette(paletteName); // lights the lamp if this period has it on
  deskReady = true;
  if (import.meta.env.DEV) window.__desk = { shadowRedraws: 0, scene, get camera() { return camera; }, renderer, get hover() { return hover; }, toys, get pen() { return pen; }, get notebook() { return notebook; }, frameDesk, get lampOn() { return lampOn; }, get dogHover() { return dogHover; } };
}

// The baked framing points must match what the loaded desk measures, or the export is stale.
function checkFitPoints() {
  const live = [];
  for (const name of FIT_OBJECTS) {
    const box = new THREE.Box3().setFromObject(desk.getObjectByName(name));
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) live.push(new THREE.Vector3(x, box.min.y, z), new THREE.Vector3(x, box.max.y, z));
  }
  const off = Math.max(...live.map((point, i) => point.distanceTo(fitPoints[i])));
  if (off > 1e-4) console.warn(`Framing points are ${off.toFixed(4)} m off; rerun export_desk.py`);
}

function showDetails(gltf) {
  if (import.meta.env.DEV) checkFitPoints(); // the notebook and pen arrive with the details
  hover = createHover(desk);
  pen = createPenDrawing(desk, renderer.domElement, () => camera, () => notebook?.open);
  notebook = createNotebook(desk, renderer.domElement, () => camera, {
    reduceMotion: () => reduceMotion.matches,
    blocked: () => pen.over || pen.dragging,
    restOn: [desk.getObjectByName('Phone')],
  });
  pen.setInk(currentPalette.materials.M_Dark[0]);
  dogMixer = new THREE.AnimationMixer(desk);
  dogClips = Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip]));
  desk.traverse((o) => { if (o.isSkinnedMesh) dogParts.push(o); });
  dogHover = createDogHover(desk);
  desk.traverse((o) => { if (o.isMesh && (o.name.startsWith('Chair_') || o.parent?.name.startsWith('Chair_'))) dogBlockers.push(o); });
  setDogPose(currentPalette.dogPose, currentPalette.dogHover);
}

async function showSkyline(module) {
  await fadeDone();
  if (skyline) return; // a City pick got there first
  holdFrame();
  addSkyline(module);
  shadowsDirty = true;
}

// Scrolling over the monitor slides through the cities (screens.js); the page itself never scrolls.
renderer.domElement.addEventListener('wheel', (e) => {
  if (!deskReady || !hovered?.carousel) return;
  e.preventDefault();
  screens.scroll(hovered, e);
}, { passive: false });

renderer.domElement.addEventListener('click', (e) => {
  const dragged = [pen, notebook].map((part) => part?.takeClick()).some(Boolean); // both reset
  if (!deskReady || dragged) return;
  const item = screens.itemAt(camera, [desk], e.clientX, e.clientY);
  if (item) screens.pick(item);
  else if (pick(camera, e.clientX, e.clientY) === LAMP_TARGET) setLamp(!lampOn);
});
addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; pointerMoved = true; });

// Development only: the room as the still behind the canvas, with the camera at rest.
// Open /?stages=room&palette=<period>, then call __capturePoster().
if (import.meta.env.DEV) {
  window.__capturePoster = async (height = 900, aspect = 2.4, quality = 0.5) => {
    renderer.setAnimationLoop(null);
    renderer.setPixelRatio(1);
    resize(Math.round(height * aspect), height);
    camera.position.copy(home);
    camera.lookAt(frameAim);
    camera.updateMatrixWorld();
    post.uniforms.uPrev.value = 0;
    renderer.shadowMap.needsUpdate = true;
    drawFrame(null);
    const still = document.createElement('canvas');
    Object.assign(still, { width: renderer.domElement.width, height: renderer.domElement.height });
    still.getContext('2d').drawImage(renderer.domElement, 0, 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    resize();
    requestFrames();
    return new Promise((done) => still.toBlob(done, 'image/webp', quality));
  };
}

// roomFile is already downloading when entry.js fetched it alongside this module.
// city is the one entry.js picked, and skylineFile its skyline module, already loading.
export function startDesk(roomFile = fetchModel('room'), city = Object.keys(CITIES)[0], skylineFile = CITIES[city].skyline()) {
  cityName = city;
  screens.setZone(CITIES[city].zone);
  const deskFile = fetchModel('desk');
  const detailsFile = fetchModel('details');
  (async () => {
    showRoom(await addStage(await roomFile));
    if (import.meta.env.DEV && params.get('stages') === 'room') return; // for capturePoster
    showDesk(await addStage(await deskFile));
    showDetails(await addStage(await detailsFile));
    await showSkyline(await skylineFile);
  })().catch((error) => console.error('The 3D desk could not load', error));
}
