// Stockholm: the City Hall tower over a row of steep gables, with the low iron arch of
// Skeppsholmsbron in front.
import { CLOUD_END, LIT_SHARE, blocks, box, buildingRow, clouds, ground, litTower, strip, windows } from './shapes.js';

// The window sill hides everything below about height 6.5, so the bridge's shallow arch
// springs just under it and rises to meet the deck. The deck sits as low as Paris's bridge.
const DECK = 7.6;
const DECK_HALF = 0.17;
const SPAN = { from: -2.6, to: 8.6, spring: 6.1, crown: DECK - DECK_HALF, strutGap: 0.8 };

// The City Hall tower: a square brick shaft, a ledge, a slimmer lantern, a pointed cap and
// a thin spire, all at SCALE of the first draft so it sits in proportion over the gables.
const SCALE = 0.8;
const LIFT = 1.4; // the tower and the front row stand this much higher than first drawn
const TOWER = { x: 4.2, w: 2.8 * SCALE, shaft: 15.5 * SCALE + LIFT, ledge: { w: 3.1 * SCALE, h: 0.3 * SCALE }, lantern: { w: 1.5 * SCALE, h: 2.2 * SCALE }, cap: 1.4 * SCALE, spire: 1.2 * SCALE };

// [x, width, height] for a few towers behind, mostly hidden by the gables.
const CITY = [[0.2, 1.4, 10.6], [8.2, 1.4, 11.2], [12.6, 1.6, 10.4]];

const { x: tx, w, shaft, ledge, lantern, cap, spire } = TOWER;
const ledgeTop = shaft + ledge.h;
const lanternTop = ledgeTop + lantern.h;
const capTop = lanternTop + cap;
const cityHall = {
  shape: [
    [tx - w / 2, 0], [tx - w / 2, shaft], [tx - ledge.w / 2, shaft], [tx - ledge.w / 2, ledgeTop],
    [tx - lantern.w / 2, ledgeTop], [tx - lantern.w / 2, lanternTop], [tx - 0.04, capTop], [tx - 0.03, capTop + spire],
    [tx + 0.03, capTop + spire], [tx + 0.04, capTop], [tx + lantern.w / 2, lanternTop], [tx + lantern.w / 2, ledgeTop],
    [tx + ledge.w / 2, ledgeTop], [tx + ledge.w / 2, shaft], [tx + w / 2, shaft], [tx + w / 2, 0],
  ],
  // Only the shaft takes the light side. No lit windows.
  lit: box(tx - (w * (1 - LIT_SHARE)) / 2, w * LIT_SHARE, shaft),
  windows: [],
};

// Gamla stan rooftops, mixed along the row so neighbours differ: a stepped gable with curled
// shoulders and a finial, a bell gable with a rounded top, and a sloped roof with a dormer.
// Each outline is its left half, mirrored.
const mirror = (x, left, peak = []) => [...left, ...peak, ...left.map(([px, y]) => [2 * x - px, y]).reverse()];

// A small outward curl from (x0, y0) up to (x1, y1), as a few points.
const curl = (x0, y0, x1, y1, n = 4) => Array.from({ length: n }, (_, i) => {
  const t = (i + 1) / n;
  return [x0 + (x1 - x0) * Math.sin((t * Math.PI) / 2), y0 + (y1 - y0) * (1 - Math.cos((t * Math.PI) / 2))];
});

const ROOFS = [
  // Stepped: three steps, each with a curled shoulder, then a finial.
  (x, w, h) => {
    const left = [[x - w / 2, 0], [x - w / 2, h]];
    const steps = [[0.5, 0.36, 0.45], [0.36, 0.24, 0.85], [0.24, 0.13, 1.25]];
    let y = h;
    for (const [from, to, top] of steps) {
      left.push(...curl(x - from * w, y, x - to * w, h + top - 0.12), [x - to * w, h + top]);
      y = h + top;
    }
    left.push([x - 0.13 * w, h + 1.55], [x - 0.04, h + 1.62]);
    return mirror(x, left, [[x, h + 1.85]]);
  },
  // Bell: a cornice ledge standing out past the walls, then the gable's sides lean in to a
  // broad round top.
  (x, w, h) => {
    const ledge = { out: 0.1, h: 0.22 };
    const r = 0.32 * w;
    const sides = h + ledge.h + 0.55;
    const left = [[x - w / 2, 0], [x - w / 2, h], [x - w / 2 - ledge.out, h], [x - w / 2 - ledge.out, h + ledge.h], [x - w / 2 + 0.08, h + ledge.h], [x - r, sides]];
    for (let i = 1; i < 8; i++) {
      const a = Math.PI - (i / 16) * Math.PI;
      left.push([x + r * Math.cos(a), sides + r * Math.sin(a)]);
    }
    return mirror(x, left, [[x, sides + r]]);
  },
  // Sloped: a mansard-like roof with a pointed dormer standing up from the middle.
  (x, w, h) => {
    const ridge = h + 0.7;
    const left = [[x - w / 2, 0], [x - w / 2, h], [x - w / 2 + 0.3, ridge], [x - 0.2, ridge], [x - 0.2, ridge + 0.32]];
    return mirror(x, left, [[x, ridge + 0.5]]);
  },
];
const ROOF_ORDER = [0, 1, 2, 1, 0, 2];

const gamlaStan = ([x, bw, h], i) => ({
  shape: ROOFS[ROOF_ORDER[i % ROOF_ORDER.length]](x, bw, h),
  lit: box(x - (bw * (1 - LIT_SHARE)) / 2, bw * LIT_SHARE, h),
  windows: windows(307 + i * 7, x, h, () => bw, 0.42),
});

// The arch is a shallow curve between the abutments, with struts up to the deck.
const archAt = (x) => {
  const t = (x - SPAN.from) / (SPAN.to - SPAN.from);
  return SPAN.spring + (SPAN.crown - SPAN.spring) * Math.sin(t * Math.PI);
};
const archPts = Array.from({ length: 25 }, (_, i) => {
  const x = SPAN.from + ((SPAN.to - SPAN.from) * i) / 24;
  return [x, archAt(x)];
});
const struts = [];
for (let x = SPAN.from + SPAN.strutGap; x < SPAN.to - 0.3; x += SPAN.strutGap) {
  if (DECK - DECK_HALF - archAt(x) > 0.15) struts.push(box(x, 0.07, DECK, archAt(x)));
}

// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  far: [...CITY.map(litTower), cityHall],
  front: buildingRow(53, -26, 24, 8.6 + LIFT, 9.4 + LIFT, 1.6, 2.6).map(gamlaStan), // gables rise well over the deck
};

export { CLOUD_END, clouds };

export default {
  far: [
    ...blocks(67, -36, 26, 7.6, 9.2, 2.2, 4), // the low city behind
    ...towers.far.map((tower) => tower.shape),
  ],
  clouds: clouds.map(({ shape }) => shape),
  front: towers.front.map((tower) => tower.shape),
  mid: [
    ...struts,
    strip(archPts, 0.26),
    strip([[-44, DECK], [24, DECK]], DECK_HALF * 2),
    box(SPAN.from - 0.5, 1.2, DECK - DECK_HALF), // the stone abutments either end
    box(SPAN.to + 0.5, 1.2, DECK - DECK_HALF),
  ],
  near: [ground(2.2), ...blocks(97, 9, 34, 3.2, 4.8, 2.4, 4.4), ...blocks(101, -60, -30, 3.2, 5, 2.4, 4.4)],
};
