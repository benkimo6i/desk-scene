import { blocks, box, ground, hill, strip, taper } from './shapes.js';

const DECK = 8;
const BRIDGE_TOP = 20;

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
  taper(x - 0.72, 0.62, 0.36, BRIDGE_TOP),
  taper(x + 0.72, 0.62, 0.36, BRIDGE_TOP),
  box(x, 1.8, BRIDGE_TOP - 0.1, BRIDGE_TOP - 0.7),
  box(x, 1.8, 17.3, 16.6),
  box(x, 1.9, 14, 13.3),
  box(x, 2, 10.6, 9.9),
  box(x, 3, 3.6),
];

export default {
  far: [
    hill(-60, -6, 8.5),
    hill(16, 62, 10),
    ...blocks(41, 3, 15, 5, 7.6, 0.9, 1.7),
    taper(6.4, 2, 0.05, 12.4),
    box(9.6, 1.3, 9.4),
  ],
  mid: [
    ...cable(-15.4, BRIDGE_TOP - 0.2, 1, BRIDGE_TOP - 0.2, DECK + 1),
    ...cable(1, BRIDGE_TOP - 0.2, 16.6, DECK + 2, DECK + 1.2),
    ...cable(-30.4, DECK + 2, -15.4, BRIDGE_TOP - 0.2, DECK + 1.2),
    strip([[-44, DECK], [24, DECK]], 0.34),
    ...tower(-15.4),
    ...tower(1),
  ],
  near: [ground(2.2), hill(9, 34, 6), hill(-60, -30, 6.5)],
};
