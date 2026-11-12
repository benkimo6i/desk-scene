// Paris: the Eiffel Tower over a row of mansard roofs, with the low stone arches of the
// Pont Marie in front.
import { CLOUD_END, LIT_SHARE, blocks, box, buildingRow, clouds, ground, litTower, windows } from './shapes.js';

// The window sill hides everything below about height 6.5, so Paris is drawn above it.
// Pont Marie is low, with round arches and no towers or cables: only the tops of its arches
// and the parapet show over the sill.
const DECK = 7.6;
const PARAPET = 0.3;
const ARCH = { spacing: 3, w: 2.2, spring: 6.1, base: 0.3, from: -4.5, to: 10.5 }; // arch centers run from..to

// The Eiffel Tower stands on ground just below the roofs, so its flare and both platforms
// show. Its half-width narrows up the height in a curve, as on the real tower.
// It sits 1.5 higher than first drawn: less than the roofs rose, so the antenna stays in view.
const EIFFEL = { x: 3.6, ground: 7.9, base: 3.2, waist: 0.12, curve: 2.75, top: 20.7, antenna: 22.5 };
const RISE = EIFFEL.top - EIFFEL.ground;
const PLATFORMS = [0.21, 0.4].map((share) => EIFFEL.ground + share * RISE); // first and second platforms
const PLATFORM = { out: 0.2, h: 0.35 };

// [x, width, height] for a few low towers behind.
const CITY = [[-0.6, 1.4, 9.2], [0.9, 1.2, 9.8], [7.2, 1.5, 9.4], [8.6, 1.2, 10.2], [12.4, 1.6, 9]];

const { x: ex, ground: foot, base, waist, curve, top, antenna } = EIFFEL;
const halfWidth = (y) => waist + base * (1 - (Math.min(Math.max(y, foot), top) - foot) / RISE) ** curve;

// The left outline from the ground to the top platform, with the platforms standing out.
function eiffelLeft() {
  const pts = [[ex - halfWidth(foot), 0]]; // straight down from its feet, out of sight
  const profile = (y0, y1, n) => {
    for (let i = 0; i <= n; i++) {
      const y = y0 + ((y1 - y0) * i) / n;
      pts.push([ex - halfWidth(y), y]);
    }
  };
  let y = foot;
  for (const p of PLATFORMS) {
    profile(y, p, 6);
    const w = halfWidth(p) + PLATFORM.out;
    pts.push([ex - w, p], [ex - w, p + PLATFORM.h]);
    y = p + PLATFORM.h;
  }
  profile(y, top - 0.4, 8);
  pts.push([ex - 0.32, top - 0.4], [ex - 0.32, top], [ex - 0.05, top], [ex - 0.03, antenna]);
  return pts;
}

// The great arch between the legs, and the narrowing gap between the first two platforms.
function eiffelHoles() {
  const arch = [];
  const a = halfWidth(foot) * 0.6, b = PLATFORMS[0] - foot - 0.4;
  arch.push([ex + a, 0.2]);
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * Math.PI;
    arch.push([ex + a * Math.cos(t), foot + b * Math.sin(t)]);
  }
  arch.push([ex - a, 0.2]);
  const [p1, p2] = PLATFORMS;
  const low = p1 + PLATFORM.h + 0.25, high = p2 - 0.35;
  const gap = [[ex - halfWidth(low) * 0.55, low], [ex + halfWidth(low) * 0.55, low], [ex + halfWidth(high) * 0.3, high], [ex - halfWidth(high) * 0.3, high]];
  return [arch, gap];
}

const left = eiffelLeft();
const eiffel = {
  shape: { pts: [...left, ...left.map(([x, y]) => [2 * ex - x, y]).reverse()], holes: eiffelHoles() },
  // The lit side is a strip down the left leg, clear of the openings. No lit windows.
  lit: (() => {
    const edge = [];
    edge.push([ex - halfWidth(foot), 0]);
    for (let i = 0; i <= 16; i++) {
      const y = foot + ((top - 0.4 - foot) * i) / 16;
      edge.push([ex - halfWidth(y), y]);
    }
    return [...edge, ...edge.map(([x, y]) => [x + (ex - x) * 0.35, y]).reverse()];
  })(),
  windows: [],
};

// A Paris building: a stone body, a sloped mansard roof and a chimney.
const MANSARD = { inset: 0.35, h: 0.8, chimney: 0.45 };
const mansard = ([x, w, h], i) => {
  const roofTop = h + MANSARD.h;
  const cx = x + (i % 2 ? 0.2 : -0.2) * w; // chimneys alternate sides, always on the flat roof top
  return {
    shape: [
      [x - w / 2, 0], [x - w / 2, h], [x - w / 2 + MANSARD.inset, roofTop],
      [cx - 0.12, roofTop], [cx - 0.12, roofTop + MANSARD.chimney], [cx + 0.12, roofTop + MANSARD.chimney], [cx + 0.12, roofTop],
      [x + w / 2 - MANSARD.inset, roofTop], [x + w / 2, h], [x + w / 2, 0],
    ],
    lit: box(x - (w * (1 - LIT_SHARE)) / 2, w * LIT_SHARE, h),
    windows: windows(211 + i * 7, x, h, () => w, 0.42),
  };
};

// A round arch opening, base to crown.
function roundArch(x, w, base, spring) {
  const pts = [[x - w / 2, base]];
  for (let i = 0; i <= 12; i++) {
    const t = Math.PI - (i / 12) * Math.PI;
    pts.push([x + (w / 2) * Math.cos(t), spring + (w / 2) * Math.sin(t)]);
  }
  pts.push([x + w / 2, base]);
  return pts;
}

const arches = [];
for (let x = ARCH.from; x <= ARCH.to; x += ARCH.spacing) arches.push(roundArch(x, ARCH.w, ARCH.base, ARCH.spring));

// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  far: [...CITY.map(litTower), eiffel],
  front: buildingRow(43, -26, 24, 10.2, 11, 1.8, 3.2).map(mansard), // Paris keeps an even roofline, level with the Eiffel's second platform
};

export { CLOUD_END, clouds };

export default {
  far: [
    ...blocks(61, -36, 26, 7, 8.6, 2.2, 4), // the low city behind, just over the roofs
    ...towers.far.map((tower) => tower.shape),
  ],
  clouds: clouds.map(({ shape }) => shape),
  front: towers.front.map((tower) => tower.shape),
  mid: [
    // One long stone span with its arches cut through, then the parapet along the top.
    { pts: box(0, 88, DECK), holes: arches },
    box(0, 88, DECK + PARAPET, DECK),
  ],
  near: [ground(2.2), ...blocks(83, 9, 34, 3.2, 4.8, 2.4, 4.4), ...blocks(89, -60, -30, 3.2, 5, 2.4, 4.4)],
};
