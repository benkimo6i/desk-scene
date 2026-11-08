// 3D pieces that rise out of a screen on hover, layer by layer, leaving a gap in the
// the screen's title clear. Panel bodies use the scene's materials, so they catch its
// shadows and outlines. Their contents are live canvases laid over the front.
// Local axes: x right, y up, z out of the screen.
import * as THREE from 'three';

const IN_SECONDS = 0.75;
const OUT_SECONDS = 0.3;
const START_DEPTH = -0.012; // behind the screen surface
const DRAW_INTERVAL = 1 / 24; // the canvases don't need to redraw every frame
const AGENT_SECONDS = 6; // the run plays once per hover, then rests on its finished state
const TIMELINE_LOOP = 5;
const SCRUB_RELEASE = 0.18; // seconds after the last scroll before playback resumes
const SCROLL_PER_LOOP = 900; // scroll distance in pixels for one full pass of the timeline
const MONO = "ui-monospace, Menlo, Consolas, monospace";
const SANS = "'Inter Tight Variable', Helvetica, Arial, sans-serif";

const clamp01 = (x) => THREE.MathUtils.clamp(x, 0, 1);
const backOut = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;

function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function makeBuilder(root, parts, materials, tag) {
  const add = (parent, geometry, material) => {
    const mesh = new THREE.Mesh(geometry, materials[material]);
    mesh.castShadow = mesh.receiveShadow = true;
    tag(mesh);
    parent.add(mesh);
    return mesh;
  };
  const part = (x, y, z, delay) => {
    const object = new THREE.Group();
    root.add(object);
    parts.push({ object, home: new THREE.Vector3(x, y, z), delay });
    return object;
  };
  // A panel body with a transparent canvas over its front face.
  const screen = (parent, w, h, body, pixelsWide) => {
    add(parent, box(w, h, 0.008), body);
    const canvas = document.createElement('canvas');
    canvas.width = pixelsWide;
    canvas.height = Math.round((pixelsWide * h) / w);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    plane.position.z = 0.0043;
    tag(plane);
    parent.add(plane);
    return { context: canvas.getContext('2d'), width: canvas.width, height: canvas.height, texture };
  };
  return { add, part, screen };
}

function rounded(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function checkmark(c, x, y, s) {
  c.beginPath();
  c.moveTo(x - s * 0.5, y);
  c.lineTo(x - s * 0.12, y + s * 0.4);
  c.lineTo(x + s * 0.55, y - s * 0.45);
  c.stroke();
}

// The engineering run: an agent builds a small 3D product viewer, from model to browser.
const STEPS = ['Model the bottle', 'Export bottle.glb', 'Write scene.js', 'Open the preview'];
// Where each step ends, as a share of the run. Modelling takes the longest, so the
// viewport has time to build the bottle ring by ring.
const STEP_ENDS = [0.32, 0.42, 0.72, 0.86];
const stepAt = (u) => {
  const index = STEP_ENDS.findIndex((end) => u < end);
  return index === -1 ? STEPS.length : index;
};
const CODE = ["const bottle = load('bottle.glb');", 'scene.add(bottle);', 'spin(bottle, 0.4);'];

// A low-poly bottle, turned from a profile: [radius, height] from the base up.
const PROFILE = [[0, -1], [0.62, -1], [0.7, -0.82], [0.7, 0.18], [0.5, 0.48], [0.22, 0.62], [0.22, 0.92], [0, 0.92]];
const SIDES = 10;
// Each ring of the profile, turned by an angle and tipped toward the viewer, in 2D.
function bottleRings(turn, tilt = 0.32) {
  return PROFILE.map(([r, y]) => Array.from({ length: SIDES }, (_, k) => {
    const a = turn + (k / SIDES) * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    return { x, y: y * Math.cos(tilt) - z * Math.sin(tilt), z: z * Math.cos(tilt) + y * Math.sin(tilt) };
  }));
}

// Draws the bottle centred at (cx, cy), size pixels tall. built (0 to 1) shows the rings
// appearing from the base up as a wireframe; shaded fills the faces, lit from the upper left.
function drawBottle(c, colors, cx, cy, size, turn, built, shaded) {
  const rings = bottleRings(turn);
  const s = size / 2;
  const at = (p) => [cx + p.x * s, cy - p.y * s];
  const shown = shaded ? rings.length : Math.max(1, Math.ceil(built * rings.length));
  const faces = [];
  for (let i = 0; i < shown - 1; i++) {
    for (let k = 0; k < SIDES; k++) {
      const q = [rings[i][k], rings[i][(k + 1) % SIDES], rings[i + 1][(k + 1) % SIDES], rings[i + 1][k]];
      faces.push({ q, depth: q.reduce((sum, p) => sum + p.z, 0) / 4 });
    }
  }
  faces.sort((f, g) => f.depth - g.depth);
  c.lineJoin = 'round';
  for (const { q } of faces) {
    const [p0, p1, , p3] = q;
    // Outward normal from the face's edges; the viewer looks along -z.
    const a = [p3.x - p0.x, p3.y - p0.y, p3.z - p0.z], b = [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z];
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const length = Math.hypot(...n) || 1;
    const facing = n[2] / length;
    if (shaded && facing <= 0) continue;
    c.beginPath();
    q.forEach((p, k) => (k ? c.lineTo(...at(p)) : c.moveTo(...at(p))));
    c.closePath();
    if (shaded) {
      // Light from the upper left, in three tones like the room.
      const light = (-0.55 * n[0] + 0.55 * n[1] + 0.63 * n[2]) / length;
      c.fillStyle = light > 0.6 ? colors.soft : light > 0.2 ? colors.accent : colors.ink;
      c.fill();
      c.strokeStyle = colors.ink;
      c.lineWidth = 1.5;
      c.stroke();
    } else {
      c.strokeStyle = facing <= 0 ? colors.muted : colors.ink;
      c.lineWidth = facing <= 0 ? 1 : 2;
      c.stroke();
    }
  }
}

function drawAgent(s, colors, u) {
  const { context: c, width: W, height: H } = s;
  const active = stepAt(u);
  const finished = active >= STEPS.length;
  c.clearRect(0, 0, W, H);
  c.fillStyle = colors.ink;
  c.fillRect(0, 0, W, 54);
  c.fillStyle = colors.paper;
  c.textBaseline = 'middle';
  c.font = `700 26px ${SANS}`;
  c.textAlign = 'left';
  c.fillText('Agent', 24, 28);
  c.font = `500 21px ${SANS}`;
  c.textAlign = 'right';
  c.fillText(finished ? 'Done' : 'Working', W - 24, 28);

  c.textAlign = 'left';
  c.fillStyle = colors.ink;
  rounded(c, 24, 76, W - 48, 62, 10);
  c.globalAlpha = 0.12;
  c.fill();
  c.globalAlpha = 1;
  c.font = `500 25px ${SANS}`;
  c.fillText('Build a 3D product viewer', 44, 107);

  c.lineWidth = 4;
  c.lineCap = 'round';
  STEPS.forEach((step, i) => {
    const y = 180 + i * 50;
    const done = i < active;
    const running = i === active;
    c.strokeStyle = c.fillStyle = done || running ? colors.ink : colors.muted;
    if (done) {
      checkmark(c, 40, y, 22);
    } else if (running) {
      c.strokeStyle = colors.accent;
      c.beginPath();
      c.arc(40, y, 11, u * 80, u * 80 + 4.4);
      c.stroke();
    } else {
      c.beginPath();
      c.arc(40, y, 10, 0, Math.PI * 2);
      c.stroke();
    }
    c.font = `${running ? 700 : 500} 25px ${SANS}`;
    c.fillText(step, 72, y);
  });

  c.fillStyle = colors.ink;
  c.globalAlpha = 0.15;
  c.fillRect(24, H - 32, W - 48, 8);
  c.globalAlpha = 1;
  c.fillRect(24, H - 32, (W - 48) * clamp01(u / STEP_ENDS[3]), 8);
  s.texture.needsUpdate = true;
}

// The Blender viewport: the bottle's wireframe builds during the modelling step, turning slowly.
function drawViewport(s, colors, u, time) {
  const { context: c, width: W, height: H } = s;
  c.clearRect(0, 0, W, H);
  c.fillStyle = colors.ink;
  c.fillRect(0, 0, W, 42);
  c.fillStyle = colors.paper;
  c.font = `500 21px ${MONO}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillText('Blender', 18, 22);
  c.textAlign = 'right';
  c.fillText(u >= STEP_ENDS[1] ? 'bottle.glb  412 KB' : u >= STEP_ENDS[0] ? 'Exporting' : 'Modelling', W - 18, 22);
  // A faint floor grid under the model.
  c.strokeStyle = colors.muted;
  c.globalAlpha = 0.35;
  c.lineWidth = 1;
  for (let i = -4; i <= 4; i++) {
    c.beginPath();
    c.moveTo(W / 2 + i * 34, H - 14);
    c.lineTo(W / 2 + i * 20, H - 44);
    c.stroke();
  }
  c.globalAlpha = 1;
  drawBottle(c, colors, W / 2, H / 2 + 22, H - 84, time * 0.5, clamp01(u / STEP_ENDS[0]), false);
  s.texture.needsUpdate = true;
}

// The scene code types in during its step, on the dark strip under the viewport.
function drawCode(s, colors, u, time) {
  const { context: c, width: W, height: H } = s;
  c.clearRect(0, 0, W, H);
  c.fillStyle = colors.onDark;
  c.font = `500 18px ${MONO}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  const progress = clamp01((u - STEP_ENDS[1]) / (STEP_ENDS[2] - STEP_ENDS[1]));
  let shown = Math.floor(progress * CODE.reduce((sum, line) => sum + line.length, 0));
  let cursor = [18, 28];
  CODE.forEach((line, i) => {
    if (shown <= 0) return;
    const text = line.slice(0, shown);
    shown -= line.length;
    const y = 28 + i * 38;
    c.fillText(text, 18, y);
    cursor = [18 + c.measureText(text).width + 4, y];
  });
  if (time % 1 < 0.55 && u < STEP_ENDS[3]) c.fillRect(cursor[0], cursor[1] - 12, 11, 24);
  s.texture.needsUpdate = true;
}

// The agent's result: once the scene is written, the page reloads with the bottle on show.
const RELOAD = [0.86, 0.93];

function drawBrowser(s, colors, u, time) {
  const { context: c, width: W, height: H } = s;
  const reloading = u >= RELOAD[0] && u < RELOAD[1];
  const updated = u >= RELOAD[1];
  c.clearRect(0, 0, W, H);
  c.fillStyle = colors.ink;
  c.fillRect(0, 0, W, 54);
  c.fillStyle = colors.paper;
  [28, 52, 76].forEach((x) => {
    c.beginPath();
    c.arc(x, 27, 7, 0, Math.PI * 2);
    c.fill();
  });
  rounded(c, 104, 12, W - 128, 30, 15);
  c.globalAlpha = 0.18;
  c.fill();
  c.globalAlpha = 1;
  c.font = `500 19px ${MONO}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillText('localhost:5173', 122, 28);
  if (reloading) {
    c.fillStyle = colors.accent;
    c.fillRect(0, 50, W * ((u - RELOAD[0]) / (RELOAD[1] - RELOAD[0])), 5);
    s.texture.needsUpdate = true;
    return;
  }

  c.fillStyle = colors.ink;
  c.font = `700 30px ${SANS}`;
  c.fillText(updated ? 'Bottle' : 'Product viewer', 26, 92);
  if (!updated) {
    // An empty stage waiting for the model.
    c.strokeStyle = colors.muted;
    c.lineWidth = 3;
    c.setLineDash([10, 8]);
    rounded(c, 26, 120, W - 52, H - 150, 14);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = colors.muted;
    c.font = `500 22px ${SANS}`;
    c.textAlign = 'center';
    c.fillText('No model yet', W / 2, 120 + (H - 150) / 2);
    s.texture.needsUpdate = true;
    return;
  }
  drawBottle(c, colors, W / 2, 120 + (H - 170) / 2 + 6, H - 190, time * 0.8, 1, true);
  // Carousel dots: the bottle is the first of three products.
  [-24, 0, 24].forEach((dx, i) => {
    c.fillStyle = i === 0 ? colors.ink : colors.muted;
    c.beginPath();
    c.arc(W / 2 + dx, H - 30, i === 0 ? 7 : 5, 0, Math.PI * 2);
    c.fill();
  });
  s.texture.needsUpdate = true;
}

function engineeringPieces(make, colors) {
  // One plane of panels with even gaps, so nothing overlaps: the run reads left to right.
  const Z = 0.12;
  const agent = make.screen(make.part(-0.275, 0.115, Z, 0), 0.27, 0.235, 'M_Panel', 560);
  const viewport = make.screen(make.part(0, 0.15, Z, 0.1), 0.25, 0.165, 'M_Panel', 560);
  const code = make.screen(make.part(0, 0.0125, Z, 0.2), 0.25, 0.085, 'M_Stage', 420);
  const browser = make.screen(make.part(0.275, 0.115, Z, 0.3), 0.27, 0.235, 'M_Panel', 560);
  return [(time, sinceHover) => {
    const u = Math.min(sinceHover / AGENT_SECONDS, 1);
    drawAgent(agent, colors, u);
    drawViewport(viewport, colors, u, time);
    drawCode(code, colors, u, time);
    drawBrowser(browser, colors, u, time);
  }];
}

// Particles drifting through a changing angle field. They deposit brightness into a
// character grid that slowly fades, which leaves flowing trails.
function createFlowField(columns, rows) {
  const trail = new Float32Array(columns * rows);
  const base = new Float32Array(columns * rows);
  const particles = Array.from({ length: 460 }, (_, i) => ({
    x: (i * 7.31) % columns,
    y: (i * 3.77) % rows,
    life: (i * 0.13) % 1,
  }));
  const angle = (x, y, phase) => {
    const nx = x / columns, ny = y / rows;
    return Math.sin(nx * 5 + phase) * 2.2 + Math.cos(ny * 6 - phase * 0.7) * 1.8
      + Math.sin((nx + ny) * 7 + phase * 0.4) * 1.2;
  };
  return {
    angle,
    step(phase) {
      for (let i = 0; i < trail.length; i++) trail[i] *= 0.9;
      for (const p of particles) {
        const a = angle(p.x, p.y, phase);
        p.x += Math.cos(a) * 0.75;
        p.y += Math.sin(a) * 0.42; // characters are taller than wide
        p.life -= 0.012;
        if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x >= columns || p.y >= rows) {
          p.x = ((p.x * 37.7 + 11) % columns + columns) % columns;
          p.y = ((p.y * 19.3 + 7) % rows + rows) % rows;
          p.life = 1;
        }
        const cell = Math.floor(p.y) * columns + Math.floor(p.x);
        trail[cell] = Math.min(trail[cell] + 0.45, 1);
      }
      // A soft moving gradient under the trails keeps the whole panel filled.
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          const swell = 0.5 + 0.5 * Math.sin(angle(x, y, phase) * 1.4);
          base[y * columns + x] = 0.1 + swell * 0.32;
        }
      }
    },
    value: (i) => Math.max(trail[i], base[i]),
  };
}

const GLYPHS = ' .:-=+*#%@';

function drawField(s, field, columns, rows, stops) {
  const { context: c, width: W, height: H } = s;
  c.clearRect(0, 0, W, H);
  const cellW = W / columns, cellH = H / rows;
  c.font = `700 ${cellH * 1.02}px ${MONO}`;
  c.textBaseline = 'top';
  c.textAlign = 'center';
  // A diagonal gradient through the active palette's colours.
  const gradient = c.createLinearGradient(0, 0, W, H);
  stops.forEach((color, i) => gradient.addColorStop(i / (stops.length - 1), color));
  c.fillStyle = gradient;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const glyph = GLYPHS[Math.min(Math.floor(field.value(y * columns + x) * GLYPHS.length), GLYPHS.length - 1)];
      if (glyph !== ' ') c.fillText(glyph, (x + 0.5) * cellW, y * cellH);
    }
  }
  s.texture.needsUpdate = true;
}

// The palettes the stage cycles through: the room's creams and its sky and skyline blues, light
// on the dark stage, so they shift with the time of day.
const PALETTES = [
  ['onDark', 'soft', 'cloud'],
  ['cloud', 'sky', 'skyline'],
  ['skyline', 'soft', 'onDark'],
  ['sky', 'skylineMid', 'cloud'],
];
const PALETTE_BLEND = 0.04; // share of the loop over which one palette fades into the next
const mixColors = (a, b, t) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
// Lamp-lit periods use a lighter stage, where some blues would vanish: those are lightened
// toward white, keeping their tint, until they stand clear of it.
const STAGE_CONTRAST = 0.3;
const brightness = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
function legible(hex, stage) {
  for (let t = 0; t <= 1; t += 0.05) {
    const color = mixColors(hex, '#ffffff', t);
    if (Math.abs(brightness(color) - brightness(stage)) >= STAGE_CONTRAST) return color;
  }
  return '#ffffff';
}

// The palette window: the four palettes as swatch strips, the active one marked.
function drawPalette(s, colors, active) {
  const { context: c, width: W, height: H } = s;
  c.clearRect(0, 0, W, H);
  const top = 52, gap = 10, rowH = (H - top - 16 - gap * (PALETTES.length - 1)) / PALETTES.length;
  PALETTES.forEach((palette, i) => {
    const y = top + i * (rowH + gap);
    const x = i === active ? 30 : 18;
    palette.forEach((name, k) => {
      c.fillStyle = colors[name];
      c.fillRect(x + k * ((W - 36 - 12) / 3), y, (W - 36 - 12) / 3, rowH);
    });
    if (i === active) {
      c.fillStyle = colors.ink;
      c.fillRect(8, y, 10, rowH);
    }
  });
  s.texture.needsUpdate = true;
}

// The flow window: the hidden direction field that steers the particles, as a grid of arrows.
// It turns with the playhead, the same field the stage is drawn from.
function drawFlow(s, colors, field, phase, columns, rows) {
  const { context: c, width: W, height: H } = s;
  c.clearRect(0, 0, W, H);
  const top = 52, cols = 4, lines = 5;
  const cellW = (W - 24) / cols, cellH = (H - top - 12) / lines;
  const length = Math.min(cellW, cellH) * 0.4;
  c.strokeStyle = c.fillStyle = colors.ink;
  c.lineWidth = 6;
  c.lineCap = 'round';
  for (let j = 0; j < lines; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = 12 + (i + 0.5) * cellW, cy = top + (j + 0.5) * cellH;
      // Sample the field where this cell sits on the stage. Rows run down, as on screen.
      const a = field.angle(((i + 0.5) / cols) * columns, ((j + 0.5) / lines) * rows, phase);
      const dx = Math.cos(a), dy = Math.sin(a) * 0.88; // a particle's step on screen: 0.75 of a cell across, 0.42 of a taller cell down
      const n = Math.hypot(dx, dy) || 1;
      const ux = (dx / n) * length, uy = (dy / n) * length;
      c.beginPath();
      c.moveTo(cx - ux, cy - uy);
      c.lineTo(cx + ux, cy + uy);
      c.stroke();
      const head = Math.atan2(uy, ux);
      c.beginPath();
      c.moveTo(cx + ux, cy + uy);
      c.lineTo(cx + ux - Math.cos(head - 0.5) * 15, cy + uy - Math.sin(head - 0.5) * 15);
      c.lineTo(cx + ux - Math.cos(head + 0.5) * 15, cy + uy - Math.sin(head + 0.5) * 15);
      c.closePath();
      c.fill();
    }
  }
  s.texture.needsUpdate = true;
}

function designPieces(make) {
  const columns = 55, rows = 21;
  // Stage on top; timeline, palette and flow field in a row beneath it, the same width.
  const Z = 0.11, STAGE_W = 0.3888, GAP = 0.012, ROW_H = 0.115, ROW_Y = 0.05;
  const stageGroup = make.part(0, ROW_Y + ROW_H / 2 + GAP + 0.117, Z, 0);
  const stage = make.screen(stageGroup, STAGE_W, 0.234, 'M_Stage', 1032);
  const field = createFlowField(columns, rows);

  const SIDE_W = 0.084, W = STAGE_W - 2 * (SIDE_W + GAP), H = ROW_H;
  const timeline = make.part(-STAGE_W / 2 + W / 2, ROW_Y, Z, 0.14);
  make.add(timeline, box(W, H, 0.008), 'M_Panel');
  make.add(timeline, box(W, 0.016, 0.003, 0, H / 2 - 0.008, 0.0055), 'M_Dark');
  const left = -W / 2 + 0.018, right = W / 2 - 0.018;
  const trackY = [0.02, -0.008, -0.036];
  trackY.forEach((y) => make.add(timeline, box(right - left, 0.002, 0.002, (left + right) / 2, y, 0.005), 'M_Dark'));
  // The top track keys the palette changes.
  const keyframes = [[0, 0], [0, 0.25], [0, 0.5], [0, 0.75], [1, 0.12], [1, 0.62], [2, 0.08], [2, 0.34], [2, 0.76]].map(([track, u]) => {
    const mesh = make.add(timeline, box(0.01, 0.01, 0.003), 'M_Dark');
    mesh.rotation.z = Math.PI / 4;
    mesh.position.set(THREE.MathUtils.lerp(left, right, u), trackY[track], 0.006);
    return { mesh, u };
  });
  const playhead = make.add(timeline, box(0.0026, 0.088, 0.003), 'M_Accent');
  playhead.position.set(left, -0.008, 0.0078);

  const side = (x, delay) => {
    const group = make.part(x, ROW_Y, Z, delay);
    const canvas = make.screen(group, SIDE_W, H, 'M_Panel', 240);
    make.add(group, box(SIDE_W, 0.016, 0.003, 0, H / 2 - 0.008, 0.0055), 'M_Dark');
    return canvas;
  };
  const palette = side(STAGE_W / 2 - SIDE_W * 1.5 - GAP, 0.28);
  const flow = side(STAGE_W / 2 - SIDE_W / 2, 0.42);

  // Playback position. Scrolling overrides it, and playback resumes from wherever it stops.
  let position = 0, pendingScrub = 0, lastScrub = -Infinity, lastTime = null;

  const play = (time, sinceHover, colors) => {
    const dt = lastTime === null ? 0 : time - lastTime;
    lastTime = time;
    if (pendingScrub) {
      position += pendingScrub;
      pendingScrub = 0;
      lastScrub = time;
    } else if (time - lastScrub > SCRUB_RELEASE) {
      position += dt / TIMELINE_LOOP;
    }
    position = ((position % 1) + 1) % 1;
    const u = position;
    playhead.position.x = THREE.MathUtils.lerp(left, right, u);
    for (const { mesh, u: at } of keyframes) {
      mesh.scale.setScalar(1 + (1 - clamp01(Math.abs(u - at) / 0.03)) * 0.9);
    }
    // Palette: each quarter of the loop has its own, fading into the next at the keyframe.
    const slot = u * PALETTES.length;
    const active = Math.floor(slot) % PALETTES.length;
    const fade = clamp01((slot % 1 - (1 - PALETTE_BLEND * PALETTES.length)) / (PALETTE_BLEND * PALETTES.length));
    const next = (active + 1) % PALETTES.length;
    const stops = PALETTES[active].map((name, k) => legible(mixColors(colors[name], colors[PALETTES[next][k]], fade), colors.stage));
    // The playhead steers the field, like scrubbing an animation.
    const phase = u * Math.PI * 2;
    field.step(phase);
    drawField(stage, field, columns, rows, stops);
    drawPalette(palette, colors, active);
    drawFlow(flow, colors, field, phase, columns, rows);
  };
  play.scrub = (amount) => { pendingScrub += amount; };
  return [play];
}

// The phone's message rises up facing the camera, since the phone itself lies flat. It plays
// once per hover as a short thread: the visitor's message is sent, Ben types, Ben replies.
const THREAD = [
  { from: 'visitor', at: 0.3, text: 'Get in touch' },
  { from: 'ben', typing: 0.75, at: 1.5, text: 'Tap to open contact' },
];

// A rounded bubble with a small tail at its lower outside corner: left for received, right for sent.
function bubble(c, x, y, w, h, side) {
  rounded(c, x, y, w, h, h / 2);
  c.fill();
  const edge = side === 'left' ? x : x + w, dir = side === 'left' ? 1 : -1;
  c.beginPath();
  c.moveTo(edge + dir * 4, y + h - 16);
  c.quadraticCurveTo(edge - dir * 2, y + h + 2, edge - dir * 10, y + h + 2);
  c.quadraticCurveTo(edge + dir * 10, y + h + 4, edge + dir * 22, y + h - 6);
  c.fill();
}

function drawMessage(s, colors, since, time) {
  const { context: c, width: W, height: H } = s;
  c.clearRect(0, 0, W, H);
  // Header: who the conversation is with.
  c.fillStyle = colors.ink;
  c.fillRect(0, 0, W, 58);
  c.fillStyle = colors.paper;
  c.beginPath();
  c.arc(40, 29, 17, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = colors.ink;
  c.font = `700 15px ${SANS}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('BK', 40, 30);
  c.fillStyle = colors.paper;
  c.textAlign = 'left';
  c.font = `700 26px ${SANS}`;
  c.fillText('Ben Kim', 70, 30);

  const margin = 34, lineH = 80, top = 82, h = 60;
  c.font = `500 33px ${SANS}`;
  THREAD.forEach(({ from, typing, at, text }, i) => {
    const start = typing ?? at;
    if (since < start) return;
    const y = top + i * lineH;
    const shown = since >= at;
    const sent = from === 'visitor';
    const w = shown ? c.measureText(text).width + 48 : 104;
    const x = sent ? W - margin - w : margin;
    // Each bubble pops in from a little smaller, growing out of its tail's corner.
    const pop = shown ? backOut(clamp01((since - at) / 0.25)) : 1;
    const anchor = sent ? x + w : x;
    c.save();
    c.translate(anchor, y + h);
    c.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
    c.translate(-anchor, -(y + h));
    c.fillStyle = colors.ink;
    c.globalAlpha = sent ? 1 : 0.13;
    bubble(c, x, y, w, h, sent ? 'right' : 'left');
    c.globalAlpha = 1;
    if (shown) {
      c.fillStyle = sent ? colors.paper : colors.ink;
      c.fillText(text, x + 24, y + h / 2 + 1);
    } else {
      // Ben typing: three dots rising in turn.
      [0, 1, 2].forEach((k) => {
        const lift = Math.max(0, Math.sin(time * 9 - k * 0.9)) * 5;
        c.fillStyle = colors.muted;
        c.beginPath();
        c.arc(x + 32 + k * 20, y + h / 2 - lift, 7, 0, Math.PI * 2);
        c.fill();
      });
    }
    c.restore();
  });
  s.texture.needsUpdate = true;
}

function contactPieces(make, colors) {
  // Centered on the phone; its bottom edge stays just above the pencil cup's ruler.
  const H = 0.13;
  const message = make.screen(make.part(0, 0.2435 + H / 2, 0.03, 0), 0.24, H, 'M_Panel', 480);
  return [(time, since) => drawMessage(message, colors, since, time)];
}

const KINDS = { engineering: engineeringPieces, design: designPieces, contact: contactPieces };

export function createHoverPieces(kind, screen, materials, tag, colors) {
  const group = new THREE.Group();
  group.name = `Pieces_${kind}`;
  const right = new THREE.Vector3().crossVectors(screen.up, screen.normal);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, screen.up, screen.normal));
  group.position.copy(screen.center);
  group.visible = false;

  const parts = [];
  const animators = KINDS[kind](makeBuilder(group, parts, materials, tag), colors);
  let reveal = 0;
  let sinceDraw = DRAW_INTERVAL;
  let wasActive = false;
  let hoverStart = 0;

  function update(dt, time, active) {
    if (active && !wasActive) hoverStart = time;
    wasActive = active;
    reveal = clamp01(reveal + (active ? dt / IN_SECONDS : -dt / OUT_SECONDS));
    group.visible = reveal > 0;
    if (!group.visible) return;
    parts.forEach(({ object, home, delay }, i) => {
      const p = clamp01(reveal * 1.4 - delay);
      const e = backOut(p);
      object.visible = p > 0;
      object.position.set(home.x * (0.55 + 0.45 * e), home.y * (0.55 + 0.45 * e),
        THREE.MathUtils.lerp(START_DEPTH, home.z + Math.sin(time * 1.3 + i * 1.1) * 0.004, e));
      object.scale.setScalar(0.35 + 0.65 * Math.min(e, 1.05));
    });
    sinceDraw += dt;
    if (sinceDraw >= DRAW_INTERVAL) {
      sinceDraw = 0;
      for (const animate of animators) animate(time, time - hoverStart, colors);
    }
  }

  return {
    group,
    update,
    scrub(deltaPixels) {
      if (reveal > 0) animators[0].scrub?.(deltaPixels / SCROLL_PER_LOOP);
    },
  };
}
