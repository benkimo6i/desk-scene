// Singapore: Marina Bay Sands, its three towers joined by the SkyPark, over a row of modern
// towers, with the flat promenade deck and lamp posts of the Jubilee Bridge in front.
import { CLOUD_END, LIT_SHARE, blocks, box, buildingRow, clouds, ground, litTower, strip, windows } from './shapes.js';

// A slim, low deck on short piers, with thin lamp posts along it.
const DECK = 7.6;
const DECK_HALF = 0.12;
const PIERS = { from: -6, gap: 3, to: 15, w: 0.3 };
// Curved (shepherd's crook) lamp posts, spaced well apart.
const LAMPS = { from: -3.8, gap: 2.6, to: 14, h: 0.95, reach: 0.32, head: { w: 0.16, h: 0.12 } };

// Marina Bay Sands: three towers, each wider at the foot and leaning in a little on its inner
// edge, joined at the top by the SkyPark, which overhangs past the right-hand tower.
// Each tower is 1.5x the first draft's width, its left edge curving out toward the foot.
const MBS = { towers: [0.9, 3.1, 5.3], foot: 2.55, head: 1.65, top: 17.4, sky: { from: -0.3, to: 7.6, h: 0.5, bow: 0.15 } };

const tower = (x, i) => {
  const { foot, head, top } = MBS;
  const leftAt = (y) => x - head / 2 - ((foot - head) / 2) * (1 - y / top) ** 2; // curves out toward the foot
  const rightAt = (y) => x + head / 2 + ((foot - head) / 2 - 0.3) * (1 - y / top);
  const ys = Array.from({ length: 11 }, (_, k) => (top * k) / 10);
  const left = ys.map((y) => [leftAt(y), y]);
  return {
    shape: [...left, ...ys.map((y) => [rightAt(y), y]).reverse()],
    lit: [...left, ...ys.map((y) => [leftAt(y) + (rightAt(y) - leftAt(y)) * LIT_SHARE, y]).reverse()],
    windows: windows(701 + i * 11, x, top - 0.6, (y) => rightAt(y) - leftAt(y) - 0.3, 0.36),
  };
};

// The SkyPark: a long flat deck with a gently bowed top, tapering to a point at the overhang.
const { sky, top } = MBS;
const skyPark = {
  shape: [
    [sky.from, top], [sky.from, top + sky.h * 0.7],
    ...Array.from({ length: 9 }, (_, i) => {
      const t = (i + 1) / 10;
      return [sky.from + (sky.to - sky.from) * t, top + sky.h + sky.bow * Math.sin(t * Math.PI) - (t > 0.8 ? (t - 0.8) * 1.5 : 0)];
    }),
    [sky.to, top + sky.h * 0.6], [sky.to - 0.3, top - 0.1],
  ],
  lit: [],
  windows: [],
};

// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  far: [...[[-1.2, 1.3, 12.2], [8.6, 1.4, 12.8], [10.2, 1.2, 11.6], [13, 1.6, 12.4]].map(litTower), ...MBS.towers.map(tower), skyPark],
  front: buildingRow(163, -26, 24, 12.1, 13.3, 1.3, 2.6).map(litTower), // modern towers, up across the towers' lower half
};

export { CLOUD_END, clouds };

const piers = [];
for (let x = PIERS.from; x <= PIERS.to; x += PIERS.gap) piers.push(box(x, PIERS.w, DECK - DECK_HALF + 0.05));
const lamps = [];
for (let x = LAMPS.from; x <= LAMPS.to; x += LAMPS.gap) {
  // A post that rises, arcs over to the right, and hangs a small lamp at the end.
  const top = DECK + LAMPS.h, r = LAMPS.reach / 2;
  const crook = [[x, DECK], [x, top], ...Array.from({ length: 6 }, (_, k) => {
    const a = Math.PI - ((k + 1) / 6) * Math.PI;
    return [x + r + r * Math.cos(a), top + r * Math.sin(a)];
  })];
  lamps.push(strip(crook, 0.05), box(x + LAMPS.reach, LAMPS.head.w, top, top - LAMPS.head.h));
}

export default {
  far: [
    ...blocks(167, -36, 26, 7.6, 9.4, 2.2, 4), // the low city behind
    ...towers.far.map((t) => t.shape),
  ],
  clouds: clouds.map(({ shape }) => shape),
  front: towers.front.map((t) => t.shape),
  mid: [
    // Lamps and piers first, then the deck right after, so they line up as the view moves.
    ...lamps,
    ...piers,
    box(4, 96, DECK + DECK_HALF, DECK - DECK_HALF),
  ],
  near: [ground(2.2), ...blocks(173, 9, 34, 3.2, 4.8, 2.4, 4.4), ...blocks(179, -60, -30, 3.2, 5, 2.4, 4.4)],
};
