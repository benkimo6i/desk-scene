// Review viewer. Rebuilds the Blender preview look in real time:
// two sun lights with the same strengths as Blender, a three-step colour ramp,
// and a screen-space pass for ink lines.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { CITIES, cityForTimezone } from './skylines/index.js';

// Each material has lit / shadow / deep colours. 'harbor', the default, matches PALETTE in blender/build_desk.py.
const PALETTES = {
  blue: {
    label: 'Cobalt and cream',
    sky: '#DCE6EF', screen: '#DCE6F2', ink: '#0D1433',
    skyline: ['#B9CBE2', '#8BA3CF', '#4B5A99'],
    materials: {
      M_Main: ['#CFC7B8', '#1E4DB5', '#17399A'],
      M_Paper: ['#BFD2E6', '#8FA8C8', '#7690B2'],
      M_Blueprint: ['#B4C2D4', '#7F96B8', '#6F88AC'],
      M_Sheet: ['#CBCFD4', '#9BAAC2', '#8798B4'],
      M_Dark: ['#1E4DB5', '#17399A', '#122E80'],
      M_Green: ['#9DBB9A', '#4F7F62', '#3E6B54'],
      M_Accent: ['#D9553B', '#A8402F', '#8E3528'],
    },
  },
  indigo: {
    label: 'Indigo and cream',
    sky: '#E4E3EF', screen: '#E6E6F3', ink: '#0F0F38',
    skyline: ['#C4C4E0', '#9593C8', '#4F4C9C'],
    materials: {
      M_Main: ['#EFE6D2', '#2B2A7E', '#1F1E63'],
      M_Paper: ['#DCD9E6', '#8B88BE', '#7370AB'],
      M_Blueprint: ['#CFCDDF', '#7A77B4', '#66639F'],
      M_Sheet: ['#E6E3EA', '#A09DC8', '#8784B5'],
      M_Dark: ['#2B2A7E', '#1F1E63', '#16154C'],
      M_Green: ['#A8BE98', '#4C7A6A', '#3C6658'],
      M_Accent: ['#D9553B', '#A8402F', '#8E3528'],
    },
  },
  harbor: {
    label: 'Blue #0B4C92',
    sky: '#DCE8F1', screen: '#E0EAF3', ink: '#06203F',
    skyline: ['#B5CCE2', '#7FA3CB', '#2F5F9A'],
    materials: {
      M_Main: ['#EFE6D2', '#0B4C92', '#083A72'],
      M_Paper: ['#C5D6E6', '#7FA0C4', '#6688AE'],
      M_Blueprint: ['#B9C8D8', '#6F90B6', '#5C7DA3'],
      M_Sheet: ['#DCE2E6', '#94ACC8', '#7C96B4'],
      M_Dark: ['#0B4C92', '#083A72', '#062C58'],
      M_Green: ['#9DBB9A', '#4F7F62', '#3E6B54'],
      M_Accent: ['#D9553B', '#A8402F', '#8E3528'],
    },
  },
  dusk: {
    label: 'Dusk',
    sky: '#F9DCCB', screen: '#FCEDE5', ink: '#1B1B4B',
    skyline: ['#EDBFBB', '#B592BB', '#5F5A9E'],
    materials: {
      M_Main: ['#F0CFC4', '#3A3F8F', '#2C2F70'],
      M_Paper: ['#F4DCD3', '#8F86B8', '#736EA3'],
      M_Blueprint: ['#E8CEC8', '#7C78AE', '#676398'],
      M_Sheet: ['#F6E4DC', '#A39CC4', '#8A84B2'],
      M_Dark: ['#3A3F8F', '#2C2F70', '#20235A'],
      M_Green: ['#B8C9A0', '#5B7F78', '#4A6A68'],
      M_Accent: ['#E8604C', '#B04660', '#8F3858'],
    },
  },
  ink: {
    label: 'Ink',
    sky: '#E4E2DD', screen: '#EFEDE8', ink: '#101114',
    skyline: ['#CBC9C3', '#9B9C9E', '#55585F'],
    materials: {
      M_Main: ['#D6D3CC', '#2A2D34', '#1C1E23'],
      M_Paper: ['#DAD8D2', '#8B8E94', '#6F7279'],
      M_Blueprint: ['#CFCDC7', '#7C7F86', '#65686F'],
      M_Sheet: ['#E2E0DA', '#A0A2A7', '#84868C'],
      M_Dark: ['#2A2D34', '#1C1E23', '#121317'],
      M_Green: ['#A9B5A0', '#56665A', '#445248'],
      M_Accent: ['#D9553B', '#A8402F', '#8E3528'],
    },
  },
};
const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color();

// Blender (x, y, z) -> three (x, z, -y)
const key = new THREE.DirectionalLight('#fff', 8);
key.position.set(-1, 0.55, 0.8).normalize().multiplyScalar(6).add(new THREE.Vector3(0, 0.7, 0));
key.target.position.set(0, 0.7, 0);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
Object.assign(key.shadow.camera, { left: -3.4, right: 3.4, top: 3.4, bottom: -3.4, near: 0.5, far: 13 });
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.004;
key.shadow.radius = 1.2;
const fill = new THREE.DirectionalLight('#fff', 0.62);
fill.position.set(0.2, 1, 0.3);
scene.add(key, key.target, fill);

function toonMaterial(tones) {
  // Both sides cast shadows. With the default, walls cast from their room-facing side,
  // which is flush with the corner and lets a hairline of sun through.
  const m = new THREE.MeshLambertMaterial({ color: '#fff', shadowSide: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, tones);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uLit, uShadow, uDeep;
        float grainAt(vec2 p) {
          vec2 c = floor(p);
          return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
        }`)
      .replace('#include <opaque_fragment>', `
        float n = grainAt(gl_FragCoord.xy / 1.5);
        float base = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        // Roughen only the sunlit edge; noise on the blue-to-blue step reads as blotches.
        float v = base + (n - 0.5) * 0.10;
        vec3 tone = base < 0.10 ? uDeep : (v < 0.30 ? uShadow : uLit);
        outgoingLight = tone * (0.92 + 0.16 * n);
        #include <opaque_fragment>`);
  };
  return m;
}
const newTones = () => ({
  uLit: { value: new THREE.Color() },
  uShadow: { value: new THREE.Color() },
  uDeep: { value: new THREE.Color() },
});
const TONES = Object.fromEntries(Object.keys(PALETTES.blue.materials).map((k) => [k, newTones()]));
const MATERIALS = Object.fromEntries(Object.entries(TONES).map(([k, v]) => [k, toonMaterial(v)]));
const SCREEN = new THREE.MeshBasicMaterial();
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

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  renderer.getDrawingBufferSize(size);
  colorRT.setSize(size.x, size.y);
  normalRT.setSize(size.x, size.y);
  post.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
});

function render() {
  eased.lerp(mouse, 0.06);
  camera.position.copy(home).add(new THREE.Vector3(eased.x * 0.09, -eased.y * 0.05, 0));
  camera.lookAt(homeAim);
  renderer.setRenderTarget(colorRT);
  renderer.render(scene, camera);
  const bg = scene.background;
  scene.background = null;
  scene.overrideMaterial = idMaterial;
  renderer.setRenderTarget(normalRT);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  scene.background = bg;
  renderer.setRenderTarget(null);
  renderer.render(screenScene, screenCam);
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

function applyPalette(name) {
  const p = PALETTES[name];
  for (const [k, [lit, shadow, deep]] of Object.entries(p.materials)) {
    TONES[k].uLit.value.set(lit);
    TONES[k].uShadow.value.set(shadow);
    TONES[k].uDeep.value.set(deep);
  }
  scene.background.set(p.sky);
  SCREEN.color.set(p.screen);
  post.uniforms.uInk.value.set(p.ink);
  p.skyline.forEach((c, i) => SKYLINE[i].color.set(c));
}

// The skyline is flat layers well outside the window. Layers sit at different distances
// and scale to match, so they keep their composition but shift apart as the camera drifts.
const SKYLINE_BEARING = THREE.MathUtils.degToRad(41);
const SKYLINE_BASE = Math.tan(THREE.MathUtils.degToRad(24));
const LAYERS = [['far', 95], ['mid', 75], ['near', 60]];
let skyline = null;

function toShape(item) {
  const { pts, holes = [] } = Array.isArray(item) ? { pts: item } : item;
  const path = (list) => list.map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape(path(pts));
  shape.holes = holes.map((h) => new THREE.Path(path(h)));
  return shape;
}

let skylineRequest = 0;
async function showSkyline(city) {
  const request = ++skylineRequest;
  const { default: data } = await CITIES[city].load();
  if (request !== skylineRequest) return;
  if (skyline) {
    scene.remove(skyline);
    skyline.traverse((o) => o.geometry?.dispose());
  }
  skyline = new THREE.Group();
  const dir = new THREE.Vector3(-Math.cos(SKYLINE_BEARING), 0, -Math.sin(SKYLINE_BEARING));
  LAYERS.forEach(([name, distance], i) => {
    const layer = new THREE.Group();
    layer.position.copy(home).addScaledVector(dir, distance);
    layer.position.y = home.y - distance * SKYLINE_BASE;
    layer.scale.setScalar(distance / 60);
    layer.lookAt(home.x, layer.position.y, home.z);
    data[name].forEach((item, order) => {
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
  group('Palette', PALETTES, state.palette, applyPalette);
  group('Skyline', CITIES, state.city, showSkyline);
  document.body.append(panel);
}

new GLTFLoader().load(`${import.meta.env.BASE_URL}models/desk.glb`, (gltf) => {
  const root = gltf.scene;
  root.traverse((o) => {
    if (!o.isMesh) return;
    tagForOutlines(o);
    const name = o.material.name;
    if (name === 'M_Screen') {
      o.material = SCREEN;
      o.castShadow = true;
      return;
    }
    o.material = MATERIALS[name] ?? MATERIALS.M_Main;
    o.castShadow = o.receiveShadow = true;
  });
  scene.add(root);
  root.updateMatrixWorld(true);

  const src = gltf.cameras[0];
  camera = src.clone();
  src.getWorldPosition(home);
  const forward = src.getWorldDirection(new THREE.Vector3());
  homeAim.copy(home).addScaledVector(forward, home.distanceTo(new THREE.Vector3(0, 0.8, 0)));
  camera.far = 220; // far enough for the skyline layers
  post.uniforms.uNear.value = camera.near;
  post.uniforms.uFar.value = camera.far;
  resize();
  renderer.setAnimationLoop(render);
  window.__desk = { scene, get camera() { return camera; }, renderer };

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const palette = PALETTES[params.get('palette')] ? params.get('palette') : 'harbor';
  const city = CITIES[params.get('city')] ? params.get('city') : cityForTimezone(zone);
  applyPalette(palette);
  showSkyline(city);
  if (!params.has('clean')) reviewPanel({ palette, city });
});
