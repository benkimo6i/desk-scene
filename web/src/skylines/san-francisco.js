import { CLOUD_END, blocks, box, buildingRow, cable as hangingCable, clouds, ground, hill, litTower, strip, taper, windows } from './shapes.js';

const DECK = 8;
const BRIDGE_TOP = 20;
const cable = (x0, top0, x1, top1, low) => hangingCable(x0, top0, x1, top1, low, DECK);
const TOWER_LEG = 0.72; // a tower's legs, either side of its center
const PYRAMID = { x: 5.3, base: 3.6, top: 0.06, h: 17.5 };
const LIFT = 2.3; // the Pyramid stands this much higher, on straight walls, clear of the front row

// [x, width, height] for the downtown towers around the Pyramid.
const DOWNTOWN = [
  [2.5, 1.3, 8.2], [3.5, 1.2, 10.4], [7.5, 1.3, 11.6], [8.7, 1.2, 8.6], [10, 1.6, 10.2],
  [11.5, 1.3, 7.4], [12.8, 1.5, 9], [14.2, 1.3, 7.8],
];

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

const { x: px, base, top, h: pyramidHeight } = PYRAMID;
// The Pyramid's two wings rise straight up out of the taper and stop flat below the spire,
// all one silhouette.
const WING_OUT = 0.175; // how far a wing reaches past the triangle at its top
const WING_TO = 0.88; // share of the height: the plain spire above stays short
const wingTo = pyramidHeight * WING_TO;
const wingHalf = (base + (top - base) * WING_TO) / 2 + WING_OUT;
const wingFrom = ((base - 2 * wingHalf) / (base - top)) * pyramidHeight; // where the taper is as wide
const pyramidLeft = [[px - base / 2, 0], ...[[px - base / 2, 0], [px - wingHalf, wingFrom], [px - wingHalf, wingTo], [px - wingHalf + WING_OUT, wingTo], [px - top / 2, pyramidHeight]].map(([x, y]) => [x, y + LIFT])];
const pyramidTower = {
  shape: [...pyramidLeft, ...pyramidLeft.map(([x, y]) => [2 * px - x, y]).reverse()],
  lit: [...pyramidLeft, [px, pyramidHeight + LIFT], [px - base * 0.1, LIFT], [px - base * 0.1, 0]],
  windows: windows(907, px, wingTo + 0.5, (y) => base + (top - base) * (y / pyramidHeight), 0.5).map((w) => ({ ...w, y: w.y + LIFT })), // none on the spire
};

// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  far: [...DOWNTOWN.map(litTower), pyramidTower],
  front: buildingRow(17, -26, 24, 8.4, 9.8, 1.7, 3.2).map(litTower), // tops just over the deck
};

export { CLOUD_END, clouds };

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
