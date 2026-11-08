// Silhouette helpers. Units are roughly degrees of view from the room:
// x runs across the window (the main pane covers about -7 to 7, the left pane
// about -21 to -10) and h is height above the bottom of the view.
// A shape is a list of [x, h] points, or { pts, holes } when it has cut-outs.

export const box = (x, w, h, base = 0) => [[x - w / 2, base], [x - w / 2, h], [x + w / 2, h], [x + w / 2, base]];

export const taper = (x, wBottom, wTop, h, base = 0) => [
  [x - wBottom / 2, base], [x - wTop / 2, h], [x + wTop / 2, h], [x + wBottom / 2, base],
];

// tiers: [[width, top height], ...], widest first. Optional point on top.
export function stepped(x, tiers, peak) {
  const left = [];
  let h0 = 0;
  for (const [w, h] of tiers) {
    left.push([x - w / 2, h0], [x - w / 2, h]);
    h0 = h;
  }
  const right = left.map(([px, h]) => [2 * x - px, h]).reverse();
  return [...left, ...(peak ? [[x, peak]] : []), ...right];
}

// Rounded top. power < 1 gives a pointed bullet, power 2 a dome.
export function bullet(x, w, h, shoulder, power = 1.4, n = 12) {
  const left = [[x - w / 2, 0], [x - w / 2, shoulder]];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    left.push([x - (w / 2) * (1 - t ** power), shoulder + (h - shoulder) * Math.sin((t * Math.PI) / 2)]);
  }
  const right = left.map(([px, y]) => [2 * x - px, y]).reverse();
  return [...left, [x, h], ...right];
}

export function hill(x0, x1, peak, n = 16) {
  const pts = [[x0, 0]];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t, peak * Math.sin(t * Math.PI) ** 0.7]);
  }
  pts.push([x1, 0]);
  return pts;
}

// A thick polyline, for cables and struts.
export function strip(points, width) {
  const up = [], down = [];
  points.forEach(([x, y], i) => {
    const [ax, ay] = points[Math.max(i - 1, 0)];
    const [bx, by] = points[Math.min(i + 1, points.length - 1)];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * (width / 2), ny = ((bx - ax) / len) * (width / 2);
    up.push([x + nx, y + ny]);
    down.push([x - nx, y - ny]);
  });
  return [...up, ...down.reverse()];
}

export function ring(x, h, r, thickness, n = 36) {
  const circle = (rad) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [x + rad * Math.cos(a), h + rad * Math.sin(a)];
  });
  return { pts: circle(r), holes: [circle(r - thickness)] };
}

// Repeatable filler blocks, with an occasional rooftop box.
export function blocks(seed, x0, x1, hMin, hMax, wMin = 1.6, wMax = 3.4) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out = [];
  for (let x = x0; x < x1;) {
    const w = wMin + rnd() * (wMax - wMin);
    const h = hMin + rnd() * (hMax - hMin);
    if (rnd() > 0.65) out.push(stepped(x + w / 2, [[w, h], [w * 0.5, h + 0.7]]));
    else out.push(box(x + w / 2, w, h));
    x += w * (0.86 + rnd() * 0.2);
  }
  return out;
}

export const ground = (h) => box(0, 110, h);

// A flat-bottomed cloud with a lumpy top. x and h are its center and base.
export function cloud(x, h, w, seed = 1) {
  const top = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const lumps = 0.72 + 0.28 * Math.abs(Math.sin(t * 7 + seed * 2.1));
    top.push([x - w / 2 + w * t, h + 0.16 * w * Math.sin(t * Math.PI) ** 0.7 * lumps]);
  }
  return [...top, [x + w * 0.3, h - 0.012 * w], [x - w * 0.3, h - 0.012 * w]];
}
