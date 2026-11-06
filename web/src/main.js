// Review viewer. Rebuilds the Blender preview look in real time:
// two sun lights with the same strengths as Blender, a three-step colour ramp,
// and a screen-space pass for ink lines.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import skylineData from './skylines/san-francisco.js';
import { createHover } from './hover.js';
import { createFlight, createPhoneLift, createPicker, measureScreen } from './flight.js';
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

function toonMaterial(tones) {
  // Both sides cast shadows. With the default, walls cast from their room-facing side,
  // which is flush with the corner and lets a hairline of sun through.
  const m = new THREE.MeshLambertMaterial({ color: '#fff', shadowSide: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, tones);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uLit, uShadow, uDeep, uRimColor;
        uniform float uRim;
        float grainAt(vec2 p) {
          vec2 c = floor(p);
          return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
        }`)
      .replace('#include <opaque_fragment>', `
        float rim = (1.0 - abs(dot(normalize(vViewPosition), normal))) * step(0.0, normal.y);
        float n = grainAt(gl_FragCoord.xy / 1.5);
        float base = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        // Roughen only the sunlit edge; noise on the blue-to-blue step reads as blotches.
        float v = base + (n - 0.5) * 0.10;
        vec3 tone = base < 0.10 ? uDeep : (v < 0.30 ? uShadow : uLit);
        if (uRim > 0.5 && rim + (n - 0.5) * 0.04 > 0.66) tone = mix(tone, uRimColor, 0.55);
        outgoingLight = tone * (0.92 + 0.16 * n);
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
const SCREEN = new THREE.MeshBasicMaterial();
const BULB = new THREE.MeshBasicMaterial();
const lampLight = new THREE.SpotLight('#fff', 0, 0, THREE.MathUtils.degToRad(40), 0, 0); // no falloff, so the pool ends on one clean edge
lampLight.shadow.mapSize.set(2048, 2048);
lampLight.castShadow = true; // left on, so toggling the lamp never recompiles the shaders
lampLight.shadow.camera.near = 0.02;
lampLight.shadow.camera.far = 6;
lampLight.shadow.bias = -0.0004;
lampLight.shadow.normalBias = 0.004;
const SKYLINE = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];

// Ink lines come from a normals + depth buffer, so nothing is added to the models.
const size = new THREE.Vector2();
const colorRT = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
const normalRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
normalRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
// RGB holds the view normal, alpha holds an id per mesh. The id gives solid lines where
// two objects meet, even when one is a paper-thin sheet with no real depth step.
const idMaterial = new THREE.ShaderMaterial({
  uniforms: { uId: { value: 0 } },
  vertexShader: `varying vec3 vN;
    void main() {
      vN = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `varying vec3 vN; uniform float uId;
    void main() { gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, uId); }`,
});

const post = new THREE.ShaderMaterial({
  depthTest: false,
  depthWrite: false,
  uniforms: {
    tColor: { value: colorRT.texture },
    tNormal: { value: normalRT.texture },
    tDepth: { value: normalRT.depthTexture },
    uTexel: { value: new THREE.Vector2() },
    uInk: { value: new THREE.Color() },
    uNear: { value: 0.1 },
    uFar: { value: 20 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tColor, tNormal, tDepth;
    uniform vec2 uTexel;
    uniform vec3 uInk;
    uniform float uNear, uFar;
    float depthAt(vec2 uv) {
      float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
      return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
    }
    void main() {
      vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
      vec4 n = texture2D(tNormal, vUv);
      vec4 nl = texture2D(tNormal, vUv - dx), nr = texture2D(tNormal, vUv + dx);
      vec4 nd = texture2D(tNormal, vUv - dy), nu = texture2D(tNormal, vUv + dy);
      float edgeN = length(nr.xyz - nl.xyz) + length(nu.xyz - nd.xyz);
      float a = n.a;
      float idGap = max(max(abs(nl.a - a), abs(nr.a - a)), max(abs(nd.a - a), abs(nu.a - a)));
      float d = depthAt(vUv);
      // Second difference: stays zero across a flat surface at any viewing angle.
      float lap = abs(depthAt(vUv - dx) + depthAt(vUv + dx) - 2.0 * d)
                + abs(depthAt(vUv - dy) + depthAt(vUv + dy) - 2.0 * d);
      float edge = max(smoothstep(0.25, 0.5, edgeN), smoothstep(0.006, 0.014, lap / d));
      if (idGap > 0.0005) edge = 1.0;
      vec3 c = mix(texture2D(tColor, vUv).rgb, uInk, edge * 0.8);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});
const screenScene = new THREE.Scene();
screenScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const screenCam = new THREE.Camera();

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

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  renderer.getDrawingBufferSize(size);
  colorRT.setSize(size.x, size.y);
  normalRT.setSize(size.x, size.y);
  post.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (fitPoints.length) frameDesk();
}
addEventListener('resize', resize);
addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
});

const SUN_DISTANCE = 10;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
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

function render(now) {
  // The first frame's timestamp can come from just before the loop restarted.
  const elapsed = Math.max(now - lastFrame, 0) / 1000;
  lastFrame = now;
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
  renderer.shadowMap.needsUpdate = shadowsDirty || isRoomMoving();
  if (import.meta.env.DEV && window.__desk && renderer.shadowMap.needsUpdate) window.__desk.shadowRedraws += 1;
  shadowsDirty = false;
  renderer.setRenderTarget(colorRT);
  renderer.render(scene, camera);
  const bg = scene.background;
  scene.background = null;
  scene.overrideMaterial = idMaterial;
  shell.visible = false;
  if (pen) pen.ink.visible = false; // ink never draws outlines
  renderer.setRenderTarget(normalRT);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  shell.visible = true;
  if (pen) pen.ink.visible = true;
  scene.background = bg;
  renderer.setRenderTarget(null);
  renderer.render(screenScene, screenCam);
  if (flight.state.t === 1 && !flight.state.direction) renderer.setAnimationLoop(null);
}

let nextId = 1;
function tagForOutlines(mesh) {
  const id = (nextId++ % 500 + 1) / 512;
  mesh.onBeforeRender = (_r, _s, _c, _g, material) => {
    if (material !== idMaterial) return;
    idMaterial.uniforms.uId.value = id;
    idMaterial.uniformsNeedUpdate = true;
  };
}

// Each period starts with the lamp in its usual state, and a click can flip it from there.
let currentPalette = null;
let lampOn = false;
function setLamp(on) {
  lampOn = on;
  lampLight.intensity = on ? LAMP : 0;
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
  setLamp(p.lamp > 0);
  shadowsDirty = true;
  pen?.setInk(p.materials.M_Dark[0]);
  SCREEN.color.set(p.screen);
  post.uniforms.uInk.value.set(p.line);
  p.skyline.forEach((c, i) => SKYLINE[i].color.set(c));
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
  });
  setPageColors(name);
  for (const { card } of cards.values()) card.setColors(paper, ink, p.materials.M_Main[0], p.materials.M_Dark[2]);
}

// The skyline is flat layers well outside the window. Layers sit at different distances
// and scale to match, so they keep their composition but shift apart as the camera drifts.
const SKYLINE_BEARING = THREE.MathUtils.degToRad(41);
const SKYLINE_BASE = Math.tan(THREE.MathUtils.degToRad(24));
const LAYERS = [['far', 95], ['mid', 75], ['near', 60]];

function toShape(item) {
  const { pts, holes = [] } = Array.isArray(item) ? { pts: item } : item;
  const path = (list) => list.map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape(path(pts));
  shape.holes = holes.map((h) => new THREE.Path(path(h)));
  return shape;
}

function addSkyline() {
  const skyline = new THREE.Group();
  const dir = new THREE.Vector3(-Math.cos(SKYLINE_BEARING), 0, -Math.sin(SKYLINE_BEARING));
  LAYERS.forEach(([name, distance], i) => {
    const layer = new THREE.Group();
    layer.position.copy(home).addScaledVector(dir, distance);
    layer.position.y = home.y - distance * SKYLINE_BASE;
    layer.scale.setScalar(distance / 60);
    layer.lookAt(home.x, layer.position.y, home.z);
    skylineData[name].forEach((item, order) => {
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(toShape(item), 8), SKYLINE[i]);
      mesh.position.z = order * 0.02; // keeps overlapping buildings off a shared plane
      tagForOutlines(mesh);
      layer.add(mesh);
    });
    skyline.add(layer);
  });
  scene.add(skyline);
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

const loadDesk = () => new GLTFLoader().load(`${import.meta.env.BASE_URL}models/desk.glb`, (gltf) => {
  const root = gltf.scene;
  const shellParts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name.startsWith('Shell_')) {
      o.material = shellMaterial;
      o.castShadow = true;
      shellParts.push(o);
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
    o.material = (isChair && CHAIR[name]) || MATERIALS[name] || MATERIALS.M_Main;
    o.castShadow = o.receiveShadow = true;
  });
  scene.add(root);
  root.updateMatrixWorld(true);
  shellParts.forEach((part) => shell.attach(part));
  hover = createHover(root);
  toys = createDeskToys(root);
  pen = createPenDrawing(root, renderer.domElement, () => camera);

  // The lamp sits at the bulb, shining out of the shade.
  const head = root.getObjectByName('Lamp_Joint3');
  head.updateWorldMatrix(true, false);
  const aim = new THREE.Vector3(0, 1, 0).transformDirection(head.matrixWorld);
  head.getWorldPosition(lampLight.position).addScaledVector(aim, 0.06);
  lampLight.target.position.copy(lampLight.position).add(aim);
  scene.add(lampLight, lampLight.target);

  const measured = {};
  const pickable = { Lamp: LAMP_TARGET };
  for (const page of Object.values(PAGES)) {
    const mesh = root.getObjectByName(page.screen);
    const screen = measureScreen(mesh, page.flat);
    measured[page.screen] = screen;
    if (page.flat) {
      const eye = gltf.cameras[0].getWorldPosition(new THREE.Vector3());
      phoneLift = createPhoneLift(root.getObjectByName(page.object), screen, eye);
      measured[page.screen] = phoneLift.screen;
    }
    const card = page.flat ? createPhoneCard(mesh) : createScreenCard(mesh, page.label, screen.width / screen.height);
    const facing = page.flat ? { center: screen.center, up: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(0.25, 0, 0.97).normalize() } : screen;
    const pieces = createHoverPieces(page.pieces, facing, MATERIALS, tagForOutlines, pieceColors);
    scene.add(pieces.group);
    cards.set(page, { card, pieces, hover: 0 });
    pickable[page.object] = page;
  }
  flight = createFlight(measured, { requestFrames, reduceMotion });
  for (const name of ['Laptop', 'Monitor_Panel', 'Phone', 'Mug']) {
    const box = new THREE.Box3().setFromObject(root.getObjectByName(name));
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) fitPoints.push(new THREE.Vector3(x, box.min.y, z), new THREE.Vector3(x, box.max.y, z));
  }
  fitPoints.push(measured.Phone_Screen.center);
  pick = createPicker([root], pickable); // only the objects respond, never their hover panels

  const src = gltf.cameras[0];
  camera = src.clone();
  src.getWorldPosition(home);
  const forward = src.getWorldDirection(new THREE.Vector3());
  homeAim.copy(home).addScaledVector(forward, home.distanceTo(new THREE.Vector3(0, 0.8, 0)));
  camera.far = 220; // far enough for the skyline layers
  baseNear = camera.near;
  post.uniforms.uNear.value = camera.near;
  post.uniforms.uFar.value = camera.far;
  resize();
  navigation.attachDesk(flight);
  if (import.meta.env.DEV) window.__desk = { shadowRedraws: 0, scene, get camera() { return camera; }, renderer, hover, flight, navigation, toys, pen, frameDesk, get lampOn() { return lampOn; } };

  const palette = initialPalette();
  applyPalette(palette);
  addSkyline();
  if (import.meta.env.DEV && !params.has('clean')) reviewPanel({ palette });
  if (!navigation.onPage && !navigation.basic) requestFrames();
});

renderer.domElement.addEventListener('click', (e) => {
  if (!flight?.atDesk || pen?.takeClick()) return;
  const target = pick(camera, e.clientX, e.clientY);
  if (target === LAMP_TARGET) setLamp(!lampOn);
  else if (target) navigation.go(Object.keys(PAGES).find((path) => PAGES[path] === target));
});
addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; });
// Scrolling over the laptop takes over its timeline.
addEventListener('wheel', (e) => {
  if (!e.ctrlKey && hovered) cards.get(hovered)?.pieces.scrub(e.deltaY + e.deltaX);
}, { passive: true });

export function setDeskActive(active) {
  if (!flight) return;
  if (active) requestFrames();
  else renderer.setAnimationLoop(null);
}

export function startDesk(nav) {
  navigation = nav;
  loadDesk();
}
