import { blocks, box, bullet, ground, stepped, taper } from './shapes.js';

export default {
  far: blocks(83, -55, 55, 9, 13.5),
  mid: [
    ...blocks(89, -8, -3, 9, 12),
    ...blocks(97, 9, 55, 9, 13),
    stepped(1.3, [[4.6, 10], [3.6, 14], [2.6, 16.8], [1.5, 18.4]]),
    box(0.9, 0.12, 21.4),
    box(1.75, 0.12, 21.4),
    taper(-4.3, 3.5, 2.1, 15.8),
    box(-4.7, 0.12, 19.2),
    box(-3.9, 0.12, 19.2),
    box(5.6, 2.4, 15.6),
    // Round twin towers by the river, seen through the left pane
    bullet(-13, 1.9, 13.2, 12.5, 2),
    bullet(-15.7, 1.9, 13.2, 12.5, 2),
    box(-19.5, 2.2, 10),
  ],
  near: [ground(3), ...blocks(103, -8, 55, 4, 8, 2.2, 4.4), ...blocks(107, -55, -22, 3.4, 5.4, 2.2, 3.8)],
};
