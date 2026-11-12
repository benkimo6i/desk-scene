// Austin: the Texas Capitol over a row of downtown towers, with the low shallow arches of the
// Congress Avenue Bridge in front. Austin keeps view corridors to the Capitol, so it leads.
import { CLOUD_END, LIT_SHARE, box, buildingRow, clouds, ground, blocks, litTower, windows } from './shapes.js';

// The window sill hides everything below about height 6.5, so only the tops of the bridge's
// shallow arches and its parapet show, as with Pont Marie.
const DECK = 7.6;
const PARAPET = 0.3;
const ARCH = { spacing: 3.3, w: 2.55, rise: 1, crown: DECK - 0.4, from: -4.6, to: 11.9 }; // shallow segmental arches on piers 2.5x the first draft's

// The Capitol: long wings, a pediment over the centre, the drum, a tall dome, the lantern and
// the statue on top.
const CAPITOL = { x: 4.2, wings: { from: -1, to: 9.4, top: 11.6 }, pediment: { w: 2.8, peak: 12.5 }, drum: { w: 2.6, top: 13.3 }, dome: { top: 15.7 }, lantern: { w: 0.62, top: 16.6 }, cap: 0.35, statue: 17.6 };

const { x: cx, wings, pediment, drum, dome, lantern, cap, statue } = CAPITOL;
const half = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const domeLeft = half(10, (t) => [cx - (drum.w / 2) * Math.cos((t * Math.PI) / 2), drum.top + (dome.top - drum.top) * Math.sin((t * Math.PI) / 2)]);
const part = (shape, lit = [], lights = []) => ({ shape, lit, windows: lights });

const wingsWidth = wings.to - wings.from, wingsX = (wings.from + wings.to) / 2;
const capitol = [
  part(box(wingsX, wingsWidth, wings.top), box(wings.from + (wingsWidth * LIT_SHARE) / 2, wingsWidth * LIT_SHARE, wings.top), windows(613, wingsX, wings.top, () => wingsWidth, 0.3)),
  part(box(cx, drum.w, drum.top)),
  part([...domeLeft, ...domeLeft.map(([x, y]) => [2 * cx - x, y]).reverse()], domeLeft.concat([[cx - drum.w * 0.15, dome.top - 0.2], [cx - drum.w * 0.15, drum.top]])),
  part([[cx - lantern.w / 2, dome.top - 0.3], [cx - lantern.w / 2, lantern.top], [cx - 0.16, lantern.top + cap], [cx - 0.03, statue], [cx + 0.03, statue], [cx + 0.16, lantern.top + cap], [cx + lantern.w / 2, lantern.top], [cx + lantern.w / 2, dome.top - 0.3]]),
  part([[cx - pediment.w / 2, wings.top - 0.05], [cx, pediment.peak], [cx + pediment.w / 2, wings.top - 0.05]]),
];

// [x, width, height] for downtown towers behind the Capitol, clear of the dome: a few rise
// taller, for Austin's skyline.
const DOWNTOWN = [[-1.4, 1.3, 17.2], [0.4, 1.2, 15.4], [1.7, 1, 18.4], [7.2, 1.1, 16.6], [8.6, 1.3, 19], [9.9, 1.4, 14.6], [12.6, 1.6, 12.2]];

// A shallow segmental arch opening: straight sides up to the springing, then a low curve.
function shallowArch(x, w, base, crown, rise) {
  const r = (w * w) / (8 * rise) + rise / 2; // the circle through both springings and the crown
  const spring = crown - rise;
  const half0 = Math.asin(w / 2 / r);
  const pts = [[x - w / 2, base]];
  for (let i = 0; i <= 12; i++) {
    const a = -half0 + (2 * half0 * i) / 12;
    pts.push([x + r * Math.sin(a), crown - r + r * Math.cos(a)]);
  }
  pts.push([x + w / 2, base]);
  pts.splice(1, 0, [x - w / 2, spring]);
  pts.splice(pts.length - 1, 0, [x + w / 2, spring]);
  return pts;
}
const arches = [];
for (let x = ARCH.from; x <= ARCH.to; x += ARCH.spacing) arches.push(shallowArch(x, ARCH.w, 0.3, ARCH.crown, ARCH.rise));

// Towers come last in their layer, in this order, so nearer ones cover farther ones.
export const towers = {
  far: [...DOWNTOWN.map(litTower), ...capitol],
  front: buildingRow(139, -26, 24, 9.2, 10.4, 1.4, 2.8).map(litTower), // tops over the bridge, under the Capitol's wings
};

export { CLOUD_END, clouds };

// The drum's colonnade: the shadowed gaps between its columns, above the pediment, drawn in the
// darker backdrop tone (main.js).
const COLUMNS = 6;
export const accents = Array.from({ length: COLUMNS - 1 }, (_, k) => {
  const gap = drum.w / COLUMNS, x = cx - drum.w / 2 + gap * (k + 1);
  return box(x, gap * 0.45, drum.top - 0.15, pediment.peak + 0.05);
});

export default {
  far: [
    ...blocks(149, -36, 26, 7.6, 9.4, 2.2, 4), // the low city behind
    ...towers.far.map((tower) => tower.shape),
  ],
  clouds: clouds.map(({ shape }) => shape),
  front: towers.front.map((tower) => tower.shape),
  mid: [
    // One long concrete span with its shallow arches cut through, then the parapet.
    { pts: box(3.6, 88, DECK), holes: arches },
    box(3.6, 88, DECK + PARAPET, DECK),
  ],
  near: [ground(2.2), ...blocks(151, 9, 34, 3.2, 4.8, 2.4, 4.4), ...blocks(157, -60, -30, 3.2, 5, 2.4, 4.4)],
};
