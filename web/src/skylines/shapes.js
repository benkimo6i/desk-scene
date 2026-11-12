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

// Height of a cable at x, hanging between two points in a parabola.
export const sag = (x, x0, top0, x1, top1, low) => {
  const t = (x - x0) / (x1 - x0);
  return (1 - t) * top0 + t * top1 + 4 * t * (1 - t) * (low - (top0 + top1) / 2);
};

// A suspension cable between two points, with hangers down to the deck every gap. Hangers run
// on into the deck strip, nearly to its underside: they sit a little deeper in the layer than
// the deck, so ends stopped at its centre line show above it as small nubs.
const HANGER_TUCK = 0.14; // the deck strips are 0.34 thick
export function cable(x0, top0, x1, top1, low, deck, gap = 1.1) {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const x = x0 + ((x1 - x0) * i) / 20;
    pts.push([x, sag(x, x0, top0, x1, top1, low)]);
  }
  const hangers = [];
  for (let x = x0 + gap; x < x1 - 0.4; x += gap) {
    hangers.push(box(x, 0.06, sag(x, x0, top0, x1, top1, low), deck - HANGER_TUCK));
  }
  return [strip(pts, 0.16), ...hangers];
}

// Repeatable lit windows on a building. widthAt narrows them for a tapering tower.
export function windows(seed, x, h, widthAt, litShare) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const lights = [];
  for (let y = 2.8; y < h - 0.5; y += 0.62) {
    const half = widthAt(y) / 2 - 0.16;
    for (let offset = -half; offset <= half; offset += 0.38) {
      if (rnd() > litShare) continue;
      lights.push({ x: x + offset, y, w: 0.17, h: 0.27, core: rnd() < 0.3 });
    }
  }
  return lights;
}

export const LIT_SHARE = 0.42; // how much of a tower's width faces the light

// A plain tower for the night lights: its shape, its lit side and its windows.
export const litTower = ([x, w, h], i) => ({
  shape: box(x, w, h),
  lit: box(x - (w * (1 - LIT_SHARE)) / 2, w * LIT_SHARE, h),
  windows: windows(101 + i * 7, x, h, () => w, 0.42),
});

// Repeatable [x, width, height] rows of buildings.
export function buildingRow(seed, x0, x1, hMin, hMax, wMin, wMax) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const row = [];
  for (let x = x0; x < x1;) {
    const w = wMin + rnd() * (wMax - wMin);
    row.push([x + w / 2, w, hMin + rnd() * (hMax - hMin)]);
    x += w * (0.86 + rnd() * 0.2);
  }
  return row;
}

// The drifting clouds every city shares. Each period shows the first cloudCount of these,
// so the first few start in the main pane. A spot is a share of the visible width, which
// main.js measures from the current view.
const CLOUD_SPOTS = [0.62, 0.44, 0.78, 0.52, 0.9, 0.7, 0.34, 0.12, 0.24];
export const CLOUD_END = 13; // behind the right edge of the window
export const clouds = CLOUD_SPOTS.map((spot, i) => {
  const low = i % 3 === 1;
  const size = (i * 0.37) % 1;
  return {
    spot,
    shape: cloud(0, low ? 10.5 + size * 4.5 : 19 + size * 9, low ? 3 + size * 2.6 : 1.4 + size * 2.2, i + 1),
    speed: low ? 0.16 : 0.1, // skyline units per second
  };
});
