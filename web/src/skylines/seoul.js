// Seoul: N Seoul Tower on the Namsan ridge, modern towers at its foot, a row of hanok roofs
// in front of them, and the flat girder deck of the Mapo Bridge nearest.
import { CLOUD_END, LIT_SHARE, blocks, box, buildingRow, clouds, ground, litTower, windows } from './shapes.js';

// A plain girder bridge: the deck at Paris's height over a deeper girder, on slim piers.
const DECK = 7.6;
const DECK_HALF = 0.17;
const GIRDER = 0.6; // how far the girder hangs below the deck
const PIERS = { from: -6, gap: 4.5, to: 14, w: 0.5 };

// Namsan as a ridge: the peak left of centre, a steeper left side with a shoulder, and a long
// gentle ridge falling away to the right with small bumps. Smoothed through these points.
const RIDGE = [
  [-6, 7.6], [-3, 9.8], [-1, 11.3], [0.2, 12], [0.9, 11.8], [1.8, 13.2], [2.8, 14.2], [3.7, 13.9], [4.7, 13.2],
  [5.6, 13], [6.6, 12.3], [7.8, 12.1], [9, 11.2], [10.6, 10.7], [12.4, 9.6], [15, 8.4],
];
const PEAK = RIDGE[6];
// Catmull-Rom through the points, so the ridge reads as land rather than a polyline.
const smooth = (pts, steps = 4) => pts.slice(0, -1).flatMap((p1, i) => {
  const p0 = pts[Math.max(i - 1, 0)], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
  return Array.from({ length: steps }, (_, k) => {
    const t = k / steps, t2 = t * t, t3 = t2 * t;
    const at = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
    return [at(p0[0], p1[0], p2[0], p3[0]), at(p0[1], p1[1], p2[1], p3[1])];
  });
}).concat([pts.at(-1)]);
const namsan = [[RIDGE[0][0], 0], ...smooth(RIDGE), [RIDGE.at(-1)[0], 0]];

// N Seoul Tower: a slim shaft, the stacked observation drum, its cap, then the antenna.
const FOOT = PEAK[1] - 0.3;
const TOWER = { x: PEAK[0], foot: FOOT, shaft: 0.46, ring: { w: 1.1, low: FOOT + 3.1, high: FOOT + 3.4 }, drum: { w: 1.32, top: FOOT + 4.3 }, cap: { w: 0.9, top: FOOT + 4.65 }, mast: 0.26, tip: FOOT + 8.25 };


const { x: tx, foot, shaft, ring, drum, cap, mast, tip } = TOWER;
const left = [
  [tx - shaft / 2, foot], [tx - shaft / 2, ring.low], [tx - ring.w / 2, ring.low], [tx - ring.w / 2, ring.high],
  [tx - drum.w / 2, ring.high], [tx - drum.w / 2 + 0.06, drum.top], [tx - cap.w / 2, drum.top], [tx - cap.w / 2, cap.top],
  [tx - mast / 2, cap.top], [tx - 0.03, tip],
];
const seoulTower = {
  shape: [...left, ...left.map(([x, y]) => [2 * tx - x, y]).reverse()],
  // The lit side runs up the left of the shaft. No lit windows.
  lit: box(tx - (shaft * (1 - LIT_SHARE)) / 2, shaft * LIT_SHARE, ring.low, foot),
  windows: [],
};

// A hanok roof: a low body under wide eaves that turn up at the tips, a curved roof slope
// and a ridge with upturned ends.
function hanok([x, w, h], i) {
  const eave = 0.35, ridge = h + 0.85, ridgeHalf = w * 0.28;
  const slope = Array.from({ length: 5 }, (_, k) => {
    const t = (k + 1) / 6;
    return [x - w / 2 - eave + (w / 2 + eave - ridgeHalf) * t, h + 0.22 + (ridge - h - 0.22) * t ** 1.6]; // sags, then rises
  });
  const leftSide = [[x - w / 2, 0], [x - w / 2, h], [x - w / 2 - eave, h + 0.28], ...slope, [x - ridgeHalf - 0.08, ridge + 0.1], [x - ridgeHalf, ridge]];
  return {
    shape: [...leftSide, ...leftSide.map(([px, y]) => [2 * x - px, y]).reverse()],
    lit: box(x - (w * (1 - LIT_SHARE)) / 2, w * LIT_SHARE, h),
    windows: windows(401 + i * 7, x, h, () => w, 0.4),
  };
}


// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  // Modern towers stand in front of the mountain's lower slopes, the tower above them all.
  far: [...buildingRow(83, -8, 16, 10.6, 12, 1.1, 2).map(litTower), seoulTower],
  front: buildingRow(73, -26, 24, 8.4, 9.2, 1.8, 3).map(hanok), // hanok roofs, just over the deck
};

export { CLOUD_END, clouds };

// The mountain sits behind everything in a darker tone (main.js), apart from the towers.
export const backdrop = [namsan];

const piers = [];
for (let x = PIERS.from; x <= PIERS.to; x += PIERS.gap) piers.push(box(x, PIERS.w, DECK - DECK_HALF - GIRDER + 0.05));

export default {
  far: [
    ...towers.far.map((tower) => tower.shape),
  ],
  clouds: clouds.map(({ shape }) => shape),
  front: towers.front.map((tower) => tower.shape),
  mid: [
    // Piers first, then the deck and girder as one band right after, so they line up.
    ...piers,
    box(-10, 68, DECK + DECK_HALF, DECK - DECK_HALF - GIRDER),
  ],
  near: [ground(2.2), ...blocks(109, 9, 34, 3.2, 4.8, 2.4, 4.4), ...blocks(113, -60, -30, 3.2, 5, 2.4, 4.4)],
};
