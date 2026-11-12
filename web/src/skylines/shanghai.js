// Shanghai: the Oriental Pearl Tower over a row of modern towers, with the H tower of the
// Nanpu Bridge in front.
import { CLOUD_END, blocks, box, buildingRow, clouds, ground, litTower, strip } from './shapes.js';

const DECK = 8;
const DECK_HALF = 0.17;
const TUCK = 0.14; // stays run on into the deck, so their ends never show above it

// Nanpu's H tower: two legs leaning in slightly toward the top, a cross beam a little below
// the middle of their height over the deck, and a beam under the deck; far enough right that
// both legs clear the window frame at 16:9. One straight stay runs
// from each leg's top out to the deck, left and right.
const H = { x: 0.9, foot: 1.15, head: 0.75, leg: 0.45, top: 16.3, beam: [11.9, 12.4] };
const STAY_REACH = 2.4; // short enough that the right stay lands before the Pearl's legs

// The Oriental Pearl Tower: three legs splaying out from under the lower sphere (shown as
// two slanted legs and the core), columns up to the upper sphere, which is nearly as big,
// then a tiny top sphere and the spire. It stands high enough that the legs show over the roofs.
const PEARL = { x: 5.4, legFoot: { y: 9, out: 2.2 }, leg: 0.36, columns: 0.45, column: 0.2, core: 0.32, lower: { y: 13.6, r: 1.05 }, upper: { y: 18.8, r: 0.85 }, top: { y: 20.6, r: 0.3 }, tip: 22.5 };

const circle = (x, y, r, n = 28) => Array.from({ length: n }, (_, i) => [x + r * Math.cos((i / n) * Math.PI * 2), y + r * Math.sin((i / n) * Math.PI * 2)]);
// The lit side of a sphere: the slice of the circle left of a line a little left of centre.
const litSlice = (x, y, r, n = 14) => Array.from({ length: n + 1 }, (_, i) => {
  const a = Math.PI / 2 + 0.35 + ((Math.PI - 0.7) * i) / n;
  return [x + r * Math.cos(a), y + r * Math.sin(a)];
});
const part = (shape, lit = []) => ({ shape, lit, windows: [] });

const { x: px, legFoot, leg, columns, column, core, lower, upper, top, tip } = PEARL;
const pearl = [
  ...[-1, 1].map((side) => part(strip([[px + side * 0.4, lower.y], [px + side * legFoot.out, legFoot.y]], leg))),
  part(box(px - columns, column, upper.y, lower.y)),
  part(box(px + columns, column, upper.y, lower.y)),
  part([[px - core / 2, 0], [px - core / 2, top.y], [px - 0.09, top.y + top.r + 0.1], [px - 0.03, tip], [px + 0.03, tip], [px + 0.09, top.y + top.r + 0.1], [px + core / 2, top.y], [px + core / 2, 0]]),
  part(circle(px, lower.y, lower.r), litSlice(px, lower.y, lower.r)),
  part(circle(px, upper.y, upper.r), litSlice(px, upper.y, upper.r)),
  part(circle(px, top.y, top.r)),
];

// [x, width, height] for other towers behind the front row.
// The two either side of the Pearl rise high, to frame it (user's marks).
const DOWNTOWN = [[-1, 1.3, 12.4], [1.6, 1.2, 19.3], [8.2, 1.4, 17.4], [12.4, 1.6, 12.2]];

// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  far: [...DOWNTOWN.map(litTower), ...pearl],
  front: buildingRow(97, -26, 24, 10.1, 11.7, 1.3, 2.6).map(litTower), // modern towers, well over the deck
};

export { CLOUD_END, clouds };

const { x: hx, foot: hFoot, head, leg: hLeg, top: hTop, beam } = H;
// A leg's centre at height y, leaning in from the foot to the head.
const legX = (side, y) => hx + side * (hFoot + (head - hFoot) * (y / hTop));
const hLegs = [-1, 1].map((side) => [[legX(side, 0) - hLeg / 2, 0], [legX(side, hTop) - hLeg / 2, hTop], [legX(side, hTop) + hLeg / 2, hTop], [legX(side, 0) + hLeg / 2, 0]]);
const beamAt = ([y0, y1]) => [[legX(-1, y0), y0], [legX(-1, y1), y1], [legX(1, y1), y1], [legX(1, y0), y0]];
const stays = [-1, 1].map((side) => strip([[legX(side, hTop - 0.3), hTop - 0.3], [legX(side, hTop) + side * STAY_REACH, DECK - TUCK]], 0.08));

export default {
  far: [
    ...blocks(127, -36, 26, 7.6, 9.4, 2.2, 4), // the low city behind
    ...towers.far.map((tower) => tower.shape),
  ],
  clouds: clouds.map(({ shape }) => shape),
  front: towers.front.map((tower) => tower.shape),
  mid: [
    // Stays first, then the deck and the tower right after, so they line up as the view moves.
    ...stays,
    strip([[-44, DECK], [44, DECK]], DECK_HALF * 2),
    ...hLegs,
    beamAt(beam),
    beamAt([DECK - 0.8, DECK - DECK_HALF]), // the lower beam, under the deck
  ],
  near: [ground(2.2), ...blocks(131, 9, 34, 3.2, 4.8, 2.4, 4.4), ...blocks(137, -60, -30, 3.2, 5, 2.4, 4.4)],
};
