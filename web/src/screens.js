// The monitor, laptop and phone screens. Each is dark until the cursor is over its device, then
// lights up flat in the screen's color. Only the screen face changes: a glow spilling onto the
// desk didn't match the flat light of the lamp and sun (user, 2026-11-09).
// The monitor and laptop carry the scene's controls: the monitor lists the cities and the
// laptop the times of day, glowing in the lit color on the dark screen. The current pick sits
// in a filled pill; the item under the cursor gets an outline. When a screen lights up, its
// colors swap, so the menu stays readable.
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
const SCREENS = [
  { object: 'Monitor', mesh: 'Monitor_Screen', px: [1024, 576], cols: 3, margin: 0.1 },
  { object: 'Laptop', mesh: 'Laptop_Screen', px: [768, 512], cols: 2, margin: 0.1 },
  { object: 'Phone', mesh: 'Phone_Screen', px: [320, 685], clock: true },
];

const CLOCK_DIM = 0.6; // how far the time sits from the dark screen toward the lit color
const CLOCK_Y = 0.27; // the time's center, as a share of the screen's height from the top
const CLOCK_WIDTH = 0.96; // the widest time, as a share of the screen's width: nearly edge to edge
const CLOCK_TRACKING = -0.04; // letter-spacing, as a share of the type size, so the digits can be bigger

const ease = (x) => x * x * (3 - 2 * x);

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
    if (entry.clock) {
      paintClock(entry, g);
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
      Object.assign(byObject[object], { items, current, onPick });
      paint(byObject[object]);
    },

    // Marks the current pick on a device's menu.
    select(object, key) {
      const entry = byObject[object];
      if (entry.current === key) return;
      entry.current = key;
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
