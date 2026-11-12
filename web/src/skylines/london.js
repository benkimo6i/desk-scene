// London: Tower Bridge in front, with Elizabeth Tower (Big Ben) and the Houses of Parliament
// to its right.
import { CLOUD_END, LIT_SHARE, blocks, box, buildingRow, cable, clouds, ground, litTower, strip, taper } from './shapes.js';

// The whole bridge sits DROP lower than the other cities' bridges, so the chain passes under
// Big Ben's clock face.
const DROP = 1.2;
const DECK = 8 - DROP;
const DECK_HALF = 0.17; // half the deck strip's thickness
// Both towers, the walkway and Big Ben fit the view (about x -1.5 to 6.5 at 16:9).
const BRIDGE_TOWERS = [-0.3, 3.3];
const TOWER = { half: 1, body: 14.5 - DROP, roof: 16.8 - DROP }; // body top, then the pointed roof's peak
const TURRET = { inset: 0.18, w: 0.36, top: 15.2 - DROP, peak: 16 - DROP }; // the corner turrets
const WALKWAY = { bottom: 12.3 - DROP, top: 13.3 - DROP }; // the high walkway between the towers
const CHAIN_TOP = 12.8 - DROP; // where the chains leave the towers, at the walkway

// Elizabeth Tower as [width, top height] stages: the shaft, the clock stage, the belfry,
// then its tall pointed roof and spire. Its left edge tucks behind the near bridge tower.
// It sits LIFT higher than first drawn, clear of the raised front row.
const LIFT = 2.4;
const BIG_BEN = { x: 5.4, stages: [[1.95, 12.2 + LIFT], [2.4, 14 + LIFT], [1.95, 15.2 + LIFT]], roof: 18 + LIFT, spire: 18.8 + LIFT, tip: 0.09 };

// The working clock on Big Ben's face, keeping London time; main.js draws its face and hands.
export const clock = { x: BIG_BEN.x, y: 13.1 + LIFT, r: 0.78, zone: 'Europe/London' };

// [x, width, height] for the towers around it, lower than New York's; Parliament is the long one.
const CITY = [
  [1.5, 1.1, 8.4], [2.6, 1.1, 9.6], [7.4, 1.2, 7.2], [10.8, 6, 6.4], [15, 1.4, 8.8],
];

// A stepped outline: each stage is [left, right, top], in order up, then an optional point.
function steps(x, stages, peak) {
  const left = [], right = [];
  let h0 = 0;
  for (const [l, r, h] of stages) {
    left.push([x + l, h0], [x + l, h]);
    right.push([x + r, h0], [x + r, h]);
    h0 = h;
  }
  return [...left, ...peak, ...right.reverse()];
}

const { x: bx, stages, roof, spire, tip } = BIG_BEN;
const bigBen = {
  // The roof rises from the belfry's full width to a narrow tip, then the spire.
  shape: steps(bx, stages.map(([w, h]) => [-w / 2, w / 2, h]), [[bx - tip, roof], [bx - tip / 2, spire], [bx + tip / 2, spire], [bx + tip, roof]]),
  // Only the shaft takes the light side, below the clock. No lit windows.
  lit: box(bx - (stages[0][0] * (1 - LIT_SHARE)) / 2, stages[0][0] * LIT_SHARE, stages[0][1]),
  windows: [],
};

// A bridge tower: the stone body, its pointed roof, and a turret at each visible corner.
const bridgeTower = (x) => [
  box(x, TOWER.half * 2, TOWER.body),
  taper(x, TOWER.half * 2 - 0.5, 0.08, TOWER.roof, TOWER.body),
  ...[-1, 1].flatMap((side) => {
    const tx = x + side * (TOWER.half - TURRET.inset);
    return [box(tx, TURRET.w, TURRET.top, TOWER.body), taper(tx, TURRET.w, 0.04, TURRET.peak, TURRET.top)];
  }),
];

const [west, east] = BRIDGE_TOWERS;
// [x0, x1, x2, x3, ...] -> deck strips x0-x1, x2-x3, ...
const deckSpans = (ends) => ends.filter((_, i) => i % 2 === 0).map((x0, i) => strip([[x0, DECK], [ends[i * 2 + 1], DECK]], DECK_HALF * 2));

// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  far: [...CITY.map(litTower), bigBen],
  front: buildingRow(37, -26, 24, 8.4, 9.8, 1.6, 3.2).map(litTower), // tops just over the deck
};

export { CLOUD_END, clouds };

export default {
  far: [
    ...blocks(59, -36, 26, 2.4, 4, 2.2, 4), // the low city behind
    ...blocks(43, 0, 16, 4.4, 6.8, 0.9, 1.8),
    ...towers.far.map((tower) => tower.shape),
  ],
  clouds: clouds.map(({ shape }) => shape),
  front: towers.front.map((tower) => tower.shape),
  mid: [
    // The chains run from the walkway out to each shore; nothing hangs between the towers.
    ...cable(east + TOWER.half, CHAIN_TOP, 16.6, DECK + 1.6, DECK + 1, DECK),
    ...cable(-30.4, DECK + 1.6, west - TOWER.half, CHAIN_TOP, DECK + 1, DECK),
    box((west + east) / 2, east - west, WALKWAY.top, WALKWAY.bottom),
    // The deck comes just before the towers, so the two sit at almost the same depth in the
    // layer and stay lined up as the view moves. It stops inside the stone.
    ...deckSpans([-44, ...BRIDGE_TOWERS.flatMap((x) => [x - TOWER.half + 0.4, x + TOWER.half - 0.4]), 24]),
    ...BRIDGE_TOWERS.flatMap(bridgeTower),
  ],
  near: [ground(2.2), ...blocks(73, 9, 34, 3.4, 5.4, 2.4, 4.4), ...blocks(79, -60, -30, 3.4, 5.6, 2.4, 4.4)],
};
