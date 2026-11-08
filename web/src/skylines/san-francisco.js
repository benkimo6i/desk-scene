import { blocks, box, cloud, ground, hill, strip, taper } from './shapes.js';

const DECK = 8;
const BRIDGE_TOP = 20;
const TOWER_LEG = 0.72; // a tower's legs, either side of its center
const PYRAMID = { x: 5.3, base: 3.6, top: 0.06, h: 17.5 };

// [x, width, height] for the downtown towers around the Pyramid.
const DOWNTOWN = [
  [2.5, 1.3, 8.2], [3.5, 1.2, 10.4], [7.5, 1.3, 11.6], [8.7, 1.2, 8.6], [10, 1.6, 10.2],
  [11.5, 1.3, 7.4], [12.8, 1.5, 9], [14.2, 1.3, 7.8],
];

// Height of a cable at x, hanging between two points in a parabola.
const sag = (x, x0, top0, x1, top1, low) => {
  const t = (x - x0) / (x1 - x0);
  return (1 - t) * top0 + t * top1 + 4 * t * (1 - t) * (low - (top0 + top1) / 2);
};

function cable(x0, top0, x1, top1, low) {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const x = x0 + ((x1 - x0) * i) / 20;
    pts.push([x, sag(x, x0, top0, x1, top1, low)]);
  }
  const hangers = [];
  for (let x = x0 + 1.1; x < x1 - 0.4; x += 1.1) {
    hangers.push(box(x, 0.06, sag(x, x0, top0, x1, top1, low), DECK));
  }
  return [strip(pts, 0.16), ...hangers];
}

// Twin tapering legs tied together by portal beams, on a concrete pier.
const tower = (x) => [
  taper(x - TOWER_LEG, 0.62, 0.36, BRIDGE_TOP),
  taper(x + TOWER_LEG, 0.62, 0.36, BRIDGE_TOP),
  box(x, 1.8, BRIDGE_TOP - 0.1, BRIDGE_TOP - 0.7),
  box(x, 1.8, 17.3, 16.6),
  box(x, 1.9, 14, 13.3),
  box(x, 2, 10.6, 9.9),
  box(x, 3, 3.6),
];

// Repeatable lit windows on a building. widthAt narrows them for a tapering tower.
function windows(seed, x, h, widthAt, litShare) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const lights = [];
  for (let y = 2.8; y < h - 0.5; y += 0.62) {
    const half = widthAt(y) / 2 - 0.16;
    for (let offset = -half; offset <= half; offset += 0.38) {
      if (rnd() > litShare) continue;
      lights.push({ x: x + offset, y, w: 0.17, h: 0.27, core: rnd() < 0.3 });
    }
  }
  return lights;
}

const LIT_SHARE = 0.42; // how much of a tower's width faces the light

const downtownTower = ([x, w, h], i) => ({
  shape: box(x, w, h),
  lit: box(x - (w * (1 - LIT_SHARE)) / 2, w * LIT_SHARE, h),
  windows: windows(101 + i * 7, x, h, () => w, 0.42),
});

const { x: px, base, top, h: pyramidHeight } = PYRAMID;
// The Pyramid's two wings rise straight up out of the taper and stop flat below the spire,
// all one silhouette.
const WING_OUT = 0.175; // how far a wing reaches past the triangle at its top
const WING_TO = 0.88; // share of the height: the plain spire above stays short
const wingTo = pyramidHeight * WING_TO;
const wingHalf = (base + (top - base) * WING_TO) / 2 + WING_OUT;
const wingFrom = ((base - 2 * wingHalf) / (base - top)) * pyramidHeight; // where the taper is as wide
const pyramidLeft = [[px - base / 2, 0], [px - wingHalf, wingFrom], [px - wingHalf, wingTo], [px - wingHalf + WING_OUT, wingTo], [px - top / 2, pyramidHeight]];
const pyramidTower = {
  shape: [...pyramidLeft, ...pyramidLeft.map(([x, y]) => [2 * px - x, y]).reverse()],
  lit: [...pyramidLeft, [px, pyramidHeight], [px - base * 0.1, 0]],
  windows: windows(907, px, wingTo + 0.5, (y) => base + (top - base) * (y / pyramidHeight), 0.5), // none on the spire
};

// Repeatable [x, width, height] rows, for the buildings between downtown and the bridge.
function buildingRow(seed, x0, x1, hMin, hMax, wMin, wMax) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const row = [];
  for (let x = x0; x < x1;) {
    const w = wMin + rnd() * (wMax - wMin);
    row.push([x + w / 2, w, hMin + rnd() * (hMax - hMin)]);
    x += w * (0.86 + rnd() * 0.2);
  }
  return row;
}

// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  far: [...DOWNTOWN.map(downtownTower), pyramidTower],
  front: buildingRow(17, -26, 24, 5.4, 8.2, 1.7, 3.2).map(downtownTower),
};

// Each period shows the first cloudCount of these, so the first few start in the main pane.
// A spot is a share of the visible width, which main.js measures from the current view.
const CLOUD_SPOTS = [0.62, 0.44, 0.78, 0.52, 0.9, 0.7, 0.34, 0.12, 0.24];
export const CLOUD_END = 13; // behind the right edge of the window
export const clouds = CLOUD_SPOTS.map((spot, i) => {
  const low = i % 3 === 1;
  const size = (i * 0.37) % 1;
  return {
    spot,
    shape: cloud(0, low ? 10.5 + size * 4.5 : 19 + size * 9, low ? 3 + size * 2.6 : 1.4 + size * 2.2, i + 1),
    speed: low ? 0.16 : 0.1, // skyline units per second
  };
});

export default {
  far: [
    hill(-60, -6, 8.5),
    hill(16, 62, 10),
    ...blocks(41, 3, 15, 5, 7.6, 0.9, 1.7),
    ...towers.far.map((tower) => tower.shape),
  ],
  clouds: clouds.map(({ shape }) => shape),
  front: towers.front.map((tower) => tower.shape),
  mid: [
    // Cables stop at the legs, so nothing crosses the opening between them.
    ...cable(-15.4 + TOWER_LEG, BRIDGE_TOP - 0.9, 1 - TOWER_LEG, BRIDGE_TOP - 0.9, DECK + 1),
    ...cable(1 + TOWER_LEG, BRIDGE_TOP - 0.9, 16.6, DECK + 2, DECK + 1.2),
    ...cable(-30.4, DECK + 2, -15.4 - TOWER_LEG, BRIDGE_TOP - 0.9, DECK + 1.2),
    strip([[-44, DECK], [24, DECK]], 0.34),
    ...tower(-15.4),
    ...tower(1),
  ],
  near: [ground(2.2), hill(9, 34, 6), hill(-60, -30, 6.5)],
};
