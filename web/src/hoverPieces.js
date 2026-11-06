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

const STEPS = ['Read the codebase', 'Plan the change', 'Edit limiter.ts', 'Run the tests'];
const DIFF = [
  [' ', 'export function limit(key) {'],
  ['-', '  return next(key);'],
  ['+', '  const used = count(key);'],
  ['+', '  if (used >= MAX) {'],
  ['+', '    return reject(429);'],
  ['+', '  }'],
  ['+', '  return next(key);'],
  [' ', '}'],
];
// Where each step ends, as a share of the run. The first two are quick, so the
// diff and terminal fill up soon after the hover starts.
const STEP_ENDS = [0.09, 0.18, 0.6, 0.86];
const stepAt = (u) => {
  const index = STEP_ENDS.findIndex((end) => u < end);
  return index === -1 ? STEPS.length : index;
};

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
  c.fillText('Add rate limiting to the API', 44, 107);

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

function drawDiff(s, colors, u) {
  const { context: c, width: W, height: H } = s;
  // Code streams in during the "Edit" step and then stays.
  const progress = clamp01((u - STEP_ENDS[1]) / (STEP_ENDS[2] - STEP_ENDS[1]));
  const total = DIFF.reduce((sum, [, line]) => sum + line.length, 0);
  let shown = Math.floor(progress * total);
  c.clearRect(0, 0, W, H);
  c.fillStyle = colors.ink;
  c.fillRect(0, 0, W, 42);
  c.fillStyle = colors.paper;
  c.font = `500 21px ${MONO}`;
  c.textBaseline = 'middle';
  c.fillText('limiter.ts', 18, 22);
  c.font = `500 21px ${MONO}`;
  DIFF.forEach(([sign, line], i) => {
    if (shown <= 0) return;
    const y = 72 + i * 31;
    const text = line.slice(0, shown);
    shown -= line.length;
    if (sign !== ' ') {
      c.fillStyle = sign === '+' ? colors.ink : colors.accent;
      c.globalAlpha = 0.12;
      c.fillRect(0, y - 15, W, 30);
      c.globalAlpha = 1;
    }
    c.fillStyle = sign === '-' ? colors.accent : colors.ink;
    c.fillText(`${sign} ${text}`, 16, y);
  });
  s.texture.needsUpdate = true;
}

function drawTerminal(s, colors, u, time) {
  const { context: c, width: W, height: H } = s;
  c.clearRect(0, 0, W, H);
  c.fillStyle = colors.onDark;
  c.font = `500 24px ${MONO}`;
  c.textBaseline = 'middle';
  const running = u >= STEP_ENDS[2];
  const finished = u >= STEP_ENDS[3];
  const passed = Math.floor(clamp01((u - STEP_ENDS[2]) / (STEP_ENDS[3] - STEP_ENDS[2])) * 48);
  c.fillText(running ? '$ npm test' : '$', 20, 28);
  if (running) c.fillText(`\u2713 ${passed} passed`, 20, 66);
  if (finished) c.fillText('All checks green', 20, 104);
  if (time % 1 < 0.55) c.fillRect(running ? 20 + (finished ? 240 : 0) : 44, running ? (finished ? 92 : 54) : 16, 13, 24);
  s.texture.needsUpdate = true;
}

// The agent's result: once the tests pass, the page reloads with the change applied.
const RELOAD = [0.86, 0.93];

function drawBrowser(s, colors, u) {
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
  c.fillText('localhost:3000/status', 122, 28);
  if (reloading) {
    c.fillStyle = colors.accent;
    c.fillRect(0, 50, W * ((u - RELOAD[0]) / (RELOAD[1] - RELOAD[0])), 5);
    s.texture.needsUpdate = true;
    return;
  }

  c.fillStyle = colors.ink;
  c.font = `700 32px ${SANS}`;
  c.fillText('API status', 26, 98);
  c.font = `500 23px ${SANS}`;
  c.fillText('Rate limit', 26, 150);
  c.textAlign = 'right';
  c.font = `700 23px ${SANS}`;
  c.fillStyle = updated ? colors.ink : colors.accent;
  c.fillText(updated ? '100 / min' : 'None', W - 26, 150);
  c.textAlign = 'left';
  // Traffic bars: spiky without the limit, capped with it.
  const bars = 16, gap = 6;
  const barW = (W - 52 - gap * (bars - 1)) / bars;
  const floor = H - 28;
  const cap = 112;
  for (let i = 0; i < bars; i++) {
    const spike = 40 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) * 170;
    const height = Math.min(updated ? Math.min(spike, cap) : spike, 170);
    c.fillStyle = !updated && spike > cap ? colors.accent : colors.ink;
    c.fillRect(26 + i * (barW + gap), floor - height, barW, height);
  }
  if (updated) {
    c.fillStyle = colors.accent;
    c.fillRect(26, floor - cap - 8, W - 52, 3);
  }
  s.texture.needsUpdate = true;
}

function engineeringPieces(make, colors) {
  // One plane of panels with even gaps, so nothing overlaps: the run reads left to right.
  const Z = 0.12;
  const agent = make.screen(make.part(-0.275, 0.115, Z, 0), 0.27, 0.235, 'M_Panel', 560);
  const diff = make.screen(make.part(0, 0.15, Z, 0.1), 0.25, 0.165, 'M_Panel', 560);
  const terminal = make.screen(make.part(0, 0.0125, Z, 0.2), 0.25, 0.085, 'M_Stage', 420);
  const browser = make.screen(make.part(0.275, 0.115, Z, 0.3), 0.27, 0.235, 'M_Panel', 560);
  return [(time, sinceHover) => {
    const u = Math.min(sinceHover / AGENT_SECONDS, 1);
    drawAgent(agent, colors, u);
    drawDiff(diff, colors, u);
    drawTerminal(terminal, colors, u, time);
    drawBrowser(browser, colors, u);
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

function drawField(s, field, columns, rows, colors) {
  const { context: c, width: W, height: H } = s;
  c.clearRect(0, 0, W, H);
  const cellW = W / columns, cellH = H / rows;
  c.font = `700 ${cellH * 1.02}px ${MONO}`;
  c.textBaseline = 'top';
  c.textAlign = 'center';
  // A left-to-right gradient, cream through coral.
  const gradient = c.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, colors.onDark);
  gradient.addColorStop(0.55, colors.soft);
  gradient.addColorStop(1, colors.accent);
  c.fillStyle = gradient;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const glyph = GLYPHS[Math.min(Math.floor(field.value(y * columns + x) * GLYPHS.length), GLYPHS.length - 1)];
      if (glyph !== ' ') c.fillText(glyph, (x + 0.5) * cellW, y * cellH);
    }
  }
  s.texture.needsUpdate = true;
}

function designPieces(make) {
  const columns = 55, rows = 21;
  // Stage on top, 10% wider on each side than the timeline and inspector row below it.
  const Z = 0.11, ROW_W = 0.324, STAGE_W = ROW_W * 1.2, GAP = 0.012, ROW_H = 0.115, ROW_Y = 0.05;
  const stageGroup = make.part(0, ROW_Y + ROW_H / 2 + GAP + 0.117, Z, 0);
  const stage = make.screen(stageGroup, STAGE_W, 0.234, 'M_Stage', 1032);
  const field = createFlowField(columns, rows);

  const W = 0.225, H = ROW_H, INSPECTOR_W = ROW_W - W - GAP;
  const timeline = make.part(-ROW_W / 2 + W / 2, ROW_Y, Z, 0.14);
  make.add(timeline, box(W, H, 0.008), 'M_Panel');
  make.add(timeline, box(W, 0.016, 0.003, 0, H / 2 - 0.008, 0.0055), 'M_Dark');
  const left = -W / 2 + 0.018, right = W / 2 - 0.018;
  const trackY = [0.02, -0.008, -0.036];
  trackY.forEach((y) => make.add(timeline, box(right - left, 0.002, 0.002, (left + right) / 2, y, 0.005), 'M_Dark'));
  const keyframes = [[0, 0.05], [0, 0.42], [0, 0.95], [1, 0.2], [1, 0.62], [2, 0.08], [2, 0.34], [2, 0.76]].map(([track, u]) => {
    const mesh = make.add(timeline, box(0.01, 0.01, 0.003), 'M_Dark');
    mesh.rotation.z = Math.PI / 4;
    mesh.position.set(THREE.MathUtils.lerp(left, right, u), trackY[track], 0.006);
    return { mesh, u };
  });
  const playhead = make.add(timeline, box(0.0026, 0.088, 0.003), 'M_Accent');
  playhead.position.set(left, -0.008, 0.0078);

  const inspector = make.part(ROW_W / 2 - INSPECTOR_W / 2, ROW_Y, Z, 0.28);
  make.add(inspector, box(INSPECTOR_W, H, 0.008), 'M_Panel');
  make.add(inspector, box(INSPECTOR_W, 0.016, 0.003, 0, H / 2 - 0.008, 0.0055), 'M_Dark');
  const knobs = [0, 1, 2].map((i) => {
    make.add(inspector, box(INSPECTOR_W - 0.022, 0.002, 0.002, 0, 0.02 - i * 0.028, 0.0052), 'M_Dark');
    const knob = make.add(inspector, box(0.009, 0.013, 0.003), 'M_Accent');
    knob.position.set(0, 0.02 - i * 0.028, 0.0062);
    return knob;
  });

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
    knobs.forEach((knob, i) => { knob.position.x = Math.sin(u * Math.PI * 2 + i * 1.7) * (INSPECTOR_W / 2 - 0.016); });
    // The playhead steers the field, like scrubbing an animation.
    field.step(u * Math.PI * 2);
    drawField(stage, field, columns, rows, colors);
  };
  play.scrub = (amount) => { pendingScrub += amount; };
  return [play];
}

// The phone's message rises up facing the camera, since the phone itself lies flat.
function drawMessage(s, colors) {
  const { context: c, width: W, height: H } = s;
  c.clearRect(0, 0, W, H);
  c.fillStyle = colors.ink;
  c.fillRect(0, 0, W, 58);
  c.fillStyle = colors.paper;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.font = `700 28px ${SANS}`;
  c.fillText('Message', 26, 30);
  c.fillStyle = colors.ink;
  c.font = `700 48px ${SANS}`;
  c.fillText('Get in touch', 26, 118);
  c.font = `500 25px ${SANS}`;
  c.fillText('Tap to open contact', 26, 172);
  s.texture.needsUpdate = true;
}

function contactPieces(make, colors) {
  // Centered on the phone and raised past the top of the pencil cup's ruler.
  const message = make.screen(make.part(0, 0.3, 0.03, 0), 0.24, 0.113, 'M_Panel', 480);
  return [() => drawMessage(message, colors)];
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
