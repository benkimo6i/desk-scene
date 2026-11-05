import { blocks, box, bullet, ground, ring, strip, stepped, taper } from './shapes.js';

// Slim gothic turrets along the river, in front of the clock tower.
const turret = (x, h) => stepped(x, [[0.7, h]], h + 1.5);

export default {
  far: [
    ...blocks(61, -55, 55, 6.5, 9.5, 2, 4.2),
    taper(8.2, 2.4, 0.06, 13.4),
  ],
  mid: [
    ...blocks(67, -55, -24, 7, 9.6),
    ...blocks(71, 9, 55, 7, 10),
    // Domed cathedral: broad base, drum, dome, then lantern
    stepped(3.9, [[6.6, 7.6], [3.7, 10.2]]),
    bullet(3.9, 3.3, 14.2, 10.2, 1.9),
    box(3.9, 0.56, 15.6, 13.8),
    stepped(3.9, [[0.16, 16.4]], 17.1),
    // Clock tower: shaft, wider clock head, belfry, spire
    stepped(-2.2, [[1.8, 14.2], [2.3, 16.2], [1.5, 17]], 21),
    // Observation wheel, seen through the left pane
    ring(-17.6, 8.2, 5.8, 0.3),
    strip([[-20.2, 0], [-17.6, 8.2]], 0.32),
    strip([[-15, 0], [-17.6, 8.2]], 0.32),
  ],
  near: [
    ground(2.4),
    ...blocks(79, -55, -9, 3.2, 5.6, 2.2, 4.6),
    ...blocks(83, 8, 55, 3.2, 6, 2.2, 4.6),
    box(-3, 9.4, 5.4),
    turret(-7.2, 6.4),
    turret(-5.2, 6.8),
    turret(-0.6, 6.4),
    turret(1.4, 6),
    ring(-2.2, 15.2, 0.72, 0.13, 20),
  ],
};
