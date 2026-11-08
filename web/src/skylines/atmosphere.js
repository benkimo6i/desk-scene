// Everything outside the window: a sky gradient, and buildings that fade into the haze
// toward their base, so distance reads through tone. Gradients break up in the same grain
// as the room, which keeps them from looking airbrushed against its flat shading.
import * as THREE from 'three';

export const GRAIN_GLSL = /* glsl */ `
  float grainAt(vec2 p) {
    vec2 c = floor(p);
    return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
  }`;

const STIPPLE = 0.14; // how far the grain roughens a gradient
export const GRAIN_FINISH = '(0.86 + 0.28 * n)'; // brightness scatter, shared with the room
const finish = /* glsl */ `
  float n = grainAt(gl_FragCoord.xy / 1.5);
  float t = clamp(amount + (n - 0.5) * ${STIPPLE.toFixed(2)}, 0.0, 1.0);
  gl_FragColor = vec4(mix(uLow, uHigh, t) * ${GRAIN_FINISH}, 1.0);`;

// from and to are heights in skyline units: the color runs from low to high between them.
export function hazeMaterial(from = 0, to = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHigh: { value: new THREE.Color() }, uLow: { value: new THREE.Color() },
      uFrom: { value: from }, uTo: { value: to },
    },
    vertexShader: /* glsl */ `
      varying float vHeight;
      void main() {
        vHeight = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vHeight;
      uniform vec3 uHigh, uLow;
      uniform float uFrom, uTo;
      ${GRAIN_GLSL}
      void main() {
        float amount = smoothstep(uFrom, uTo, vHeight);
        ${finish}
      }`,
  });
}

// lowShare is how much of the haze color a shape takes on at its base.
export function setHaze(material, color, haze, lowShare = 0) {
  material.uniforms.uHigh.value.set(color);
  material.uniforms.uLow.value.set(color).lerp(new THREE.Color(haze), lowShare);
}

const SKY_RADIUS = 150;
const HAZE_TOP = -0.3; // slope of the view, where the gradient starts and ends
const SKY_TOP = -0.02;

export function createSky(center) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uHigh: { value: new THREE.Color() }, uLow: { value: new THREE.Color() } },
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDirection;
      uniform vec3 uHigh, uLow;
      ${GRAIN_GLSL}
      void main() {
        float slope = vDirection.y / max(length(vDirection.xz), 0.001);
        float amount = smoothstep(${HAZE_TOP.toFixed(2)}, ${SKY_TOP.toFixed(2)}, slope);
        ${finish}
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), material);
  mesh.position.copy(center);
  return {
    mesh,
    apply({ skyTop, haze }) {
      material.uniforms.uHigh.value.set(skyTop);
      material.uniforms.uLow.value.set(haze);
    },
  };
}
