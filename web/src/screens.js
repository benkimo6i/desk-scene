// The monitor, laptop and phone screens. Each is dark until the cursor is over its device, then
// lights up flat in the screen's color. Only the screen face changes: a glow spilling onto the
// desk didn't match the flat light of the lamp and sun (user, 2026-11-09).
// The monitor and laptop carry the scene's controls, glowing in the lit color on the dark screen;
// when a screen lights up, its colors swap, so the text stays readable.
// The monitor shows one city at a time, "Hello <city>" as large as fits (the old grid of 11 was
// too small to read). Scrolling over it slides through the cities, wrapping around: a trackpad
// moves the list with the fingers and it settles on the nearest city when they stop; a mouse
// wheel notch moves exactly one. The city applies once the list settles, so a fast scroll
// costs one cross-fade.
// The laptop lists the times of day: the current pick sits in a filled pill and the item under
// the cursor gets an outline.
// The phone shows the time in the city outside the window, 24-hour, like a lock screen: dim
// on the dark screen, and dark on the lit one.
import * as THREE from 'three';
import '@fontsource-variable/inter-tight';

const ON_SECONDS = 0.15;
const OFF_SECONDS = 0.4;
const FONT = "'Inter Tight Variable', Helvetica, Arial, sans-serif"; // the portfolio's face
const WEIGHT = 700;
const MINUTE = 60000;

// px: canvas size, matching the screen's aspect. cols: the menu's columns. margin: the space
// around the menu, as a share of the canvas height. clock: the screen shows the time instead.
// carousel: one item at a time, changed by scrolling.
const SCREENS = [
  { object: 'Monitor', mesh: 'Monitor_Screen', px: [1024, 576], carousel: true },
  { object: 'Laptop', mesh: 'Laptop_Screen', px: [768, 512], cols: 2, margin: 0.1 },
  { object: 'Phone', mesh: 'Phone_Screen', px: [320, 685], clock: true },
];

const CLOCK_DIM = 0.6; // how far the time sits from the dark screen toward the lit color
const CLOCK_Y = 0.27; // the time's center, as a share of the screen's height from the top
const CLOCK_WIDTH = 0.96; // the widest time, as a share of the screen's width: nearly edge to edge
const CLOCK_TRACKING = -0.04; // letter-spacing, as a share of the type size, so the digits can be bigger

const CAROUSEL_WIDTH = 0.86; // the line's widest, as a share of the screen's width
const CAROUSEL_SIZE = 0.2; // the largest type, as a share of the screen's height (short names)
const SCROLL_PER_ITEM = 160; // trackpad scroll pixels that move the list by one item
const SNAP_IDLE = 120; // ms without scrolling before the list settles on the nearest item
const SNAP_RATE = 14; // per second: how fast it eases onto that item

const ease = (x) => x * x * (3 - 2 * x);
const wrap = (i, n) => ((i % n) + n) % n;

// A mouse wheel moves in notches; a trackpad scrolls in small steps. Notches arrive in lines
// (Firefox) or as whole multiples of 120 in the legacy wheelDelta (Chrome, Safari).
const isNotch = (e) => e.deltaMode === 1 || (e.wheelDeltaY !== 0 && e.wheelDeltaY % 120 === 0);

// The phone screen comes from Blender without UVs. It faces up, so they come straight from its
// outline, with v = 0 at the top (glTF -z, the end away from the camera), as the menus have it.
function addFlatUVs(geometry) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[2 * i] = (pos.getX(i) - min.x) / (max.x - min.x);
    uv[2 * i + 1] = (pos.getZ(i) - min.z) / (max.z - min.z);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const clockFormat = (zone) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function menuScreen(entry) {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = entry.px;
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false; // the screens' UVs follow glTF, with v = 0 at the top
  map.anisotropy = 4;
  entry.material.map = map;
  entry.canvas = canvas;
  entry.items = [];
  entry.current = null;
  entry.over = null;
}

// The menu's cells, row by row, in canvas pixels.
function layout({ canvas, items, cols, margin }) {
  const pad = canvas.height * margin;
  const rows = Math.ceil(items.length / cols);
  const w = (canvas.width - 2 * pad) / cols, h = (canvas.height - 2 * pad) / rows;
  return items.map((item, i) => ({ ...item, x: pad + (i % cols) * w, y: pad + Math.floor(i / cols) * h, w, h }));
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export function createScreens() {
  const off = new THREE.Color();
  const on = new THREE.Color();
  const back = new THREE.Color();
  const ink = new THREE.Color();
  const entries = SCREENS.map((screen) => ({ ...screen, material: new THREE.MeshBasicMaterial(), level: 0 }));
  entries.filter((entry) => entry.px).forEach(menuScreen);
  const byMesh = Object.fromEntries(entries.map((entry) => [entry.mesh, entry]));
  const byObject = Object.fromEntries(entries.map((entry) => [entry.object, entry]));
  const meshes = [];
  const raycaster = new THREE.Raycaster();
  const point = new THREE.Vector2();
  let time = clockFormat('America/Los_Angeles');
  let shownMinute = -1;

  // The carousel's items around pos (in items; whole numbers sit centred), each line as large
  // as fits. Neighbours slide in from above and below while it moves.
  const paintCarousel = ({ canvas, items, pos }, g) => {
    const n = items.length;
    if (!n) return;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = ink.getStyle();
    for (let k = Math.floor(pos); k <= Math.floor(pos) + 1; k++) {
      const y = canvas.height * (0.5 + k - pos);
      const text = `Hello ${items[wrap(k, n)].label}`;
      g.font = `${WEIGHT} 100px ${FONT}`;
      const size = Math.min(canvas.height * CAROUSEL_SIZE, (100 * canvas.width * CAROUSEL_WIDTH) / g.measureText(text).width);
      g.font = `${WEIGHT} ${size}px ${FONT}`;
      g.fillText(text, canvas.width / 2, y + size * 0.04);
    }
  };

  const indexOf = (entry, key) => Math.max(0, entry.items.findIndex((item) => item.key === key));
  // Moves the carousel to key, by the shortest way round from where it is.
  const jumpTo = (entry, key) => {
    const n = entry.items.length;
    if (!n) return;
    let delta = wrap(indexOf(entry, key) - entry.pos, n);
    if (delta > n / 2) delta -= n;
    entry.pos = entry.target = Math.round(entry.pos + delta);
    entry.mode = 'rest';
  };

  // The time, one size for every reading (set by the widest), so the digits don't jump.
  const paintClock = ({ canvas }, g) => {
    ink.lerpColors(off, on, CLOCK_DIM).lerp(off, ease(byObject.Phone.level));
    g.font = `${WEIGHT} 100px ${FONT}`;
    g.letterSpacing = `${100 * CLOCK_TRACKING}px`;
    const size = (100 * canvas.width * CLOCK_WIDTH) / g.measureText('00:00').width;
    g.font = `${WEIGHT} ${size}px ${FONT}`;
    g.letterSpacing = `${size * CLOCK_TRACKING}px`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = ink.getStyle();
    g.fillText(time.format(Date.now()), canvas.width / 2, canvas.height * CLOCK_Y);
  };

  const paint = (entry) => {
    const t = ease(entry.level);
    if (!entry.canvas) {
      entry.material.color.lerpColors(off, on, t);
      return;
    }
    back.lerpColors(off, on, t);
    ink.lerpColors(on, off, t);
    const { canvas } = entry, g = canvas.getContext('2d');
    g.fillStyle = back.getStyle();
    g.fillRect(0, 0, canvas.width, canvas.height);
    if (entry.clock || entry.carousel) {
      (entry.clock ? paintClock : paintCarousel)(entry, g);
      entry.material.map.needsUpdate = true;
      return;
    }
    const cells = entry.cells = layout(entry);
    if (!cells.length) return;
    // One type size for the whole menu, as big as the longest label allows.
    g.font = `${WEIGHT} 100px ${FONT}`;
    const widest = Math.max(...cells.map(({ label }) => g.measureText(label).width)) / 100;
    const { w, h } = cells[0];
    const size = Math.min(h * 0.46, (w * 0.8) / widest);
    g.font = `${WEIGHT} ${size}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const pillH = size * 1.55, radius = pillH / 2, inset = w * 0.04;
    for (const cell of cells) {
      const cx = cell.x + cell.w / 2, cy = cell.y + cell.h / 2;
      const pillW = Math.min(cell.w - 2 * inset, g.measureText(cell.label).width + size * 1.3);
      if (cell.key === entry.current) {
        g.fillStyle = ink.getStyle();
        roundRect(g, cx - pillW / 2, cy - pillH / 2, pillW, pillH, radius);
        g.fill();
        g.fillStyle = back.getStyle();
      } else {
        if (cell.key === entry.over) {
          g.strokeStyle = ink.getStyle();
          g.lineWidth = size * 0.09;
          roundRect(g, cx - pillW / 2, cy - pillH / 2, pillW, pillH, radius);
          g.stroke();
        }
        g.fillStyle = ink.getStyle();
      }
      g.fillText(cell.label, cx, cy + size * 0.04);
    }
    entry.material.map.needsUpdate = true;
  };
  // Eases a carousel onto its target once scrolling stops, then applies that item.
  function settle(entry, dt, instant) {
    if (entry.mode === 'follow' && performance.now() - entry.lastScroll > SNAP_IDLE) {
      entry.target = Math.round(entry.pos);
      entry.mode = 'snap';
    }
    if (entry.mode !== 'snap') return;
    const step = instant ? 1 : 1 - Math.exp(-dt * SNAP_RATE);
    entry.pos += (entry.target - entry.pos) * step;
    if (Math.abs(entry.target - entry.pos) < 1e-3) {
      const n = entry.items.length;
      entry.pos = entry.target = wrap(entry.target, n);
      entry.mode = 'rest';
      const { key } = entry.items[entry.pos];
      if (key !== entry.current) {
        entry.current = key;
        entry.onPick?.(key);
      }
    }
    paint(entry);
  }

  // Canvas text doesn't wait for web fonts, so redraw once the bold cut has loaded.
  document.fonts?.load(`${WEIGHT} 100px ${FONT}`).then(() => entries.forEach(paint));

  return {
    // Takes on a screen mesh from the model: returns its material, by the mesh's name.
    attach(mesh) {
      if (!byMesh[mesh.name]) return undefined;
      if (byMesh[mesh.name].clock) addFlatUVs(mesh.geometry);
      meshes.push(mesh);
      return byMesh[mesh.name].material;
    },

    // Pick targets: hovering anywhere on a device counts.
    targets: () => Object.fromEntries(entries.map((entry) => [entry.object, entry])),

    setColors(offColor, onColor) {
      off.set(offColor);
      on.set(onColor);
      entries.forEach(paint);
    },

    // The phone keeps time in this IANA zone (the city outside the window).
    setZone(zone) {
      time = clockFormat(zone);
      paint(byObject.Phone);
    },

    // Puts a menu on a device's screen: items are [{ key, label }], onPick(key) runs on a click.
    setMenu(object, items, current, onPick) {
      const entry = byObject[object];
      Object.assign(entry, { items, current, onPick });
      if (entry.carousel) {
        entry.pos = entry.target = indexOf(entry, current);
        entry.mode = 'rest';
      }
      paint(entry);
    },

    // A wheel event over a carousel screen (entry, from targets): slides its items.
    scroll(entry, e) {
      if (!entry.carousel || !entry.items.length) return;
      if (isNotch(e)) {
        entry.target = Math.round(entry.target) + Math.sign(e.deltaY);
        entry.mode = 'snap';
      } else {
        entry.pos += e.deltaY / SCROLL_PER_ITEM;
        entry.target = entry.pos;
        entry.lastScroll = performance.now();
        entry.mode = 'follow';
        paint(entry);
      }
    },

    // Marks the current pick on a device's menu.
    select(object, key) {
      const entry = byObject[object];
      if (entry.current === key) return;
      entry.current = key;
      if (entry.carousel) jumpTo(entry, key); // picked elsewhere (the keyboard controls)
      paint(entry);
    },

    // The menu item under the cursor, as { entry, key }, or null. Anything nearer to the
    // camera than the screen (in roots) blocks it.
    itemAt(camera, roots, clientX, clientY) {
      point.set((clientX / innerWidth) * 2 - 1, 1 - (clientY / innerHeight) * 2);
      raycaster.setFromCamera(point, camera);
      const hit = raycaster.intersectObjects(roots, true)[0];
      const entry = hit && meshes.includes(hit.object) && byMesh[hit.object.name];
      if (!entry?.cells || !hit.uv) return null;
      const x = hit.uv.x * entry.canvas.width, y = hit.uv.y * entry.canvas.height;
      const cell = entry.cells.find((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
      return cell ? { entry, key: cell.key } : null;
    },

    // A device's menu item by key, in the form itemAt returns.
    item: (object, key) => ({ entry: byObject[object], key }),

    // Outlines the item under the cursor (from itemAt), clearing the others.
    hover(item) {
      for (const entry of entries) {
        const over = item?.entry === entry ? item.key : null;
        if (!entry.canvas || entry.over === over) continue;
        entry.over = over;
        paint(entry);
      }
    },

    // Runs the item's menu pick.
    pick(item) {
      item.entry.onPick?.(item.key);
    },

    // hovered is the pick target under the cursor (one of these entries, or something else).
    update(dt, hovered, instant) {
      const minute = Math.floor(Date.now() / MINUTE);
      if (minute !== shownMinute) {
        shownMinute = minute;
        paint(byObject.Phone);
      }
      for (const entry of entries) if (entry.carousel) settle(entry, dt, instant);
      for (const entry of entries) {
        const target = entry === hovered ? 1 : 0;
        const step = instant ? 1 : dt / (target ? ON_SECONDS : OFF_SECONDS);
        const level = THREE.MathUtils.clamp(entry.level + Math.sign(target - entry.level) * step, 0, 1);
        if (level !== entry.level) {
          entry.level = level;
          paint(entry);
        }
      }
    },

    get lit() { return entries.some(({ level }) => level > 0); },
  };
}
