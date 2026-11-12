// New York: Midtown around the Empire State Building, with the Brooklyn Bridge in front.
import { CLOUD_END, LIT_SHARE, blocks, box, buildingRow, cable, clouds, ground, litTower, strip, windows } from './shapes.js';

const DECK = 8;
const BRIDGE_TOP = 16.3;
const TOWER = { half: 2.1, cornice: 0.45 }; // the stone towers, either side of their center
const BRIDGE_TOWERS = [-15.4, 1];

// The Empire State Building's setbacks as [width, top height], widest first, then the mast.
// Every setback sits LIFT higher than first drawn, so the building clears the raised front row.
const LIFT = 1.9;
const EMPIRE = { x: 5.4, tiers: [[3.3, 5.2], [2.7, 10.6], [2.1, 14.2], [1.6, 15.4], [1.05, 16.2], [0.62, 17], [0.22, 18.6]].map(([w, h]) => [w, h + LIFT]), peak: 19.6 + LIFT };

// [x, width, height] for the Midtown towers around it.
const MIDTOWN = [
  [2.4, 1.2, 9.4], [3.4, 1.1, 11.6], [7.6, 1.2, 10.8], [8.7, 0.7, 14.6], [9.8, 1.5, 9.6],
  [11.3, 1.2, 12.2], [12.7, 1.6, 8.4], [14.2, 1.3, 10],
];

// A staircase outline: its left edge at the given offsets from center, each to its top
// height, then back down the right edge. tiers are [left, right, top] in order up.
function steps(x, tiers, peak) {
  const left = [], right = [];
  let h0 = 0;
  for (const [l, r, h] of tiers) {
    left.push([x + l, h0], [x + l, h]);
    right.push([x + r, h0], [x + r, h]);
    h0 = h;
  }
  return [...left, ...(peak ? [[x, peak]] : []), ...right.reverse()];
}

const { x: ex, tiers, peak } = EMPIRE;
const widthAt = (y) => (tiers.find(([, h]) => y < h) ?? tiers.at(-1))[0];
const empireTower = {
  shape: steps(ex, tiers.map(([w, h]) => [-w / 2, w / 2, h]), peak),
  // The lit side is the left share of each setback, so it steps up with them.
  lit: steps(ex, tiers.map(([w, h]) => [-w / 2, -w / 2 + w * LIT_SHARE, h])),
  windows: windows(613, ex, tiers[3][1], widthAt, 0.5), // none on the crown or mast
};

// A pointed (Gothic) arch opening: straight sides up to spring, then two curves to the point.
function gothicArch(x, w, base, spring, top, n = 8) {
  const left = [[x - w / 2, base], [x - w / 2, spring]];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    left.push([x - (w / 2) * (1 - Math.sin((t * Math.PI) / 2) ** 1.6), spring + (top - spring) * Math.sin((t * Math.PI) / 2)]);
  }
  return [...left, [x, top], ...left.map(([px, y]) => [2 * x - px, y]).reverse()];
}

// A broad stone tower with two tall pointed arches, and a cornice on top. The arches start
// at the deck's top edge, so the deck seems to pass into the stone and nothing shows below.
const DECK_HALF = 0.17; // half the deck strip's thickness
const ARCH = { w: 1.1, offsets: [-0.93, 0.93] };
const stoneTower = (x) => [
  { pts: box(x, TOWER.half * 2, BRIDGE_TOP - TOWER.cornice), holes: ARCH.offsets.map((dx) => gothicArch(x + dx, ARCH.w, DECK + DECK_HALF, 13.2, 14.3)) },
  box(x, TOWER.half * 2 + 0.3, BRIDGE_TOP, BRIDGE_TOP - TOWER.cornice),
];

const [west, east] = BRIDGE_TOWERS;
// [x0, x1, x2, x3, ...] -> deck strips x0-x1, x2-x3, ...
const deckSpans = (ends) => ends.filter((_, i) => i % 2 === 0).map((x0, i) => strip([[x0, DECK], [ends[i * 2 + 1], DECK]], DECK_HALF * 2));
const CABLE_TOP = BRIDGE_TOP - 0.7;

// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  far: [...MIDTOWN.map(litTower), empireTower],
  front: buildingRow(29, -26, 24, 8.8, 10.2, 1.5, 3).map(litTower), // tops just over the deck
};

export { CLOUD_END, clouds };

export default {
  far: [
    ...blocks(53, -36, 26, 2.6, 4.4, 2.2, 4), // the low city across the river, as far as the window shows
    ...blocks(41, 0, 16, 5, 8, 0.9, 1.7),
    ...towers.far.map((tower) => tower.shape),
  ],
  clouds: clouds.map(({ shape }) => shape),
  front: towers.front.map((tower) => tower.shape),
  mid: [
    // Cables stop at the tower faces, so nothing crosses the stone.
    ...cable(west + TOWER.half, CABLE_TOP, east - TOWER.half, CABLE_TOP, DECK + 1, DECK),
    ...cable(east + TOWER.half, CABLE_TOP, 16.6, DECK + 1.6, DECK + 0.9, DECK),
    ...cable(-30.4, DECK + 1.6, west - TOWER.half, CABLE_TOP, DECK + 0.9, DECK),
    // The deck comes just before the towers, so the two sit at almost the same depth in the
    // layer and stay lined up as the view moves. It stops inside the stone, short of the arches.
    ...deckSpans([-44, ...BRIDGE_TOWERS.flatMap((x) => [x - TOWER.half + 0.4, x + TOWER.half - 0.4]), 24]),
    ...BRIDGE_TOWERS.flatMap(stoneTower),
  ],
  near: [ground(2.2), ...blocks(67, 9, 34, 3.6, 5.6, 2.4, 4.4), ...blocks(71, -60, -30, 3.6, 5.8, 2.4, 4.4)],
};
