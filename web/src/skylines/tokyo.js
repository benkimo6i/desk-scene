// Tokyo: Tokyo Tower over a dense row of modern towers, framed by the near tower and main
// cable of the Rainbow Bridge.
import { CLOUD_END, LIT_SHARE, box, buildingRow, cable, clouds, ground, blocks, litTower, strip } from './shapes.js';

const DECK = 8;
const DECK_HALF = 0.17;
// The near tower stands far enough right that both its legs clear the window frame at 16:9;
// the far tower stands out of view, past the window's right edge.
const BRIDGE_TOWERS = [1.2, 23.2];
// A Rainbow Bridge tower: wide and short, two legs joined at the top, with one tall opening
// above the deck whose top corners are rounded, like a single arch. The opening starts at the
// deck's top edge, so the deck seems to pass through.
const FRAME = { half: 1.6, leg: 0.5, top: 15, opening: { top: 14.1, round: 0.55 } };
const CABLE_TOP = FRAME.top - 0.4;

// Tokyo Tower: straighter legs than the Eiffel's, a boxy two-storey main deck, a small top
// deck and the antenna. Its feet stand just behind the rooftops.
// Its feet stand high enough that the arch between the legs shows over the rooftops.
const TOWER = { x: 5.2, ground: 9.5, base: 2.1, waist: 0.1, curve: 2, mainDeck: 0.45, topDeck: 0.75, tip: 21.5 };
const LEG_ARCH = 0.18; // share of the rise the arch between the legs reaches
const RISE = TOWER.tip - TOWER.ground;
const MAIN = { at: TOWER.ground + TOWER.mainDeck * RISE, w: 1.75, h: 0.7 };
const TOP = { at: TOWER.ground + TOWER.topDeck * RISE, w: 0.72, h: 0.36 };
const BANDS = 6; // the red-and-white bands, between the main deck and the top deck

// [x, width, height] for the taller towers behind the front row.
const DOWNTOWN = [[1.6, 1.3, 11.6], [3, 1.2, 12.4], [7.4, 1.4, 12], [8.8, 1.1, 11.2], [12.2, 1.6, 12.2]];

const { x: tx, ground: foot, base, waist, curve, tip } = TOWER;
const halfWidth = (y) => waist + base * (1 - (Math.min(Math.max(y, foot), tip) - foot) / RISE) ** curve;
const left = [
  [tx - halfWidth(foot), 0], [tx - halfWidth(foot), foot], [tx - halfWidth(MAIN.at), MAIN.at],
  [tx - MAIN.w / 2, MAIN.at], [tx - MAIN.w / 2, MAIN.at + MAIN.h], [tx - halfWidth(MAIN.at + MAIN.h), MAIN.at + MAIN.h],
  [tx - halfWidth(TOP.at), TOP.at], [tx - TOP.w / 2, TOP.at], [tx - TOP.w / 2, TOP.at + TOP.h], [tx - 0.1, TOP.at + TOP.h], [tx - 0.03, tip],
];
// The arch between the legs, and the narrowing gap above it up to the main deck, as on the Eiffel.
function legGaps() {
  const a = halfWidth(foot) * 0.6, b = LEG_ARCH * RISE;
  const arch = [[tx + a, 0.2]];
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * Math.PI;
    arch.push([tx + a * Math.cos(t), foot + b * Math.sin(t)]);
  }
  arch.push([tx - a, 0.2]);
  const low = foot + b + 0.35, high = MAIN.at - 0.3;
  const gap = [[tx - halfWidth(low) * 0.5, low], [tx + halfWidth(low) * 0.5, low], [tx + halfWidth(high) * 0.25, high], [tx - halfWidth(high) * 0.25, high]];
  return [arch, gap];
}

const edge = Array.from({ length: 13 }, (_, i) => {
  const y = foot + ((MAIN.at - foot) * i) / 12;
  return [tx - halfWidth(y), y];
});
const tokyoTower = {
  shape: { pts: [...left, ...left.map(([x, y]) => [2 * tx - x, y]).reverse()], holes: legGaps() },
  // The lit side is a strip down the left leg, clear of the openings. No lit windows.
  lit: [[tx - halfWidth(foot), 0], ...edge, ...edge.map(([x, y]) => [tx - (tx - x) * 0.62, y]).reverse(), [tx - halfWidth(foot) * 0.62, 0]],
  windows: [],
};

// Alternate bands between the decks, drawn over the tower in the darker backdrop tone.
const bandFrom = MAIN.at + MAIN.h, bandTo = TOP.at;
export const accents = Array.from({ length: BANDS }, (_, k) => k).filter((k) => k % 2 === 0).map((k) => {
  const y0 = bandFrom + ((bandTo - bandFrom) * k) / BANDS, y1 = bandFrom + ((bandTo - bandFrom) * (k + 1)) / BANDS;
  return [[tx - halfWidth(y0), y0], [tx - halfWidth(y1), y1], [tx + halfWidth(y1), y1], [tx + halfWidth(y0), y0]];
});

// The Rainbow Bridge tower, its opening as a hole so the sky shows through.
function frameTower(x) {
  const inner = FRAME.half - FRAME.leg, { top, round } = FRAME.opening;
  const opening = [[x - inner, DECK + DECK_HALF], [x - inner, top - round]];
  for (let i = 1; i < 6; i++) {
    const a = Math.PI - (i / 12) * Math.PI; // the rounded corner, a quarter turn
    opening.push([x - inner + round + round * Math.cos(a), top - round + round * Math.sin(a)]);
  }
  opening.push([x - inner + round, top]);
  const right = opening.map(([px, y]) => [2 * x - px, y]).reverse();
  return [{ pts: box(x, FRAME.half * 2, FRAME.top), holes: [[...opening, ...right]] }];
}

const [near, far] = BRIDGE_TOWERS;
// [x0, x1, x2, x3, ...] -> deck strips x0-x1, x2-x3, ...
const deckSpans = (ends) => ends.filter((_, i) => i % 2 === 0).map((x0, i) => strip([[x0, DECK], [ends[i * 2 + 1], DECK]], DECK_HALF * 2));

// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  far: [...DOWNTOWN.map(litTower), tokyoTower],
  front: buildingRow(89, -26, 24, 8.6, 10.2, 1.3, 2.6).map(litTower), // dense modern towers, tops just over the deck
};

export { CLOUD_END, clouds };

export default {
  far: [
    ...blocks(91, -36, 26, 7.6, 9.4, 2.2, 4), // the low city behind
    ...towers.far.map((tower) => tower.shape),
  ],
  clouds: clouds.map(({ shape }) => shape),
  front: towers.front.map((tower) => tower.shape),
  mid: [
    // The main cable sweeps from the near tower to the far one, past the window; the side
    // span runs off to the left.
    ...cable(near + FRAME.half, CABLE_TOP, far - FRAME.half, CABLE_TOP, DECK + 1, DECK),
    ...cable(-22, DECK + 1.6, near - FRAME.half, CABLE_TOP, DECK + 0.9, DECK),
    // The deck comes just before the towers, so they line up as the view moves, and stops
    // inside the frame's legs, out of sight through the opening.
    ...deckSpans([-44, near - FRAME.half + 0.25, near + FRAME.half - 0.25, far - FRAME.half + 0.25, far + FRAME.half - 0.25, 44]),
    ...BRIDGE_TOWERS.flatMap(frameTower),
  ],
  near: [ground(2.2), ...blocks(117, 9, 34, 3.2, 4.8, 2.4, 4.4), ...blocks(121, -60, -30, 3.2, 5, 2.4, 4.4)],
};
