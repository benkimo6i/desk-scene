// Review viewer. Rebuilds the Blender preview look in real time:
// two sun lights with the same strengths as Blender, a three-step colour ramp,
// and a screen-space pass for ink lines.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import skylineData, { CLOUD_END, clouds, towers } from './skylines/san-francisco.js';
import { CITY_LAYER, createCityLights } from './skylines/cityLights.js';
import { GRAIN_FINISH, GRAIN_GLSL, createSky, hazeMaterial, setHaze } from './skylines/atmosphere.js';
import { createDogHover } from './dogHover.js';
import { createHover } from './hover.js';
import { createFlight, createPhoneLift, createPicker, liftedCenter, measureScreen } from './flight.js';
import { createPhoneCard, createScreenCard } from './screenCard.js';
import { createHoverPieces } from './hoverPieces.js';
import { PAGES } from './pages.js';
import { LAMP, PALETTES, initialPalette, setPageColors } from './palettes.js';
import { createDeskToys } from './deskToys.js';
import { createPenDrawing } from './penDrawing.js';

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
          attribute float _sketch_donut_u, _sketch_donut_v, _sketch_stretch_u, _sketch_stretch_v;
          uniform vec2 uSketchPose; // which pose's baked positions: donut, stretch
          uniform float uBreath;
          varying float vMark;
          varying vec2 vSketch;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vMark = color.g;
          vSketch = uSketchPose.x * vec2(_sketch_donut_u, _sketch_donut_v) + uSketchPose.y * vec2(_sketch_stretch_u, _sketch_stretch_v);
          transformed += objectNormal * uBreath * color.r;`);
    }
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        ${marked ? `varying float vMark; varying vec2 vSketch; uniform vec3 uDark, uInk;
          uniform float uSketch; uniform int uSketchCount; uniform vec2 uSketchLine[${SKETCH_MAX}];` : ''}
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
        ${marked ? `// A drawn line (the donut's ear). vSketch is where this point of fur sat in the hero
        // camera's view in that pose, so the line stays on the fur. Ink within about a pixel.
        if (uSketch > 0.5) {
          float d = 1e3;
          for (int i = 0; i < ${SKETCH_MAX - 1}; i++) {
            if (i >= uSketchCount - 1) break;
            vec2 a = uSketchLine[i], ab = uSketchLine[i + 1] - a;
            d = min(d, length(vSketch - a - ab * clamp(dot(vSketch - a, ab) / dot(ab, ab), 0.0, 1.0)));
          }
          float perPixel = 0.5 * (length(dFdx(vSketch)) + length(dFdy(vSketch)));
          outgoingLight = mix(outgoingLight, uInk, 0.8 * (1.0 - smoothstep(0.6, 1.4, d / max(perPixel, 1e-7))));
        }` : ''}
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
const TONES = Object.fromEntries([...Object.keys(PALETTES.afternoon.materials), 'M_Panel', 'M_Stage'].map((k) => [k, newTones()]));
const pieceColors = {}; // shared with the hover pieces' canvases
const MATERIALS = Object.fromEntries(Object.entries(TONES).map(([k, v]) => [k, toonMaterial(v)]));
const chairMaterial = (name) => toonMaterial({ ...TONES[name], uRim: rimOn });
const CHAIR = { M_Main: chairMaterial('M_Main'), M_Dark: chairMaterial('M_Dark') };
const dogBreath = { value: 0 }; // how far the ribs have risen, in metres
const inkLine = { value: new THREE.Color() }; // the outline color, shared with the line pass
// A line drawn on the dog in one pose (SKETCHES in build_dog.py), filled in when it loads.
const SKETCH_MAX = 64;
const sketch = {
  uSketch: { value: 0 },
  uSketchCount: { value: 0 },
  uSketchPose: { value: new THREE.Vector2() },
  uSketchLine: { value: Array.from({ length: SKETCH_MAX }, () => new THREE.Vector2()) },
};
let sketchLines = {}; // pose -> flat [u, v, ...], from the Dog's "sketch" property
const DOG = toonMaterial({ ...TONES.M_Dog, uDark: TONES.M_Dark.uDeep, uBreath: dogBreath, uInk: inkLine, ...sketch }, true);
const SCREEN = new THREE.MeshBasicMaterial();
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
const cityLights = createCityLights(LAYERS[0].haze, LAYERS[2].haze);
const FRONT_DEPTH = 0.55; // the front row's tone, from the middle tone toward the bridge's
const driftingClouds = [];
let sky = null;

// Ink lines come from a normals + depth buffer, so nothing is added to the models.
const size = new THREE.Vector2();
const colorRT = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
const normalRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
normalRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
// RGB holds the view normal, alpha holds an id per mesh. The id gives solid lines where
// two objects meet, even when one is a paper-thin sheet with no real depth step.
// The dog is one mesh, so it writes 2 + limb / 8 instead (blue and alpha vertex color, from build_dog.py),
// which lets its legs get lines where they cross each other or lie over the body.
const idMaterial = new THREE.ShaderMaterial({
  uniforms: { uId: { value: 0 }, uBreath: { value: 0 }, uFolded: { value: new THREE.Vector4() }, uQuiet: { value: new THREE.Vector3() } },
  // The skinning chunks keep outlines on the dog when its bones move, and color carries its breath.
  vertexShader: `varying vec3 vN;
    flat varying float vLimb;
    varying float vSide, vQuiet;
    attribute vec4 color;
    attribute float _quiet_donut, _quiet_stretch, _quiet_shrimp;
    uniform float uBreath;
    uniform vec3 uQuiet;
    #include <common>
    #include <morphtarget_pars_vertex>
    #include <skinning_pars_vertex>
    void main() {
      #include <beginnormal_vertex>
      #include <morphnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      vN = normalize(normalMatrix * objectNormal);
      vLimb = floor(color.b * 8.0 + 0.5);
      vSide = color.a;
      vQuiet = dot(uQuiet, vec3(_quiet_donut, _quiet_stretch, _quiet_shrimp)); // this pose's quiet skin
      #include <begin_vertex>
      #include <morphtarget_vertex>
      transformed += objectNormal * uBreath * color.r;
      #include <skinning_vertex>
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }`,
  fragmentShader: `varying vec3 vN; flat varying float vLimb; varying float vSide, vQuiet;
    uniform float uId;
    uniform vec4 uFolded; // legs 1-4 folded out of sight in this pose, whose leftover skin counts as body
    void main() {
      float limb = vLimb;
      // Legs 1-2 and 3-4 are pairs: the smooth side value picks between them, not the triangle.
      if (limb > 0.5 && limb < 4.5) {
        limb = (limb < 2.5 ? 1.0 : 3.0) + (vSide > 0.5 ? 0.0 : 1.0);
        if (uFolded[int(limb) - 1] > 0.5) limb = 0.0;
      }
      // 6: quiet skin (QUIET in build_dog.py), whose creases draw no lines in this pose.
      if (vQuiet > 0.5 && abs(limb - 5.0) > 0.5) limb = 6.0; // never the tail, which keeps its outline
      gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, uId + limb / 8.0);
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
    // Between meshes, any change of id draws a line. Inside the dog, two different limbs always
    // get one, but a limb and the body only where there is a depth step: where the leg lies over
    // the body, not where it grows out of the shoulder or hip.
    float limbOf(float a) { return a < 1.5 ? -1.0 : floor((a - 2.0) * 8.0 + 0.5); }
    float idEdge(float a, float b, float d, float db) {
      if (a < 1.5 || b < 1.5) return step(0.0005, abs(a - b));
      float la = limbOf(a), lb = limbOf(b);
      if (la == 6.0 || la == 5.0) la = 0.0; // quiet skin and the tail count as body: the tail
      if (lb == 6.0 || lb == 5.0) lb = 0.0; // gets a line only where it lies over something
      if (la == lb) return 0.0;
      if (la > 0.0 && lb > 0.0) return 1.0;
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
      // Creases in quiet skin (limb 6) draw nothing; outlines against other things still do, and so
      // does the tail's own outline where it lies over quiet skin.
      bool quiet = limbOf(a) == 6.0 || limbOf(nl.a) == 6.0 || limbOf(nr.a) == 6.0 || limbOf(nd.a) == 6.0 || limbOf(nu.a) == 6.0;
      bool tail = limbOf(a) == 5.0 || limbOf(nl.a) == 5.0 || limbOf(nr.a) == 5.0 || limbOf(nd.a) == 5.0 || limbOf(nu.a) == 5.0;
      if (quiet && !tail) edge = 0.0;
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

// As the window narrows, the camera turns toward the desk's center, keeping the monitor,
// laptop, phone and the phone's lift path in frame.
const DESK_CENTER = new THREE.Vector3(0, 0.8, 0);
const FIT_EDGE = 0.92; // leaves room for the cursor drift
const frameAim = new THREE.Vector3();
const fitPoints = [];
const fitCheck = new THREE.Vector3();

function fits() {
  camera.position.copy(home);
  camera.lookAt(frameAim);
  camera.updateMatrixWorld();
  return fitPoints.every((point) => Math.abs(fitCheck.copy(point).project(camera).x) < FIT_EDGE);
}

function frameDesk() {
  for (let turn = 0; turn <= 1; turn += 0.02) {
    frameAim.lerpVectors(homeAim, DESK_CENTER, turn);
    if (fits()) return turn;
  }
  return null; // doesn't fit at this shape
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
let dogMesh = null;
let dogHover = null;
let dogBlockers = []; // the chair sits between the camera and part of the bed
let pointerMoved = false;
const dogRay = new THREE.Raycaster();
const LAMP_TARGET = { lamp: true };
const CLOSE_NEAR = 0.01; // the phone needs the camera right up against it
let baseNear = 0.1;
let hover = null;
let toys = null;
let pen = null;
let phoneLift = null;
let flight = null;
let pick = null;
let hovered = null;
let pointer = null;
let lastFrame = performance.now();
const cards = new Map(); // page -> { card, pieces, hover }
const clock = { time: 0 };

let shadowsDirty = true;
const isRoomMoving = () => hover?.moving || toys?.moving || pen?.moving || flight?.state.lift % 1 > 0
  || [...cards.values()].some(({ pieces }) => pieces.group.visible);

function requestFrames() {
  lastFrame = performance.now();
  renderer.setAnimationLoop(render);
}

function isOverDog() {
  if (!pointer || !dogHover.kind || !flight.atDesk) return false;
  dogRay.setFromCamera({ x: (pointer.x / innerWidth) * 2 - 1, y: 1 - (pointer.y / innerHeight) * 2 }, camera);
  return dogRay.intersectObjects([dogMesh, ...dogBlockers], false)[0]?.object === dogMesh;
}

function updatePointerTarget() {
  if (flight.atDesk && pointer && !pen?.dragging) {
    const target = pick(camera, pointer.x, pointer.y);
    if (target !== hovered) {
      hovered = target;
      renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    }
  } else if (hovered) {
    hovered = null;
    renderer.domElement.style.cursor = '';
  }
  pointer = flight.atDesk ? pointer : null;
}

function updateScreens(elapsed) {
  const dt = Math.min(elapsed, 0.05);
  clock.time += dt;
  const { fade, screen } = flight.state;
  for (const [page, entry] of cards) {
    const active = page === hovered;
    entry.hover = THREE.MathUtils.clamp(entry.hover + (active ? dt / 0.16 : -dt / 0.2), 0, 1);
    entry.card.draw(entry.hover, page.screen === screen ? fade : 0);
    entry.pieces.update(dt, clock.time, active && !reduceMotion.matches);
  }
}

// The dog holds one sleeping position per period, switched with the rest of the palette.
// "Away" leaves its bed empty, as if it were out for a walk.
function setDogPose(name, reaction) {
  if (!dogMixer) return;
  dogHover.settle();
  dogMesh.visible = name !== 'Away';
  // A line drawn on the dog in this pose (SKETCHES in build_dog.py), if it has one.
  const line = sketchLines[name] ?? [];
  sketch.uSketch.value = line.length ? 1 : 0;
  sketch.uSketchPose.value.set(name === 'Donut' ? 1 : 0, name === 'Stretch' ? 1 : 0); // _sketch_<pose>_
  sketch.uSketchCount.value = Math.min(line.length / 2, SKETCH_MAX);
  sketch.uSketchLine.value.slice(0, sketch.uSketchCount.value).forEach((point, i) => point.set(line[2 * i], line[2 * i + 1]));
  // A pose can reshape the dog with a shape key of its own name (FILLS in build_dog.py).
  for (const [key, index] of Object.entries(dogMesh.morphTargetDictionary ?? {})) dogMesh.morphTargetInfluences[index] = key === name ? 1 : 0;
  idMaterial.uniforms.uQuiet.value.set(name === 'Donut' ? 1 : 0, name === 'Stretch' ? 1 : 0, name === 'Shrimp' ? 1 : 0); // _quiet_<pose>
  dogMixer.stopAllAction();
  if (dogClips[name]) dogMixer.clipAction(dogClips[name]).play();
  dogMixer.update(0);
  // A leg the pose folded away (scaled to nothing in build_dog.py) draws no outline of its own.
  const folded = (bone) => (dogMesh.skeleton.getBoneByName(bone)?.scale.x ?? 1) < 0.5 ? 1 : 0;
  // Leg 3 also holds the big thigh, which stays in view even when its lower leg is folded.
  idMaterial.uniforms.uFolded.value.set(folded('FrontTop0'), folded('FrontLow0'), 0, folded('HindLow0'));
  dogMesh.boundingSphere = dogMesh.boundingBox = null; // the hit test measures the pose afresh
  if (!reduceMotion.matches) dogHover.use(reaction);
  pointerMoved = true;
}

function render(now) {
  // The first frame's timestamp can come from just before the loop restarted.
  const elapsed = Math.max(now - lastFrame, 0) / 1000;
  lastFrame = now;
  updateFade(now);
  if (!flight) { // only the room so far
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
  if (flight.atDesk && !pen?.dragging) eased.lerp(mouse, 0.06); // the view holds still while writing
  camera.position.copy(home).add(new THREE.Vector3(eased.x * 0.09, -eased.y * 0.05, 0));
  camera.lookAt(frameAim);
  flight.update(camera, elapsed);
  phoneLift?.apply(flight.state.lifts ? flight.state.lift : 0);
  const near = flight.state.t > 0.5 ? CLOSE_NEAR : baseNear;
  if (camera.near !== near) {
    camera.near = near;
    camera.updateProjectionMatrix();
    post.uniforms.uNear.value = near;
  }
  camera.updateMatrixWorld();
  const free = flight.atDesk && !pen?.dragging;
  toys?.update(camera, elapsed, pointer, free);
  hover?.update(camera, elapsed, free);
  pen?.update(elapsed, pointer, flight.atDesk);
  updatePointerTarget();
  if (pen?.dragging) renderer.domElement.style.cursor = 'grabbing';
  else if (pen?.over) renderer.domElement.style.cursor = 'grab';
  else renderer.domElement.style.cursor = hovered ? 'pointer' : '';
  updateScreens(elapsed);
  driftClouds(elapsed);
  renderer.shadowMap.needsUpdate = shadowsDirty || isRoomMoving();
  if (import.meta.env.DEV && window.__desk && renderer.shadowMap.needsUpdate) window.__desk.shadowRedraws += 1;
  shadowsDirty = false;
  drawFrame(null);
  if (flight.state.t === 1 && !flight.state.direction) renderer.setAnimationLoop(null);
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
function tagForOutlines(mesh) {
  const id = (nextId++ % 500 + 1) / 512;
  mesh.onBeforeRender = (_r, _s, _c, _g, material) => {
    if (material !== idMaterial) return;
    idMaterial.uniforms.uId.value = mesh.isSkinnedMesh ? DOG_ID : id;
    idMaterial.uniforms.uBreath.value = mesh.isSkinnedMesh ? dogBreath.value : 0; // only the dog has breath data
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
  SCREEN.color.set(p.screen);
  post.uniforms.uInk.value.set(p.line);
  applySkyline(p);
  const { paper, ink } = p;
  // Hover panels stay light even in shadow, so their contents remain readable.
  const paperColor = new THREE.Color(paper), inkColor = new THREE.Color(ink);
  TONES.M_Panel.uLit.value.copy(paperColor);
  TONES.M_Panel.uShadow.value.copy(paperColor).lerp(inkColor, 0.12);
  TONES.M_Panel.uDeep.value.copy(paperColor).lerp(inkColor, 0.18);
  // Dark panels sit on a dark room, so in lamp-lit periods they use one flat, lighter blue.
  const lampPanel = p.lamp ? new THREE.Color(p.materials.M_Main[1]).lerp(new THREE.Color(p.materials.M_Main[0]), 0.14) : null;
  if (lampPanel) for (const tone of ['uLit', 'uShadow', 'uDeep']) TONES.M_Panel[tone].value.copy(lampPanel);
  ['uLit', 'uShadow', 'uDeep'].forEach((tone, i) => {
    TONES.M_Stage[tone].value.set(p.materials.M_Dark[i]);
    if (lampPanel) TONES.M_Stage[tone].value.copy(lampPanel);
  });
  const css = (color) => `#${color.getHexString()}`;
  Object.assign(pieceColors, {
    paper, ink, accent: p.materials.M_Accent[0],
    muted: css(paperColor.clone().lerp(inkColor, 0.45)),
    soft: p.materials.M_Paper[0],
    onDark: p.materials.M_Main[0], // for text on dark panels, in every period
    sky: p.sky, cloud: p.cloud, skyline: p.skyline[0], skylineMid: p.skyline[1], // the design palettes
    stage: css(TONES.M_Stage.uLit.value), // behind the design stage's art
  });
  setPageColors(name);
  for (const { card } of cards.values()) card.setColors(paper, ink, p.materials.M_Main[0], p.materials.M_Dark[2]);
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
  driftingClouds.forEach(({ mesh }, i) => { mesh.visible = i < p.cloudCount; });
  cityLights.apply(p.city, p.materials.M_Main[0], p.haze); // windows match the lamp's lit color
  sky?.apply(p);
}

// Clouds cover only the skyline the camera can see, from just past the left edge of the
// frame to just behind the window's right edge, so every cloud in a period's count shows.
const CLOUD_MARGIN = 4;
const CLOUD_LIMIT = -24;
let cloudStart = CLOUD_LIMIT;

function fitClouds() {
  const yaw = Math.atan2(home.z - frameAim.z, home.x - frameAim.x);
  const halfWidth = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  const leftEdge = 60 * Math.tan(yaw - halfWidth - SKYLINE_BEARING);
  cloudStart = THREE.MathUtils.clamp(leftEdge - CLOUD_MARGIN, CLOUD_LIMIT, CLOUD_END - 10);
}

function driftClouds(elapsed) {
  const span = CLOUD_END - cloudStart;
  for (const cloud of driftingClouds) {
    if (!reduceMotion.matches) cloud.spot = (cloud.spot + (cloud.speed * elapsed) / span) % 1;
    cloud.mesh.position.x = cloudStart + cloud.spot * span;
  }
}

function addSkyline() {
  const skyline = new THREE.Group();
  const dir = new THREE.Vector3(-Math.cos(SKYLINE_BEARING), 0, -Math.sin(SKYLINE_BEARING));
  LAYERS.forEach(({ name, distance }, i) => {
    const layer = new THREE.Group();
    layer.position.copy(home).addScaledVector(dir, distance);
    layer.position.y = home.y - distance * SKYLINE_BASE;
    layer.scale.setScalar(distance / 60);
    layer.lookAt(home.x, layer.position.y, home.z);
    const step = towers[name] ? TOWER_STEP : SKYLINE_STEP;
    skylineData[name].forEach((item, order) => {
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(toShape(item), 8), SKYLINE[i]);
      mesh.position.z = order * step; // keeps overlapping buildings off a shared plane
      tagForOutlines(mesh);
      layer.add(mesh);
      if (name === 'clouds') driftingClouds.push({ mesh, ...clouds[order] });
    });
    const row = Object.keys(towers).indexOf(name);
    if (row >= 0) {
      const first = skylineData[name].length - towers[name].length;
      towers[name].forEach(({ lit, windows }, t) => {
        const litGeometry = lit.length ? new THREE.ShapeGeometry(toShape(lit)) : new THREE.BufferGeometry(); // a shaded wing has no lit side
        cityLights.addTower(layer, row, litGeometry, windows, (first + t) * step);
      });
    }
    skyline.add(layer);
  });
  sky = createSky(home);
  sky.mesh.layers.set(CITY_LAYER); // no outlines
  skyline.add(sky.mesh);
  scene.add(skyline);
  applySkyline(currentPalette);
}

function reviewPanel(state) {
  const panel = document.createElement('div');
  panel.id = 'review';
  const group = (title, options, current, pick) => {
    const label = document.createElement('span');
    label.textContent = title;
    panel.append(label);
    const buttons = Object.entries(options).map(([key, { label: text }]) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.setAttribute('aria-pressed', key === current);
      b.onclick = () => {
        pick(key);
        buttons.forEach((other) => other.setAttribute('aria-pressed', other === b));
      };
      return b;
    });
    panel.append(...buttons);
  };
  group('Time of day', PALETTES, state.palette, applyPalette);
  document.body.append(panel);
}

let navigation = null;

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
      o.material = SCREEN;
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
  baseNear = camera.near;
  post.uniforms.uNear.value = camera.near;
  post.uniforms.uFar.value = camera.far;
  // The framing points come with the room, measured in Blender (export_desk.py), so the
  // camera is already aimed right before the desk arrives.
  const { fitBoxes, phoneScreen } = src.userData;
  for (let i = 0; i < fitBoxes.length; i += 6) {
    const [x0, y0, z0, x1, y1, z1] = fitBoxes.slice(i, i + 6);
    for (const x of [x0, x1]) for (const z of [z0, z1]) fitPoints.push(new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1, z));
  }
  fitPoints.push(liftedCenter(new THREE.Vector3(...phoneScreen), home));
  resize();
  paletteName = initialPalette();
  applyPalette(paletteName);
  // The first frame draws now, and the canvas fades in over the page background or the room's
  // still (posters/, made with capturePoster below), which it matches.
  drawFrame(null);
  renderer.domElement.classList.add('shown');
  if (import.meta.env.DEV && !params.has('clean')) reviewPanel({ palette: paletteName });
  if (!navigation.onPage && !navigation.basic) requestFrames();
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

  const measured = {};
  const pickable = { Lamp: LAMP_TARGET };
  for (const page of Object.values(PAGES)) {
    const mesh = desk.getObjectByName(page.screen);
    const screen = measureScreen(mesh, page.flat);
    measured[page.screen] = screen;
    if (page.flat) {
      phoneLift = createPhoneLift(desk.getObjectByName(page.object), screen, home);
      measured[page.screen] = phoneLift.screen;
    }
    const card = page.flat ? createPhoneCard(mesh) : createScreenCard(mesh, page.label, screen.width / screen.height);
    const facing = page.flat ? { center: screen.center, up: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(0.25, 0, 0.97).normalize() } : screen;
    const pieces = createHoverPieces(page.pieces, facing, MATERIALS, tagForOutlines, pieceColors);
    scene.add(pieces.group);
    cards.set(page, { card, pieces, hover: 0 });
    pickable[page.object] = page;
  }
  if (import.meta.env.DEV) checkFitPoints(measured.Phone_Screen.center);
  flight = createFlight(measured, { requestFrames, reduceMotion });
  toys = createDeskToys(desk);
  pick = createPicker([desk], pickable); // only the objects respond, never their hover panels
  applyPalette(paletteName); // colors the screens, and lights the lamp if this period has it on
  navigation.attachDesk(flight);
  if (import.meta.env.DEV) window.__desk = { shadowRedraws: 0, scene, get camera() { return camera; }, renderer, get hover() { return hover; }, flight, navigation, toys, get pen() { return pen; }, frameDesk, get lampOn() { return lampOn; }, get dogHover() { return dogHover; } };
}

// The baked framing points must match what the loaded desk measures, or the export is stale.
function checkFitPoints(phoneCenter) {
  const live = [];
  for (const name of ['Laptop', 'Monitor_Panel', 'Phone', 'Mug']) {
    const box = new THREE.Box3().setFromObject(desk.getObjectByName(name));
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) live.push(new THREE.Vector3(x, box.min.y, z), new THREE.Vector3(x, box.max.y, z));
  }
  live.push(phoneCenter);
  const off = Math.max(...live.map((point, i) => point.distanceTo(fitPoints[i])));
  if (off > 1e-4) console.warn(`Framing points are ${off.toFixed(4)} m off; rerun export_desk.py`);
}

function showDetails(gltf) {
  hover = createHover(desk);
  pen = createPenDrawing(desk, renderer.domElement, () => camera);
  pen.setInk(currentPalette.materials.M_Dark[0]);
  dogMixer = new THREE.AnimationMixer(desk);
  dogClips = Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip]));
  dogMesh = desk.getObjectByProperty('isSkinnedMesh', true);
  sketchLines = dogMesh.userData.sketch ?? {};
  dogHover = createDogHover(desk);
  desk.traverse((o) => { if (o.isMesh && (o.name.startsWith('Chair_') || o.parent?.name.startsWith('Chair_'))) dogBlockers.push(o); });
  setDogPose(currentPalette.dogPose, currentPalette.dogHover);
}

async function showSkyline() {
  await fadeDone();
  holdFrame();
  addSkyline();
  shadowsDirty = true;
}

renderer.domElement.addEventListener('click', (e) => {
  if (!flight?.atDesk || pen?.takeClick()) return;
  const target = pick(camera, e.clientX, e.clientY);
  if (target === LAMP_TARGET) setLamp(!lampOn);
  else if (target) navigation.go(Object.keys(PAGES).find((path) => PAGES[path] === target));
});
addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; pointerMoved = true; });
// Scrolling over the laptop takes over its timeline.
addEventListener('wheel', (e) => {
  if (!e.ctrlKey && hovered) cards.get(hovered)?.pieces.scrub(e.deltaY + e.deltaX);
}, { passive: true });

export function setDeskActive(active) {
  if (!fitPoints.length) return; // nothing to draw yet
  if (active) requestFrames();
  else renderer.setAnimationLoop(null);
}

// Development only: the room as the still behind the canvas, with the camera at rest.
// Open /?clean&stages=room&palette=<period>, then call __capturePoster().
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
export function startDesk(nav, roomFile = fetchModel('room')) {
  navigation = nav;
  const deskFile = fetchModel('desk');
  const detailsFile = fetchModel('details');
  (async () => {
    showRoom(await addStage(await roomFile));
    if (import.meta.env.DEV && params.get('stages') === 'room') return; // for capturePoster
    showDesk(await addStage(await deskFile));
    showDetails(await addStage(await detailsFile));
    await showSkyline();
  })().catch((error) => console.error('The 3D desk could not load', error));
}
