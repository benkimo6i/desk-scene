// Toronto: the CN Tower over a cluster of condo towers, with the white arches of the Humber
// Bay Arch Bridge in front.
import { CLOUD_END, LIT_SHARE, blocks, buildingRow, box, clouds, ground, litTower, strip } from './shapes.js';

// A low, slim pedestrian deck, as low as Paris's bridge, with two steel arches standing over
// it: a big one and a smaller one, each with hangers down to the deck.
const DECK = 7.6;
const DECK_HALF = 0.12;
const ARCHES = [{ from: -1.6, to: 5.6, rise: 4 }, { from: 5, to: 9.2, rise: 2.4 }];
const HANGER_GAP = 0.7;

// The CN Tower, tip near the Eiffel's: a tapering shaft, the main pod (bevelled in and out),
// a slimmer shaft up to the small SkyPod, then the long antenna.
const CN = { x: 3.2, base: 1.6, podFrom: 15.6, pod: { w: 2.1, low: 16.2, high: 16.8, top: 17.3 }, neck: 0.56, sky: { w: 0.84, low: 19.05, high: 19.4 }, tip: 22.3 };

// [x, width, height] for the taller downtown towers behind the condos.
const DOWNTOWN = [[-0.4, 1.3, 12.4], [1.4, 1.1, 13.2], [5.6, 1.4, 12.8], [7.2, 1.2, 11.6], [11, 1.6, 12]];

const { x: cx, base, podFrom, pod, neck, sky, tip } = CN;
const shaftAt = podFrom; // where the shaft meets the pod
const left = [
  [cx - base / 2, 0], [cx - 0.4, shaftAt], [cx - pod.w / 2, pod.low], [cx - pod.w / 2, pod.high], [cx - 0.55, pod.top],
  [cx - neck / 2, pod.top], [cx - neck / 2, sky.low - 0.15], [cx - sky.w / 2, sky.low], [cx - sky.w / 2, sky.high],
  [cx - 0.16, sky.high + 0.1], [cx - 0.03, tip],
];
const cnTower = {
  shape: [...left, ...left.map(([x, y]) => [2 * cx - x, y]).reverse()],
  // The lit side runs up the left of the shaft. No lit windows.
  lit: [[cx - base / 2, 0], [cx - 0.4, shaftAt], [cx - 0.4 + 0.8 * LIT_SHARE, shaftAt], [cx - base / 2 + base * LIT_SHARE, 0]],
  windows: [],
};

// An arch as a parabola from deck to deck, and its hangers.
const archY = ({ from, to, rise }, x) => {
  const t = (x - from) / (to - from);
  return DECK + 4 * rise * t * (1 - t);
};
const archShapes = (arch) => {
  const pts = Array.from({ length: 25 }, (_, i) => {
    const x = arch.from + ((arch.to - arch.from) * i) / 24;
    return [x, archY(arch, x)];
  });
  const hangers = [];
  for (let x = arch.from + HANGER_GAP; x < arch.to - 0.3; x += HANGER_GAP) {
    if (archY(arch, x) - DECK > 0.3) hangers.push(box(x, 0.05, archY(arch, x), DECK - DECK_HALF * 0.75)); // ends tucked into the deck
  }
  return { arch: strip(pts, 0.2), hangers };
};
const bridge = ARCHES.map(archShapes);

// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  far: [...DOWNTOWN.map(litTower), cnTower],
  front: buildingRow(61, -26, 24, 9, 10.8, 1, 1.8).map(litTower), // tall, narrow condos, tops just over the deck
};

export { CLOUD_END, clouds };

export default {
  far: [
    ...blocks(71, -36, 26, 7.6, 9.4, 2.2, 4), // the low city behind
    ...towers.far.map((tower) => tower.shape),
  ],
  clouds: clouds.map(({ shape }) => shape),
  front: towers.front.map((tower) => tower.shape),
  mid: [
    // Hangers first, then the arches and deck right after, so they line up as the view moves.
    ...bridge.flatMap(({ hangers }) => hangers),
    ...bridge.map(({ arch }) => arch),
    strip([[-44, DECK], [24, DECK]], DECK_HALF * 2),
  ],
  near: [ground(2.2), ...blocks(103, 9, 34, 3.2, 4.8, 2.4, 4.4), ...blocks(107, -60, -30, 3.2, 5, 2.4, 4.4)],
};
